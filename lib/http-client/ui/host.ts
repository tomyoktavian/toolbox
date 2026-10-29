"use client";

import type {
  HttpRequest,
  HttpTree,
  KeyValue,
  RequestScripts,
  AuthConfig,
  Environment,
  WsSessionState,
} from "@/lib/http-client/core";
import { findFolder, findRequest } from "@/lib/http-client/core/model/factory";
import { PanelChannel, type BridgeMessage, type ChannelHost } from "./bridge";
import { EVENTS_URL, rpc } from "./rpc";

export type PanelKind = "request" | "owner" | "environments";

export interface HostPanel {
  key: string;
  kind: PanelKind;
  title: string;
  channel: PanelChannel;
  collectionId?: string;
  requestId?: string;
  folderId?: string;
  /** A request created from the menu that has never been saved; closing its tab deletes it. */
  draft?: boolean;
  /** The panel has edits that are not saved yet. */
  dirty?: boolean;
}

export interface HostSnapshot {
  panels: HostPanel[];
  activeKey?: string;
}

export interface PickItem {
  id: string;
  label: string;
}

/** The browser stand-ins for VS Code dialogs, supplied by the React shell. */
export interface HostUi {
  confirm(message: string, action?: string): Promise<boolean>;
  pick(placeholder: string, items: PickItem[]): Promise<string | undefined>;
  input(options: { title: string; prompt: string; placeholder?: string }): Promise<string | undefined>;
  openFile(accept: string): Promise<string | undefined>;
  toast(level: "info" | "error", message: string): void;
}

const PANELS_KEY = "http-client:panels";
const VIEW_STATE_KEY = "http-client:view-state";
const LEGACY_KEY = "workspaces";
const LEGACY_DONE_KEY = "http-client:legacy-imported";

interface StoredPanel {
  kind: PanelKind;
  collectionId?: string;
  requestId?: string;
  folderId?: string;
  draft?: boolean;
}

function ownerKey(collectionId: string, folderId?: string): string {
  return folderId ? `${collectionId}/${folderId}` : collectionId;
}

function requestKey(requestId: string): string {
  return `request:${requestId}`;
}

