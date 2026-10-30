import {
  createCollection,
  createEnvironment,
  createFolder,
  createRequest,
  eachRequest,
  findFolder,
  findRequest,
  newId,
  removeFolder,
  removeRequest,
  summarize,
  type ResolvedAuth,
} from '../model/factory';
import type {
  AuthConfig,
  Collection,
  CollectionSummary,
  Environment,
  HttpRequest,
  KeyValue,
  RequestFolder,
  RequestScripts,
} from '../model/types';
import { exportNative } from '../export/native';
import { exportPostmanCollection, exportPostmanEnvironment } from '../export/postman-collection';
import { hostOf, parseCurl } from '../import/curl';
import { importAny } from '../import/detect';
import type { HttpClientStore } from '../store/types';

export interface HttpTree {
  collections: Collection[];
  summaries: CollectionSummary[];
  environments: Environment[];
  activeEnvironmentId?: string;
  globals: KeyValue[];
}

/** Everything a request run needs to know about where it lives. */
export interface RunContext {
  collection?: Collection;
  environment?: Environment;
  globals: KeyValue[];
  folderPath: string[];
}

/** Variable changes by key; `null` removes the key. */
export type VariablePatch = Record<string, string | null>;

/** What a run changed besides the response, for the caller to apply to wherever the data lives. */
export interface ContextChanges {
  environment?: VariablePatch;
  collection?: VariablePatch;
  globals?: VariablePatch;
  /** A refreshed OAuth2 token, for the request or for the collection it inherits from. */
  auth?: ResolvedAuth;
}

export interface OAuthToken {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
}

export interface ImportSummary {
  kind: string;
  collections: number;
  environments: number;
}

export function mergePairs(existing: readonly KeyValue[], patch: VariablePatch): KeyValue[] {
  const out = existing.filter((pair) => patch[pair.key] !== null).map((pair) => ({ ...pair }));
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) continue;
    const hit = out.find((pair) => pair.key === key);
    if (hit) {
      hit.value = value;
      hit.enabled = true;
    } else out.push({ key, value, enabled: true });
  }
  return out;
}

function hasScripts(scripts: RequestScripts | undefined): scripts is RequestScripts {
  return Boolean(scripts?.preRequest?.trim() || scripts?.postResponse?.trim());
}

/**
 * Reads and edits collections and environments on a store. It needs no Node APIs, so it runs
 * in the browser against IndexedDB as well as on the server against files.
 */
export class Workspace {
  private seeded = false;
  private seeding: Promise<void> | undefined;

  constructor(
    readonly store: HttpClientStore,
    /** Drops the saved responses of a request that was deleted. */
    private readonly forgetHistory: (requestId: string) => Promise<unknown> | unknown,
  ) {}

  async tree(): Promise<HttpTree> {
    if (!this.seeded) {
      // Concurrent first calls share one seed run; otherwise each would create its own seed.
      this.seeding ??= this.store.ensureSeed();
      await this.seeding;
      this.seeded = true;
    }
    const [collections, environments, state] = await Promise.all([
      this.store.allCollections(),
      this.store.listEnvironments(),
      this.store.readState(),
    ]);
    return {
      collections,
      summaries: collections.map(summarize),
      environments,
      globals: state.globals ?? [],
      ...(state.activeEnvironmentId ? { activeEnvironmentId: state.activeEnvironmentId } : {}),
    };
  }

  async mutate(
    collectionId: string,
    change: (collection: Collection) => boolean | void,
  ): Promise<Collection | undefined> {
    const collection = await this.store.getCollection(collectionId);
    if (!collection) return undefined;
    if (change(collection) === false) return undefined;
    return this.store.saveCollection(collection);
  }

  createCollection(name: string): Promise<Collection> {
    return this.store.saveCollection(createCollection({ name }));
  }

  async saveCollectionSettings(
    collectionId: string,
    patch: {
      name: string;
      description?: string;
      variables: KeyValue[];
      auth: AuthConfig;
      scripts?: RequestScripts;
    },
  ): Promise<void> {
    await this.mutate(collectionId, (collection) => {
      collection.name = patch.name;
      if (patch.description?.trim()) collection.description = patch.description;
      else delete collection.description;
      collection.variables = patch.variables;
      collection.auth = patch.auth;
      if (hasScripts(patch.scripts)) collection.scripts = patch.scripts;
      else delete collection.scripts;
    });
  }

  async deleteCollection(collectionId: string): Promise<boolean> {
    const collection = await this.store.getCollection(collectionId);
    if (collection) {
      for (const request of eachRequest(collection)) await this.forgetHistory(request.id);
    }
    return this.store.deleteCollection(collectionId);
  }

  addRequest(
    collectionId: string,
    request: HttpRequest,
    folderId?: string,
  ): Promise<Collection | undefined> {
    return this.mutate(collectionId, (collection) => {
      const target = folderId ? findFolder(collection, folderId) : undefined;
      (target ? target.requests : collection.requests).push(request);
    });
  }

