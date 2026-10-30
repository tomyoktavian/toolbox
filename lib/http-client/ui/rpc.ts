import type { HttpClientOps } from "@/lib/http-client/server/ops";
import { localOps, type LocalOps } from "./local/ops";
import { remote } from "./remote";

export { EVENTS_URL, RPC_URL } from "./remote";

/** Every operation the UI can call: the local ones win, the rest go to the server. */
export type ClientOps = LocalOps & Omit<HttpClientOps, keyof LocalOps>;
export type ClientOp = keyof ClientOps;

type Handler = (...args: unknown[]) => Promise<unknown>;

/** Calls one operation. Data operations run in the browser, the others on the server. */
export async function rpc<K extends ClientOp>(
  op: K,
  ...args: Parameters<ClientOps[K]>
): Promise<Awaited<ReturnType<ClientOps[K]>>> {
  const local = Object.hasOwn(localOps, op) ? (localOps[op as keyof LocalOps] as Handler) : undefined;
  const result = local
    ? await local(...args)
    : await (remote as unknown as (op: string, ...args: unknown[]) => Promise<unknown>)(op, ...args);
  return result as Awaited<ReturnType<ClientOps[K]>>;
}
