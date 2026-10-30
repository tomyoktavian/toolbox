import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { rejectHttpClientRequest } from "@/lib/http-client/server/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The Local Proxy program itself, served by the server it will talk to so the two always match. */
export async function GET(request: Request) {
  const rejected = rejectHttpClientRequest(request, false);
  if (rejected) return rejected;
  const source = await readFile(join(process.cwd(), "scripts", "local-proxy.mjs"), "utf8");
  return new Response(source, {
    headers: {
      "content-type": "text/javascript; charset=utf-8",
      "content-disposition": 'attachment; filename="toolbox-proxy.mjs"',
      "cache-control": "no-store",
    },
  });
}