  async newRequest(
    collectionId: string,
    protocol: 'rest' | 'ws',
    folderId?: string,
  ): Promise<string> {
    const request = createRequest({
      name: protocol === 'ws' ? 'New WebSocket' : 'New HTTP',
      protocol,
    });
    await this.addRequest(collectionId, request, folderId);
    return request.id;
  }

  addFolder(
    collectionId: string,
    folder: RequestFolder,
    parentFolderId?: string,
  ): Promise<Collection | undefined> {
    return this.mutate(collectionId, (collection) => {
      const parent = parentFolderId ? findFolder(collection, parentFolderId) : undefined;
      (parent ? parent.folders : collection.folders).push(folder);
    });
  }

  async newFolder(collectionId: string, parentFolderId?: string): Promise<string> {
    const folder = createFolder({ name: 'New folder' });
    await this.addFolder(collectionId, folder, parentFolderId);
    return folder.id;
  }

  async saveFolderSettings(
    collectionId: string,
    folderId: string,
    patch: { name: string; description?: string; auth: AuthConfig; scripts?: RequestScripts },
  ): Promise<void> {
    await this.mutate(collectionId, (collection) => {
      const folder = findFolder(collection, folderId);
      if (!folder) return false;
      folder.name = patch.name;
      if (patch.description?.trim()) folder.description = patch.description;
      else delete folder.description;
      folder.auth = patch.auth;
      if (hasScripts(patch.scripts)) folder.scripts = patch.scripts;
      else delete folder.scripts;
    });
  }

  async deleteFolder(collectionId: string, folderId: string): Promise<Collection | undefined> {
    const collection = await this.store.getCollection(collectionId);
    const folder = collection ? findFolder(collection, folderId) : undefined;
    if (folder) {
      for (const request of eachRequest({ ...collection!, folders: [folder], requests: [] })) {
        await this.forgetHistory(request.id);
      }
    }
    return this.mutate(collectionId, (target) => removeFolder(target, folderId));
  }

  duplicateRequest(collectionId: string, requestId: string): Promise<Collection | undefined> {
    return this.mutate(collectionId, (collection) => {
      const found = findRequest(collection, requestId);
      if (!found) return false;
      const copy: HttpRequest = {
        ...structuredClone(found.request),
        id: newId(),
        name: `${found.request.name} copy`,
      };
      const folderId = found.folderPath[found.folderPath.length - 1];
      const folder = folderId ? findFolder(collection, folderId) : undefined;
      (folder ? folder.requests : collection.requests).push(copy);
    });
  }

  /**
   * Copies a request next to the original and returns the copy's id. `current` is what the open tab
   * holds (possibly unsaved edits); without it the saved request is copied.
   */
  async duplicateRequestAs(
    collectionId: string,
    requestId: string,
    current: HttpRequest | null,
  ): Promise<string> {
    const copyId = newId();
    await this.mutate(collectionId, (collection) => {
      const found = findRequest(collection, requestId);
      if (!found) return false;
      const source = current ?? found.request;
      const copy: HttpRequest = {
        ...structuredClone(source),
        id: copyId,
        name: `${source.name} copy`,
        ...(source.examples
          ? {
              examples: source.examples.map((example) => ({
                ...structuredClone(example),
                id: newId(),
              })),
            }
          : {}),
      };
      const folderId = found.folderPath[found.folderPath.length - 1];
      const folder = folderId ? findFolder(collection, folderId) : undefined;
      (folder ? folder.requests : collection.requests).push(copy);
    });
    return copyId;
  }

  saveRequest(collectionId: string, request: HttpRequest): Promise<Collection | undefined> {
    return this.mutate(collectionId, (collection) => {
      const found = findRequest(collection, request.id);
      if (!found) return false;
      Object.assign(found.request, request);
    });
  }

  async deleteRequest(collectionId: string, requestId: string): Promise<Collection | undefined> {
    await this.forgetHistory(requestId);
    return this.mutate(collectionId, (collection) => removeRequest(collection, requestId));
  }

  async deleteExample(
    collectionId: string,
    requestId: string,
    exampleId: string,
  ): Promise<void> {
    await this.mutate(collectionId, (target) => {
      const hit = findRequest(target, requestId);
      if (!hit) return false;
      const remaining = (hit.request.examples ?? []).filter((item) => item.id !== exampleId);
      if (remaining.length > 0) hit.request.examples = remaining;
      else delete hit.request.examples;
    });
  }

  /** Adds a cURL command as a request; with no collection id it goes into a new one named after the host. */
  async importCurl(
    text: string,
    collectionId?: string,
  ): Promise<{ collectionId: string; requestId: string }> {
    const request = parseCurl(text);
    const targetId = collectionId ?? (await this.createCollection(hostOf(request.url))).id;
    await this.addRequest(targetId, request);
    return { collectionId: targetId, requestId: request.id };
  }

