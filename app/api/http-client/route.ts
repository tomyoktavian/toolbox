import { rejectHttpClientRequest } from "@/lib/http-client/server/guard";
import { ops, type HttpClientOp } from "@/lib/http-client/server/ops";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const rejected = rejectHttpClientRequest(request, true);
  if (rejected) return rejected;

  let payload: { op?: unknown; args?: unknown };
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const { op, args = [] } = payload;
  if (typeof op !== "string" || !Object.hasOwn(ops, op) || !Array.isArray(args)) {
    return Response.json({ error: `Unknown operation: ${String(op)}` }, { status: 400 });
  }

  try {
    const handler = ops[op as HttpClientOp] as (...input: unknown[]) => unknown;
    const result = await handler(...args);
    return Response.json({ result: result ?? null });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
