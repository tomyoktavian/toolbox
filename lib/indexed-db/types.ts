export interface IndexDefinition {
  keyPath: string | string[];
  unique?: boolean;
  multiEntry?: boolean;
}

export interface StoreOptions {
  /** In-line key. Omit it for out-of-line keys, which are passed to `put` and `add`. */
  keyPath?: string | string[];
  autoIncrement?: boolean;
  indexes?: Record<string, IndexDefinition>;
}

/** `T` exists only at the type level, so `database.store("name")` knows the value type. */
export interface StoreDefinition<T = unknown> extends StoreOptions {
  readonly __value?: T;
}

export function defineStore<T>(options: StoreOptions = {}): StoreDefinition<T> {
  return { ...options };
}

export type StoreMap = Record<string, StoreDefinition>;
export type StoreName<S extends StoreMap> = keyof S & string;
export type StoreValue<S extends StoreMap, K extends StoreName<S>> =
  S[K] extends StoreDefinition<infer V> ? V : never;

export interface UpgradeContext {
  db: IDBDatabase;
  /** The versionchange transaction; only IndexedDB requests may run in it. */
  transaction: IDBTransaction;
  oldVersion: number;
  newVersion: number;
}

export interface DatabaseDefinition<S extends StoreMap> {
  name: string;
  /** Bump it whenever `stores` changes or `migrate` has new work. */
  version: number;
  stores: S;
  /**
   * Runs during an upgrade, after the missing stores and indexes in `stores` are created.
   * Stores and indexes removed from `stores` are never dropped automatically; drop them here.
   */
  migrate?: (context: UpgradeContext) => void;
}
