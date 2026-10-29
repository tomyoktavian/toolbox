"use client";

import { useEffect, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent } from "react";
import { CopyPlus, Layers, Folder, Globe, ListX, PanelTopClose, SlidersHorizontal, X } from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { cn } from "@/lib/utils";
import { BridgeProvider } from "@/lib/http-client/ui/bridge";
import { HttpClientHost, type HostPanel } from "@/lib/http-client/ui/host";
import { EnvironmentsView } from "../EnvironmentsView";
import { HttpTab } from "../HttpTab";
import { OwnerPanel } from "../OwnerPanel";
import { RequestPanel } from "../RequestPanel";
import { methodStyle } from "../lib";
import { TooltipLayer } from "../shared/TooltipLayer";
import { ConsoleBar, ConsolePanel } from "./console-panel";
import { HostDialogs } from "./host-dialogs";

const CONSOLE_OPEN_KEY = "http-client:console-open";
const CONSOLE_HEIGHT_KEY = "http-client:console-height";
const CONSOLE_MIN_HEIGHT = 120;
const CONSOLE_DEFAULT_HEIGHT = 280;

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function PanelView({ panel }: { panel: HostPanel }) {
  if (panel.kind === "request") return <RequestPanel />;
  if (panel.kind === "owner") return <OwnerPanel />;
  return <EnvironmentsView />;
}

function TabLabel({ panel }: { panel: HostPanel }) {
  if (panel.kind === "request") {
    const [label, ...rest] = panel.title.split(" ");
    return (
      <>
        <span className={cn("text-[9px] font-bold", methodStyle(label ?? ""))}>{label}</span>
        <span className="truncate">{rest.join(" ")}</span>
      </>
    );
  }
  const Icon = panel.kind === "environments" ? SlidersHorizontal : panel.folderId ? Folder : Layers;
  return (
    <>
      <Icon size={12} className="shrink-0 opacity-70" />
      <span className="truncate">{panel.title}</span>
    </>
  );
}

