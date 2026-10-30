import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Braces,
  Check,
  ChevronDown,
  Copy,
  Download,
  History,
  MoreHorizontal,
  Search,
  Sparkles,
  Trash2,
  WrapText,
  X,
} from 'lucide-react';
import type { HttpResponse, ResponseHistorySummary, ScriptReport } from '@/lib/http-client/core';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/http-client/shared/motion/popover';
import { SelectField } from './SelectField';
import { JsonTable } from './JsonTable';
import { renderTemplate, visualizeDocument, type VisualTheme } from './visualize';
import { ModelGenerator, type SavePayload } from './ModelGenerator';
import { formatTime } from './lib';
import { BODY_LANGUAGES, guessLanguage, ResponseBody, type BodyLanguage, type ResponseBodyHandle } from './ResponseBody';
import { prettyJson, statusColor } from './lib';

type Pane = 'body' | 'cookies' | 'headers' | 'tests' | 'console';
type BodyMode = 'pretty' | 'raw' | 'preview' | 'visualize';

interface BodyAction {
  key: string;
  label: string;
  icon: ReactNode;
  active?: boolean;
  onClick: () => void;
}

const COMPACT_WIDTH = 560;

function themeOf(): VisualTheme {
  const style = getComputedStyle(document.body);
  const pick = (name: string, fallback: string): string =>
    style.getPropertyValue(name).trim() || fallback;
  return {
    background: pick('--vscode-editor-background', '#1e1e1e'),
    foreground: pick('--vscode-editor-foreground', '#d4d4d4'),
    border: pick('--vscode-panel-border', '#3c3c3c'),
    font: pick('--vscode-font-family', 'system-ui, sans-serif'),
  };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ResponseView({
  response,
  error,
  skipped,
  running,
  reports,
  requestName,
  history,
  viewing,
  onOpenHistory,
  onDeleteHistory,
  onClearHistory,
  onBackToLatest,
  onSave,
  onSaveExample,
  savedExample,
  onOpenExample,
  onAi,
  onAiStop,
  aiBusy = false,
}: {
  response?: HttpResponse;
  error?: string;
  skipped?: boolean;
  running: boolean;
  reports: ScriptReport[];
  requestName: string;
  history: ResponseHistorySummary[];
  viewing?: ResponseHistorySummary;
  onOpenHistory: (entryId: string) => void;
  onDeleteHistory: (entryId: string) => void;
  onClearHistory: () => void;
  onBackToLatest: () => void;
  onSave: (payload: SavePayload) => void;
  /** Offered only for a response no saved example holds yet. */
  onSaveExample?: () => void;
  /** The saved example that already holds this response, when there is one. */
  savedExample?: { id: string; name: string };
  onOpenExample?: (id: string) => void;
  onAi?: (action: 'fix' | 'explain' | 'tests') => void;
  onAiStop?: () => void;
  aiBusy?: boolean;
}) {
  const [pane, setPane] = useState<Pane>('body');
  const [bodyMode, setBodyMode] = useState<BodyMode>('pretty');
  const [wrap, setWrap] = useState(true);
  const [languageOverride, setLanguageOverride] = useState<BodyLanguage | undefined>();
  const [copied, setCopied] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [modeOpen, setModeOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [compact, setCompact] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const [codegen, setCodegen] = useState(false);
  const bodyRef = useRef<ResponseBodyHandle>(null);

  const historyMenu = (
    <Popover
      open={historyOpen}
      onOpenChange={setHistoryOpen}
      side="bottom"
      align="end"
      sideOffset={4}
      panelRadius={8}
      gooStrength={0}
    >
      <PopoverTrigger>
        <button
          data-tip="Riwayat response request ini"
          className={`flex items-center gap-1 rounded px-1 py-0.5 hover:bg-[var(--vscode-toolbar-hoverBackground)] ${
            history.length ? 'opacity-80 hover:opacity-100' : 'opacity-40'
          }`}
        >
          <History size={13} />
          {history.length > 0 && <span>{history.length}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent className="flex w-[22rem] flex-col p-1 text-xs">
        {history.length === 0 ? (
          <div className="px-2 py-1.5 opacity-60">Belum ada riwayat untuk request ini.</div>
        ) : (
          <>
            <div className="max-h-72 overflow-y-auto">
              {history.map((entry) => (
                <div
                  key={entry.id}
                  className={`group flex items-center gap-2 rounded px-2 py-1 hover:bg-[var(--vscode-list-hoverBackground)] ${
                    viewing?.id === entry.id ? 'bg-[var(--vscode-list-hoverBackground)]' : ''
                  }`}
                >
                  <button
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    onClick={() => {
                      setHistoryOpen(false);
                      onOpenHistory(entry.id);
                    }}
                  >
                    <span className="w-14 shrink-0 font-mono opacity-60">{formatTime(entry.at)}</span>
                    <span className={`w-8 shrink-0 font-semibold ${statusColor(entry.status)}`}>
                      {entry.status}
                    </span>
                    <span className="shrink-0 opacity-60">{entry.timeMs} ms</span>
                    <span className="shrink-0 opacity-60">{formatBytes(entry.sizeBytes)}</span>
                    {entry.testsTotal > 0 && (
                      <span
                        className={`shrink-0 ${
                          entry.testsPassed === entry.testsTotal
                            ? 'text-emerald-500'
                            : 'text-[var(--vscode-errorForeground)]'
                        }`}
                      >
                        {entry.testsPassed}/{entry.testsTotal}
                      </span>
                    )}
                    <span className="min-w-0 truncate opacity-50" data-tip={entry.url}>
                      {entry.environmentName ?? ''}
                    </span>
                  </button>
                  <button
                    data-tip="Hapus entri ini"
                    onClick={() => onDeleteHistory(entry.id)}
                    className="hidden shrink-0 rounded p-0.5 opacity-60 hover:opacity-100 group-hover:block"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
            <button
              onClick={() => {
                setHistoryOpen(false);
                onClearHistory();
              }}
              className="mt-1 rounded px-2 py-1 text-left text-[var(--vscode-errorForeground)] hover:bg-[var(--vscode-list-hoverBackground)]"
            >
              Bersihkan riwayat
            </button>
          </>
        )}
      </PopoverContent>
    </Popover>
  );

  const visualization = reports.find((report) => report.visualization)?.visualization;

  useEffect(() => {
    setLanguageOverride(undefined);
    setCodegen(false);
  }, [response]);

  useEffect(() => {
    if (!visualization && bodyMode === 'visualize') setBodyMode('pretty');
  }, [visualization, bodyMode]);

  useEffect(() => {
    const element = rootRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setCompact((entry?.contentRect.width ?? 0) < COMPACT_WIDTH);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const tests = reports.flatMap((report) => report.tests);
  const logs = reports.flatMap((report) =>
    report.logs.map((log) => ({ ...log, phase: report.phase })),
  );
  const scriptErrors = reports.filter((report) => report.error);
  const failed = tests.filter((test) => !test.passed).length;

  if (running) {
    return (
      <div className="flex h-full items-center justify-center text-xs opacity-60">Mengirim…</div>
    );
  }
  if (!response && !error && !skipped) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex shrink-0 items-center justify-end px-3 py-1.5 text-xs">{historyMenu}</div>
        <div className="flex flex-1 items-center justify-center text-xs opacity-50">
          Tekan Send untuk melihat response.
        </div>
      </div>
    );
  }

  const language: BodyLanguage = languageOverride ?? guessLanguage(response?.contentType ?? '', response?.body ?? '');
  const isHtml = language === 'html';
  const isImage = Boolean(response?.bodyBase64 && response.contentType.startsWith('image/'));
  const parsedJson = ((): { ok: boolean; value?: unknown } => {
    if (!response || response.bodyBase64 || language !== 'json') return { ok: false };
    try {
      return { ok: true, value: JSON.parse(response.body) };
    } catch {
      return { ok: false };
    }
  })();
  const canPreview = isHtml || isImage || parsedJson.ok;
  const body = !response
    ? ''
    : response.bodyBase64
      ? `<binary ${response.contentType || 'body'} · ${formatBytes(response.sizeBytes)}>`
      : language === 'json' && bodyMode === 'pretty'
        ? prettyJson(response.body)
        : response.body;

  const visual = ((): { html?: string; error?: string } => {
    if (!visualization || bodyMode !== 'visualize') return {};
    try {
      return { html: renderTemplate(visualization.template, visualization.data) };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  })();
  const modes: BodyMode[] = [
    'pretty',
    'raw',
    ...(canPreview ? (['preview'] as const) : []),
    ...(visualization ? (['visualize'] as const) : []),
  ];

  const copyBody = (): void => {
    void navigator.clipboard.writeText(body).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    });
  };
  const copyHeaders = (): void => {
    if (!response) return;
    void navigator.clipboard.writeText(
      response.headers.map(([key, value]) => `${key}: ${value}`).join('\n'),
    );
  };

  const bodyActions: BodyAction[] = [
    ...(bodyMode === 'preview'
      ? []
      : [
          {
            key: 'wrap',
            label: wrap ? 'Matikan wrap baris' : 'Wrap baris',
            icon: <WrapText size={13} />,
            active: wrap,
            onClick: () => setWrap(!wrap),
          },
          {
            key: 'search',
            label: 'Cari di body (Cmd/Ctrl+F)',
            icon: <Search size={13} />,
            onClick: () => bodyRef.current?.search(),
          },
          {
            key: 'copy',
            label: copied ? 'Tersalin' : 'Salin body',
            icon: copied ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />,
            onClick: copyBody,
          },
        ]),
    {
      key: 'save',
      label: 'Simpan response ke file',
      icon: <Download size={13} />,
      onClick: () =>
        response &&
        onSave({
          body: response.bodyBase64 ?? response.body,
          contentType: response.contentType,
          fileName: '',
          ...(response.bodyBase64 ? { base64: true } : {}),
        }),
    },
    ...(parsedJson.ok
      ? [
          {
            key: 'model',
            label: 'Buat model/tipe dari response (TypeScript, Dart, Kotlin, Swift, Go, Python, JSON Schema)',
            icon: <Braces size={13} />,
            active: codegen,
            onClick: () => setCodegen(!codegen),
          },
        ]
      : []),
  ];

  return (
    <div ref={rootRef} className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-3 px-3 py-1.5 text-xs">
        {response && (
          <>
            <span className={`font-semibold ${statusColor(response.status)}`}>
              {response.status} {response.statusText}
            </span>
            <span className="opacity-70">{response.timeMs} ms</span>
            <span className="opacity-70">{formatBytes(response.sizeBytes)}</span>
            {response.redirected && <span className="opacity-60">redirected</span>}
            {response.truncated && (
              <span className="text-[var(--vscode-editorWarning-foreground)]">body dipotong</span>
            )}
            {!viewing && onSaveExample && (
              <button
                type="button"
                onClick={onSaveExample}
                data-tip="Simpan request dan response ini sebagai contoh di collection"
                className="flex items-center gap-1 rounded border border-[var(--vscode-panel-border)] px-2 py-0.5 hover:bg-[var(--vscode-toolbar-hoverBackground)]"
              >
                <Braces size={12} /> Save as example
              </button>
            )}
            {!viewing && !onSaveExample && savedExample && (
              <button
                type="button"
                onClick={() => onOpenExample?.(savedExample.id)}
                data-tip="Response ini sama dengan contoh yang sudah disimpan · klik untuk membukanya"
                className="flex max-w-56 items-center gap-1 rounded px-1 py-0.5 opacity-70 hover:bg-[var(--vscode-toolbar-hoverBackground)] hover:opacity-100"
              >
                <Check size={12} className="shrink-0 text-emerald-500" />
                <span className="truncate">Contoh: {savedExample.name}</span>
              </button>
            )}
          </>
        )}
        {skipped && <span className="opacity-70">Dilewati oleh pm.execution.skipRequest()</span>}
        {error && <span className="text-[var(--vscode-errorForeground)]">{error}</span>}
        {response && (
          <span className="min-w-0 flex-1 truncate text-right opacity-40" data-tip={response.url}>
            {response.url}
          </span>
        )}
        {historyMenu}
      </div>

      {viewing && (
        <div className="flex shrink-0 items-center gap-2 bg-[var(--vscode-editorWidget-background)] px-3 py-1 text-xs">
          <History size={12} className="opacity-70" />
          <span>
            Riwayat · {formatTime(viewing.at)}
            {viewing.environmentName ? ` · ${viewing.environmentName}` : ''}
          </span>
          <button className="ml-auto opacity-70 hover:underline hover:opacity-100" onClick={onBackToLatest}>
            Kembali ke response terbaru
          </button>
        </div>
      )}

      <div className="flex shrink-0 items-center gap-3 overflow-x-auto border-y border-[var(--vscode-panel-border)] px-3 text-xs">
        <PaneTab pane="body" current={pane} onSelect={setPane} label="Body" />
        <PaneTab
          pane="cookies"
          current={pane}
          onSelect={setPane}
          label={<TabLabel text="Cookies" count={response?.cookies.length} />}
        />
        <PaneTab
          pane="headers"
          current={pane}
          onSelect={setPane}
          label={<TabLabel text="Headers" count={response?.headers.length} />}
        />
        <PaneTab
          pane="tests"
          current={pane}
          onSelect={setPane}
          label={
            <TabLabel
              text="Tests"
              danger={failed > 0}
              {...(tests.length ? { badge: `${tests.length - failed}/${tests.length}` } : {})}
            />
          }
        />
        <PaneTab
          pane="console"
          current={pane}
          onSelect={setPane}
          label={<TabLabel text="Console" count={logs.length} />}
        />

        <div className="ml-auto flex shrink-0 items-center gap-2 py-1">
          {onAi && (response || error) && (
            aiBusy ? (
              <>
                <span className="flex items-center gap-1 opacity-80">
                  <span className="size-1.5 animate-pulse rounded-full bg-[var(--vscode-focusBorder)]" />
                  AI…
                </span>
                {onAiStop && (
                  <button
                    onClick={onAiStop}
                    className="text-[var(--vscode-errorForeground)] hover:underline"
                  >
                    Stop
                  </button>
                )}
              </>
            ) : (
              <Popover
                open={aiOpen}
                onOpenChange={setAiOpen}
                side="bottom"
                align="end"
                sideOffset={4}
                panelRadius={8}
                gooStrength={0}
              >
                <PopoverTrigger>
                  <button
                    data-tip="Aksi AI untuk response ini"
                    className="flex items-center gap-1 rounded px-1.5 py-0.5 opacity-70 hover:bg-[var(--vscode-toolbar-hoverBackground)] hover:opacity-100"
                  >
                    <Sparkles size={12} /> AI
                    <ChevronDown size={11} className="opacity-60" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="flex w-52 flex-col p-1 text-xs">
                  {(error || (response && response.status >= 400)) && (
                    <MenuItem
                      icon={<Sparkles size={12} />}
                      label="Perbaiki request"
                      onClick={() => {
                        setAiOpen(false);
                        onAi('fix');
                      }}
                    />
                  )}
                  <MenuItem
                    icon={<Sparkles size={12} />}
                    label="Jelaskan response"
                    onClick={() => {
                      setAiOpen(false);
                      onAi('explain');
                    }}
                  />
                  {response && (
                    <MenuItem
                      icon={<Sparkles size={12} />}
                      label="Buat tests"
                      onClick={() => {
                        setAiOpen(false);
                        onAi('tests');
                      }}
                    />
                  )}
                </PopoverContent>
              </Popover>
            )
          )}
          {pane === 'headers' && response && response.headers.length > 0 && (
            <IconButton title="Salin semua header" onClick={copyHeaders}>
              <Copy size={13} />
            </IconButton>
          )}
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        {pane === 'body' && response && !codegen && (
          <div className="absolute top-1.5 right-3 z-10 flex items-center gap-1 rounded-md border border-[var(--vscode-panel-border)] bg-[var(--vscode-editorWidget-background)] px-1 py-0.5 opacity-75 shadow-sm transition-opacity hover:opacity-100 focus-within:opacity-100">
            {compact ? (
              <Popover
                open={modeOpen}
                onOpenChange={setModeOpen}
                side="bottom"
                align="end"
                sideOffset={6}
                panelRadius={8}
                gooStrength={0}
              >
                <PopoverTrigger>
                  <button
                    data-tip="Tampilan body"
                    className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] capitalize hover:bg-[var(--vscode-toolbar-hoverBackground)]"
                  >
                    {bodyMode}
                    <ChevronDown size={11} className="opacity-60" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="flex w-36 flex-col p-1 text-xs">
                  {modes.map((mode) => (
                    <MenuItem
                      key={mode}
                      label={mode}
                      className="capitalize"
                      active={bodyMode === mode}
                      onClick={() => {
                        setModeOpen(false);
                        setBodyMode(mode);
                      }}
                    />
                  ))}
                </PopoverContent>
              </Popover>
            ) : (
              <div className="flex items-center rounded bg-[var(--vscode-panel-border)]/30 p-0.5">
                {modes.map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setBodyMode(mode)}
                    className={`rounded px-1.5 py-0.5 text-[11px] capitalize ${
                      bodyMode === mode
                        ? 'bg-[var(--vscode-editorWidget-background)] opacity-100 shadow-sm'
                        : 'opacity-55 hover:opacity-100'
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            )}

            {!compact && bodyMode !== 'preview' && <LanguagePicker value={language} onChange={setLanguageOverride} />}

            {compact ? (
              <Popover
                open={moreOpen}
                onOpenChange={setMoreOpen}
                side="bottom"
                align="end"
                sideOffset={6}
                panelRadius={8}
                gooStrength={0}
              >
                <PopoverTrigger>
                  <button
                    data-tip="Aksi body lainnya"
                    className="rounded p-0.5 opacity-70 hover:bg-[var(--vscode-toolbar-hoverBackground)] hover:opacity-100"
                  >
                    <MoreHorizontal size={13} />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="flex w-60 flex-col p-1 text-xs">
                  {bodyMode !== 'preview' && (
                    <label className="flex items-center gap-2 px-2 py-1">
                      <span className="shrink-0 opacity-70">Bahasa</span>
                      <LanguagePicker value={language} onChange={setLanguageOverride} grow />
                    </label>
                  )}
                  {bodyActions.map((action) => (
                    <MenuItem
                      key={action.key}
                      label={action.label}
                      icon={action.icon}
                      {...(action.active === undefined ? {} : { active: action.active })}
                      onClick={() => {
                        setMoreOpen(false);
                        action.onClick();
                      }}
                    />
                  ))}
                </PopoverContent>
              </Popover>
            ) : (
              <>
                <span className="mx-0.5 h-3.5 w-px bg-[var(--vscode-panel-border)]" />
                {bodyActions.map((action) => (
                  <IconButton
                    key={action.key}
                    title={action.label}
                    {...(action.active === undefined ? {} : { active: action.active })}
                    onClick={action.onClick}
                  >
                    {action.icon}
                  </IconButton>
                ))}
              </>
            )}
          </div>
        )}
        <div className="h-full overflow-auto text-xs">
          {pane === 'body' &&
            (!response ? (
              <div className="p-3 opacity-60">Tidak ada body.</div>
            ) : codegen && parsedJson.ok ? (
              <ModelGenerator
                json={parsedJson.value}
                requestName={requestName}
                onSave={onSave}
                onClose={() => setCodegen(false)}
              />
            ) : isImage && bodyMode === 'preview' ? (
              <div className="flex h-full items-center justify-center overflow-auto p-3">
                <img
                  alt="Response"
                  src={`data:${response.contentType};base64,${response.bodyBase64}`}
                  className="max-h-full max-w-full"
                />
              </div>
            ) : isHtml && bodyMode === 'preview' ? (
              <iframe
                title="Preview"
                sandbox=""
                srcDoc={response.body}
                className="h-full w-full bg-white"
              />
            ) : bodyMode === 'visualize' && visualization ? (
              visual.error ? (
                <div className="p-3 text-[var(--vscode-errorForeground)]">
                  Template visualisasi gagal: {visual.error}
                </div>
              ) : (
                <iframe
                  title="Visualize"
                  sandbox=""
                  srcDoc={visualizeDocument(visual.html ?? '', themeOf())}
                  className="h-full w-full"
                />
              )
            ) : bodyMode === 'preview' && parsedJson.ok ? (
              <JsonTable value={parsedJson.value} />
            ) : (
              <ResponseBody ref={bodyRef} text={body} language={language} wrap={wrap} />
            ))}

          {pane === 'headers' && (
            <Table
              rows={(response?.headers ?? []).map(([key, value]) => [key, value])}
              empty="Tidak ada header."
            />
          )}

          {pane === 'cookies' &&
            (response?.cookies.length ? (
              <table className="w-full">
                <thead className="text-left opacity-60">
                  <tr>
                    {['Name', 'Value', 'Domain', 'Path', 'Expires', 'HttpOnly', 'Secure', 'SameSite'].map(
                      (head) => (
                        <th key={head} className="whitespace-nowrap px-3 py-1 font-medium">
                          {head}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {response.cookies.map((cookie, index) => (
                    <tr key={`${cookie.name}:${index}`} className="align-top">
                      <td className="px-3 py-0.5 font-mono">{cookie.name}</td>
                      <td className="break-all px-3 py-0.5 font-mono">{cookie.value}</td>
                      <td className="px-3 py-0.5">{cookie.domain ?? ''}</td>
                      <td className="px-3 py-0.5">{cookie.path ?? ''}</td>
                      <td className="whitespace-nowrap px-3 py-0.5">{cookie.expires ?? 'Session'}</td>
                      <td className="px-3 py-0.5">{cookie.httpOnly ? '✓' : ''}</td>
                      <td className="px-3 py-0.5">{cookie.secure ? '✓' : ''}</td>
                      <td className="px-3 py-0.5">{cookie.sameSite ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="p-3 opacity-60">Tidak ada cookie.</div>
            ))}

          {pane === 'tests' && (
            <div className="p-2">
              {scriptErrors.map((report, index) => (
                <div key={index} className="mb-2 text-[var(--vscode-errorForeground)]">
                  Script {report.phase} gagal: {report.error}
                </div>
              ))}
              {tests.length === 0 && scriptErrors.length === 0 && (
                <div className="opacity-60">
                  Belum ada test. Tulis di tab Tests: pm.test(&apos;…&apos;, () =&gt; …).
                </div>
              )}
              {tests.map((test, index) => (
                <div key={index} className="flex items-start gap-2 py-0.5">
                  {test.passed ? (
                    <Check size={13} className="mt-0.5 shrink-0 text-emerald-500" />
                  ) : (
                    <X size={13} className="mt-0.5 shrink-0 text-[var(--vscode-errorForeground)]" />
                  )}
                  <span className="min-w-0">
                    {test.name}
                    {test.error && (
                      <span className="block opacity-70">{test.error}</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}

          {pane === 'console' && (
            <div className="p-2 font-mono text-[11px]">
              {logs.length === 0 && <div className="opacity-60">console.log dari script muncul di sini.</div>}
              {logs.map((log, index) => (
                <div
                  key={index}
                  className={
                    log.level === 'error'
                      ? 'text-[var(--vscode-errorForeground)]'
                      : log.level === 'warn'
                        ? 'text-[var(--vscode-editorWarning-foreground)]'
                        : ''
                  }
                >
                  <span className="opacity-40">[{log.phase}] </span>
                  {log.text}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PaneTab({
  pane,
  current,
  onSelect,
  label,
}: {
  pane: Pane;
  current: Pane;
  onSelect: (pane: Pane) => void;
  label: React.ReactNode;
}) {
  return (
    <button
      onClick={() => onSelect(pane)}
      className={`py-1 ${current === pane ? 'border-b-2 border-[var(--vscode-focusBorder)]' : 'opacity-60'}`}
    >
      {label}
    </button>
  );
}

function TabLabel({
  text,
  count,
  badge,
  danger,
}: {
  text: string;
  count?: number;
  badge?: string;
  danger?: boolean;
}) {
  const suffix = badge ?? (count ? String(count) : undefined);
  return (
    <span className={`flex items-center gap-1 whitespace-nowrap ${danger ? 'text-[var(--vscode-errorForeground)]' : ''}`}>
      {text}
      {suffix && (
        <span className="rounded bg-[var(--vscode-panel-border)]/50 px-1 text-[10px] opacity-70">
          {suffix}
        </span>
      )}
    </span>
  );
}

function MenuItem({
  label,
  icon,
  active,
  className,
  onClick,
}: {
  label: string;
  icon?: ReactNode;
  active?: boolean;
  className?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 rounded px-2 py-1 text-left hover:bg-[var(--vscode-list-hoverBackground)] ${
        active ? 'bg-[var(--vscode-list-hoverBackground)]' : ''
      } ${className ?? ''}`}
    >
      <span className="flex w-4 shrink-0 items-center justify-center opacity-70">{icon}</span>
      <span className="min-w-0 truncate">{label}</span>
    </button>
  );
}

function LanguagePicker({
  value,
  onChange,
  grow,
}: {
  value: BodyLanguage;
  onChange: (next: BodyLanguage) => void;
  grow?: boolean;
}) {
  return (
    <SelectField
      value={value}
      onChange={onChange}
      options={BODY_LANGUAGES}
      variant="ghost"
      tip="Bahasa penyorotan"
      className={`text-[11px] ${grow ? 'min-w-0 flex-1 border-input' : ''}`}
    />
  );
}

function IconButton({
  title,
  active,
  onClick,
  children,
}: {
  title: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      data-tip={title}
      onClick={onClick}
      className={`rounded p-0.5 hover:bg-[var(--vscode-toolbar-hoverBackground)] ${
        active ? 'opacity-100' : 'opacity-60 hover:opacity-100'
      }`}
    >
      {children}
    </button>
  );
}

function Table({ rows, empty }: { rows: Array<[string, string]>; empty: string }) {
  if (rows.length === 0) return <div className="p-3 opacity-60">{empty}</div>;
  return (
    <table className="w-full table-fixed">
      <tbody>
        {rows.map(([key, value], index) => (
          <tr key={`${key}:${index}`} className="align-top">
            <td className="w-1/3 truncate px-3 py-0.5 opacity-70">{key}</td>
            <td className="break-all px-3 py-0.5">{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
