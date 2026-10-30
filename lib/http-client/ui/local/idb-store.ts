import { createCollection, createEnvironment, eachRequest } from "@/lib/http-client/core/model/factory";
import type {
  Collection,
  Environment,
  ResponseHistoryEntry,
} from "@/lib/http-client/core/model/types";
import type {
  HistoryStore,
  HttpClientState,
  HttpClientStore,
} from "@/lib/http-client/core/store/types";
import type { HttpTree } from "@/lib/http-client/core/workspace/workspace";
import { createDatabase, defineStore, IndexedDbError } from "@/lib/indexed-db";

type MetaValue = HttpClientState | boolean;

const STATE_KEY = "state";
const ADOPTED_KEY = "adopted-server-data";
const HISTORY_ADOPTED_KEY = "adopted-server-history";
/** How many of the oldest entries to drop when the browser reports it is out of space. */
const QUOTA_EVICT_COUNT = 20;

/**
 * The browser's data. `meta` holds the state record and flags, `history` the saved responses
 * (one row each; `byRequest` lists a request's entries by time, `byAt` finds the oldest overall).
 */
export const httpClientDb = createDatabase({
  name: "http-client",
  version: 2,
  stores: {
    collections: defineStore<Collection>({ keyPath: "id" }),
    environments: defineStore<Environment>({ keyPath: "id" }),
    meta: defineStore<MetaValue>(),
    history: defineStore<ResponseHistoryEntry>({
      keyPath: "id",
      indexes: { byRequest: { keyPath: ["requestId", "at"] }, byAt: { keyPath: "at" } },
    }),
  },
});

function asState(value: MetaValue | undefined): HttpClientState {
  return value && typeof value === "object" ? value : {};
}

const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name);

export class IdbStore implements HttpClientStore {
  async allCollections(): Promise<Collection[]> {
    return (await httpClientDb.store("collections").getAll()).sort(byName);
  }

  getCollection(id: string): Promise<Collection | undefined> {
    return httpClientDb.store("collections").get(id);
  }

  async saveCollection(collection: Collection): Promise<Collection> {
    const next: Collection = { ...collection, updatedAt: Date.now() };
    await httpClientDb.store("collections").put(next);
    return next;
  }

  async deleteCollection(id: string): Promise<boolean> {
    return httpClientDb.transaction(["collections"], "readwrite", async (tx) => {
      const collections = tx.store("collections");
      const existed = (await collections.count(id)) > 0;
      await collections.delete(id);
      return existed;
    });
  }

  async listEnvironments(): Promise<Environment[]> {
    return (await httpClientDb.store("environments").getAll()).sort(byName);
  }

  getEnvironment(id: string): Promise<Environment | undefined> {
    return httpClientDb.store("environments").get(id);
  }

  async saveEnvironment(environment: Environment): Promise<Environment> {
    const next: Environment = { ...environment, updatedAt: Date.now() };
    await httpClientDb.store("environments").put(next);
    return next;
  }

  async deleteEnvironment(id: string): Promise<boolean> {
    return httpClientDb.transaction(["environments", "meta"], "readwrite", async (tx) => {
      const environments = tx.store("environments");
      const existed = (await environments.count(id)) > 0;
      await environments.delete(id);
      const meta = tx.store("meta");
      const state = asState(await meta.get(STATE_KEY));
      if (state.activeEnvironmentId === id) {
        const next = { ...state };
        delete next.activeEnvironmentId;
        await meta.put(next, STATE_KEY);
      }
      return existed;
    });
  }

  async readState(): Promise<HttpClientState> {
    return asState(await httpClientDb.store("meta").get(STATE_KEY));
  }

  async writeState(state: HttpClientState): Promise<void> {
    await httpClientDb.store("meta").put(state, STATE_KEY);
  }

  async setActiveEnvironment(id: string | undefined): Promise<void> {
    await httpClientDb.store("meta").update(STATE_KEY, (current) => {
      const next = { ...asState(current) };
      if (id) next.activeEnvironmentId = id;
      else delete next.activeEnvironmentId;
      return next;
    });
  }

  /** One transaction, so two tabs opening at once cannot each create a starter collection. */
  async ensureSeed(): Promise<void> {
    await httpClientDb.transaction(["collections", "environments", "meta"], "readwrite", async (tx) => {
      const collections = tx.store("collections");
      if ((await collections.count()) === 0) {
        await collections.put({ ...createCollection({ name: "My API" }), updatedAt: Date.now() });
      }
      const environments = tx.store("environments");
      if ((await environments.count()) === 0) {
        const local = createEnvironment({
          name: "Local",
          variables: [{ key: "baseUrl", value: "http://localhost:3000", enabled: true }],
        });
        await environments.put({ ...local, updatedAt: Date.now() });
        const meta = tx.store("meta");
        await meta.put({ ...asState(await meta.get(STATE_KEY)), activeEnvironmentId: local.id }, STATE_KEY);
      }
    });
  }
}

