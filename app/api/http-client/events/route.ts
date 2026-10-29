import type { WsSessionState } from "@/lib/http-client/core";
import { rejectHttpClientRequest } from "@/lib/http-client/server/guard";
import { runtime as httpClientRuntime } from "@/lib/http-client/server/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Server-sent events carrying WebSocket session state to the browser host. */
export async function GET(request: Request) {
  const rejected = rejectHttpClientRequest(request, false);
  if (rejected) return rejected;

  const { wsListeners } = httpClientRuntime();
  const encoder = new TextEncoder();
  let listener: ((state: WsSessionState) => void) | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const stop = () => {
    if (listener) wsListeners.delete(listener);
    if (heartbeat) clearInterval(heartbeat);
    listener = undefined;
    heartbeat = undefined;
  };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const write = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          stop();
        }
      };
      listener = (state) => write(`data: ${JSON.stringify(state)}\n\n`);
      wsListeners.add(listener);
      heartbeat = setInterval(() => write(": ping\n\n"), 25_000);
      write(": connected\n\n");
      request.signal.addEventListener("abort", () => {
        stop();
        try {
          controller.close();
        } catch {}
      });
    },
    cancel: stop,
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
