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
} from '../model/factory';
import type {
  AuthConfig,
  Collection,
  Environment,
  HttpRequest,
  HttpResponse,
  KeyValue,
  RequestExample,
  RequestFolder,
  RequestScripts,
  ResponseHistoryEntry,
  ResponseHistorySummary,
} from '../model/types';
import { buildScope } from '../vars/resolve';
import {
  formatResponseSummary,
  prepareRequest,
  sendRestRequest,
  type RunnerDeps,
} from '../runner/rest-runner';
import { toCurl } from '../runner/curl';
import { fetchSpecText } from '../import/fetch-spec';
import type { HistoryStore, HttpClientStore } from '../store/types';
import {
  runScript,
  type ScriptLog,
  type ScriptOutcome,
  type ScriptVisualization,
  type ScriptRequestView,
  type ScriptTestResult,
  type VarBucket,
} from '../scripts/sandbox';
import {
  DEFAULT_HISTORY_LIMIT,
  mergePairs,
  summarizeHistory,
  Workspace,
  type ContextChanges,
  type HttpTree,
  type ImportSummary,
  type RunContext,
  type VariablePatch,
} from '../workspace/workspace';

export type { HttpTree } from '../workspace/workspace';

export interface ScriptReport {
  phase: 'pre-request' | 'post-response';
  logs: ScriptLog[];
  tests: ScriptTestResult[];
  error?: string;
  visualization?: ScriptVisualization;
}

export interface SendOutcome {
  response?: HttpResponse;
  error?: string;
  reports: ScriptReport[];
  skipped?: boolean;
}

export interface AgentSendResult {
  ok: boolean;
  summary: string;
  collectionId?: string;
  requestId?: string;
  outcome?: SendOutcome;
}

export interface AgentSendInput {
  collection?: string;
  request?: string;
  method?: string;
  url?: string;
  headers?: Record<string, string>;
  body?: string;
  environment?: string;
}

export { DEFAULT_HISTORY_LIMIT };

export interface HttpClientServiceOptions {
  historyLimit?: number;
}

export interface RunOutcome extends SendOutcome {
  /** Variable and token changes the run made; apply them to wherever the data is kept. */
  changes: ContextChanges;
  /** The response as a history entry, for the caller to store; absent when the request is not saved. */
  historyEntry?: ResponseHistoryEntry;
}

/** Runs requests. The data operations come from Workspace; this adds sending, history and the agent tools. */
export class HttpClientService extends Workspace {
  private readonly historyStore: HistoryStore;
  private historyLimit: number;

  constructor(
    store: HttpClientStore & HistoryStore,
    private readonly deps: RunnerDeps = {},
    options: HttpClientServiceOptions = {},
  ) {
    super(store, (requestId) => store.deleteHistory(requestId));
    this.historyStore = store;
    this.historyLimit = options.historyLimit ?? DEFAULT_HISTORY_LIMIT;
  }

  setHistoryLimit(limit: number): void {
    this.historyLimit = Math.max(0, Math.floor(limit));
  }

  async history(requestId: string): Promise<ResponseHistorySummary[]> {
    return (await this.historyStore.readHistory(requestId)).map(summarizeHistory);
  }

  async historyEntry(
    requestId: string,
    entryId: string,
  ): Promise<ResponseHistoryEntry | undefined> {
    return (await this.historyStore.readHistory(requestId)).find((entry) => entry.id === entryId);
  }

  async deleteHistoryEntry(requestId: string, entryId: string): Promise<void> {
    const kept = (await this.historyStore.readHistory(requestId)).filter(
      (entry) => entry.id !== entryId,
    );
    await this.historyStore.writeHistory(requestId, kept);
  }

  clearHistory(requestId: string): Promise<boolean> {
    return this.historyStore.deleteHistory(requestId);
  }

  /** The saved history of several requests at once; requests without any are left out. */
  async readHistories(requestIds: readonly string[]): Promise<Record<string, ResponseHistoryEntry[]>> {
    const rows = await Promise.all(
      requestIds.map(async (id) => [id, await this.historyStore.readHistory(id)] as const),
    );
    return Object.fromEntries(rows.filter(([, entries]) => entries.length > 0));
  }

  async curl(collectionId: string, request: HttpRequest, environmentId?: string): Promise<string> {
    const ctx = await this.context(collectionId, request.id, environmentId);
    const prepared = await prepareRequest(
      request,
      {
        ...(ctx.collection ? { collection: ctx.collection } : {}),
        ...(ctx.environment ? { environment: ctx.environment } : {}),
        globals: ctx.globals,
        folderPath: ctx.folderPath,
      },
      this.deps,
    );
    return toCurl(prepared);
  }

