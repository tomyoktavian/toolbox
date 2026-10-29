// Web Crypto is global in Node and the browser, which keeps this module usable by the client host.
import type {
  AuthConfig,
  Collection,
  CollectionSummary,
  Environment,
  HttpRequest,
  RequestFolder,
  RequestProtocol,
} from './types';

export type ResolvedAuth = Exclude<AuthConfig, { type: 'inherit' }>;

export interface AuthResolution {
  auth: ResolvedAuth;
  from: 'request' | 'folder' | 'collection';
}

export function newId(): string {
  return globalThis.crypto.randomUUID();
}

export function createRequest(patch: Partial<HttpRequest> = {}): HttpRequest {
  const protocol: RequestProtocol = patch.protocol ?? 'rest';
  return {
    id: patch.id ?? newId(),
    name: patch.name ?? (protocol === 'ws' ? 'New socket' : 'New request'),
    protocol,
    method: patch.method ?? 'GET',
    url: patch.url ?? '',
    params: patch.params ?? [],
    headers: patch.headers ?? [],
    body: patch.body ?? { mode: 'none' },
    auth: patch.auth ?? { type: 'inherit' },
    ...(patch.description !== undefined ? { description: patch.description } : {}),
    ...(patch.scripts !== undefined ? { scripts: patch.scripts } : {}),
    ...(patch.wsProtocols !== undefined ? { wsProtocols: patch.wsProtocols } : {}),
    ...(patch.examples !== undefined ? { examples: patch.examples } : {}),
  };
}

export function createFolder(patch: Partial<RequestFolder> = {}): RequestFolder {
  return {
    id: patch.id ?? newId(),
    name: patch.name ?? 'New folder',
    auth: patch.auth ?? { type: 'inherit' },
    folders: patch.folders ?? [],
    requests: patch.requests ?? [],
    ...(patch.description !== undefined ? { description: patch.description } : {}),
    ...(patch.scripts !== undefined ? { scripts: patch.scripts } : {}),
  };
}

export function createCollection(patch: Partial<Collection> = {}): Collection {
  return {
    id: patch.id ?? newId(),
    name: patch.name ?? 'New collection',
    auth: patch.auth ?? { type: 'none' },
    variables: patch.variables ?? [],
    folders: patch.folders ?? [],
    requests: patch.requests ?? [],
    updatedAt: patch.updatedAt ?? Date.now(),
    ...(patch.description !== undefined ? { description: patch.description } : {}),
    ...(patch.scripts !== undefined ? { scripts: patch.scripts } : {}),
  };
}

export function createEnvironment(patch: Partial<Environment> = {}): Environment {
  return {
    id: patch.id ?? newId(),
    name: patch.name ?? 'New environment',
    variables: patch.variables ?? [],
    updatedAt: patch.updatedAt ?? Date.now(),
  };
}

export function eachRequest(collection: Collection): HttpRequest[] {
  const out: HttpRequest[] = [...collection.requests];
  const walk = (folders: readonly RequestFolder[]): void => {
    for (const folder of folders) {
      out.push(...folder.requests);
      walk(folder.folders);
    }
  };
  walk(collection.folders);
  return out;
}

export function findRequest(
  collection: Collection,
  requestId: string,
): { request: HttpRequest; folderPath: string[] } | undefined {
  const direct = collection.requests.find((r) => r.id === requestId);
  if (direct) return { request: direct, folderPath: [] };
  const walk = (
    folders: readonly RequestFolder[],
    path: string[],
  ): { request: HttpRequest; folderPath: string[] } | undefined => {
    for (const folder of folders) {
      const hit = folder.requests.find((r) => r.id === requestId);
      if (hit) return { request: hit, folderPath: [...path, folder.id] };
      const deeper = walk(folder.folders, [...path, folder.id]);
      if (deeper) return deeper;
    }
    return undefined;
  };
  return walk(collection.folders, []);
}

export function findFolder(collection: Collection, folderId: string): RequestFolder | undefined {
  const walk = (folders: readonly RequestFolder[]): RequestFolder | undefined => {
    for (const folder of folders) {
      if (folder.id === folderId) return folder;
      const deeper = walk(folder.folders);
      if (deeper) return deeper;
    }
    return undefined;
  };
  return walk(collection.folders);
}

export function removeRequest(collection: Collection, requestId: string): boolean {
  const before = collection.requests.length;
  collection.requests = collection.requests.filter((r) => r.id !== requestId);
  if (collection.requests.length !== before) return true;
  const walk = (folders: RequestFolder[]): boolean => {
    for (const folder of folders) {
      const count = folder.requests.length;
      folder.requests = folder.requests.filter((r) => r.id !== requestId);
      if (folder.requests.length !== count) return true;
      if (walk(folder.folders)) return true;
    }
    return false;
  };
  return walk(collection.folders);
}

export function removeFolder(collection: Collection, folderId: string): boolean {
  const before = collection.folders.length;
  collection.folders = collection.folders.filter((f) => f.id !== folderId);
  if (collection.folders.length !== before) return true;
  const walk = (folders: RequestFolder[]): boolean => {
    for (const folder of folders) {
      const count = folder.folders.length;
      folder.folders = folder.folders.filter((f) => f.id !== folderId);
      if (folder.folders.length !== count) return true;
      if (walk(folder.folders)) return true;
    }
    return false;
  };
  return walk(collection.folders);
}

export function summarize(collection: Collection): CollectionSummary {
  return {
    id: collection.id,
    name: collection.name,
    updatedAt: collection.updatedAt,
    requestCount: eachRequest(collection).length,
    ...(collection.description !== undefined ? { description: collection.description } : {}),
  };
}

export function authChain(
  collection: Collection,
  folderPath: readonly string[],
  request: HttpRequest,
): AuthResolution {
  if (request.auth.type !== 'inherit') return { auth: request.auth, from: 'request' };
  let folders: readonly RequestFolder[] = collection.folders;
  let inherited: AuthResolution =
    collection.auth.type === 'inherit'
      ? { auth: { type: 'none' }, from: 'collection' }
      : { auth: collection.auth, from: 'collection' };
  for (const id of folderPath) {
    const folder = folders.find((f) => f.id === id);
    if (!folder) break;
    if (folder.auth.type !== 'inherit') inherited = { auth: folder.auth, from: 'folder' };
    folders = folder.folders;
  }
  return inherited;
}
