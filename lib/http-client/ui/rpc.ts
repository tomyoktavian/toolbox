import type { HttpClientOp, HttpClientOps } from "@/lib/http-client/server/ops";

export const RPC_URL = "/api/http-client";
export const EVENTS_URL = "/api/http-client/events";

/** Calls one server operation; rejects with the server's error message. */
export async function rpc<K extends HttpClientOp>(
  op: K,
  ...args: Parameters<HttpClientOps[K]>
): Promise<Awaited<ReturnType<HttpClientOps[K]>>> {
  const response = await fetch(RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json", "x-http-client": "1" },
    body: JSON.stringify({ op, args }),
  });
  const payload = (await response.json().catch(() => ({}))) as { result?: unknown; error?: string };
  if (!response.ok) throw new Error(payload.error ?? `HTTP ${response.status}`);
  return payload.result as Awaited<ReturnType<HttpClientOps[K]>>;
}