const entriesOf = (requestId: string) =>
  IDBKeyRange.bound([requestId, -Infinity], [requestId, Infinity]);

/** Saved responses in IndexedDB, newest first per request. */
export class IdbHistory implements HistoryStore {
  async readHistory(requestId: string): Promise<ResponseHistoryEntry[]> {
    const entries = await httpClientDb.store("history").index("byRequest").getAll(entriesOf(requestId));
    return entries.reverse();
  }

  getEntry(requestId: string, entryId: string): Promise<ResponseHistoryEntry | undefined> {
    return httpClientDb
      .store("history")
      .get(entryId)
      .then((entry) => (entry && entry.requestId === requestId ? entry : undefined));
  }

  async pushHistory(entry: ResponseHistoryEntry, limit: number): Promise<void> {
    try {
      await this.write(entry, limit);
    } catch (error) {
      if (!(error instanceof IndexedDbError && error.isQuotaExceeded)) throw error;
      // Out of space: history is the cheapest thing to lose, so drop the oldest and try once more.
      await this.evictOldest(QUOTA_EVICT_COUNT);
      await this.write(entry, limit);
    }
  }

  async writeHistory(requestId: string, entries: ResponseHistoryEntry[]): Promise<void> {
    await httpClientDb.transaction(["history"], "readwrite", async (tx) => {
      const history = tx.store("history");
      await history.deleteMany(await history.index("byRequest").keys(entriesOf(requestId)));
      await history.putMany(entries);
    });
  }

  deleteEntry(entryId: string): Promise<void> {
    return httpClientDb.store("history").delete(entryId);
  }

  async deleteHistory(requestId: string): Promise<boolean> {
    return httpClientDb.transaction(["history"], "readwrite", async (tx) => {
      const history = tx.store("history");
      const ids = await history.index("byRequest").keys(entriesOf(requestId));
      await history.deleteMany(ids);
      return ids.length > 0;
    });
  }

  async evictOldest(count: number): Promise<void> {
    const history = httpClientDb.store("history");
    await history.deleteMany(await history.index("byAt").keys(null, count));
  }

  private async write(entry: ResponseHistoryEntry, limit: number): Promise<void> {
    await httpClientDb.transaction(["history"], "readwrite", async (tx) => {
      const history = tx.store("history");
      if (limit > 0) await history.put(entry);
      // Oldest first; whatever is beyond the limit goes.
      const ids = await history.index("byRequest").keys(entriesOf(entry.requestId));
      const excess = ids.length - Math.max(0, limit);
      if (excess > 0) await history.deleteMany(ids.slice(0, excess));
    });
  }
}

export const idbHistory = new IdbHistory();

/**
 * Once: copies the history the server kept before it moved into the browser. Entries have fixed
 * ids, so running it again would change nothing; it stops asking after the first success.
 */
export async function adoptServerHistory(
  readServerHistory: (requestIds: string[]) => Promise<Record<string, ResponseHistoryEntry[]>>,
): Promise<void> {
  const meta = httpClientDb.store("meta");
  if (await meta.get(HISTORY_ADOPTED_KEY)) return;

  const collections = await httpClientDb.store("collections").getAll();
  const requestIds = collections.flatMap((collection) => eachRequest(collection).map((request) => request.id));
  if (requestIds.length > 0) {
    try {
      const entries = Object.values(await readServerHistory(requestIds)).flat();
      if (entries.length > 0) await httpClientDb.store("history").putMany(entries);
    } catch {
      // Not copied: leave the flag unset so the next load tries again.
      return;
    }
  }
  await meta.put(true, HISTORY_ADOPTED_KEY);
}

/**
 * First run only: copies what the server saved before the data moved into the browser. It does
 * nothing once the browser holds data of its own, so it never overwrites anything.
 */
export async function adoptServerData(readServerTree: () => Promise<HttpTree>): Promise<void> {
  const meta = httpClientDb.store("meta");
  if (await meta.get(ADOPTED_KEY)) return;

  const [collections, environments] = await Promise.all([
    httpClientDb.store("collections").count(),
    httpClientDb.store("environments").count(),
  ]);
  if (collections === 0 && environments === 0) {
    let tree: HttpTree;
    try {
      // Outside the transaction: a transaction must not wait on the network.
      tree = await readServerTree();
    } catch {
      // Try again next time rather than starting from an empty copy and never looking again.
      return;
    }
    await httpClientDb.transaction(["collections", "environments", "meta"], "readwrite", async (tx) => {
      // Another tab may have filled the database while the server was answering.
      if ((await tx.store("collections").count()) > 0 || (await tx.store("environments").count()) > 0) return;
      await tx.store("collections").putMany(tree.collections);
      await tx.store("environments").putMany(tree.environments);
      await tx.store("meta").put(
        {
          globals: tree.globals,
          ...(tree.activeEnvironmentId ? { activeEnvironmentId: tree.activeEnvironmentId } : {}),
        },
        STATE_KEY,
      );
    });
  }
  await meta.put(true, ADOPTED_KEY);
}