  async importUrl(url: string): Promise<ImportSummary> {
    return this.importText(await fetchSpecText(url));
  }

  /** Sends a request from the data in this service's own store and saves what the run changed there. */
  async send(
    collectionId: string,
    request: HttpRequest,
    options: { environmentId?: string; signal?: AbortSignal } = {},
  ): Promise<SendOutcome> {
    const ctx = await this.context(collectionId, request.id, options.environmentId);
    const { changes, historyEntry, ...outcome } = await this.sendWith(ctx, request, {
      ...(options.signal ? { signal: options.signal } : {}),
    });
    await this.applyRunChanges(collectionId, request.id, ctx, changes);
    if (historyEntry && this.historyLimit > 0) {
      await this.historyStore.pushHistory(historyEntry, this.historyLimit);
    }
    return outcome;
  }

  /**
   * Sends a request against a context the caller supplies, and reports the changes instead of
   * saving them, so the data can live somewhere this service cannot reach (the browser).
   */
  async sendWith(
    ctx: RunContext,
    request: HttpRequest,
    options: { signal?: AbortSignal } = {},
  ): Promise<RunOutcome> {
    const reports: ScriptReport[] = [];
    const changes: ContextChanges = {};
    const variables = {
      environment: toRecord(ctx.environment?.variables),
      collection: toRecord(ctx.collection?.variables),
      globals: toRecord(ctx.globals),
    };
    const record = (patches: ScriptOutcome['changes']): void => {
      for (const [bucket, patch] of Object.entries(patches) as Array<[VarBucket, VariablePatch]>) {
        if (Object.keys(patch).length === 0) continue;
        for (const [key, value] of Object.entries(patch)) {
          if (value === null) delete variables[bucket][key];
          else variables[bucket][key] = value;
        }
        // There is nothing stored to update when the request has no environment or collection.
        if (bucket === 'environment' && !ctx.environment) continue;
        if (bucket === 'collection' && !ctx.collection) continue;
        changes[bucket] = { ...changes[bucket], ...patch };
      }
    };

    let effective = request;
    const scripts = scriptChain(ctx.collection, ctx.folderPath, request);

    for (const code of scripts.preRequest) {
      const outcome = runScript(code, {
        phase: 'pre-request',
        request: toScriptRequest(effective),
        variables,
      });
      reports.push(toReport('pre-request', outcome));
      record(outcome.changes);
      if (outcome.request) effective = applyScriptRequest(effective, outcome.request);
      if (outcome.skipRequest) return { reports, skipped: true, changes };
      if (outcome.error) {
        return { reports, error: `Pre-request script failed: ${outcome.error}`, changes };
      }
    }

    const environment = ctx.environment
      ? { ...ctx.environment, variables: toPairs(variables.environment) }
      : undefined;
    const collection = ctx.collection
      ? { ...ctx.collection, variables: toPairs(variables.collection) }
      : undefined;

    let response: HttpResponse;
    try {
      response = await sendRestRequest(
        effective,
        {
          ...(collection ? { collection } : {}),
          ...(environment ? { environment } : {}),
          globals: toPairs(variables.globals),
          folderPath: ctx.folderPath,
          ...(options.signal ? { signal: options.signal } : {}),
          onAuthRefreshed: (auth) => {
            changes.auth = auth;
          },
        },
        this.deps,
      );
    } catch (error) {
      return { reports, error: error instanceof Error ? error.message : String(error), changes };
    }

    for (const code of scripts.postResponse) {
      const outcome = runScript(code, {
        phase: 'post-response',
        request: toScriptRequest(effective),
        response,
        variables,
      });
      reports.push(toReport('post-response', outcome));
      record(outcome.changes);
    }

    let historyEntry: ResponseHistoryEntry | undefined;
    if (ctx.collection && findRequest(ctx.collection, request.id)) {
      const tests = reports.flatMap((report) => report.tests);
      historyEntry = {
        id: newId(),
        requestId: request.id,
        at: Date.now(),
        method: effective.method,
        ...(ctx.environment ? { environmentName: ctx.environment.name } : {}),
        testsPassed: tests.filter((test) => test.passed).length,
        testsTotal: tests.length,
        response,
      };
    }

    return { response, reports, changes, ...(historyEntry ? { historyEntry } : {}) };
  }

