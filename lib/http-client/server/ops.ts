import { randomBytes } from "node:crypto";
import {
  buildAuthorizeUrl,
  createEnvironment,
  createFolder,
  createPkcePair,
  createRequest,
  exchangeAuthorizationCode,
  findFolder,
  findRequest,
  hostOf,
  newId,
  parseCurl,
  resolveAuthVars,
  scopeFor,
  type AuthConfig,
  type Environment,
  type HttpRequest,
  type KeyValue,
  type RequestScripts,
} from "@/lib/http-client/core";
import { buildSnippetRequest } from "@/lib/http-client/core/snippet/build";
import { awaitAuthorizationCode } from "./oauth-callback";
import { runtime, withSentCapture } from "./runtime";

function hasScripts(scripts: RequestScripts | undefined): scripts is RequestScripts {
  return Boolean(scripts?.preRequest?.trim() || scripts?.postResponse?.trim());
}

type OAuthStart =
  | { notice: string; level: "info" | "error" }
  | { flowId: string; url: string };

/**
 * Operations the browser host may call through /api/http-client. They mirror what the VS Code
 * HttpClientManager does with the service, minus anything that needs a window or a dialog.
 */
export const ops = {
  tree: () => runtime().service.tree(),
  allCollections: () => runtime().service.store.allCollections(),
  getCollection: (id: string) => runtime().service.store.getCollection(id),
  getEnvironment: (id: string) => runtime().service.store.getEnvironment(id),
  readState: () => runtime().service.store.readState(),

  history: (requestId: string) => runtime().service.history(requestId),
  historyEntry: (requestId: string, entryId: string) =>
    runtime().service.historyEntry(requestId, entryId),
  deleteHistoryEntry: (requestId: string, entryId: string) =>
    runtime().service.deleteHistoryEntry(requestId, entryId),
  clearHistory: (requestId: string) => runtime().service.clearHistory(requestId),

  createCollection: (name: string) => runtime().service.createCollection(name),
  deleteCollection: (id: string) => runtime().service.deleteCollection(id),
  saveCollectionSettings: async (
    collectionId: string,
    patch: {
      name: string;
      description?: string;
      variables: KeyValue[];
      auth: AuthConfig;
      scripts?: RequestScripts;
    },
  ) => {
    await runtime().service.mutate(collectionId, (collection) => {
      collection.name = patch.name;
      if (patch.description?.trim()) collection.description = patch.description;
      else delete collection.description;
      collection.variables = patch.variables;
      collection.auth = patch.auth;
      if (hasScripts(patch.scripts)) collection.scripts = patch.scripts;
      else delete collection.scripts;
    });
  },

  newFolder: async (collectionId: string, parentFolderId?: string) => {
    const folder = createFolder({ name: "New folder" });
    await runtime().service.addFolder(collectionId, folder, parentFolderId);
    return folder.id;
  },
  deleteFolder: (collectionId: string, folderId: string) =>
    runtime().service.deleteFolder(collectionId, folderId),
  saveFolderSettings: async (
    collectionId: string,
    folderId: string,
    patch: { name: string; description?: string; auth: AuthConfig; scripts?: RequestScripts },
  ) => {
    await runtime().service.mutate(collectionId, (collection) => {
      const folder = findFolder(collection, folderId);
      if (!folder) return false;
      folder.name = patch.name;
      if (patch.description?.trim()) folder.description = patch.description;
      else delete folder.description;
      folder.auth = patch.auth;
      if (hasScripts(patch.scripts)) folder.scripts = patch.scripts;
      else delete folder.scripts;
    });
  },

  newRequest: async (collectionId: string, protocol: "rest" | "ws", folderId?: string) => {
    const request = createRequest({
      name: protocol === "ws" ? "New WebSocket" : "New HTTP",
      protocol,
    });
    await runtime().service.addRequest(collectionId, request, folderId);
    return request.id;
  },
  duplicateRequest: (collectionId: string, requestId: string) =>
    runtime().service.duplicateRequest(collectionId, requestId),
  /**
   * Copies a request next to the original and returns the copy's id. `current` is what the open tab
   * holds (possibly unsaved edits); without it the saved request is copied.
   */
  duplicateRequestAs: async (collectionId: string, requestId: string, current: HttpRequest | null) => {
    const copyId = newId();
    await runtime().service.mutate(collectionId, (collection) => {
      const found = findRequest(collection, requestId);
      if (!found) return false;
      const source = current ?? found.request;
      const copy: HttpRequest = {
        ...structuredClone(source),
        id: copyId,
        name: `${source.name} copy`,
        ...(source.examples
          ? { examples: source.examples.map((example) => ({ ...structuredClone(example), id: newId() })) }
          : {}),
      };
      const folderId = found.folderPath[found.folderPath.length - 1];
      const folder = folderId ? findFolder(collection, folderId) : undefined;
      (folder ? folder.requests : collection.requests).push(copy);
    });
    return copyId;
  },
  deleteRequest: (collectionId: string, requestId: string) =>
    runtime().service.deleteRequest(collectionId, requestId),
  saveRequest: (collectionId: string, request: HttpRequest) =>
    runtime().service.saveRequest(collectionId, request),
  deleteExample: async (collectionId: string, requestId: string, exampleId: string) => {
    await runtime().service.mutate(collectionId, (target) => {
      const hit = findRequest(target, requestId);
      if (!hit) return false;
      const remaining = (hit.request.examples ?? []).filter((item) => item.id !== exampleId);
      if (remaining.length > 0) hit.request.examples = remaining;
      else delete hit.request.examples;
    });
  },

  send: async (collectionId: string, request: HttpRequest, environmentId?: string) => {
    const { service, running } = runtime();
    running.get(request.id)?.abort();
    const controller = new AbortController();
    running.set(request.id, controller);
    try {
      const { result: outcome, sent } = await withSentCapture(() =>
        service.send(collectionId, request, {
          signal: controller.signal,
          ...(environmentId ? { environmentId } : {}),
        }),
      );
      return {
        ...outcome,
        ...(sent ? { sent } : {}),
        ...(outcome.error && controller.signal.aborted ? { error: "Dibatalkan." } : {}),
      };
    } finally {
      if (running.get(request.id) === controller) running.delete(request.id);
    }
  },
  cancel: (requestId: string) => {
    runtime().running.get(requestId)?.abort();
  },

  parseCurl: (text: string) => parseCurl(text),
  /** Adds a cURL command as a request; with no collection id it goes into a new one named after the host. */
  importCurl: async (text: string, collectionId?: string) => {
    const request = parseCurl(text);
    const targetId =
      collectionId ?? (await runtime().service.createCollection(hostOf(request.url))).id;
    await runtime().service.addRequest(targetId, request);
    return { collectionId: targetId, requestId: request.id };
  },
  curlHost: (text: string) => hostOf(parseCurl(text).url),
  snippet: async (
    collectionId: string,
    request: HttpRequest,
    environmentId: string | undefined,
    resolve: boolean,
  ) => {
    const ctx = await runtime().service.context(collectionId, request.id, environmentId);
    return buildSnippetRequest(request, { ...ctx, resolve });
  },

  importText: (text: string) => runtime().service.importText(text),
  importUrl: (url: string) => runtime().service.importUrl(url),
  exportText: (format: "postman" | "native", collectionId?: string) =>
    runtime().service.exportText(format, collectionId),
  exportEnvironmentText: (environmentId: string) =>
    runtime().service.exportEnvironmentText(environmentId),

  newEnvironment: async (name?: string) => {
    const store = runtime().service.store;
    const environment = await store.saveEnvironment(
      createEnvironment({
        name: name?.trim() || "New environment",
        variables: [{ key: "baseUrl", value: "http://localhost:3000", enabled: true }],
      }),
    );
    const state = await store.readState();
    if (!state.activeEnvironmentId) await store.setActiveEnvironment(environment.id);
    return environment.id;
  },
  duplicateEnvironment: async (environmentId: string) => {
    const store = runtime().service.store;
    const source = await store.getEnvironment(environmentId);
    if (!source) return undefined;
    const copy = await store.saveEnvironment(
      createEnvironment({
        name: `${source.name} copy`,
        variables: source.variables.map((variable) => ({ ...variable })),
      }),
    );
    return copy.id;
  },
  deleteEnvironment: (environmentId: string) =>
    runtime().service.store.deleteEnvironment(environmentId),
  saveEnvironment: (environment: Environment) =>
    runtime().service.store.saveEnvironment(environment),
  activateEnvironment: (environmentId?: string) =>
    runtime().service.store.setActiveEnvironment(environmentId),
  saveGlobals: async (globals: KeyValue[]) => {
    const store = runtime().service.store;
    const state = await store.readState();
    await store.writeState({ ...state, globals });
  },

  /**
   * Starts an authorization-code flow: a listener on the redirect URI catches the code, and the
   * browser opens the returned URL. Finish the flow with oauthFinish.
   */
  oauthStart: async (
    collectionId: string,
    request: HttpRequest,
    environmentId?: string,
  ): Promise<OAuthStart> => {
    const { service, oauthFlows } = runtime();
    const ctx = await service.context(collectionId, request.id, environmentId);
    const scope = scopeFor(ctx.collection, ctx.environment, ctx.globals);
    const resolved =
      request.auth.type === "oauth2" ? resolveAuthVars(request.auth, scope) : undefined;
    const auth = resolved?.type === "oauth2" ? resolved : undefined;
    if (!auth) return { notice: "Auth request ini bukan OAuth2.", level: "error" };
    if (auth.grantType === "client_credentials") {
      return { notice: "Token client_credentials diambil otomatis saat Send.", level: "info" };
    }
    if (!auth.redirectUri) {
      return {
        notice: "Isi Redirect URI (mis. http://127.0.0.1:47830/callback) lebih dulu.",
        level: "error",
      };
    }

    const state = randomBytes(12).toString("hex");
    const pkce = auth.usePkce === false ? undefined : createPkcePair();
    const listener = awaitAuthorizationCode(auth.redirectUri, state);
    const flowId = randomBytes(8).toString("hex");
    const promise = listener.promise.then(async (callback) => {
      const token = await exchangeAuthorizationCode(auth, {
        code: callback.code,
        ...(pkce ? { verifier: pkce.verifier } : {}),
      });
      await service.mutate(collectionId, (collection) => {
        const found = findRequest(collection, request.id);
        if (!found || found.request.auth.type !== "oauth2") return false;
        found.request.auth = {
          ...found.request.auth,
          accessToken: token.accessToken,
          ...(token.refreshToken ? { refreshToken: token.refreshToken } : {}),
          ...(token.expiresAt !== undefined ? { expiresAt: token.expiresAt } : {}),
        };
      });
    });
    // The caller may never finish the flow; keep an unhandled rejection from surfacing.
    promise.catch(() => {});
    oauthFlows.set(flowId, { promise, cancel: listener.cancel });
    return { flowId, url: buildAuthorizeUrl(auth, { state, ...(pkce ? { pkce } : {}) }) };
  },
  oauthFinish: async (flowId: string) => {
    const flow = runtime().oauthFlows.get(flowId);
    if (!flow) throw new Error("OAuth flow tidak ditemukan.");
    try {
      await flow.promise;
    } finally {
      flow.cancel();
      runtime().oauthFlows.delete(flowId);
    }
  },

  wsOpen: async (
    collectionId: string,
    request: HttpRequest,
    environmentId: string | undefined,
    autoReconnect: boolean,
  ) => {
    const { service, ws } = runtime();
    const ctx = await service.context(collectionId, request.id, environmentId);
    await ws.open(request, { ...ctx, autoReconnect });
  },
  wsSend: (requestId: string, data: string) => runtime().ws.send(requestId, data),
  wsClose: (requestId: string) => runtime().ws.close(requestId),
  wsClear: (requestId: string) => runtime().ws.clear(requestId),
  wsState: (requestId: string) => runtime().ws.state(requestId) ?? null,
};

export type HttpClientOps = typeof ops;
export type HttpClientOp = keyof HttpClientOps;
