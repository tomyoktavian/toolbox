import type {
  Collection,
  Environment,
  KeyValue,
  ResponseHistoryEntry,
} from '../model/types';

export interface HttpClientState {
  activeEnvironmentId?: string;
  globals?: KeyValue[];
}

/** Collections, environments and the small state record. Implemented on files, in IndexedDB, and later in a database. */
export interface HttpClientStore {
  allCollections(): Promise<Collection[]>;
  getCollection(id: string): Promise<Collection | undefined>;
  saveCollection(collection: Collection): Promise<Collection>;
  deleteCollection(id: string): Promise<boolean>;

  listEnvironments(): Promise<Environment[]>;
  getEnvironment(id: string): Promise<Environment | undefined>;
  saveEnvironment(environment: Environment): Promise<Environment>;
  deleteEnvironment(id: string): Promise<boolean>;

  readState(): Promise<HttpClientState>;
  writeState(state: HttpClientState): Promise<void>;
  setActiveEnvironment(id: string | undefined): Promise<void>;

  /** Creates the starter collection and environment when there are none. Safe to call concurrently. */
  ensureSeed(): Promise<void>;
}

/** Saved responses per request. Kept in the browser on IndexedDB; the file store serves the agent tools. */
export interface HistoryStore {
  readHistory(requestId: string): Promise<ResponseHistoryEntry[]>;
  /** Adds an entry, then drops the oldest ones of that request beyond `limit`. */
  pushHistory(entry: ResponseHistoryEntry, limit: number): Promise<void>;
  writeHistory(requestId: string, entries: ResponseHistoryEntry[]): Promise<void>;
  deleteHistory(requestId: string): Promise<boolean>;
}
