import { toIndexedDbError } from "./errors";

export type KeyQuery = IDBValidKey | IDBKeyRange;

/** Settles when the transaction commits, so a write has reached storage before its promise resolves. */
export function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () =>
      reject(tx.error ?? new DOMException("The transaction was aborted.", "AbortError"));
  });
}

export function requestResult<R>(request: IDBRequest<R>): Promise<R> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export interface IndexReader<T> {
  get(key: KeyQuery): Promise<T | undefined>;
  getAll(query?: KeyQuery | null, count?: number): Promise<T[]>;
  keys(query?: KeyQuery | null, count?: number): Promise<IDBValidKey[]>;
  count(query?: KeyQuery | null): Promise<number>;
}

type Work<R> = (store: IDBObjectStore) => Promise<R>;

/**
 * Promise API over one object store. Each call is its own transaction, unless the store
 * came from `database.transaction`, where all calls share the caller's transaction.
 */
export class ObjectStore<T> {
  constructor(
    readonly name: string,
    private readonly connect: () => Promise<IDBDatabase>,
    /** Set when this store belongs to a caller-managed transaction. */
    private readonly tx?: IDBTransaction,
  ) {}

  get(key: KeyQuery): Promise<T | undefined> {
    return this.run("get", "readonly", async (store) => requestResult<T | undefined>(store.get(key)));
  }

  getAll(query?: KeyQuery | null, count?: number): Promise<T[]> {
    return this.run("getAll", "readonly", async (store) => requestResult<T[]>(store.getAll(query, count)));
  }

  keys(query?: KeyQuery | null, count?: number): Promise<IDBValidKey[]> {
    return this.run("keys", "readonly", async (store) => requestResult(store.getAllKeys(query, count)));
  }

  count(query?: KeyQuery | null): Promise<number> {
    return this.run("count", "readonly", async (store) => requestResult(store.count(query ?? undefined)));
  }

  add(value: T, key?: IDBValidKey): Promise<IDBValidKey> {
    return this.run("add", "readwrite", async (store) => requestResult(store.add(value, key)));
  }

  put(value: T, key?: IDBValidKey): Promise<IDBValidKey> {
    return this.run("put", "readwrite", async (store) => requestResult(store.put(value, key)));
  }

  /** One transaction for all values, so they are written together or not at all. Needs a `keyPath`. */
  putMany(values: readonly T[]): Promise<void> {
    return this.run("putMany", "readwrite", async (store) => {
      await Promise.all(values.map((value) => requestResult(store.put(value))));
    });
  }

  delete(key: KeyQuery): Promise<void> {
    return this.run("delete", "readwrite", async (store) => requestResult(store.delete(key)));
  }

  deleteMany(keys: readonly KeyQuery[]): Promise<void> {
    return this.run("deleteMany", "readwrite", async (store) => {
      await Promise.all(keys.map((key) => requestResult(store.delete(key))));
    });
  }

  clear(): Promise<void> {
    return this.run("clear", "readwrite", async (store) => requestResult(store.clear()));
  }

  /**
   * Reads, changes and writes one entry in a single transaction, so concurrent updates cannot
   * overwrite each other. Return `undefined` from `change` to delete the entry. `change` must be synchronous.
   */
  update(key: IDBValidKey, change: (current: T | undefined) => T | undefined): Promise<T | undefined> {
    return this.run("update", "readwrite", async (store) => {
      const current = await requestResult<T | undefined>(store.get(key));
      const next = change(current);
      if (next === undefined) await requestResult(store.delete(key));
      else await requestResult(store.put(next, store.keyPath === null ? key : undefined));
      return next;
    });
  }

  index(name: string): IndexReader<T> {
    return {
      get: (key) =>
        this.run(`${name}.get`, "readonly", async (store) =>
          requestResult<T | undefined>(store.index(name).get(key)),
        ),
      getAll: (query, count) =>
        this.run(`${name}.getAll`, "readonly", async (store) =>
          requestResult<T[]>(store.index(name).getAll(query, count)),
        ),
      keys: (query, count) =>
        this.run(`${name}.keys`, "readonly", async (store) =>
          requestResult(store.index(name).getAllKeys(query, count)),
        ),
      count: (query) =>
        this.run(`${name}.count`, "readonly", async (store) =>
          requestResult(store.index(name).count(query ?? undefined)),
        ),
    };
  }

  private async run<R>(action: string, mode: IDBTransactionMode, work: Work<R>): Promise<R> {
    let own: IDBTransaction | undefined;
    try {
      if (this.tx) return await work(this.tx.objectStore(this.name));
      const db = await this.connect();
      own = db.transaction(this.name, mode);
      const [result] = await Promise.all([work(own.objectStore(this.name)), transactionDone(own)]);
      return result;
    } catch (error) {
      // A failed batch must not commit the writes that did go through.
      try {
        own?.abort();
      } catch {}
      throw toIndexedDbError(error, `${this.name}.${action}`);
    }
  }
}
