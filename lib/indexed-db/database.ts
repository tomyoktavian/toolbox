import { IndexedDbError, toIndexedDbError } from "./errors";
import { ObjectStore, transactionDone } from "./object-store";
import type { DatabaseDefinition, StoreMap, StoreName, StoreValue } from "./types";

export interface TransactionScope<S extends StoreMap, N extends StoreName<S>> {
  store<K extends N>(name: K): ObjectStore<StoreValue<S, K>>;
}

/** What the registry needs from a database, whatever its stores are. */
export interface DatabaseHandle {
  readonly name: string;
  close(): void;
  destroy(): Promise<void>;
}

export function isIndexedDbSupported(): boolean {
  return typeof indexedDB !== "undefined";
}

/**
 * One IndexedDB database. It opens lazily on first use (so importing it on the server is safe)
 * and reopens by itself after another tab upgrades the schema.
 */
export class IndexedDatabase<S extends StoreMap> implements DatabaseHandle {
  private connection?: Promise<IDBDatabase>;

  constructor(readonly definition: DatabaseDefinition<S>) {}

  get name(): string {
    return this.definition.name;
  }

  store<K extends StoreName<S>>(name: K): ObjectStore<StoreValue<S, K>> {
    return new ObjectStore(name, () => this.open());
  }

  /**
   * Runs `run` in one transaction over `names`. Throwing aborts it and rolls every write back.
   * Await only IndexedDB calls inside `run`: any other await lets the transaction commit early.
   */
  async transaction<N extends StoreName<S>, R>(
    names: readonly N[],
    mode: IDBTransactionMode,
    run: (scope: TransactionScope<S, N>) => Promise<R>,
  ): Promise<R> {
    let tx: IDBTransaction | undefined;
    try {
      const db = await this.open();
      tx = db.transaction([...names], mode);
      const scope = tx;
      const done = transactionDone(scope);
      // Aborting on error rejects `done` too; the original error is the one to report.
      done.catch(() => {});
      const result = await run({
        store: (name) => new ObjectStore(name, () => this.open(), scope),
      });
      await done;
      return result;
    } catch (error) {
      try {
        tx?.abort();
      } catch {}
      throw toIndexedDbError(error, `${this.name} transaction`);
    }
  }

  close(): void {
    const connection = this.connection;
    this.connection = undefined;
    connection?.then((db) => db.close(), () => {});
  }

  /** Deletes the database and everything in it. The next call reopens it empty. */
  async destroy(): Promise<void> {
    this.close();
    if (!isIndexedDbSupported()) return;
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(this.name);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(toIndexedDbError(request.error, `${this.name} delete`));
    });
  }

  private open(): Promise<IDBDatabase> {
    this.connection ??= this.connect().catch((error) => {
      this.connection = undefined;
      throw toIndexedDbError(error, `${this.name} open`);
    });
    return this.connection;
  }

  private connect(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      if (!isIndexedDbSupported()) {
        reject(new IndexedDbError("IndexedDB is not available in this environment."));
        return;
      }
      const request = indexedDB.open(this.name, this.definition.version);
      request.onupgradeneeded = (event) => {
        const { transaction } = request;
        if (transaction) this.upgrade(request.result, transaction, event.oldVersion);
      };
      request.onsuccess = () => {
        const db = request.result;
        // Another tab wants to upgrade: let go so it is not blocked, and reconnect on the next call.
        const release = () => {
          this.connection = undefined;
        };
        db.onversionchange = () => {
          db.close();
          release();
        };
        db.onclose = release;
        resolve(db);
      };
      request.onerror = () => reject(request.error);
    });
  }

  private upgrade(db: IDBDatabase, transaction: IDBTransaction, oldVersion: number): void {
    const { stores, migrate, version } = this.definition;
    for (const [name, definition] of Object.entries(stores)) {
      const objectStore = db.objectStoreNames.contains(name)
        ? transaction.objectStore(name)
        : db.createObjectStore(name, {
            keyPath: definition.keyPath,
            autoIncrement: definition.autoIncrement,
          });
      for (const [indexName, index] of Object.entries(definition.indexes ?? {})) {
        if (objectStore.indexNames.contains(indexName)) continue;
        objectStore.createIndex(indexName, index.keyPath, {
          unique: index.unique,
          multiEntry: index.multiEntry,
        });
      }
    }
    migrate?.({ db, transaction, oldVersion, newVersion: version });
  }
}

const registry = new Map<string, DatabaseHandle>();

/**
 * Declares a database. Every feature that needs local storage calls this with its own
 * definition, so a new database never touches the existing ones:
 *
 *   const collections = defineStore<Collection>({ keyPath: "id", indexes: { byName: { keyPath: "name" } } });
 *   export const httpDb = createDatabase({ name: "http-client", version: 1, stores: { collections } });
 *   await httpDb.store("collections").put(collection);
 */
export function createDatabase<S extends StoreMap>(
  definition: DatabaseDefinition<S>,
): IndexedDatabase<S> {
  const database = new IndexedDatabase(definition);
  // A hot reload declares the same name again; release the old connection first.
  registry.get(definition.name)?.close();
  registry.set(definition.name, database);
  return database;
}

export function getDatabase(name: string): DatabaseHandle | undefined {
  return registry.get(name);
}

export function listDatabases(): string[] {
  return [...registry.keys()];
}

/** For sign-out: deletes every database declared in this session. Others on the origin are left alone. */
export async function destroyAllDatabases(): Promise<void> {
  await Promise.all([...registry.values()].map((database) => database.destroy()));
}