  async importText(text: string): Promise<ImportSummary> {
    const result = importAny(text);
    for (const collection of result.collections) await this.store.saveCollection(collection);
    for (const environment of result.environments) await this.store.saveEnvironment(environment);
    const state = await this.store.readState();
    const first = result.environments[0];
    if (!state.activeEnvironmentId && first) await this.store.setActiveEnvironment(first.id);
    return {
      kind: result.kind,
      collections: result.collections.length,
      environments: result.environments.length,
    };
  }

  async exportText(format: 'postman' | 'native', collectionId?: string): Promise<string> {
    const collections = await this.store.allCollections();
    const selected = collectionId ? collections.filter((c) => c.id === collectionId) : collections;
    if (format === 'native') {
      return exportNative(selected, await this.store.listEnvironments());
    }
    const single = selected[0];
    if (!single) throw new Error('No collection to export.');
    return exportPostmanCollection(single);
  }

  async exportEnvironmentText(environmentId: string): Promise<string> {
    const environment = await this.store.getEnvironment(environmentId);
    if (!environment) throw new Error('Environment not found.');
    return exportPostmanEnvironment(environment);
  }

  async newEnvironment(name?: string): Promise<string> {
    const environment = await this.store.saveEnvironment(
      createEnvironment({
        name: name?.trim() || 'New environment',
        variables: [{ key: 'baseUrl', value: 'http://localhost:3000', enabled: true }],
      }),
    );
    const state = await this.store.readState();
    if (!state.activeEnvironmentId) await this.store.setActiveEnvironment(environment.id);
    return environment.id;
  }

  async duplicateEnvironment(environmentId: string): Promise<string | undefined> {
    const source = await this.store.getEnvironment(environmentId);
    if (!source) return undefined;
    const copy = await this.store.saveEnvironment(
      createEnvironment({
        name: `${source.name} copy`,
        variables: source.variables.map((variable) => ({ ...variable })),
      }),
    );
    return copy.id;
  }

  async saveGlobals(globals: KeyValue[]): Promise<void> {
    const state = await this.store.readState();
    await this.store.writeState({ ...state, globals });
  }

  /** Where a request run, or the user, left a request: its saved state, the active environment, globals, folders. */
  async context(
    collectionId: string,
    requestId: string,
    environmentId: string | undefined,
  ): Promise<RunContext> {
    const collection = await this.store.getCollection(collectionId);
    const state = await this.store.readState();
    const wanted = environmentId ?? state.activeEnvironmentId;
    const environment = wanted ? await this.store.getEnvironment(wanted) : undefined;
    const folderPath = collection ? (findRequest(collection, requestId)?.folderPath ?? []) : [];
    return {
      ...(collection ? { collection } : {}),
      ...(environment ? { environment } : {}),
      globals: state.globals ?? [],
      folderPath,
    };
  }

  /**
   * Applies what a run changed. Variables are merged into what is stored now, not into the copy the
   * run started from, so edits made while it ran are kept.
   */
  async applyRunChanges(
    collectionId: string,
    requestId: string,
    context: RunContext,
    changes: ContextChanges,
  ): Promise<void> {
    if (changes.environment && context.environment) {
      const current = await this.store.getEnvironment(context.environment.id);
      if (current) {
        await this.store.saveEnvironment({
          ...current,
          variables: mergePairs(current.variables, changes.environment),
        });
      }
    }
    const collectionPatch = changes.collection;
    if (collectionPatch) {
      await this.mutate(collectionId, (target) => {
        target.variables = mergePairs(target.variables, collectionPatch);
      });
    }
    if (changes.globals) {
      const state = await this.store.readState();
      await this.store.writeState({
        ...state,
        globals: mergePairs(state.globals ?? [], changes.globals),
      });
    }
    if (changes.auth) await this.applyAuth(collectionId, requestId, changes.auth);
  }

  async applyAuth(collectionId: string, requestId: string, auth: ResolvedAuth): Promise<void> {
    await this.mutate(collectionId, (collection) => {
      const found = findRequest(collection, requestId);
      if (found && found.request.auth.type === 'oauth2') found.request.auth = auth;
      else if (collection.auth.type === 'oauth2') collection.auth = auth;
      else return false;
    });
  }

  /** Stores the token an authorization-code flow obtained on the request that started it. */
  async applyOAuthToken(collectionId: string, requestId: string, token: OAuthToken): Promise<void> {
    await this.mutate(collectionId, (collection) => {
      const found = findRequest(collection, requestId);
      if (!found || found.request.auth.type !== 'oauth2') return false;
      found.request.auth = {
        ...found.request.auth,
        accessToken: token.accessToken,
        ...(token.refreshToken ? { refreshToken: token.refreshToken } : {}),
        ...(token.expiresAt !== undefined ? { expiresAt: token.expiresAt } : {}),
      };
    });
  }
}
