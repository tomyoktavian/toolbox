import type {
  AuthConfig,
  Environment,
  HttpRequest,
  KeyValue,
  RequestScripts,
} from "@/lib/http-client/core";
import { DEFAULT_HISTORY_LIMIT, summarizeHistory } from "@/lib/http-client/core/workspace/workspace";
import { remote } from "../remote";
import { idbHistory } from "./idb-store";
import { workspace } from "./workspace";

/** Authorization-code flows in progress: where to save the token once the server has it. */
const oauthFlows = new Map<string, { collectionId: string; requestId: string }>();

/**
 * The operations that read or change collections and environments. They run in the browser on
 * IndexedDB. Whatever needs the server (sending, sockets, snippets) gets the data it needs
 * from here in a RunContext, and what the run changed is saved back here.
 */
export const localOps = {
  tree: async () => (await workspace()).tree(),
  allCollections: async () => (await workspace()).store.allCollections(),
  getCollection: async (id: string) => (await workspace()).store.getCollection(id),
  getEnvironment: async (id: string) => (await workspace()).store.getEnvironment(id),
  readState: async () => (await workspace()).store.readState(),

  createCollection: async (name: string) => (await workspace()).createCollection(name),
  deleteCollection: async (id: string) => (await workspace()).deleteCollection(id),
  saveCollectionSettings: async (
    collectionId: string,
    patch: {
      name: string;
      description?: string;
      variables: KeyValue[];
      auth: AuthConfig;
      scripts?: RequestScripts;
    },
  ) => (await workspace()).saveCollectionSettings(collectionId, patch),

  newFolder: async (collectionId: string, parentFolderId?: string) =>
    (await workspace()).newFolder(collectionId, parentFolderId),
  deleteFolder: async (collectionId: string, folderId: string) =>
    (await workspace()).deleteFolder(collectionId, folderId),
  saveFolderSettings: async (
    collectionId: string,
    folderId: string,
    patch: { name: string; description?: string; auth: AuthConfig; scripts?: RequestScripts },
  ) => (await workspace()).saveFolderSettings(collectionId, folderId, patch),

  newRequest: async (collectionId: string, protocol: "rest" | "ws", folderId?: string) =>
    (await workspace()).newRequest(collectionId, protocol, folderId),
  duplicateRequest: async (collectionId: string, requestId: string) =>
    (await workspace()).duplicateRequest(collectionId, requestId),
  duplicateRequestAs: async (
    collectionId: string,
    requestId: string,
    current: HttpRequest | null,
  ) => (await workspace()).duplicateRequestAs(collectionId, requestId, current),
  deleteRequest: async (collectionId: string, requestId: string) =>
    (await workspace()).deleteRequest(collectionId, requestId),
  saveRequest: async (collectionId: string, request: HttpRequest) =>
    (await workspace()).saveRequest(collectionId, request),
  deleteExample: async (collectionId: string, requestId: string, exampleId: string) =>
    (await workspace()).deleteExample(collectionId, requestId, exampleId),

  importCurl: async (text: string, collectionId?: string) =>
    (await workspace()).importCurl(text, collectionId),
  importText: async (text: string) => (await workspace()).importText(text),
  /** The server fetches the document (the browser would hit CORS); the import itself happens here. */
  importUrl: async (url: string) => (await workspace()).importText(await remote("fetchSpec", url)),
  exportText: async (format: "postman" | "native", collectionId?: string) =>
    (await workspace()).exportText(format, collectionId),
  exportEnvironmentText: async (environmentId: string) =>
    (await workspace()).exportEnvironmentText(environmentId),

  newEnvironment: async (name?: string) => (await workspace()).newEnvironment(name),
  duplicateEnvironment: async (environmentId: string) =>
    (await workspace()).duplicateEnvironment(environmentId),
  deleteEnvironment: async (environmentId: string) =>
    (await workspace()).store.deleteEnvironment(environmentId),
  saveEnvironment: async (environment: Environment) =>
    (await workspace()).store.saveEnvironment(environment),
  activateEnvironment: async (environmentId?: string) =>
    (await workspace()).store.setActiveEnvironment(environmentId),
  saveGlobals: async (globals: KeyValue[]) => (await workspace()).saveGlobals(globals),

  history: async (requestId: string) => {
    await workspace();
    return (await idbHistory.readHistory(requestId)).map(summarizeHistory);
  },
  historyEntry: async (requestId: string, entryId: string) => {
    await workspace();
    return idbHistory.getEntry(requestId, entryId);
  },
  deleteHistoryEntry: async (_requestId: string, entryId: string) => {
    await workspace();
    await idbHistory.deleteEntry(entryId);
  },
  clearHistory: async (requestId: string) => {
    await workspace();
    return idbHistory.deleteHistory(requestId);
  },

  send: async (collectionId: string, request: HttpRequest, environmentId?: string) => {
    const space = await workspace();
    const context = await space.context(collectionId, request.id, environmentId);
    const { changes, historyEntry, ...outcome } = await remote("send", context, request);
    await space.applyRunChanges(collectionId, request.id, context, changes);
    // A response that cannot be saved to history must not turn a successful send into an error.
    if (historyEntry) await idbHistory.pushHistory(historyEntry, DEFAULT_HISTORY_LIMIT).catch(() => {});
    return outcome;
  },
  snippet: async (
    collectionId: string,
    request: HttpRequest,
    environmentId: string | undefined,
    resolve: boolean,
  ) => {
    const context = await (await workspace()).context(collectionId, request.id, environmentId);
    return remote("snippet", context, request, resolve);
  },

  oauthStart: async (collectionId: string, request: HttpRequest, environmentId?: string) => {
    const context = await (await workspace()).context(collectionId, request.id, environmentId);
    const started = await remote("oauthStart", context, request);
    if ("flowId" in started) {
      oauthFlows.set(started.flowId, { collectionId, requestId: request.id });
    }
    return started;
  },
  oauthFinish: async (flowId: string) => {
    const flow = oauthFlows.get(flowId);
    try {
      const token = await remote("oauthFinish", flowId);
      if (flow) {
        await (await workspace()).applyOAuthToken(flow.collectionId, flow.requestId, token);
      }
    } finally {
      oauthFlows.delete(flowId);
    }
  },

  wsOpen: async (
    collectionId: string,
    request: HttpRequest,
    environmentId: string | undefined,
    autoReconnect: boolean,
  ) => {
    const context = await (await workspace()).context(collectionId, request.id, environmentId);
    await remote("wsOpen", context, request, autoReconnect);
  },
};

export type LocalOps = typeof localOps;