  async agentSend(input: AgentSendInput): Promise<AgentSendResult> {
    try {
      const collections = await this.store.allCollections();
      const wantedCollection = input.collection?.trim().toLowerCase();
      const wantedRequest = input.request?.trim().toLowerCase();

      let collectionId = '';
      let request: HttpRequest;

      if (wantedRequest) {
        const matches = matchAgentRequests(collections, wantedCollection, wantedRequest);
        const first = matches[0];
        if (!first) {
          return {
            ok: false,
            summary: `No saved request named "${input.request}". Available: ${describeCatalog(collections)}`,
          };
        }
        if (matches.length > 1) {
          return {
            ok: false,
            summary: `"${input.request}" exists in ${matches.length} collections (${matches
              .map((m) => m.collection.name)
              .join(', ')}) — pass "collection" to pick one.`,
          };
        }
        collectionId = first.collection.id;
        request = structuredClone(first.request);
      } else {
        if (!input.url?.trim()) {
          return {
            ok: false,
            summary: `Give either a saved request name or a url. Saved requests: ${describeCatalog(collections)}`,
          };
        }
        request = createRequest({ auth: { type: 'none' } });
      }

      applyAgentRequestPatch(request, input);
      if (request.protocol === 'ws') {
        return {
          ok: false,
          summary: `"${request.name}" is a WebSocket connection — open it from the API client tab instead.`,
        };
      }

      const environments = await this.store.listEnvironments();
      const wantedEnvironment = input.environment?.trim().toLowerCase();
      if (
        wantedEnvironment &&
        !environments.some((e) => e.name.toLowerCase() === wantedEnvironment)
      ) {
        return {
          ok: false,
          summary: `No environment named "${input.environment}". Available: ${
            environments.map((e) => e.name).join(', ') || '(none)'
          }`,
        };
      }
      const environmentId = wantedEnvironment
        ? environments.find((e) => e.name.toLowerCase() === wantedEnvironment)?.id
        : undefined;

      const outcome = await this.send(collectionId, request, {
        ...(environmentId ? { environmentId } : {}),
      });
      if (!outcome.response) {
        return { ok: false, summary: outcome.error ?? 'The request produced no response.' };
      }
      const tests = outcome.reports.flatMap((report) => report.tests);
      const testLine = tests.length
        ? `\n\nTests: ${tests.filter((t) => t.passed).length}/${tests.length} passed${tests
            .filter((t) => !t.passed)
            .map((t) => `\n  ✗ ${t.name}: ${t.error ?? ''}`)
            .join('')}`
        : '';
      return {
        ok: outcome.response.status < 400,
        summary: formatResponseSummary(outcome.response) + testLine,
        ...(collectionId && wantedRequest ? { collectionId, requestId: request.id } : {}),
        outcome,
      };
    } catch (error) {
      return { ok: false, summary: error instanceof Error ? error.message : String(error) };
    }
  }

  async agentCatalog(): Promise<AgentCatalog> {
    const [collections, environments] = await Promise.all([
      this.store.allCollections(),
      this.store.listEnvironments(),
    ]);
    return {
      collections: collections.map((collection) => ({
        name: collection.name,
        requests: catalogRequests(collection),
      })),
      environments: environments.map((environment) => environment.name),
    };
  }

  async agentDescribe(input: AgentDescribeInput): Promise<{ ok: boolean; summary: string }> {
    const collections = await this.store.allCollections();
    const wantedCollection = input.collection?.trim().toLowerCase();
    const matches = matchAgentRequests(collections, wantedCollection, input.request);
    const first = matches[0];
    if (!first) {
      return {
        ok: false,
        summary: `No saved request named "${input.request}". Available: ${describeCatalog(collections)}`,
      };
    }
    if (matches.length > 1) {
      return {
        ok: false,
        summary: `"${input.request}" exists in ${matches.length} collections (${matches
          .map((match) => match.collection.name)
          .join(', ')}) — pass "collection" to pick one.`,
      };
    }
    return { ok: true, summary: describeRequest(first.collection, first.request) };
  }

