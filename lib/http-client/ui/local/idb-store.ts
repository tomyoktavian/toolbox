import { createCollection, createEnvironment } from "@/lib/http-client/core/model/factory";
import type { Collection, Environment } from "@/lib/http-client/core/model/types";
import type { HttpClientState, HttpClientStore } from "@/lib/http-client/core/store/types";
import type { HttpTree } from "@/lib/http-client/core/workspace/workspace";
import { createDatabase, defineStore } from "@/lib/indexed-db";

type MetaValue = HttpClientState | boolean;

const STATE_KEY = "state";
const ADOPTED_KEY = "adopted-server-data";

/** The browser's copy of collections and environments. `meta` holds the state record and flags. */
export const httpClientDb = createDatabase({
  name: "http-client",
  version: 1,
  stores: {
    collections: defineStore<Collection>({ keyPath: "id" }),
    environments: defineStore<Environment>({ keyPath: "id" }),
    meta: defineStore<MetaValue>(),
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
