import { randomBytes } from "node:crypto";
import {
  buildAuthorizeUrl,
  createPkcePair,
  exchangeAuthorizationCode,
  hostOf,
  parseCurl,
  resolveAuthVars,
  scopeFor,
  type HttpRequest,
  type OAuthToken,
  type RunContext,
} from "@/lib/http-client/core";
import { fetchSpecText } from "@/lib/http-client/core/import/fetch-spec";
import { buildSnippetRequest } from "@/lib/http-client/core/snippet/build";
import { awaitAuthorizationCode } from "./oauth-callback";
import { runtime, withSentCapture } from "./runtime";

type OAuthStart =
  | { notice: string; level: "info" | "error" }
  | { flowId: string; url: string };

/**
 * What the server does for the browser: run requests and sockets, and fetch URLs the browser cannot
 * reach. History lives in the browser too; the server's old copy is only read once. Collections and environments live in the browser; every call that
 * needs them receives a RunContext instead of reading a store.
 */
export const ops = {
  /** The server's own saved data, read once to seed the browser's copy on first use. */
  tree: () => runtime().service.tree(),

  /** The server's saved history for these requests, read once to seed the browser's copy. */
  readHistories: (requestIds: string[]) => runtime().service.readHistories(requestIds),

  /** Runs a request. The variable and token changes it made come back in `changes` for the browser to save. */
  send: async (context: RunContext, request: HttpRequest) => {
    const { service, running } = runtime();
    running.get(request.id)?.abort();
    const controller = new AbortController();
    running.set(request.id, controller);
    try {
      const { result: outcome, sent } = await withSentCapture(() =>
        service.sendWith(context, request, { signal: controller.signal }),
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
  curlHost: (text: string) => hostOf(parseCurl(text).url),
  fetchSpec: (url: string) => fetchSpecText(url),
  snippet: (context: RunContext, request: HttpRequest, resolve: boolean) =>
    buildSnippetRequest(request, { ...context, resolve }),

  /**
   * Starts an authorization-code flow: a listener on the redirect URI catches the code, and the
   * browser opens the returned URL. Finish the flow with oauthFinish, which returns the token.
   */
  oauthStart: async (context: RunContext, request: HttpRequest): Promise<OAuthStart> => {
    const { oauthFlows } = runtime();
    const scope = scopeFor(context.collection, context.environment, context.globals);
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
    const promise: Promise<OAuthToken> = listener.promise.then((callback) =>
      exchangeAuthorizationCode(auth, {
        code: callback.code,
        ...(pkce ? { verifier: pkce.verifier } : {}),
      }),
    );
    // The caller may never finish the flow; keep an unhandled rejection from surfacing.
    promise.catch(() => {});
    oauthFlows.set(flowId, { promise, cancel: listener.cancel });
    return { flowId, url: buildAuthorizeUrl(auth, { state, ...(pkce ? { pkce } : {}) }) };
  },
  oauthFinish: async (flowId: string): Promise<OAuthToken> => {
    const flow = runtime().oauthFlows.get(flowId);
    if (!flow) throw new Error("OAuth flow tidak ditemukan.");
    try {
      return await flow.promise;
    } finally {
      flow.cancel();
      runtime().oauthFlows.delete(flowId);
    }
  },

  wsOpen: async (context: RunContext, request: HttpRequest, autoReconnect: boolean) => {
    await runtime().ws.open(request, { ...context, autoReconnect });
  },
  wsSend: (requestId: string, data: string) => runtime().ws.send(requestId, data),
  wsClose: (requestId: string) => runtime().ws.close(requestId),
  wsClear: (requestId: string) => runtime().ws.clear(requestId),
  wsState: (requestId: string) => runtime().ws.state(requestId) ?? null,
};

export type HttpClientOps = typeof ops;
export type HttpClientOp = keyof HttpClientOps;
