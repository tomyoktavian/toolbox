import { join } from "node:path";
import WebSocket from "ws";
import {
  HttpClientService,
  staticStorage,
  WsRunner,
  type WsConnect,
  type WsSessionState,
} from "@/lib/http-client/core";

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

export interface HttpClientRuntime {
  service: HttpClientService;
  ws: WsRunner;
  /** Listeners for WebSocket session changes, fed to the browser over SSE. */
  wsListeners: Set<(state: WsSessionState) => void>;
  /** In-flight sends, keyed by request id, so a later send or a cancel aborts the previous one. */
  running: Map<string, AbortController>;
  oauthFlows: Map<string, { promise: Promise<void>; cancel: () => void }>;
}

const GLOBAL_KEY = "__httpClientRuntime";

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
    service: new HttpClientService(staticStorage(root)),
    ws,
    wsListeners,
    running: new Map(),
    oauthFlows: new Map(),
  };
  holder[GLOBAL_KEY] = created;
  return created;
}