function panelTitle(request: HttpRequest): string {
  const label = request.protocol === "ws" ? "WS" : request.method;
  return `${label} ${request.name}`;
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

const EXTENSIONS: Array<[RegExp, string]> = [
  [/json/, "json"],
  [/html/, "html"],
  [/xml/, "xml"],
  [/javascript/, "js"],
  [/css/, "css"],
  [/csv/, "csv"],
  [/png/, "png"],
  [/jpe?g/, "jpg"],
  [/gif/, "gif"],
  [/webp/, "webp"],
  [/svg/, "svg"],
  [/pdf/, "pdf"],
  [/zip/, "zip"],
  [/text\/plain/, "txt"],
];

function extensionFor(contentType: string): string {
  const type = contentType.toLowerCase();
  return EXTENSIONS.find(([pattern]) => pattern.test(type))?.[1] ?? "bin";
}

function download(fileName: string, data: BlobPart, type: string): void {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Browser port of the VS Code HttpClientManager: it owns the panels (editor tabs), routes each
 * panel's messages, and calls the server for anything that touches storage or the network.
 */
export class HttpClientHost implements ChannelHost {
  readonly sidebar: PanelChannel;
  private panels = new Map<string, HostPanel>();
  private activeKey: string | undefined;
  private activeRequestId: string | undefined;
  private readonly pendingExamples = new Map<string, string>();
  private envSelectId: string | undefined;
  private viewStates: Record<string, Record<string, unknown>>;
  private snapshot: HostSnapshot = { panels: [] };
  private readonly listeners = new Set<() => void>();
  private events: EventSource | undefined;
  private ui: HostUi | undefined;

  constructor() {
    this.viewStates = readJson<Record<string, Record<string, unknown>>>(VIEW_STATE_KEY, {});
    this.sidebar = new PanelChannel("sidebar", {}, this);
    for (const stored of readJson<{ panels?: StoredPanel[]; active?: string }>(PANELS_KEY, {}).panels ?? []) {
      this.restore(stored);
    }
    const active = readJson<{ active?: string }>(PANELS_KEY, {}).active;
    this.activeKey = active && this.panels.has(active) ? active : [...this.panels.keys()].at(-1);
    const activePanel = this.activeKey ? this.panels.get(this.activeKey) : undefined;
    if (activePanel?.kind === "request") this.activeRequestId = activePanel.requestId;
    this.emit();
  }

  setUi(ui: HostUi | undefined): void {
    this.ui = ui;
  }

  // ---- React store -------------------------------------------------------------------------

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): HostSnapshot => this.snapshot;

  private emit(): void {
    this.snapshot = { panels: [...this.panels.values()], ...(this.activeKey ? { activeKey: this.activeKey } : {}) };
    writeJson(PANELS_KEY, {
      panels: this.snapshot.panels.map(
        ({ kind, collectionId, requestId, folderId, draft }): StoredPanel => ({
          kind,
          ...(collectionId ? { collectionId } : {}),
          ...(requestId ? { requestId } : {}),
          ...(folderId ? { folderId } : {}),
          ...(draft ? { draft } : {}),
        }),
      ),
      ...(this.activeKey ? { active: this.activeKey } : {}),
    });
    for (const listener of this.listeners) listener();
  }

  // ---- ChannelHost ---------------------------------------------------------------------------

  receive(_channel: PanelChannel, msg: BridgeMessage): void {
    void this.handle(msg);
  }

  async query(_channel: PanelChannel, what: string): Promise<unknown> {
    if (what === "httpTree") return rpc("tree").catch(() => null);
    return null;
  }

  viewState(channelId: string): Record<string, unknown> {
    return this.viewStates[channelId] ?? {};
  }

  saveViewState(channelId: string, patch: Record<string, unknown>): void {
    this.viewStates = { ...this.viewStates, [channelId]: { ...this.viewState(channelId), ...patch } };
    writeJson(VIEW_STATE_KEY, this.viewStates);
  }

  // ---- lifecycle -----------------------------------------------------------------------------

  /** Opens the WebSocket event stream and imports data left by the previous HTTP client once. */
  start(): () => void {
    if (!this.events) {
      this.events = new EventSource(EVENTS_URL);
      this.events.onmessage = (event) => {
        const state = JSON.parse(event.data) as WsSessionState;
        this.postTo(state.requestId, { type: "http-ws-state", state });
      };
    }
    void this.importLegacyWorkspaces();
    return () => {
      this.events?.close();
      this.events = undefined;
    };
  }

  private async importLegacyWorkspaces(): Promise<void> {
    if (localStorage.getItem(LEGACY_DONE_KEY)) return;
    const legacy = readJson<{
      state?: { workspaces?: Array<{ data?: { collections?: unknown[]; environments?: unknown[] } }> };
    }>(LEGACY_KEY, {});
    const items = (legacy.state?.workspaces ?? []).flatMap((workspace) => [
      ...(workspace.data?.collections ?? []),
      ...(workspace.data?.environments ?? []),
    ]);
    localStorage.setItem(LEGACY_DONE_KEY, String(Date.now()));
    if (items.length === 0) return;

    let collections = 0;
    let environments = 0;
    for (const item of items) {
      try {
        const result = await rpc("importText", JSON.stringify(item));
        collections += result.collections;
        environments += result.environments;
      } catch (error) {
        this.ui?.toast("error", `Gagal memindahkan data lama: ${errorText(error)}`);
      }
    }
    await this.broadcastTree();
    this.ui?.toast(
      "info",
      `Data HTTP client lama dipindahkan — ${collections} collection, ${environments} environment.`,
    );
  }

  // ---- routing -------------------------------------------------------------------------------

  async handle(msg: BridgeMessage): Promise<void> {
    try {
      await this.route(msg);
    } catch (error) {
      this.ui?.toast("error", `HTTP client: ${errorText(error)}`);
    }
  }

  private async route(msg: BridgeMessage): Promise<void> {
    const m = msg as BridgeMessage & Record<string, any>;
    switch (m.type) {
      case "http-ai":
        // The assistant lives in the VS Code extension; the web build has no model to ask.
        this.notice(m.requestId, "info", "Aksi AI tidak tersedia di HTTP client web.");
        this.postTo(m.requestId, { type: "http-ai-busy", requestId: m.requestId, busy: false });
        break;
      case "http-ai-stop":
        break;
      case "http-panel-ready":
        await this.postRequestState(m.collectionId, m.requestId);
        this.flushExample(m.requestId);
        break;
      case "http-open": {
        if (m.exampleId) this.pendingExamples.set(m.requestId, m.exampleId);
        const alreadyAlive = await this.openRequest(m.collectionId, m.requestId);
        if (alreadyAlive) this.flushExample(m.requestId);
        break;
      }
      case "http-example-delete": {
        const collection = await rpc("getCollection", m.collectionId);
        const found = collection ? findRequest(collection, m.requestId) : undefined;
        const example = found?.request.examples?.find((item) => item.id === m.exampleId);
        if (!found || !example || !(await this.confirmDelete(`contoh "${example.name}"`))) return;
        await rpc("deleteExample", m.collectionId, m.requestId, m.exampleId);
        await this.broadcastTree();
        break;
      }
      case "http-collection-new": {
        const created = await rpc("createCollection", "New collection");
        await this.broadcastTree();
        await this.openOwner(created.id);
        break;
      }
      case "http-collection-delete": {
        const collection = await rpc("getCollection", m.collectionId);
        if (!collection || !(await this.confirmDelete(`collection "${collection.name}"`, true))) return;
        await rpc("deleteCollection", m.collectionId);
        await this.broadcastTree();
        break;
      }
      case "http-collection-open":
        await this.openOwner(m.collectionId);
        break;
      case "http-collection-save":
        await rpc("saveCollectionSettings", m.collectionId, {
          name: m.name as string,
          ...(m.description !== undefined ? { description: m.description as string } : {}),
          variables: m.variables as KeyValue[],
          auth: m.auth as AuthConfig,
          ...(m.scripts ? { scripts: m.scripts as RequestScripts } : {}),
        });
        await this.broadcastTree();
        break;
      case "http-folder-open":
        await this.openOwner(m.collectionId, m.folderId);
        break;
      case "http-folder-save":
        await rpc("saveFolderSettings", m.collectionId, m.folderId, {
          name: m.name as string,
          ...(m.description !== undefined ? { description: m.description as string } : {}),
          auth: m.auth as AuthConfig,
          ...(m.scripts ? { scripts: m.scripts as RequestScripts } : {}),
        });
        await this.broadcastTree();
        break;
      case "http-owner-panel-ready":
        await this.postOwnerState(m.collectionId, m.folderId);
        break;
      case "http-request-new": {
        const collectionId = m.collectionId ?? (await this.pickCollection());
        if (!collectionId) return;
        const requestId = await rpc("newRequest", collectionId, m.protocol, m.folderId);
        await this.broadcastTree();
        await this.openRequest(collectionId, requestId);
        this.patchPanel(requestKey(requestId), { draft: true });
        break;
      }
      case "http-request-duplicate":
        await rpc("duplicateRequest", m.collectionId, m.requestId);
        await this.broadcastTree();
        break;
      case "http-request-delete": {
        const collection = await rpc("getCollection", m.collectionId);
        const found = collection ? findRequest(collection, m.requestId) : undefined;
        if (!found || !(await this.confirmDelete(`request "${found.request.name}"`))) return;
        await rpc("deleteRequest", m.collectionId, m.requestId);
        this.dispose(requestKey(m.requestId));
        await this.broadcastTree();
        break;
      }
      case "http-request-save":
        await rpc("saveRequest", m.collectionId, m.request);
        this.patchPanel(requestKey((m.request as HttpRequest).id), { draft: false });
        await this.broadcastTree();
        break;
      case "http-panel-dirty":
        this.patchPanel(requestKey(m.requestId), { dirty: Boolean(m.dirty) });
        break;
      case "http-folder-new": {
        const collectionId = m.collectionId ?? (await this.pickCollection());
        if (!collectionId) return;
        const folderId = await rpc("newFolder", collectionId, m.parentFolderId);
        await this.broadcastTree();
        await this.openOwner(collectionId, folderId);
        break;
      }
      case "http-folder-delete": {
        const collection = await rpc("getCollection", m.collectionId);
        const folder = collection ? findFolder(collection, m.folderId) : undefined;
        if (!folder || !(await this.confirmDelete(`folder "${folder.name}"`, true))) return;
        await rpc("deleteFolder", m.collectionId, m.folderId);
        await this.broadcastTree();
        break;
      }
      case "http-import":
        await this.importFile();
        break;
      case "http-import-url":
        await this.importUrl();
        break;
      case "http-import-curl":
        await this.importCurl(m.text, m.collectionId);
        break;
      case "http-curl-parse":
        try {
          this.postTo(m.requestId, {
            type: "http-curl-parsed",
            requestId: m.requestId,
            request: await rpc("parseCurl", m.text),
          });
        } catch (error) {
          this.notice(m.requestId, "error", errorText(error));
        }
        break;
      case "http-export":
        await this.exportFile(m.format, m.collectionId);
        break;
      case "http-envs-open":
        await this.openEnvironments(m.environmentId);
        break;
      case "http-envs-ready":
        await this.postEnvironments();
        break;
      case "http-env-new": {
        const environmentId = await rpc("newEnvironment", m.name);
        this.envSelectId = environmentId;
        await this.broadcastTree();
        await this.openEnvironments(environmentId);
        break;
      }
      case "http-env-duplicate": {
        const copyId = await rpc("duplicateEnvironment", m.environmentId);
        if (!copyId) return;
        this.envSelectId = copyId;
        await this.broadcastTree();
        break;
      }
      case "http-env-delete": {
        const environment = await rpc("getEnvironment", m.environmentId);
        if (!environment || !(await this.confirmDelete(`environment "${environment.name}"`))) return;
        await rpc("deleteEnvironment", m.environmentId);
        await this.broadcastTree();
        break;
      }
      case "http-env-save":
        await rpc("saveEnvironment", m.environment as Environment);
        await this.broadcastTree();
        break;
      case "http-env-activate":
        await rpc("activateEnvironment", m.environmentId);
        await this.broadcastTree();
        break;
      case "http-env-export":
        await this.exportEnvironment(m.environmentId);
        break;
      case "http-globals-save":
        await rpc("saveGlobals", m.globals as KeyValue[]);
        await this.broadcastTree();
        break;
      case "http-send":
        await this.send(m.collectionId, m.request, m.environmentId);
        break;
      case "http-cancel":
        await rpc("cancel", m.requestId);
        break;
      case "http-response-save":
        this.saveResponse({
          requestName: m.requestName,
          contentType: m.contentType,
          fileName: m.fileName,
          body: m.body,
          bodyBase64: m.bodyBase64,
        });
        break;
      case "http-history-open": {
        const entry = await rpc("historyEntry", m.requestId, m.entryId);
        if (!entry) {
          this.notice(m.requestId, "error", "Riwayat itu sudah tidak ada.");
          return;
        }
        this.postTo(m.requestId, { type: "http-history-entry", requestId: m.requestId, entry });
        break;
      }
      case "http-history-delete":
        await rpc("deleteHistoryEntry", m.requestId, m.entryId);
        await this.postHistory(m.requestId);
        break;
      case "http-history-clear":
        await rpc("clearHistory", m.requestId);
        await this.postHistory(m.requestId);
        break;
      case "http-oauth-token":
        await this.fetchOAuthToken(m.collectionId, m.request, m.environmentId);
        break;
      case "http-ws-open":
        await rpc("wsOpen", m.collectionId, m.request, m.environmentId, m.autoReconnect !== false);
        break;
      case "http-ws-send":
        if (!(await rpc("wsSend", m.requestId, m.data))) {
          this.notice(m.requestId, "error", "Socket belum terhubung.");
        }
        break;
      case "http-ws-close":
        await rpc("wsClose", m.requestId);
        break;
      case "http-ws-clear":
        await rpc("wsClear", m.requestId);
        break;
    }
  }

  // ---- panels --------------------------------------------------------------------------------

  private restore(stored: StoredPanel): void {
    if (stored.kind === "request" && stored.collectionId && stored.requestId) {
      this.addPanel({
        key: requestKey(stored.requestId),
        kind: "request",
        title: "…",
        collectionId: stored.collectionId,
        requestId: stored.requestId,
        ...(stored.draft ? { draft: true } : {}),
      });
    } else if (stored.kind === "owner" && stored.collectionId) {
      this.addPanel({
        key: `owner:${ownerKey(stored.collectionId, stored.folderId)}`,
        kind: "owner",
        title: "…",
        collectionId: stored.collectionId,
        ...(stored.folderId ? { folderId: stored.folderId } : {}),
      });
    } else if (stored.kind === "environments") {
      this.addPanel({ key: "environments", kind: "environments", title: "Environments" });
    }
  }

  private addPanel(panel: Omit<HostPanel, "channel">): HostPanel {
    const created: HostPanel = {
      ...panel,
      channel: new PanelChannel(
        panel.key,
        {
          ...(panel.collectionId ? { collectionId: panel.collectionId } : {}),
          ...(panel.requestId ? { requestId: panel.requestId } : {}),
          ...(panel.folderId ? { folderId: panel.folderId } : {}),
        },
        this,
      ),
    };
    this.panels.set(panel.key, created);
    return created;
  }

  private setTitle(key: string, title: string): void {
    const panel = this.panels.get(key);
    if (!panel || panel.title === title) return;
    this.panels.set(key, { ...panel, title });
    this.emit();
  }

  /** Makes a tab the visible one, as revealing a VS Code panel does. */
  activate = (key: string): void => {
    const panel = this.panels.get(key);
    if (!panel) return;
    this.activeKey = key;
    if (panel.kind === "request") this.activeRequestId = panel.requestId;
    this.emit();
    this.broadcastOpen();
  };

  private patchPanel(key: string, patch: Pick<HostPanel, "draft" | "dirty">): void {
    const panel = this.panels.get(key);
    if (!panel || (Object.keys(patch) as Array<keyof typeof patch>).every((k) => panel[k] === patch[k])) return;
    this.panels.set(key, { ...panel, ...patch });
    this.emit();
  }

  /**
   * Closes a tab on the user's behalf: unsaved edits need a confirmation, and a draft request is
   * deleted from its collection because it was never saved.
   */
  close = async (key: string): Promise<void> => {
    const panel = this.panels.get(key);
    if (!panel) return;
    if (panel.draft && panel.collectionId && panel.requestId) {
      if (
        panel.dirty &&
        !(await this.ui?.confirm(`Request draft "${panel.title}" belum disimpan dan akan dihapus. Tutup?`, "Tutup"))
      ) {
        return;
      }
      this.dispose(key);
      await rpc("deleteRequest", panel.collectionId, panel.requestId);
      await this.broadcastTree();
      return;
    }
    if (
      panel.dirty &&
      !(await this.ui?.confirm(`Perubahan pada "${panel.title}" belum disimpan. Tutup tanpa menyimpan?`, "Tutup"))
    ) {
      return;
    }
    this.dispose(key);
  };

  /** Removes a tab, as disposing a VS Code panel does. */
  dispose = (key: string): void => {
    const panel = this.panels.get(key);
    if (!panel) return;
    const keys = [...this.panels.keys()];
    const index = keys.indexOf(key);
    this.panels.delete(key);
    delete this.viewStates[key];
    writeJson(VIEW_STATE_KEY, this.viewStates);
    if (panel.kind === "request" && panel.requestId) {
      void rpc("cancel", panel.requestId).catch(() => {});
      void rpc("wsClose", panel.requestId).catch(() => {});
      if (this.activeRequestId === panel.requestId) this.activeRequestId = undefined;
    }
    if (this.activeKey === key) {
      const remaining = [...this.panels.keys()];
      this.activeKey = remaining[Math.min(index, remaining.length - 1)];
      const next = this.activeKey ? this.panels.get(this.activeKey) : undefined;
      if (next?.kind === "request") this.activeRequestId = next.requestId;
    }
    this.emit();
    this.broadcastOpen();
  };

  private flushExample(requestId: string): void {
    const exampleId = this.pendingExamples.get(requestId);
    if (!exampleId || !this.panels.has(requestKey(requestId))) return;
    this.pendingExamples.delete(requestId);
    this.postTo(requestId, { type: "http-example-show", requestId, exampleId });
  }

  /** Returns true when the panel was already alive and can receive a message right away. */
  async openRequest(collectionId: string, requestId: string): Promise<boolean> {
    const key = requestKey(requestId);
    if (this.panels.has(key)) {
      this.activate(key);
      await this.postRequestState(collectionId, requestId);
      return true;
    }
    const collection = await rpc("getCollection", collectionId);
    const found = collection ? findRequest(collection, requestId) : undefined;
    if (!collection || !found) {
      this.ui?.toast("error", "HTTP client: request tidak ditemukan.");
      return false;
    }
    this.addPanel({ key, kind: "request", title: panelTitle(found.request), collectionId, requestId });
    this.activate(key);
    return false;
  }

  async openOwner(collectionId: string, folderId?: string): Promise<void> {
    const key = `owner:${ownerKey(collectionId, folderId)}`;
    if (this.panels.has(key)) {
      this.activate(key);
      await this.postOwnerState(collectionId, folderId);
      return;
    }
    const collection = await rpc("getCollection", collectionId);
    const folder = collection && folderId ? findFolder(collection, folderId) : undefined;
    if (!collection || (folderId && !folder)) {
      this.ui?.toast("error", "HTTP client: collection/folder tidak ditemukan.");
      return;
    }
    this.addPanel({
      key,
      kind: "owner",
      title: folder?.name ?? collection.name,
      collectionId,
      ...(folderId ? { folderId } : {}),
    });
    this.activate(key);
  }

  async openEnvironments(selectId?: string): Promise<void> {
    this.envSelectId = selectId;
    if (this.panels.has("environments")) {
      this.activate("environments");
      await this.postEnvironments();
      return;
    }
    this.addPanel({ key: "environments", kind: "environments", title: "Environments" });
    this.activate("environments");
  }

  private broadcastOpen(): void {
    this.sidebar.deliver({
      type: "http-open",
      open: [...this.panels.values()]
        .filter((panel) => panel.kind === "request")
        .map((panel) => ({ collectionId: panel.collectionId, requestId: panel.requestId })),
      ...(this.activeRequestId ? { activeRequestId: this.activeRequestId } : {}),
    });
  }

  private postTo(requestId: string, message: BridgeMessage): void {
    this.panels.get(requestKey(requestId))?.channel.deliver(message);
  }

  private notice(requestId: string, level: "info" | "error", message: string): void {
    this.postTo(requestId, { type: "http-notice", level, message });
  }

  private async postHistory(requestId: string): Promise<void> {
    this.postTo(requestId, { type: "http-history", requestId, history: await rpc("history", requestId) });
  }

  private async postRequestState(collectionId: string, requestId: string, tree?: HttpTree): Promise<void> {
    const key = requestKey(requestId);
    if (!this.panels.has(key)) return;
    const current = tree ?? (await rpc("tree"));
    const collection = current.collections.find((c) => c.id === collectionId);
    const found = collection ? findRequest(collection, requestId) : undefined;
    if (!collection || !found) {
      // The request is gone (deleted elsewhere or with its collection); a web tab cannot show it.
      this.dispose(key);
      return;
    }
    this.setTitle(key, panelTitle(found.request));
    this.postTo(requestId, {
      type: "http-request-state",
      collectionId,
      collection,
      request: found.request,
      environments: current.environments,
      globals: current.globals,
      ...(current.activeEnvironmentId ? { activeEnvironmentId: current.activeEnvironmentId } : {}),
    });
    const socket = await rpc("wsState", requestId);
    if (socket) this.postTo(requestId, { type: "http-ws-state", state: socket });
    await this.postHistory(requestId);
  }

  private async postOwnerState(collectionId: string, folderId?: string, tree?: HttpTree): Promise<void> {
    const key = `owner:${ownerKey(collectionId, folderId)}`;
    const open = this.panels.get(key);
    if (!open) return;
    const current = tree ?? (await rpc("tree"));
    const collection = current.collections.find((c) => c.id === collectionId);
    const folder = collection && folderId ? findFolder(collection, folderId) : undefined;
    if (!collection || (folderId && !folder)) {
      this.dispose(key);
      return;
    }
    this.setTitle(key, folder?.name ?? collection.name);
    open.channel.deliver({
      type: "http-owner-state",
      collectionId,
      collection,
      ...(folder ? { folder } : {}),
      environments: current.environments,
      globals: current.globals,
      ...(current.activeEnvironmentId ? { activeEnvironmentId: current.activeEnvironmentId } : {}),
    });
  }

  private async postEnvironments(tree?: HttpTree): Promise<void> {
    const panel = this.panels.get("environments");
    if (!panel) return;
    const current = tree ?? (await rpc("tree"));
    panel.channel.deliver({
      type: "http-envs-state",
      environments: current.environments,
      globals: current.globals,
      ...(current.activeEnvironmentId ? { activeEnvironmentId: current.activeEnvironmentId } : {}),
      ...(this.envSelectId ? { selectId: this.envSelectId } : {}),
    });
    this.envSelectId = undefined;
  }

  async broadcastTree(): Promise<void> {
    const tree = await rpc("tree");
    this.sidebar.deliver({ type: "http-tree", ...tree });
    for (const panel of [...this.panels.values()]) {
      if (panel.kind === "request" && panel.collectionId && panel.requestId) {
        await this.postRequestState(panel.collectionId, panel.requestId, tree);
      } else if (panel.kind === "owner" && panel.collectionId) {
        await this.postOwnerState(panel.collectionId, panel.folderId, tree);
      }
    }
    await this.postEnvironments(tree);
  }

  // ---- dialogs and files ---------------------------------------------------------------------

  private async confirmDelete(what: string, withContents = false): Promise<boolean> {
    return (await this.ui?.confirm(`Hapus ${what}${withContents ? " beserta isinya" : ""}?`)) ?? false;
  }

  private async pickCollection(): Promise<string | undefined> {
    const collections = await rpc("allCollections");
    if (collections.length === 0) {
      const created = await rpc("createCollection", "New collection");
      await this.broadcastTree();
      return created.id;
    }
    if (collections.length === 1) return collections[0]!.id;
    return this.ui?.pick(
      "Simpan ke collection mana?",
      collections.map((collection) => ({ id: collection.id, label: collection.name })),
    );
  }

  private async importCurl(text: string, collectionId?: string): Promise<void> {
    let targetId = collectionId;
    if (!targetId) {
      const NEW = "$new";
      const collections = await rpc("allCollections");
      const picked = await this.ui?.pick("Simpan request cURL ke collection mana?", [
        { id: NEW, label: `+ Collection baru "${await rpc("curlHost", text)}"` },
        ...collections.map((collection) => ({ id: collection.id, label: collection.name })),
      ]);
      if (!picked) return;
      targetId = picked === NEW ? undefined : picked;
    }
    const added = await rpc("importCurl", text, targetId);
    await this.broadcastTree();
    await this.openRequest(added.collectionId, added.requestId);
  }

  private async importFile(): Promise<void> {
    const text = await this.ui?.openFile(".json,.sh,.txt,.curl");
    if (text === undefined) return;
    this.announceImport(await rpc("importText", text));
    await this.broadcastTree();
  }

  private async importUrl(): Promise<void> {
    const url = await this.ui?.input({
      title: "Import dari URL",
      prompt: "URL dokumen OpenAPI/Swagger, Postman collection, atau bundle Silak (JSON)",
      placeholder: "https://api.example.com/v3/api-docs",
    });
    if (!url?.trim()) return;
    this.ui?.toast("info", `Mengambil ${url.trim()}…`);
    this.announceImport(await rpc("importUrl", url.trim()));
    await this.broadcastTree();
  }

  private announceImport(result: { kind: string; collections: number; environments: number }): void {
    this.ui?.toast(
      "info",
      `HTTP client: import ${result.kind} — ${result.collections} collection, ${result.environments} environment.`,
    );
  }

  private async exportFile(format: "postman" | "native", collectionId?: string): Promise<void> {
    const collection = collectionId ? await rpc("getCollection", collectionId) : undefined;
    const fileName =
      format === "native"
        ? "silak-http-client.json"
        : `${(collection?.name ?? "collection").replace(/[^\w.-]+/g, "-")}.postman_collection.json`;
    download(fileName, await rpc("exportText", format, collectionId), "application/json");
  }

  private async exportEnvironment(environmentId: string): Promise<void> {
    const environment = await rpc("getEnvironment", environmentId);
    if (!environment) return;
    download(
      `${environment.name.replace(/[^\w.-]+/g, "-")}.postman_environment.json`,
      await rpc("exportEnvironmentText", environmentId),
      "application/json",
    );
  }

  private saveResponse(msg: {
    requestName: string;
    contentType: string;
    fileName?: string;
    body?: string;
    bodyBase64?: string;
  }): void {
    const fallback = `${msg.requestName.replace(/[^\w.-]+/g, "-") || "response"}.${extensionFor(msg.contentType)}`;
    download(
      msg.fileName?.trim() || fallback,
      msg.bodyBase64 ? base64ToBytes(msg.bodyBase64) : (msg.body ?? ""),
      msg.contentType || "application/octet-stream",
    );
  }

  // ---- network -------------------------------------------------------------------------------

  private async send(collectionId: string, request: HttpRequest, environmentId?: string): Promise<void> {
    this.postTo(request.id, { type: "http-running", requestId: request.id, running: true });
    let outcome: Awaited<ReturnType<typeof rpc<"send">>>;
    try {
      outcome = await rpc("send", collectionId, request, environmentId);
    } catch (error) {
      outcome = { error: errorText(error), reports: [] };
    }
    this.postTo(request.id, { type: "http-running", requestId: request.id, running: false });
    if (outcome.response) await this.postHistory(request.id);
    this.postTo(request.id, {
      type: "http-result",
      requestId: request.id,
      reports: outcome.reports,
      ...(outcome.response ? { response: outcome.response } : {}),
      ...(outcome.skipped ? { skipped: true } : {}),
      ...(outcome.error ? { error: outcome.error } : {}),
    });
    await this.broadcastTree();
  }

  private async fetchOAuthToken(collectionId: string, request: HttpRequest, environmentId?: string): Promise<void> {
    try {
      const started = await rpc("oauthStart", collectionId, request, environmentId);
      if ("notice" in started) {
        this.notice(request.id, started.level, started.notice);
        return;
      }
      window.open(started.url, "_blank", "noopener");
      await rpc("oauthFinish", started.flowId);
      await this.broadcastTree();
      this.notice(request.id, "info", "Token OAuth2 tersimpan di request ini.");
    } catch (error) {
      this.notice(request.id, "error", errorText(error));
    }
  }
}
