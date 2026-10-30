import { agentRespond, parseAgentToken, type AgentResult } from "@/lib/http-client/server/agent";
import { rejectHttpClientRequest } from "@/lib/http-client/server/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isResult(value: unknown): value is AgentResult {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string") return false;
  if (row.ok === false) return typeof row.error === "string";
  return (
    row.ok === true &&
    typeof row.status === "number" &&
    typeof row.statusText === "string" &&
    typeof row.bodyBase64 === "string" &&
    typeof row.url === "string" &&
    typeof row.redirected === "boolean" &&
    Array.isArray(row.headers) &&
    row.headers.every(
      (pair) => Array.isArray(pair) && pair.length === 2 && pair.every((item) => typeof item === "string"),
    )
  );
}

/** The Local Proxy returns what a job produced. */
export async function POST(request: Request) {
  const rejected = rejectHttpClientRequest(request, true);
  if (rejected) return rejected;
  const token = parseAgentToken(request.headers.get("x-http-client-agent"));
  if (!token) return Response.json({ error: "Token Local Proxy tidak valid." }, { status: 401 });

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!isResult(payload)) return Response.json({ error: "Hasil tidak valid." }, { status: 400 });
  // Unknown id: the request was cancelled or timed out meanwhile, which is not the agent's fault.
  return new Response(null, { status: agentRespond(token, payload) ? 204 : 410 });
}
