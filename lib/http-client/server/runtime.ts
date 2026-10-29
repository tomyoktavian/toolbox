import { AsyncLocalStorage } from "node:async_hooks";
import { join } from "node:path";
import WebSocket from "ws";
import {
  HttpClientService,
  staticStorage,
  WsRunner,
  type WsConnect,
  type WsSessionState,
} from "@/lib/http-client/core";
import { nodeFetch } from "@/lib/http-client/core/runner/node-fetch";

const nodeConnect: WsConnect = (url, options, handlers) => {
  const socket = new WebSocket(url, options.protocols ?? [], { headers: options.headers });
  socket.on("open", () => handlers.onOpen());
  socket.on("message", (data: Buffer | ArrayBuffer | Buffer[]) =>
    handlers.onMessage(
      Array.isArray(data)
        ? Buffer.concat(data).toString("utf8")
        : Buffer.from(data as Buffer).toString("utf8"),
    ),
  );
  socket.on("close", (code: number, reason: Buffer) =>
    handlers.onClose(code, reason.toString("utf8")),
  );
  socket.on("error", (error: Error) => handlers.onError(error.message));
  return {
    send: (data: string) => socket.send(data),
    close: (code?: number, reason?: string) => socket.close(code, reason),
  };
};

/** What actually went on the wire for a request, after variables, auth and pre-request scripts. */
export interface SentRequest {
  method: string;
  url: string;
  headers: Array<[string, string]>;
  body?: string;
}

type CaptureSlot = { sent?: SentRequest };

// On globalThis, like the runtime: the service keeps the fetch built by the first copy of this module,
// and after a dev hot reload both copies must still read and write the same store.
function captureStore(): AsyncLocalStorage<CaptureSlot> {
  const holder = globalThis as unknown as Record<string, AsyncLocalStorage<CaptureSlot> | undefined>;
  return (holder.__httpClientCaptureStore ??= new AsyncLocalStorage<CaptureSlot>());
}

function headerPairs(init: HeadersInit | undefined): Array<[string, string]> {
  if (!init) return [];
  if (init instanceof Headers) return [...init.entries()];
  if (Array.isArray(init)) return init.map(([key, value]) => [key, value]);
  return Object.entries(init).map(([key, value]) => [key, value]);
}

// The runner's fetch, with a side channel that remembers the request being sent for the console.
const recordingFetch: typeof fetch = (input, init) => {
  const slot = captureStore().getStore();
  // The main request always passes `redirect`; OAuth token calls (which carry secrets) do not.
  if (slot && init?.redirect !== undefined) {
    slot.sent = {
      method: init.method ?? "GET",
      url: input instanceof Request ? input.url : String(input),
      headers: headerPairs(init.headers),
      ...(typeof init.body === "string" ? { body: init.body } : {}),
    };
  }
  return nodeFetch(input, init);
};

/** Runs `run` and returns its result together with the request it sent, when it sent one. */
export async function withSentCapture<T>(run: () => Promise<T>): Promise<{ result: T; sent?: SentRequest }> {
  const slot: { sent?: SentRequest } = {};
  const result = await captureStore().run(slot, run);
  return { result, ...(slot.sent ? { sent: slot.sent } : {}) };
}

export interface HttpClientRuntime {
  service: HttpClientService;
  ws: WsRunner;
  /** Listeners for WebSocket session changes, fed to the browser over SSE. */
  wsListeners: Set<(state: WsSessionState) => void>;
  /** In-flight sends, keyed by request id, so a later send or a cancel aborts the previous one. */
  running: Map<string, AbortController>;
  oauthFlows: Map<string, { promise: Promise<void>; cancel: () => void }>;
}

// Bump the suffix when the runtime's shape changes, so dev hot reloads build a fresh one.
const GLOBAL_KEY = "__httpClientRuntime_v3";

/**
 * One service per server process. Kept on globalThis because Next.js may load route modules
 * more than once in dev, and the WebSocket sessions must outlive a single request.
 */
export function runtime(): HttpClientRuntime {
  const holder = globalThis as unknown as Record<string, HttpClientRuntime | undefined>;
  const existing = holder[GLOBAL_KEY];
  if (existing) return existing;

  const root = process.env.HTTP_CLIENT_DATA_DIR || join(process.cwd(), ".http-client");
  const wsListeners = new Set<(state: WsSessionState) => void>();
  const ws = new WsRunner({ connect: nodeConnect, maxMessages: 500 });
  ws.onChange((state) => {
    for (const listener of wsListeners) listener(state);
  });

  const created: HttpClientRuntime = {
    service: new HttpClientService(staticStorage(root), { fetch: recordingFetch }),
    ws,
    wsListeners,
    running: new Map(),
    oauthFlows: new Map(),
  };
  holder[GLOBAL_KEY] = created;
  return created;
}