  async agentEnvironment(name?: string): Promise<{ ok: boolean; summary: string }> {
    const [environments, state] = await Promise.all([
      this.store.listEnvironments(),
      this.store.readState(),
    ]);
    const globals = state.globals ?? [];
    const globalLines = globals.length
      ? `\n\nGlobal variables:\n${globals.filter((item) => item.enabled).map(pairLine).join('\n')}`
      : '';
    if (!name) {
      const active = environments.find((item) => item.id === state.activeEnvironmentId);
      const lines = environments.map(
        (item) =>
          `- ${item.name}${item.id === active?.id ? ' (active)' : ''}: ${item.variables.length} variables`,
      );
      return {
        ok: true,
        summary: `Environments:\n${lines.join('\n') || '(none)'}${globalLines}`,
      };
    }
    const wanted = name.trim().toLowerCase();
    const environment = environments.find((item) => item.name.toLowerCase() === wanted);
    if (!environment) {
      return {
        ok: false,
        summary: `No environment named "${name}". Available: ${
          environments.map((item) => item.name).join(', ') || '(none)'
        }`,
      };
    }
    const variables = environment.variables.filter((item) => item.enabled);
    const active = environment.id === state.activeEnvironmentId ? ' (active)' : '';
    return {
      ok: true,
      summary: `Environment "${environment.name}"${active}:\n${
        variables.map(pairLine).join('\n') || '(no variables)'
      }${globalLines}`,
    };
  }

  async agentSaveRequest(input: AgentSaveRequestInput): Promise<AgentMutationResult> {
    try {
      const name = input.request.trim();
      if (!name) return { ok: false, summary: 'Request name is required.' };
      const collections = await this.store.allCollections();
      const wanted = input.collection.trim().toLowerCase();
      let collection = collections.find((item) => item.name.toLowerCase() === wanted);
      const created = !collection;
      if (!collection) collection = await this.createCollection(input.collection.trim());
      const existing = eachRequest(collection).find(
        (item) => item.name.toLowerCase() === name.toLowerCase(),
      );
      if (existing) {
        await this.mutate(collection.id, (target) => {
          const found = findRequest(target, existing.id);
          if (!found) return false;
          applyAgentRequestPatch(found.request, input);
          mergeAgentExamples(found.request, input.examples);
        });
        return {
          ok: true,
          summary: `Updated "${name}" in collection "${collection.name}"${exampleNote(input.examples)}.`,
        };
      }
      if (!input.url?.trim()) {
        return {
          ok: false,
          summary: `Creating request "${name}" needs a url. Collection "${collection.name}"${
            created ? ' was created for it — delete it if unwanted' : ' already exists'
          }.`,
        };
      }
      const folderName = input.folder?.trim();
      let folderId: string | undefined;
      let folderCreated = false;
      if (folderName) {
        const existingFolder = findFolderByName(collection, folderName);
        if (existingFolder) {
          folderId = existingFolder.id;
        } else {
          const folder = createFolder({ name: folderName });
          folderId = folder.id;
          folderCreated = true;
          await this.addFolder(collection.id, folder);
        }
      }
      const request = createRequest({ name, auth: { type: 'none' } });
      applyAgentRequestPatch(request, input);
      mergeAgentExamples(request, input.examples);
      await this.addRequest(collection.id, request, folderId);
      return {
        ok: true,
        summary: `Created ${request.method} "${name}" in collection "${collection.name}"${
          created ? ' (collection was created too)' : ''
        }${
          folderName
            ? ` in folder "${folderName}"${folderCreated ? ' (folder was created too)' : ''}`
            : ''
        }${exampleNote(input.examples)}.`,
      };
    } catch (error) {
      return { ok: false, summary: error instanceof Error ? error.message : String(error) };
    }
  }

  async agentSaveEnvironment(input: AgentSaveEnvironmentInput): Promise<AgentMutationResult> {
    try {
      const name = input.name.trim();
      if (!name) return { ok: false, summary: 'Environment name is required.' };
      const patch: Record<string, string | null> = {};
      for (const [key, value] of Object.entries(input.variables ?? {})) patch[key] = value;
      for (const key of input.remove ?? []) patch[key] = null;
      const environments = await this.store.listEnvironments();
      const existing = environments.find((item) => item.name.toLowerCase() === name.toLowerCase());
      if (existing) {
        const variables = mergePairs(existing.variables, patch);
        await this.store.saveEnvironment({ ...existing, variables });
        if (input.activate) await this.store.setActiveEnvironment(existing.id);
        return {
          ok: true,
          summary: `Updated environment "${existing.name}" (${variables.length} variables).`,
        };
      }
      const variables = Object.entries(patch)
        .filter((entry): entry is [string, string] => entry[1] !== null)
        .map(([key, value]) => ({ key, value, enabled: true }));
      const saved = await this.store.saveEnvironment(createEnvironment({ name, variables }));
      const state = await this.store.readState();
      const activated = input.activate === true || !state.activeEnvironmentId;
      if (activated) await this.store.setActiveEnvironment(saved.id);
      return {
        ok: true,
        summary: `Created environment "${saved.name}" (${variables.length} variables)${
          activated ? ', now active' : ''
        }.`,
      };
    } catch (error) {
      return { ok: false, summary: error instanceof Error ? error.message : String(error) };
    }
  }

