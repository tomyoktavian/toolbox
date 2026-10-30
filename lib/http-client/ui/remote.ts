import type { HttpClientOp, HttpClientOps } from "@/lib/http-client/server/ops";
import { agentToken } from "./agent-token";

export const RPC_URL = "/api/http-client";
export const EVENTS_URL = "/api/http-client/events";

/** Calls one server operation; rejects with the server's error message. */
export async function remote<K extends HttpClientOp>(
  op: K,
  ...args: Parameters<HttpClientOps[K]>
): Promise<Awaited<ReturnType<HttpClientOps[K]>>> {
  // The token tells the server which Local Proxy (if any) to use for requests to localhost.
  const token = agentToken();
  const response = await fetch(RPC_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-http-client": "1",
      ...(token ? { "x-http-client-agent": token } : {}),
    },
    body: JSON.stringify({ op, args }),
  });
  const payload = (await response.json().catch(() => ({}))) as { result?: unknown; error?: string };
  if (!response.ok) throw new Error(payload.error ?? `HTTP ${response.status}`);
  return payload.result as Awaited<ReturnType<HttpClientOps[K]>>;
}
