"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { AlertCircle, Check, ChevronDown, ChevronRight, Clipboard, Clock, Terminal, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { curlFor, isFailedEntry, type ConsoleEntry } from "@/lib/http-client/ui/console";
import type { HttpClientHost } from "@/lib/http-client/ui/host";
import { methodStyle, statusColor } from "../lib";

function useConsoleEntries(host: HttpClientHost): readonly ConsoleEntry[] {
  return useSyncExternalStore(host.subscribe, host.getConsole, host.getConsole);
}

function clock(at: number): string {
  return new Date(at).toLocaleTimeString("en-GB");
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function prettyBody(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

/** The status bar along the bottom of the workbench, with the console toggle and its counts. */
export function ConsoleBar({
  host,
  open,
  onToggle,
}: {
  host: HttpClientHost;
  open: boolean;
  onToggle: () => void;
}) {
  const entries = useConsoleEntries(host);
  const failed = entries.filter(isFailedEntry).length;
  return (
    <footer className="flex h-6 shrink-0 items-center justify-end gap-1 border-t bg-muted/40 px-2 text-[11px]">
      <button
        onClick={onToggle}
        aria-pressed={open}
        data-tip="Console: log request dan script"
        className={cn(
          "flex items-center gap-1.5 rounded px-1.5 py-0.5 hover:bg-accent",
          open && "bg-accent text-foreground",
        )}
      >
        <Terminal size={12} />
        Console
        {entries.length > 0 && (
          <span className="rounded-full bg-muted-foreground/20 px-1.5 tabular-nums">{entries.length}</span>
        )}
        {failed > 0 && (
          <span className="flex items-center gap-0.5 rounded-full bg-destructive/15 px-1.5 tabular-nums text-destructive">
            <AlertCircle size={10} />
            {failed}
          </span>
        )}
      </button>
    </footer>
  );
}

export function ConsolePanel({ host, onClose }: { host: HttpClientHost; onClose: () => void }) {
  const entries = useConsoleEntries(host);
  const failed = entries.filter(isFailedEntry).length;
  const listRef = useRef<HTMLDivElement>(null);

  // Newest first: bring the top into view whenever a request is added.
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = 0;
  }, [entries.length]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-background text-xs">
      <div className="flex shrink-0 items-center gap-2 border-b bg-muted/50 px-3 py-1.5">
        <Terminal size={13} />
        <span className="font-medium">Console</span>
        <span className="rounded-full bg-muted-foreground/20 px-2 py-px tabular-nums">{entries.length} request</span>
        {failed > 0 && (
          <span className="flex items-center gap-1 rounded-full bg-destructive/15 px-2 py-px tabular-nums text-destructive">
            <AlertCircle size={11} />
            {failed} gagal
          </span>
        )}
        <button
          onClick={host.clearConsole}
          disabled={entries.length === 0}
          className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 opacity-70 hover:bg-accent hover:opacity-100 disabled:pointer-events-none disabled:opacity-30"
        >
          <Trash2 size={12} /> Clear
        </button>
        <button
          onClick={onClose}
          aria-label="Tutup console"
          className="rounded p-0.5 opacity-70 hover:bg-accent hover:opacity-100"
        >
          <X size={13} />
        </button>
      </div>

      <div ref={listRef} className="min-h-0 flex-1 overflow-auto p-2">
        {entries.length === 0 ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            Belum ada request yang dijalankan
          </div>
        ) : (
          <div className="space-y-1">
            {[...entries].reverse().map((entry) => (
              <EntryRow key={entry.id} entry={entry} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function EntryRow({ entry }: { entry: ConsoleEntry }) {
  const [open, setOpen] = useState(false);
  const [sections, setSections] = useState<ReadonlySet<string>>(new Set());
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  const toggleSection = (name: string): void =>
    setSections((current) => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  const copyCurl = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(curlFor(entry));
      setCopied(true);
    } catch {}
  };

  const passed = entry.tests.filter((test) => test.passed).length;
  const hasScript = entry.logs.length > 0 || entry.tests.length > 0;

  return (
    <div className={cn("rounded-md border", isFailedEntry(entry) && "border-destructive/40")}>
      <div className="flex items-center gap-2 px-2 py-1.5 hover:bg-muted/50">
        <button
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          {open ? <ChevronDown size={14} className="shrink-0" /> : <ChevronRight size={14} className="shrink-0" />}
          <span className={cn("w-12 shrink-0 text-[10px] font-bold", methodStyle(entry.method))}>
            {entry.method}
          </span>
          <span className="min-w-0 flex-1 truncate font-mono">{entry.url}</span>
        </button>
        <div className="flex shrink-0 items-center gap-2">
          {entry.tests.length > 0 && (
            <span className={cn("tabular-nums", passed === entry.tests.length ? "text-emerald-500" : "text-red-500")}>
              {passed}/{entry.tests.length} test
            </span>
          )}
          {entry.status !== undefined ? (
            <span className={cn("rounded border px-1.5 font-mono", statusColor(entry.status))}>{entry.status}</span>
          ) : entry.skipped ? (
            <span className="rounded border px-1.5 font-mono text-muted-foreground">SKIP</span>
          ) : (
            <span className="rounded border border-destructive/40 px-1.5 font-mono text-destructive">ERR</span>
          )}
          {entry.timeMs !== undefined && (
            <span className="flex items-center gap-1 text-muted-foreground">
              <Clock size={11} />
              {entry.timeMs} ms
            </span>
          )}
          {entry.sizeBytes !== undefined && (
            <span className="text-muted-foreground tabular-nums">{formatSize(entry.sizeBytes)}</span>
          )}
          <span className="text-muted-foreground tabular-nums">{clock(entry.at)}</span>
          <button
            onClick={() => void copyCurl()}
            aria-label="Salin sebagai cURL"
            data-tip="Salin sebagai cURL"
            className="rounded p-1 opacity-70 hover:bg-accent hover:opacity-100"
          >
            {copied ? <Check size={12} className="text-emerald-500" /> : <Clipboard size={12} />}
          </button>
        </div>
      </div>

      {open && (
        <div className="space-y-2 border-t bg-muted/20 p-3">
          {entry.error && (
            <p className="rounded border border-destructive/30 bg-destructive/10 p-2 text-destructive">{entry.error}</p>
          )}

          <Section title="cURL" open={sections.has("curl")} onToggle={() => toggleSection("curl")}>
            <Block text={curlFor(entry)} />
          </Section>

          <Section title="Network" open={sections.has("network")} onToggle={() => toggleSection("network")}>
            <dl className="space-y-0.5 rounded border bg-background p-2 font-mono text-[11px]">
              <Field label="Request" value={entry.requestName} />
              <Field label="URL" value={entry.url} />
              <Field label="Method" value={entry.method} />
              {entry.status !== undefined && (
                <Field label="Status" value={`${entry.status} ${entry.statusText ?? ""}`.trim()} />
              )}
              {entry.timeMs !== undefined && <Field label="Waktu" value={`${entry.timeMs} ms`} />}
              {entry.sizeBytes !== undefined && <Field label="Ukuran" value={formatSize(entry.sizeBytes)} />}
              <Field label="Timestamp" value={new Date(entry.at).toLocaleString("en-GB")} />
            </dl>
          </Section>

          <Section
            title="Request Headers"
            count={entry.requestHeaders.length}
            open={sections.has("request-headers")}
            onToggle={() => toggleSection("request-headers")}
          >
            <Headers rows={entry.requestHeaders} />
          </Section>

          <Section
            title="Response Headers"
            count={entry.responseHeaders.length}
            open={sections.has("response-headers")}
            onToggle={() => toggleSection("response-headers")}
          >
            <Headers rows={entry.responseHeaders} />
          </Section>

          <Section title="Response Body" open={sections.has("response-body")} onToggle={() => toggleSection("response-body")}>
            {entry.responseBody ? <Block text={prettyBody(entry.responseBody)} /> : (
              <p className="text-muted-foreground">{entry.responseNote ?? "Body kosong."}</p>
            )}
            {entry.responseBody && entry.responseNote && (
              <p className="mt-1 text-amber-600 dark:text-amber-400">{entry.responseNote}</p>
            )}
          </Section>

          {entry.requestBody && (
            <Section title="Request Body" open={sections.has("request-body")} onToggle={() => toggleSection("request-body")}>
              <Block text={prettyBody(entry.requestBody)} />
            </Section>
          )}

          {hasScript && (
            <Section
              title="Script"
              count={entry.logs.length + entry.tests.length}
              open={sections.has("script")}
              onToggle={() => toggleSection("script")}
            >
              <div className="space-y-0.5 rounded border bg-background p-2 font-mono text-[11px]">
                {entry.logs.map((log, index) => (
                  <div key={`log-${index}`}>
                    <span className="mr-1 text-muted-foreground">{log.phase === "pre-request" ? "pre" : "post"}</span>
                    <span
                      className={cn(
                        "mr-1 font-bold",
                        log.level === "error" ? "text-red-500" : log.level === "warn" ? "text-yellow-500" : "text-sky-500",
                      )}
                    >
                      [{log.level.toUpperCase()}]
                    </span>
                    <span className="whitespace-pre-wrap break-all">{log.text}</span>
                  </div>
                ))}
                {entry.tests.map((test, index) => (
                  <div key={`test-${index}`} className={test.passed ? "text-emerald-500" : "text-red-500"}>
                    {test.passed ? "✓" : "✗"} {test.name}
                    {test.error && <span className="text-muted-foreground"> — {test.error}</span>}
                  </div>
                ))}
              </div>
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  count,
  open,
  onToggle,
  children,
}: {
  title: string;
  count?: number;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div>
      <button onClick={onToggle} aria-expanded={open} className="flex items-center gap-1.5 font-medium hover:text-primary">
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        {title}
        {count !== undefined && <span className="font-normal text-muted-foreground">({count})</span>}
      </button>
      {open && <div className="mt-1.5">{children}</div>}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-20 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-all">{value}</dd>
    </div>
  );
}

function Headers({ rows }: { rows: ReadonlyArray<readonly [string, string]> }) {
  if (rows.length === 0) return <p className="text-muted-foreground">Tidak ada header.</p>;
  return (
    <div className="space-y-0.5 rounded border bg-background p-2 font-mono text-[11px]">
      {rows.map(([name, value], index) => (
        <div key={`${name}-${index}`} className="break-all">
          <span className="text-sky-600 dark:text-sky-400">{name}:</span> <span>{value}</span>
        </div>
      ))}
    </div>
  );
}

function Block({ text }: { text: string }) {
  return (
    <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded border bg-background p-2 font-mono text-[11px]">
      {text}
    </pre>
  );
}