  async agentDelete(input: AgentDeleteInput): Promise<AgentMutationResult> {
    try {
      if (input.kind === 'environment') {
        const environments = await this.store.listEnvironments();
        const wanted = input.name.trim().toLowerCase();
        const environment = environments.find(
          (item) => item.name.toLowerCase() === wanted,
        );
        if (!environment) {
          return {
            ok: false,
            summary: `No environment named "${input.name}". Available: ${
              environments.map((item) => item.name).join(', ') || '(none)'
            }`,
          };
        }
        await this.store.deleteEnvironment(environment.id);
        return { ok: true, summary: `Deleted environment "${environment.name}".` };
      }
      const collections = await this.store.allCollections();
      if (input.kind === 'collection') {
        const wanted = input.name.trim().toLowerCase();
        const collection = collections.find((item) => item.name.toLowerCase() === wanted);
        if (!collection) {
          return {
            ok: false,
            summary: `No collection named "${input.name}". Available: ${describeCatalog(collections)}`,
          };
        }
        await this.deleteCollection(collection.id);
        return {
          ok: true,
          summary: `Deleted collection "${collection.name}" and everything in it.`,
        };
      }
      if (input.kind === 'example') {
        const requestName = input.request?.trim();
        if (!requestName) {
          return {
            ok: false,
            summary: 'Deleting an example needs "request" — the name of the request it belongs to.',
          };
        }
        const wantedCollection = input.collection?.trim().toLowerCase();
        const matches = matchAgentRequests(collections, wantedCollection, requestName);
        const first = matches[0];
        if (!first) {
          return {
            ok: false,
            summary: `No saved request named "${requestName}". Available: ${describeCatalog(collections)}`,
          };
        }
        if (matches.length > 1) {
          return {
            ok: false,
            summary: `"${requestName}" exists in ${matches.length} collections (${matches
              .map((match) => match.collection.name)
              .join(', ')}) — pass "collection" to pick one.`,
          };
        }
        const wantedExample = input.name.trim().toLowerCase();
        const example = first.request.examples?.find(
          (item) => item.name.toLowerCase() === wantedExample,
        );
        if (!example) {
          return {
            ok: false,
            summary: `No example named "${input.name}" on "${first.request.name}". Available: ${
              first.request.examples?.map((item) => item.name).join(', ') || '(none)'
            }`,
          };
        }
        await this.mutate(first.collection.id, (target) => {
          const found = findRequest(target, first.request.id);
          if (!found) return false;
          const remaining = (found.request.examples ?? []).filter((item) => item.id !== example.id);
          if (remaining.length > 0) found.request.examples = remaining;
          else delete found.request.examples;
        });
        return {
          ok: true,
          summary: `Deleted example "${example.name}" from "${first.request.name}".`,
        };
      }
      const wantedCollection = input.collection?.trim().toLowerCase();
      const matches = matchAgentRequests(collections, wantedCollection, input.name);
      const first = matches[0];
      if (!first) {
        return {
          ok: false,
          summary: `No saved request named "${input.name}". Available: ${describeCatalog(collections)}`,
        };
      }
      if (matches.length > 1) {
        return {
          ok: false,
          summary: `"${input.name}" exists in ${matches.length} collections (${matches
            .map((match) => match.collection.name)
            .join(', ')}) — pass "collection" to pick one.`,
        };
      }
      await this.deleteRequest(first.collection.id, first.request.id);
      return {
        ok: true,
        summary: `Deleted request "${first.request.name}" from collection "${first.collection.name}".`,
      };
    } catch (error) {
      return { ok: false, summary: error instanceof Error ? error.message : String(error) };
    }
  }
}

const MAX_BODY_CHARS = 2_000;
const MAX_SCRIPT_CHARS = 1_500;

export interface AgentCatalogRequest {
  name: string;
  method: string;
  url: string;
  folder?: string;
}

export interface AgentCatalogCollection {
  name: string;
  requests: AgentCatalogRequest[];
}

export interface AgentCatalog {
  collections: AgentCatalogCollection[];
  environments: string[];
}

export interface AgentDescribeInput {
  collection?: string;
  request: string;
}

export interface AgentExampleInput {
  name: string;
  status?: number;
  statusText?: string;
  headers?: Record<string, string>;
  body?: string;
}

export interface AgentSaveRequestInput {
  collection: string;
  request: string;
  folder?: string;
  method?: string;
  url?: string;
  headers?: Record<string, string>;
  body?: string;
  preRequestScript?: string;
  postResponseScript?: string;
  examples?: AgentExampleInput[];
}

