import { Workspace } from "@/lib/http-client/core/workspace/workspace";
import { remote } from "../remote";
import { adoptServerData, IdbStore } from "./idb-store";

let ready: Promise<Workspace> | undefined;

/** The browser's workspace, backed by IndexedDB. The first call also adopts the server's older data. */
export function workspace(): Promise<Workspace> {
  ready ??= (async () => {
    await adoptServerData(() => remote("tree"));
    return new Workspace(new IdbStore(), (requestId) =>
      // History lives on the server; failing to clear it must not stop a delete.
      remote("clearHistory", requestId).catch(() => {}),
    );
  })().catch((error) => {
    ready = undefined;
    throw error;
  });
  return ready;
}
