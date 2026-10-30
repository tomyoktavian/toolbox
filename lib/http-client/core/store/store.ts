import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createCollection, createEnvironment } from '../model/factory';
import type { Collection, Environment, ResponseHistoryEntry } from '../model/types';
import type { HttpClientStoragePort } from '../ports/storage';
import type { HistoryStore, HttpClientState, HttpClientStore } from './types';

const COLLECTIONS = 'collections';
const ENVIRONMENTS = 'environments';
const HISTORY = 'history';
const STATE_FILE = 'state.json';

export type { HttpClientState } from './types';

/** Keeps everything as JSON files under the storage root. */
export class FileStore implements HttpClientStore, HistoryStore {
  constructor(private readonly storage: HttpClientStoragePort) {}

  private dir(kind: string): string {
    return join(this.storage.root(), kind);
  }

  async allCollections(): Promise<Collection[]> {
    const rows = await this.readAll<Collection>(COLLECTIONS);
    return rows.sort((a, b) => a.name.localeCompare(b.name));
  }

  getCollection(id: string): Promise<Collection | undefined> {
    return this.readOne<Collection>(COLLECTIONS, id);
  }

  async saveCollection(collection: Collection): Promise<Collection> {
    const next: Collection = { ...collection, updatedAt: Date.now() };
    await this.writeOne(COLLECTIONS, next.id, next);
    return next;
  }

  deleteCollection(id: string): Promise<boolean> {
    return this.removeOne(COLLECTIONS, id);
  }

  async listEnvironments(): Promise<Environment[]> {
    const rows = await this.readAll<Environment>(ENVIRONMENTS);
    return rows.sort((a, b) => a.name.localeCompare(b.name));
  }

  getEnvironment(id: string): Promise<Environment | undefined> {
    return this.readOne<Environment>(ENVIRONMENTS, id);
  }

  async saveEnvironment(environment: Environment): Promise<Environment> {
    const next: Environment = { ...environment, updatedAt: Date.now() };
    await this.writeOne(ENVIRONMENTS, next.id, next);
    return next;
  }

  async deleteEnvironment(id: string): Promise<boolean> {
    const removed = await this.removeOne(ENVIRONMENTS, id);
    const state = await this.readState();
    if (state.activeEnvironmentId === id) {
      delete state.activeEnvironmentId;
      await this.writeState(state);
    }
    return removed;
  }

  async readState(): Promise<HttpClientState> {
    try {
      const raw = await readFile(join(this.storage.root(), STATE_FILE), 'utf8');
      const parsed = JSON.parse(raw) as HttpClientState;
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  async writeState(state: HttpClientState): Promise<void> {
    await mkdir(this.storage.root(), { recursive: true });
    await writeFile(join(this.storage.root(), STATE_FILE), JSON.stringify(state, null, 2), 'utf8');
  }

  async setActiveEnvironment(id: string | undefined): Promise<void> {
    const state = await this.readState();
    if (id) state.activeEnvironmentId = id;
    else delete state.activeEnvironmentId;
    await this.writeState(state);
  }

  async ensureSeed(): Promise<void> {
    const collections = await this.readAll<Collection>(COLLECTIONS);
    if (collections.length === 0) {
      await this.saveCollection(createCollection({ name: 'My API' }));
    }
    const environments = await this.readAll<Environment>(ENVIRONMENTS);
    if (environments.length === 0) {
      const local = createEnvironment({
        name: 'Local',
        variables: [{ key: 'baseUrl', value: 'http://localhost:3000', enabled: true }],
      });
      await this.saveEnvironment(local);
      await this.setActiveEnvironment(local.id);
    }
  }

  async readHistory(requestId: string): Promise<ResponseHistoryEntry[]> {
    return (await this.readOne<ResponseHistoryEntry[]>(HISTORY, requestId)) ?? [];
  }

  async pushHistory(entry: ResponseHistoryEntry, limit: number): Promise<ResponseHistoryEntry[]> {
    const next = [entry, ...(await this.readHistory(entry.requestId))].slice(0, Math.max(0, limit));
    if (next.length === 0) await this.removeOne(HISTORY, entry.requestId);
    else await this.writeOne(HISTORY, entry.requestId, next);
    return next;
  }

  async writeHistory(requestId: string, entries: ResponseHistoryEntry[]): Promise<void> {
    if (entries.length === 0) await this.removeOne(HISTORY, requestId);
    else await this.writeOne(HISTORY, requestId, entries);
  }

  deleteHistory(requestId: string): Promise<boolean> {
    return this.removeOne(HISTORY, requestId);
  }

  private async readAll<T>(kind: string): Promise<T[]> {
    let names: string[];
    try {
      names = await readdir(this.dir(kind));
    } catch {
      return [];
    }
    const out: T[] = [];
    for (const name of names) {
      if (!name.endsWith('.json')) continue;
      try {
        out.push(JSON.parse(await readFile(join(this.dir(kind), name), 'utf8')) as T);
      } catch {}
    }
    return out;
  }

  private async readOne<T>(kind: string, id: string): Promise<T | undefined> {
    try {
      return JSON.parse(await readFile(join(this.dir(kind), `${safeId(id)}.json`), 'utf8')) as T;
    } catch {
      return undefined;
    }
  }

  private async writeOne(kind: string, id: string, value: unknown): Promise<void> {
    await mkdir(this.dir(kind), { recursive: true });
    await writeFile(
      join(this.dir(kind), `${safeId(id)}.json`),
      JSON.stringify(value, null, 2),
      'utf8',
    );
  }

  private async removeOne(kind: string, id: string): Promise<boolean> {
    try {
      await rm(join(this.dir(kind), `${safeId(id)}.json`));
      return true;
    } catch {
      return false;
    }
  }
}

export function safeId(id: string): string {
  const cleaned = id.replace(/[^a-zA-Z0-9._-]/g, '_');
  if (!cleaned || cleaned === '.' || cleaned === '..') throw new Error(`Invalid id: ${id}`);
  return cleaned;
}