export interface AgentSaveEnvironmentInput {
  name: string;
  variables?: Record<string, string>;
  remove?: string[];
  activate?: boolean;
}

export interface AgentDeleteInput {
  kind: 'request' | 'collection' | 'environment' | 'example';
  name: string;
  collection?: string;
  request?: string;
}

export interface AgentMutationResult {
  ok: boolean;
  summary: string;
}

function findFolderByName(collection: Collection, name: string): RequestFolder | undefined {
  const target = name.trim().toLowerCase();
  const walk = (folders: readonly RequestFolder[]): RequestFolder | undefined => {
    for (const folder of folders) {
      if (folder.name.toLowerCase() === target) return folder;
      const deeper = walk(folder.folders);
      if (deeper) return deeper;
    }
    return undefined;
  };
  return walk(collection.folders);
}

function applyAgentRequestPatch(
  request: HttpRequest,
  input: {
    method?: string;
    url?: string;
    headers?: Record<string, string>;
    body?: string;
    preRequestScript?: string;
    postResponseScript?: string;
  },
): void {
  if (input.method) request.method = input.method.toUpperCase() as HttpRequest['method'];
  if (input.url?.trim()) request.url = input.url.trim();
  if (input.headers) {
    for (const [key, value] of Object.entries(input.headers)) {
      const existing = request.headers.find((h) => h.key.toLowerCase() === key.toLowerCase());
      if (existing) {
        existing.value = value;
        existing.enabled = true;
      } else request.headers.push({ key, value, enabled: true });
    }
  }
  if (input.body !== undefined) {
    request.body =
      request.body.mode === 'none' || request.body.mode === 'json'
        ? { mode: 'json', text: input.body }
        : { ...request.body, text: input.body };
  }
  if (input.preRequestScript !== undefined || input.postResponseScript !== undefined) {
    const next: RequestScripts = { ...request.scripts };
    if (input.preRequestScript !== undefined) {
      if (input.preRequestScript.trim()) next.preRequest = input.preRequestScript;
      else delete next.preRequest;
    }
    if (input.postResponseScript !== undefined) {
      if (input.postResponseScript.trim()) next.postResponse = input.postResponseScript;
      else delete next.postResponse;
    }
    request.scripts = Object.keys(next).length > 0 ? next : undefined;
  }
}

const STATUS_TEXT: Record<number, string> = {
  200: 'OK',
  201: 'Created',
  202: 'Accepted',
  204: 'No Content',
  301: 'Moved Permanently',
  302: 'Found',
  304: 'Not Modified',
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  405: 'Method Not Allowed',
  409: 'Conflict',
  422: 'Unprocessable Entity',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
};

function mergeAgentExamples(
  request: HttpRequest,
  inputs: readonly AgentExampleInput[] | undefined,
): void {
  if (!inputs || inputs.length === 0) return;
  const list = [...(request.examples ?? [])];
  for (const input of inputs) {
    const name = input.name.trim();
    if (!name) continue;
    const status = input.status ?? 200;
    const headers = Object.entries(input.headers ?? {}).map(([key, value]) => ({
      key,
      value,
      enabled: true,
    }));
    const contentType = headers.find((header) => header.key.toLowerCase() === 'content-type')?.value;
    const next: RequestExample = {
      id: '',
      name,
      status,
      statusText: input.statusText ?? STATUS_TEXT[status] ?? '',
      headers,
      body: input.body ?? '',
      ...(contentType ? { contentType } : {}),
      createdAt: Date.now(),
    };
    const index = list.findIndex((item) => item.name.toLowerCase() === name.toLowerCase());
    if (index >= 0) list[index] = { ...next, id: list[index]!.id, createdAt: list[index]!.createdAt };
    else list.push({ ...next, id: newId() });
  }
  request.examples = list;
}

function exampleNote(inputs: readonly AgentExampleInput[] | undefined): string {
  const count = inputs?.filter((input) => input.name.trim()).length ?? 0;
  return count > 0 ? `, ${count} example response(s) saved` : '';
}

function matchAgentRequests(
  collections: readonly Collection[],
  collectionName: string | undefined,
  requestName: string,
): Array<{ collection: Collection; request: HttpRequest }> {
  const wantedCollection = collectionName?.trim().toLowerCase();
  const wantedRequest = requestName.trim().toLowerCase();
  const matches: Array<{ collection: Collection; request: HttpRequest }> = [];
  for (const candidate of collections) {
    if (wantedCollection && candidate.name.toLowerCase() !== wantedCollection) continue;
    for (const saved of eachRequest(candidate)) {
      if (saved.name.toLowerCase() === wantedRequest) {
        matches.push({ collection: candidate, request: saved });
      }
    }
  }
  return matches;
}

