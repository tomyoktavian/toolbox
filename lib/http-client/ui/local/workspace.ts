import { Workspace } from "@/lib/http-client/core/workspace/workspace";
import { remote } from "../remote";
import { adoptServerData, adoptServerHistory, IdbStore, idbHistory } from "./idb-store";

let ready: Promise<Workspace> | undefined;

/** The browser's workspace, backed by IndexedDB. The first call also adopts the server's older data. */
export function workspace(): Promise<Workspace> {
  ready ??= (async () => {
    await adoptServerData(() => remote("tree"));
    await adoptServerHistory((requestIds) => remote("readHistories", requestIds));
    return new Workspace(new IdbStore(), (requestId) => idbHistory.deleteHistory(requestId));
  })().catch((error) => {
    ready = undefined;
    throw error;
  });
  return ready;
}