/** The VS Code workbench in miniature: the HTTP sidebar view plus an editor group of panels. */
export function Workbench() {
  const [host] = useState(() => new HttpClientHost());
  const { panels, activeKey } = useSyncExternalStore(host.subscribe, host.getSnapshot, host.getSnapshot);

  useEffect(() => host.start(), [host]);

  const [consoleOpen, setConsoleOpen] = useState(() => readStored(CONSOLE_OPEN_KEY) === "1");
  const [consoleHeight, setConsoleHeight] = useState(
    () => Math.max(CONSOLE_MIN_HEIGHT, Number(readStored(CONSOLE_HEIGHT_KEY)) || CONSOLE_DEFAULT_HEIGHT),
  );

  useEffect(() => {
    try {
      localStorage.setItem(CONSOLE_OPEN_KEY, consoleOpen ? "1" : "0");
      localStorage.setItem(CONSOLE_HEIGHT_KEY, String(consoleHeight));
    } catch {}
  }, [consoleOpen, consoleHeight]);

  const onConsoleResizeStart = (event: ReactPointerEvent<HTMLDivElement>): void => {
    event.preventDefault();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const startY = event.clientY;
    const startHeight = consoleHeight;
    const move = (e: PointerEvent): void => {
      const max = Math.round(window.innerHeight * 0.7);
      setConsoleHeight(Math.min(max, Math.max(CONSOLE_MIN_HEIGHT, startHeight - (e.clientY - startY))));
    };
    const up = (): void => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      handle.removeEventListener("pointercancel", up);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
    handle.addEventListener("pointercancel", up);
  };

  return (
    <div className="http-client-root flex h-full w-full flex-col overflow-hidden bg-background text-foreground">
      <div className="min-h-0 flex-1">
      <ResizablePanelGroup orientation="horizontal" className="h-full w-full">
        <ResizablePanel id="http-sidebar" defaultSize={300} minSize={220} maxSize="50%" className="border-r">
          <BridgeProvider channel={host.sidebar}>
            <HttpTab />
          </BridgeProvider>
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel id="http-editors" minSize="40%">
          <div className="flex h-full min-h-0 flex-col">
            {panels.length > 0 && (
              <div className="scrollbar-hide flex shrink-0 overflow-x-auto border-b bg-muted/40">
                {panels.map((panel) => {
                  const unsaved = Boolean(panel.draft || panel.dirty);
                  return (
                    <ContextMenu key={panel.key}>
                    <ContextMenuTrigger
                      render={
                        <div
                          role="tab"
                          aria-selected={panel.key === activeKey}
                          title={panel.draft ? `${panel.title} — draft, belum disimpan` : panel.title}
                          onClick={() => host.activate(panel.key)}
                          onAuxClick={(event) => {
                            if (event.button === 1) void host.close(panel.key);
                          }}
                          className={cn(
                            "group flex max-w-56 shrink-0 items-center gap-1.5 border-r py-1.5 pl-3 pr-1.5 text-xs",
                            panel.draft && "italic",
                            panel.key === activeKey
                              ? "-mb-px border-b border-b-background bg-background text-foreground"
                              : "text-muted-foreground hover:text-foreground",
                          )}
                        />
                      }
                    >
                      <TabLabel panel={panel} />
                      {/* Like VS Code: an unsaved tab shows a dot that turns into the close button on hover. */}
                      <button
                        aria-label={`Tutup ${panel.title}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          void host.close(panel.key);
                        }}
                        className={cn(
                          "relative ml-1 flex size-5 items-center justify-center rounded hover:bg-accent",
                          unsaved || panel.key === activeKey ? "opacity-70" : "opacity-0 group-hover:opacity-70",
                        )}
                      >
                        {unsaved && (
                          <span className="size-2 rounded-full bg-foreground group-hover:hidden" aria-hidden />
                        )}
                        <X size={12} className={cn(unsaved && "hidden group-hover:block")} />
                      </button>
                    </ContextMenuTrigger>
                    <ContextMenuContent className="min-w-48 text-xs">
                      <ContextMenuItem className="text-xs" onClick={() => void host.close(panel.key)}>
                        <X /> Tutup tab
                      </ContextMenuItem>
                      <ContextMenuItem
                        className="text-xs"
                        disabled={panels.length < 2}
                        onClick={() =>
                          void host.closeMany(panels.filter((item) => item.key !== panel.key).map((item) => item.key))
                        }
                      >
                        <PanelTopClose /> Tutup tab lain
                      </ContextMenuItem>
                      <ContextMenuItem
                        className="text-xs"
                        onClick={() => void host.closeMany(panels.map((item) => item.key))}
                      >
                        <ListX /> Tutup semua tab
                      </ContextMenuItem>
                      <ContextMenuSeparator />
                      <ContextMenuItem
                        className="text-xs"
                        disabled={panel.kind !== "request"}
                        onClick={() => void host.duplicate(panel.key)}
                      >
                        <CopyPlus /> Duplikat tab
                      </ContextMenuItem>
                    </ContextMenuContent>
                    </ContextMenu>
                  );
                })}
              </div>
            )}
            <div className="relative min-h-0 flex-1">
              {panels.length === 0 && (
                <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-xs text-muted-foreground">
                  <Globe size={28} className="opacity-40" />
                  <p>Buka request dari sidebar, atau buat yang baru.</p>
                  <button
                    onClick={() => void host.handle({ type: "http-request-new", protocol: "rest" })}
                    className="rounded-full border px-3 py-1 text-foreground hover:bg-accent"
                  >
                    HTTP request baru
                  </button>
                </div>
              )}
              {panels.map((panel) => (
                // Inactive panels stay mounted, like retained webviews, so drafts and responses survive.
                <div key={panel.key} className={cn("absolute inset-0", panel.key !== activeKey && "hidden")}>
                  <BridgeProvider channel={panel.channel}>
                    <PanelView panel={panel} />
                  </BridgeProvider>
                </div>
              ))}
            </div>
            {/* A sibling after the editors, so opening the console never remounts them (drafts live there). */}
            {consoleOpen && (
              <>
                <div
                  onPointerDown={onConsoleResizeStart}
                  onDoubleClick={() => setConsoleHeight(CONSOLE_DEFAULT_HEIGHT)}
                  data-tip="Geser untuk mengubah tinggi · klik dua kali untuk reset"
                  className="group relative h-1.5 shrink-0 cursor-row-resize touch-none select-none"
                >
                  <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border transition-colors group-hover:bg-ring group-active:bg-ring" />
                </div>
                <div style={{ height: consoleHeight, maxHeight: "70%" }} className="shrink-0">
                  <ConsolePanel host={host} onClose={() => setConsoleOpen(false)} />
                </div>
              </>
            )}
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
      </div>
      <ConsoleBar host={host} open={consoleOpen} onToggle={() => setConsoleOpen(!consoleOpen)} />
      <TooltipLayer />
      <HostDialogs host={host} />
    </div>
  );
}