function catalogRequests(collection: Collection): AgentCatalogRequest[] {
  const out: AgentCatalogRequest[] = [];
  const push = (requests: readonly HttpRequest[], folder?: string): void => {
    for (const request of requests) {
      out.push({
        name: request.name,
        method: request.method,
        url: request.url,
        ...(folder ? { folder } : {}),
      });
    }
  };
  const walk = (folders: readonly RequestFolder[], prefix: string): void => {
    for (const folder of folders) {
      const path = prefix ? `${prefix}/${folder.name}` : folder.name;
      push(folder.requests, path);
      walk(folder.folders, path);
    }
  };
  push(collection.requests);
  walk(collection.folders, '');
  return out;
}

function folderChain(collection: Collection, requestId: string): RequestFolder[] {
  const walk = (
    folders: readonly RequestFolder[],
    trail: RequestFolder[],
  ): RequestFolder[] | undefined => {
    for (const folder of folders) {
      const next = [folder, ...trail];
      if (folder.requests.some((request) => request.id === requestId)) return next;
      const deeper = walk(folder.folders, next);
      if (deeper) return deeper;
    }
    return undefined;
  };
  return walk(collection.folders, []) ?? [];
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}\n… truncated` : text;
}

function pairLine(pair: KeyValue): string {
  return `- ${pair.key}: ${pair.secret ? '(hidden)' : pair.value}`;
}

function describeAuth(auth: AuthConfig): string {
  switch (auth.type) {
    case 'none':
      return 'none';
    case 'inherit':
      return 'none (nothing to inherit)';
    case 'bearer':
      return 'bearer token (value hidden)';
    case 'basic':
      return `basic, user "${auth.username}" (password hidden)`;
    case 'apiKey':
      return `apiKey "${auth.key}" in ${auth.in} (value hidden)`;
    case 'oauth2':
      return `oauth2 ${auth.grantType}, tokenUrl ${auth.tokenUrl}, clientId ${auth.clientId} (secrets and tokens hidden)`;
    case 'awsSigV4':
      return `awsSigV4, region ${auth.region}, service ${auth.service} (keys hidden)`;
  }
}

function effectiveAuth(
  collection: Collection,
  request: HttpRequest,
): { source: string; auth: AuthConfig } {
  if (request.auth.type !== 'inherit') return { source: 'request', auth: request.auth };
  for (const folder of folderChain(collection, request.id)) {
    if (folder.auth.type !== 'inherit') return { source: `folder "${folder.name}"`, auth: folder.auth };
  }
  return { source: `collection "${collection.name}"`, auth: collection.auth };
}

function describeBody(body: HttpRequest['body']): string {
  switch (body.mode) {
    case 'none':
      return 'Body: none';
    case 'form':
    case 'urlencoded': {
      const pairs = (body.form ?? []).filter((item) => item.enabled).map(pairLine).join('\n');
      return `Body (${body.mode}):\n${pairs || '(empty)'}`;
    }
    case 'graphql': {
      const variables = body.graphql?.variables
        ? `\nVariables:\n${clip(body.graphql.variables, 500)}`
        : '';
      return `Body (graphql):\n${clip(body.graphql?.query ?? '', MAX_BODY_CHARS)}${variables}`;
    }
    default:
      return `Body (${body.mode}):\n${clip(body.text ?? '', MAX_BODY_CHARS) || '(empty)'}`;
  }
}

function describeScripts(collection: Collection, request: HttpRequest): string[] {
  const out: string[] = [];
  const add = (where: string, scripts: RequestScripts | undefined): void => {
    if (scripts?.preRequest?.trim()) {
      out.push(`Pre-request script (${where}):\n${clip(scripts.preRequest, MAX_SCRIPT_CHARS)}`);
    }
    if (scripts?.postResponse?.trim()) {
      out.push(`Post-response script (${where}):\n${clip(scripts.postResponse, MAX_SCRIPT_CHARS)}`);
    }
  };
  add(`collection "${collection.name}"`, collection.scripts);
  for (const folder of [...folderChain(collection, request.id)].reverse()) {
    add(`folder "${folder.name}"`, folder.scripts);
  }
  add('request', request.scripts);
  return out;
}

function referencedVariables(request: HttpRequest): string[] {
  const sources = [
    request.url,
    ...request.headers.map((item) => item.value),
    ...request.params.map((item) => item.value),
    request.body.text ?? '',
    ...(request.body.form ?? []).map((item) => item.value),
    request.body.graphql?.query ?? '',
    request.body.graphql?.variables ?? '',
  ];
  const out = new Set<string>();
  for (const source of sources) {
    for (const match of source.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g)) out.add(match[1]!);
  }
  return [...out];
}

function describeRequest(collection: Collection, request: HttpRequest): string {
  const blocks: string[] = [
    `${request.method} ${request.url}`,
    `Saved as "${request.name}" in collection "${collection.name}"${
      request.protocol === 'ws' ? ' (WebSocket)' : ''
    }.`,
  ];
  if (request.description) blocks.push(request.description);

  const auth = effectiveAuth(collection, request);
  blocks.push(
    `Auth: ${describeAuth(auth.auth)}${auth.source === 'request' ? '' : ` — inherited from ${auth.source}`}`,
  );

  const headers = request.headers.filter((item) => item.enabled);
  if (headers.length) blocks.push(`Headers:\n${headers.map(pairLine).join('\n')}`);
  const params = request.params.filter((item) => item.enabled);
  if (params.length) blocks.push(`Query params:\n${params.map(pairLine).join('\n')}`);

  blocks.push(describeBody(request.body));
  blocks.push(...describeScripts(collection, request));

  if (request.examples?.length) {
    blocks.push(
      `Examples:\n${request.examples
        .map((example) => `- "${example.name}" (${example.status} ${example.statusText})`)
        .join('\n')}`,
    );
  }

  const variables = referencedVariables(request);
  if (variables.length) blocks.push(`Variables referenced: ${variables.join(', ')}`);
  blocks.push(
    'This is the stored definition only — nothing was sent. Use http_send with this collection and request name to run it.',
  );
  return blocks.join('\n\n');
}

function toReport(phase: ScriptReport['phase'], outcome: ScriptOutcome): ScriptReport {
  return {
    phase,
    logs: outcome.logs,
    tests: outcome.tests,
    ...(outcome.error ? { error: outcome.error } : {}),
    ...(outcome.visualization ? { visualization: outcome.visualization } : {}),
  };
}

function toScriptRequest(request: HttpRequest): ScriptRequestView {
  return {
    method: request.method,
    url: request.url,
    headers: Object.fromEntries(
      request.headers.filter((h) => h.enabled).map((h) => [h.key, h.value]),
    ),
    body: request.body.text ?? '',
  };
}

function applyScriptRequest(request: HttpRequest, patch: ScriptRequestView): HttpRequest {
  const headers = [...request.headers];
  for (const [key, value] of Object.entries(patch.headers)) {
    const existing = headers.find((h) => h.key.toLowerCase() === key.toLowerCase());
    if (existing) {
      existing.value = value;
      existing.enabled = true;
    } else headers.push({ key, value, enabled: true });
  }
  return {
    ...request,
    method: patch.method as HttpRequest['method'],
    url: patch.url,
    headers,
    body:
      patch.body === (request.body.text ?? '')
        ? request.body
        : {
            ...request.body,
            mode: request.body.mode === 'none' ? 'json' : request.body.mode,
            text: patch.body,
          },
  };
}

function scriptChain(
  collection: Collection | undefined,
  folderPath: readonly string[],
  request: HttpRequest,
): { preRequest: string[]; postResponse: string[] } {
  const owners: Array<RequestScripts | undefined> = [collection?.scripts];
  let folders: readonly RequestFolder[] = collection?.folders ?? [];
  for (const id of folderPath) {
    const folder = folders.find((f) => f.id === id);
    if (!folder) break;
    owners.push(folder.scripts);
    folders = folder.folders;
  }
  owners.push(request.scripts);
  return {
    preRequest: owners.map((s) => s?.preRequest ?? '').filter((code) => code.trim()),
    postResponse: owners.map((s) => s?.postResponse ?? '').filter((code) => code.trim()),
  };
}

function toRecord(pairs: readonly KeyValue[] | undefined): Record<string, string> {
  return { ...buildScope(pairs) };
}

function toPairs(values: Record<string, string>): KeyValue[] {
  return Object.entries(values).map(([key, value]) => ({ key, value, enabled: true }));
}

function describeCatalog(collections: readonly Collection[]): string {
  const lines = collections.map(
    (collection) =>
      `${collection.name}: ${eachRequest(collection)
        .map((request) => request.name)
        .join(', ')}`,
  );
  return lines.length > 0 ? lines.join(' | ') : '(no saved collections yet)';
}
