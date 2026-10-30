import { agentPoll, parseAgentToken } from "@/lib/http-client/server/agent";
import { rejectHttpClientRequest } from "@/lib/http-client/server/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The Local Proxy asks for work. Held open for a while, then answered with a job or 204. */
export async function GET(request: Request) {
  const rejected = rejectHttpClientRequest(request, true);
  if (rejected) return rejected;
  const token = parseAgentToken(request.headers.get("x-http-client-agent"));
  if (!token) return Response.json({ error: "Token Local Proxy tidak valid." }, { status: 401 });

  // ?wait=0 is the agent's first call: answer straight away so it can say "connected".
  const immediate = new URL(request.url).searchParams.get("wait") === "0";
  const job = await agentPoll(token, request.signal, immediate ? 0 : undefined);
  return job ? Response.json({ job }) : new Response(null, { status: 204 });
}
