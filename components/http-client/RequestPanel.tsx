import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Code, Columns2, Eye, FileCode2, Plus, Rows2, Save, Send, Square } from 'lucide-react';
import type {
  Collection,
  Environment,
  HttpRequest,
  HttpResponse,
  KeyValue,
  RequestExample,
  ResponseHistoryEntry,
  ResponseHistorySummary,
  ScriptReport,
  WsSessionState,
} from '@/lib/http-client/core';
import { Button } from '@/components/http-client/shared/motion/button/base';
import { useBridge } from '@/lib/http-client/ui/bridge';
import { SelectField } from './SelectField';
import { AuthEditor } from './AuthEditor';
import { BodyEditor } from './BodyEditor';
import { ExampleEditor } from './ExampleEditor';
import { HeadersEditor, ParamsEditor } from './bulk/PairsEditor';
import { SnippetDialog } from './SnippetDialog';
import { ResponseView } from './ResponseView';
import { ScriptEditor } from './ScriptEditor';
import { SplitPane } from './SplitPane';
import { paneLayout } from './layout-store';
import { VarInput, VarScopeProvider } from './VarInput';
import { WsConsole } from './WsConsole';
import {
  CELL,
  METHODS,
  effectiveUrl,
  exampleLabel,
  exampleName,
  folderTrail,
  isDefaultRequestName,
  methodStyle,
  responseMatchesExample,
  statusColor,
  titleFromUrl,
  withSavedExamples,
} from './lib';
import { paramsFromUrl, urlFromParams } from './url-sync';

const exampleId = (): string => crypto.randomUUID();

const METHOD_OPTIONS = METHODS.map((method) => ({
  value: method,
  label: method,
  className: `font-bold ${methodStyle(method)}`,
}));

interface PanelViewState extends Record<string, unknown> {
  httpCollectionId?: string;
  httpRequestId?: string;
  httpEnvironmentId?: string;
  httpAutoReconnect?: boolean;
}

type Tab = 'params' | 'auth' | 'headers' | 'body' | 'pre-request' | 'tests';

const TAB_LABEL: Record<Tab, string> = {
  params: 'Params',
  auth: 'Authorization',
  headers: 'Headers',
  body: 'Body',
  'pre-request': 'Pre-request Script',
  tests: 'Tests',
};

export function RequestPanel() {
  const { boot, loadViewState, onMessage, post, saveViewState } = useBridge();
  const saved = loadViewState<PanelViewState>();
  const collectionId = boot.collectionId ?? saved.httpCollectionId ?? '';
  const requestId = boot.requestId ?? saved.httpRequestId ?? '';

  const [saved0, setSaved0] = useState<HttpRequest | undefined>();
  const [draft, setDraft] = useState<HttpRequest | undefined>();
  const [collection, setCollection] = useState<Collection | undefined>();
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [globals, setGlobals] = useState<KeyValue[]>([]);
  const [environmentId, setEnvironmentId] = useState<string | undefined>(saved.httpEnvironmentId);
  const [autoReconnect, setAutoReconnect] = useState(saved.httpAutoReconnect !== false);
  // The pane layout is shared by every request tab. While the divider is dragged this tab follows the
  // pointer on its own; the others are told once, when it is let go.
  const layout = useSyncExternalStore(paneLayout.subscribe, paneLayout.getSnapshot, paneLayout.getServerSnapshot);
  const [dragRatio, setDragRatio] = useState<number | undefined>();
  const split = layout.split;
  const splitRatio = dragRatio ?? layout.splitRatio;
  const [tab, setTab] = useState<Tab>('params');
  const [response, setResponse] = useState<HttpResponse | undefined>();
  const [history, setHistory] = useState<ResponseHistorySummary[]>([]);
  const [viewing, setViewing] = useState<ResponseHistorySummary | undefined>();
  const [latest, setLatest] = useState<
    { response?: HttpResponse; error?: string; skipped: boolean; reports: ScriptReport[] } | undefined
  >();
  const [error, setError] = useState<string | undefined>();
  const [skipped, setSkipped] = useState(false);
  const [reports, setReports] = useState<ScriptReport[]>([]);
  const [running, setRunning] = useState(false);
  const [socket, setSocket] = useState<WsSessionState | undefined>();
  const [notice, setNotice] = useState<{ message: string; level: 'info' | 'error' } | undefined>();
  const [aiBusy, setAiBusy] = useState(false);
  const [exampleView, setExampleView] = useState<string | undefined>();
  const [showVars, setShowVars] = useState(false);
  const [snippetFor, setSnippetFor] = useState<HttpRequest | undefined>();
  const draftRef = useRef<HttpRequest | undefined>(undefined);
  draftRef.current = draft;
  // Whether this tab has already shown or sent something; the saved response is restored only before that.
  const settledRef = useRef(false);

  const dirty = useMemo(
    () => Boolean(draft && saved0 && JSON.stringify(draft) !== JSON.stringify(saved0)),
    [draft, saved0],
  );

  // The web tab strip shows the unsaved marker and asks before closing a dirty tab.
  useEffect(() => {
    post({ type: 'http-panel-dirty', requestId, dirty });
  }, [post, requestId, dirty]);

  useEffect(() => {
    saveViewState({
      httpCollectionId: collectionId,
      httpRequestId: requestId,
      ...(environmentId ? { httpEnvironmentId: environmentId } : {}),
      httpAutoReconnect: autoReconnect,
    });
  }, [collectionId, requestId, environmentId, autoReconnect]);

  useEffect(() => {
    const off = onMessage((msg) => {
      switch (msg.type) {
        case 'http-request-state': {
          const state = msg as unknown as {
            request: HttpRequest;
            collection: Collection;
            environments: Environment[];
            globals: KeyValue[];
            activeEnvironmentId?: string;
          };
          // The URL is the source of truth for enabled params, but importers (Postman, OpenAPI)
          // store the query only in `params`; rebuild the URL from them before deriving params.
          const url = effectiveUrl(state.request);
          const normalized: HttpRequest = {
            ...state.request,
            url,
            params: paramsFromUrl(url, state.request.params),
          };
          // On first load, requests that usually carry a payload open on the Body tab.
          if (!draftRef.current && normalized.protocol !== 'ws' && normalized.method !== 'GET') {
            setTab('body');
          }
          setSaved0(normalized);
          setDraft((current) => (current ? withSavedExamples(current, normalized) : normalized));
          // An example that is gone (deleted from the sidebar) must not stay open in this tab.
          setExampleView((open) =>
            open && normalized.examples?.some((example) => example.id === open) ? open : undefined,
          );
          setCollection(state.collection);
          setEnvironments(state.environments);
          setGlobals(state.globals);
          setEnvironmentId((current) => current ?? state.activeEnvironmentId);
          break;
        }
        case 'http-snapshot-request':
          post({ type: 'http-snapshot', token: msg.token, request: draftRef.current });
          break;
        case 'http-example-show':
          setExampleView((msg.exampleId as string | undefined) ?? undefined);
          break;
        case 'http-running':
          setRunning(msg.running as boolean);
          if (msg.running) {
            settledRef.current = true;
            setError(undefined);
            setResponse(undefined);
            setSkipped(false);
            setReports([]);
          }
          break;
        case 'http-ai-busy': {
          const m = msg as unknown as { requestId: string; busy: boolean };
          setAiBusy(m.busy);
          break;
        }
        case 'http-ai-result': {
          const m = msg as unknown as {
            requestId: string;
            action: 'fix' | 'explain' | 'tests' | 'generate';
            patch?: {
              method?: string;
              url?: string;
              headers?: Record<string, string>;
              body?: string;
              reason?: string;
            };
            script?: string;
            note?: string;
          };
          setAiBusy(false);
          if (m.note) setNotice({ message: m.note, level: 'info' });
          if (m.script) {
            setDraft((current) =>
              current
                ? { ...current, scripts: { ...(current.scripts ?? {}), postResponse: m.script! } }
                : current,
            );
            setTab('tests');
            setNotice({ message: 'Script tests dari AI dimuat — tinjau lalu Save.', level: 'info' });
          }
          if (m.patch) {
            setDraft((current) => {
              if (!current) return current;
              const headers = [...current.headers];
              for (const [key, value] of Object.entries(m.patch!.headers ?? {})) {
                const found = headers.find((item) => item.key.toLowerCase() === key.toLowerCase());
                if (found) {
                  found.value = value;
                  found.enabled = true;
                } else headers.push({ key, value, enabled: true });
              }
              return {
                ...current,
                ...(m.patch!.method ? { method: m.patch!.method as HttpRequest['method'] } : {}),
                ...(m.patch!.url ? { url: m.patch!.url } : {}),
                headers,
                ...(m.patch!.body !== undefined
                  ? {
                      body:
                        current.body.mode === 'none'
                          ? { mode: 'json' as const, text: m.patch!.body }
                          : { ...current.body, text: m.patch!.body },
                    }
                  : {}),
              };
            });
            setNotice({
              message: m.patch.reason
                ? `Usulan AI diterapkan ke form: ${m.patch.reason}`
                : 'Usulan AI diterapkan ke form — tinjau lalu kirim ulang.',
              level: 'info',
            });
          }
          break;
        }
        case 'http-result': {
          const res = msg.response as HttpResponse | undefined;
          const err = msg.error as string | undefined;
          const rep = (msg.reports as ScriptReport[]) ?? [];
          setResponse(res);
          setError(err);
          setSkipped(Boolean(msg.skipped));
          setReports(rep);
          setViewing(undefined);
          setLatest({
            ...(res ? { response: res } : {}),
            ...(err ? { error: err } : {}),
            skipped: Boolean(msg.skipped),
            reports: rep,
          });
          break;
        }
        case 'http-curl-parsed': {
          const parsed = msg.request as HttpRequest;
          setDraft((current) =>
            current
              ? {
                  ...current,
                  method: parsed.method,
                  url: parsed.url,
                  params: parsed.params,
                  headers: parsed.headers,
                  body: parsed.body,
                  ...(parsed.auth.type !== 'none' ? { auth: parsed.auth } : {}),
                }
              : current,
          );
          setNotice({ message: 'Perintah cURL dikonversi ke request ini.', level: 'info' });
          break;
        }
        case 'http-history': {
          const list = msg.history as ResponseHistorySummary[];
          setHistory(list);
          // The first list after the tab opens: show the newest saved response, as if the last send never went away.
          if (!settledRef.current) {
            settledRef.current = true;
            const newest = list[0];
            if (newest) post({ type: 'http-history-open', requestId, entryId: newest.id });
          }
          break;
        }
        case 'http-history-entry': {
          const entry = msg.entry as ResponseHistoryEntry;
          setResponse(entry.response);
          setError(undefined);
          setSkipped(false);
          setReports([]);
          setViewing({
            id: entry.id,
            requestId: entry.requestId,
            at: entry.at,
            method: entry.method,
            ...(entry.environmentName ? { environmentName: entry.environmentName } : {}),
            testsPassed: entry.testsPassed,
            testsTotal: entry.testsTotal,
            url: entry.response.url,
            status: entry.response.status,
            statusText: entry.response.statusText,
            timeMs: entry.response.timeMs,
            sizeBytes: entry.response.sizeBytes,
          });
          break;
        }
        case 'http-ws-state':
          setSocket(msg.state as WsSessionState);
          break;
        case 'http-notice':
          setNotice({ message: msg.message as string, level: msg.level as 'info' | 'error' });
          break;
      }
    });
    post({ type: 'http-panel-ready', collectionId, requestId });
    return off;
  }, [collectionId, requestId]);

  const update = (patch: Partial<HttpRequest>): void =>
    setDraft((current) => (current ? { ...current, ...patch } : current));

  const updateExamples = (examples: RequestExample[]): void => {
    const current = draftRef.current;
    if (!current) return;
    const next = { ...current, examples };
    setDraft(next);
    setSaved0(next);
    post({ type: 'http-request-save', collectionId, request: next });
  };

  const addExampleFromResponse = (): void => {
    const current = draftRef.current;
    if (!current || !response) return;
    const example: RequestExample = {
      id: exampleId(),
      name: exampleName(current.name, response.status, current.examples ?? []),
      status: response.status,
      statusText: response.statusText,
      headers: response.headers.map(([key, value]) => ({ key, value, enabled: true })),
      body: response.body,
      ...(response.contentType ? { contentType: response.contentType } : {}),
      ...(current.body.mode !== 'none' ? { requestBody: current.body } : {}),
      createdAt: Date.now(),
    };
    updateExamples([...(current.examples ?? []), example]);
    setExampleView(example.id);
  };

  const save = useCallback((): HttpRequest | undefined => {
    const draftNow = draftRef.current;
    if (!draftNow) return undefined;
    const autoName = isDefaultRequestName(draftNow.name) && titleFromUrl(draftNow.url);
    const current = autoName ? { ...draftNow, name: autoName } : draftNow;
    if (current !== draftNow) setDraft(current);
    post({ type: 'http-request-save', collectionId, request: current });
    setSaved0(current);
    return current;
  }, [collectionId]);

  const isWs = draft?.protocol === 'ws';

  const send = useCallback((): void => {
    const current = save();
    if (!current) return;
    post({
      type: current.protocol === 'ws' ? 'http-ws-open' : 'http-send',
      collectionId,
      request: current,
      ...(current.protocol === 'ws' ? { autoReconnect } : {}),
      ...(environmentId ? { environmentId } : {}),
    });
  }, [autoReconnect, collectionId, environmentId, save]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const meta = event.metaKey || event.ctrlKey;
      if (!meta) return;
      if (event.key === 's') {
        event.preventDefault();
        save();
      } else if (event.key === 'Enter') {
        event.preventDefault();
        send();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [save, send]);

  const tabs = useMemo<Tab[]>(
    () =>
      isWs
        ? ['params', 'auth', 'headers', 'pre-request']
        : ['params', 'auth', 'headers', 'body', 'pre-request', 'tests'],
    [isWs],
  );

  useEffect(() => {
    if (!tabs.includes(tab)) setTab('params');
  }, [tabs, tab]);

  // A response is worth saving as an example only when no saved example already holds it.
  const matchedExample =
    response && draft && !viewing
      ? draft.examples?.find((example) => responseMatchesExample(example, response, draft.body))
      : undefined;

  if (!draft) return <div className="p-4 text-xs opacity-60">Memuat request…</div>;

  const environment = environments.find((e) => e.id === environmentId);
  const scope = {
    ...(environment ? { environment } : {}),
    ...(collection ? { collection } : {}),
    globals,
  };

  return (
    <VarScopeProvider value={scope}>
    <div className="flex h-full flex-col text-xs">
      <div className="flex shrink-0 items-center gap-2 px-3 py-1.5">
        {collection && (
          <button
            className="truncate opacity-50 hover:opacity-100 hover:underline"
            data-tip="Buka pengaturan collection"
            onClick={() => post({ type: 'http-collection-open', collectionId: collection.id })}
          >
            {collection.name}
          </button>
        )}
        {collection &&
          folderTrail(collection, requestId).map((entry) => (
            <span key={entry.id} className="flex min-w-0 items-center gap-2">
              <span className="opacity-30">/</span>
              <button
                className="truncate opacity-50 hover:opacity-100 hover:underline"
                data-tip="Buka pengaturan folder"
                onClick={() =>
                  post({ type: 'http-folder-open', collectionId: collection.id, folderId: entry.id })
                }
              >
                {entry.name}
              </button>
            </span>
          ))}
        <span className="opacity-30">/</span>
        <input
          value={draft.name}
          onChange={(e) => update({ name: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
          spellCheck={false}
          data-tip="Nama request — klik untuk mengubah"
          className="min-w-0 max-w-[40%] flex-1 truncate rounded border border-transparent bg-transparent px-1 py-0.5 font-medium outline-none hover:border-[var(--vscode-panel-border)] focus:border-[var(--vscode-focusBorder)]"
        />
        {dirty && <span className="h-1.5 w-1.5 rounded-full bg-amber-400" data-tip="Belum disimpan" />}

        <div className="ml-auto flex items-center gap-1.5">
          <SelectField
            value={environmentId ?? ''}
            onChange={(id) => {
              const next = id || undefined;
              setEnvironmentId(next);
              post({ type: 'http-env-activate', ...(next ? { environmentId: next } : {}) });
            }}
            className="max-w-[160px]"
            tip="Environment untuk tab ini — pilihan terakhir dipakai tab baru berikutnya"
            options={[
              { value: '', label: 'No environment' },
              ...environments.map((item) => ({ value: item.id, label: item.name })),
            ]}
          />
          <button
            data-tip={split === 'vertical' ? 'Tata letak kiri-kanan' : 'Tata letak atas-bawah'}
            onClick={() => paneLayout.set({ split: split === 'vertical' ? 'horizontal' : 'vertical' })}
            className="rounded p-1 opacity-70 hover:opacity-100"
          >
            {split === 'vertical' ? <Columns2 size={14} /> : <Rows2 size={14} />}
          </button>
          <button
            data-tip="Lihat variabel aktif"
            onClick={() => setShowVars(!showVars)}
            className="rounded p-1 opacity-70 hover:opacity-100"
          >
            <Eye size={14} />
          </button>
          {!isWs && (
            <button
              data-tip="Code snippet (cURL, JavaScript, Python, PHP, Go)"
              onClick={() => setSnippetFor(draft)}
              className="rounded p-1 opacity-70 hover:opacity-100"
            >
              <Code size={14} />
            </button>
          )}
          <Button variant={dirty ? 'primary' : 'ghost'} size="sm" onClick={save} data-tip="Cmd/Ctrl+S">
            <Save size={13} /> Save
          </Button>
        </div>
      </div>

      <SnippetDialog
        request={snippetFor}
        collectionId={collectionId}
        environmentId={environmentId}
        onClose={() => setSnippetFor(undefined)}
      />

      {showVars && (
        <VariablesQuickLook
          {...(environment ? { environment } : {})}
          {...(collection ? { collection } : {})}
          globals={globals}
          onClose={() => setShowVars(false)}
        />
      )}

      <div className="flex shrink-0 items-center gap-2 border-y border-[var(--vscode-panel-border)] px-3 py-2">
        {isWs ? (
          <span className={`font-bold ${methodStyle('WS')}`}>WS</span>
        ) : (
          <SelectField
            value={draft.method}
            tip="Method HTTP"
            onChange={(method) => update({ method })}
            options={METHOD_OPTIONS}
            className="font-bold"
          />
        )}
        <VarInput
          value={draft.url}
          onChange={(url) => {
            if (isCurl(url)) {
              post({ type: 'http-curl-parse', requestId: draft.id, text: url });
              return;
            }
            update({ url, params: paramsFromUrl(url, draft.params) });
          }}
          onPaste={(e) => {
            const text = e.clipboardData.getData('text');
            if (!isCurl(text)) return;
            e.preventDefault();
            post({ type: 'http-curl-parse', requestId: draft.id, text });
          }}
          placeholder={
            isWs ? 'wss://{{baseUrl}}/realtime' : 'https://{{baseUrl}}/path — atau tempel perintah cURL'
          }
          mono
          className={`flex-1 ${CELL}`}
        />
        {!isWs && running ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => post({ type: 'http-cancel', requestId: draft.id })}
          >
            <Square size={13} /> Cancel
          </Button>
        ) : (
          <Button variant="primary" size="sm" onClick={send} data-tip="Cmd/Ctrl+Enter">
            <Send size={13} /> {isWs ? 'Connect' : 'Send'}
          </Button>
        )}
      </div>

      {notice && (
        <div
          className={`flex shrink-0 items-center gap-2 px-3 py-1 ${
            notice.level === 'error' ? 'text-[var(--vscode-errorForeground)]' : 'opacity-70'
          }`}
        >
          <span className="min-w-0 flex-1">{notice.message}</span>
          <button className="opacity-60" onClick={() => setNotice(undefined)}>
            tutup
          </button>
        </div>
      )}

      <SplitPane
        direction={split}
        ratio={splitRatio}
        onRatioChange={setDragRatio}
        onRatioCommit={(ratio) => {
          setDragRatio(undefined);
          paneLayout.set({ splitRatio: ratio });
        }}
        first={
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex shrink-0 items-center gap-3 overflow-x-auto border-b border-[var(--vscode-panel-border)] px-3">
          {tabs.map((name) => (
            <button
              key={name}
              onClick={() => setTab(name)}
              className={`whitespace-nowrap py-1 ${
                tab === name ? 'border-b-2 border-[var(--vscode-focusBorder)]' : 'opacity-60'
              }`}
            >
              {TAB_LABEL[name]}
              {name === 'params' && countOf(draft.params) > 0 && ` (${countOf(draft.params)})`}
              {name === 'headers' && countOf(draft.headers) > 0 && ` (${countOf(draft.headers)})`}
              {name === 'auth' && draft.auth.type !== 'none' && draft.auth.type !== 'inherit' && ' •'}
              {name === 'body' && draft.body.mode !== 'none' && ' •'}
              {name === 'pre-request' && draft.scripts?.preRequest?.trim() && ' •'}
              {name === 'tests' && draft.scripts?.postResponse?.trim() && ' •'}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-3">
          {tab === 'params' && (
            <ParamsEditor
              rows={draft.params}
              onChange={(params) => update({ params, url: urlFromParams(draft.url, params) })}
            />
          )}
          {tab === 'headers' && (
            <HeadersEditor rows={draft.headers} onChange={(headers) => update({ headers })} />
          )}
          {tab === 'body' && !isWs && (
            <BodyEditor body={draft.body} onChange={(body) => update({ body })} />
          )}
          {tab === 'auth' && (
            <AuthEditor
              auth={draft.auth}
              onChange={(auth) => update({ auth })}
              onFetchToken={() => {
                const current = save();
                if (!current) return;
                post({
                  type: 'http-oauth-token',
                  collectionId,
                  request: current,
                  ...(environmentId ? { environmentId } : {}),
                });
              }}
            />
          )}
          {tab === 'pre-request' && (
            <ScriptEditor
              phase="pre-request"
              value={draft.scripts?.preRequest ?? ''}
              onChange={(preRequest) =>
                update({ scripts: { ...(draft.scripts ?? {}), preRequest } })
              }
            />
          )}
          {tab === 'tests' && (
            <ScriptEditor
              phase="tests"
              value={draft.scripts?.postResponse ?? ''}
              onChange={(postResponse) =>
                update({ scripts: { ...(draft.scripts ?? {}), postResponse } })
              }
            />
          )}
        </div>
      </div>
        }
        second={
        <div className="flex h-full min-h-0 flex-col">
          {!isWs && (draft?.examples?.length ?? 0) > 0 && (
            <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-[var(--vscode-panel-border)] px-2 py-1">
              <span className="flex items-center gap-1 text-[11px] opacity-60">
                <FileCode2 size={11} /> Contoh
              </span>
              {(draft?.examples ?? []).map((example) => (
                <button
                  key={example.id}
                  className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${
                    exampleView === example.id
                      ? 'border-[var(--vscode-focusBorder)] bg-[var(--vscode-list-activeSelectionBackground)]'
                      : 'border-[var(--vscode-panel-border)] opacity-80 hover:opacity-100'
                  }`}
                  onClick={() => setExampleView(exampleView === example.id ? undefined : example.id)}
                >
                  <span className={`font-mono ${statusColor(example.status)}`}>{example.status}</span>
                  {exampleLabel(example)}
                </button>
              ))}
              <button
                data-tip="Contoh kosong baru"
                className="flex items-center rounded-full border border-dashed border-[var(--vscode-panel-border)] px-1.5 py-0.5 opacity-70 hover:opacity-100"
                onClick={() => {
                  const current = draftRef.current;
                  if (!current) return;
                  const example: RequestExample = {
                    id: exampleId(),
                    name: exampleName(current.name, 200, current.examples ?? []),
                    status: 200,
                    statusText: 'OK',
                    headers: [],
                    body: '',
                    createdAt: Date.now(),
                  };
                  updateExamples([...(current.examples ?? []), example]);
                  setExampleView(example.id);
                }}
              >
                <Plus size={11} />
              </button>
            </div>
          )}
          <div className="min-h-0 flex-1">
          {isWs ? (
            <WsConsole
              {...(socket ? { session: socket } : {})}
              onOpen={send}
              onClose={() => post({ type: 'http-ws-close', requestId: draft.id })}
              onSend={(data) => post({ type: 'http-ws-send', requestId: draft.id, data })}
              onClear={() => post({ type: 'http-ws-clear', requestId: draft.id })}
              autoReconnect={autoReconnect}
              onAutoReconnectChange={setAutoReconnect}
            />
          ) : exampleView && draft?.examples?.some((item) => item.id === exampleView) ? (
            <ExampleEditor
              key={exampleView}
              example={draft.examples.find((item) => item.id === exampleView)!}
              index={draft.examples.findIndex((item) => item.id === exampleView)}
              total={draft.examples.length}
              onChange={(next) =>
                updateExamples((draft.examples ?? []).map((item) => (item.id === next.id ? next : item)))
              }
              onDelete={() => {
                updateExamples((draft.examples ?? []).filter((item) => item.id !== exampleView));
                setExampleView(undefined);
              }}
              onClose={() => setExampleView(undefined)}
            />
          ) : (
            <ResponseView
              {...(response ? { response } : {})}
              {...(error ? { error } : {})}
              skipped={skipped}
              running={running}
              aiBusy={aiBusy}
              onAiStop={() => draft && post({ type: 'http-ai-stop', requestId: draft.id })}
              onAi={(action) => {
                if (!draft) return;
                setAiBusy(true);
                post({
                  type: 'http-ai',
                  collectionId,
                  requestId: draft.id,
                  action,
                  request: draft,
                });
              }}
              reports={reports}
              requestName={draft.name}
              history={history}
              {...(viewing ? { viewing } : {})}
              onOpenHistory={(entryId) =>
                post({ type: 'http-history-open', requestId: draft.id, entryId })
              }
              onDeleteHistory={(entryId) =>
                post({ type: 'http-history-delete', requestId: draft.id, entryId })
              }
              onClearHistory={() => post({ type: 'http-history-clear', requestId: draft.id })}
              onBackToLatest={() => {
                setViewing(undefined);
                setResponse(latest?.response);
                setError(latest?.error);
                setSkipped(latest?.skipped ?? false);
                setReports(latest?.reports ?? []);
              }}
              onSave={(payload) =>
                post({
                  type: 'http-response-save',
                  requestName: draft.name,
                  contentType: payload.contentType,
                  ...(payload.fileName ? { fileName: payload.fileName } : {}),
                  ...(payload.base64 ? { bodyBase64: payload.body } : { body: payload.body }),
                })
              }
              {...(response && !matchedExample ? { onSaveExample: addExampleFromResponse } : {})}
              {...(matchedExample ? { savedExample: { id: matchedExample.id, name: matchedExample.name } } : {})}
              onOpenExample={setExampleView}
            />
          )}
          </div>
        </div>
        }
      />
    </div>
    </VarScopeProvider>
  );
}

function VariablesQuickLook({
  environment,
  collection,
  globals,
  onClose,
}: {
  environment?: Environment;
  collection?: Collection;
  globals: KeyValue[];
  onClose: () => void;
}) {
  const { post } = useBridge();
  const rows: Array<{ scope: string; row: KeyValue }> = [
    ...(environment?.variables ?? []).map((row) => ({ scope: environment?.name ?? 'env', row })),
    ...(collection?.variables ?? []).map((row) => ({ scope: 'collection', row })),
    ...globals.map((row) => ({ scope: 'globals', row })),
  ];

  return (
    <div className="max-h-[40%] shrink-0 overflow-y-auto border-b border-[var(--vscode-panel-border)] bg-[var(--vscode-editorWidget-background)] px-3 py-2">
      <div className="mb-1.5 flex items-center gap-2">
        <span className="font-medium uppercase opacity-60">Variabel aktif</span>
        <button
          className="opacity-70 hover:opacity-100"
          onClick={() =>
            post({
              type: 'http-envs-open',
              ...(environment ? { environmentId: environment.id } : {}),
            })
          }
        >
          Edit di pengaturan environment
        </button>
        <button className="ml-auto opacity-60 hover:opacity-100" onClick={onClose}>
          tutup
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="opacity-60">Belum ada variabel di scope mana pun.</p>
      ) : (
        <table className="w-full table-fixed">
          <tbody>
            {rows.map(({ scope, row }, index) => (
              <tr key={`${scope}:${row.key}:${index}`} className={row.enabled ? '' : 'opacity-40'}>
                <td className="w-24 truncate py-0.5 pr-2 opacity-50">{scope}</td>
                <td className="w-1/3 truncate py-0.5 pr-2 font-mono">{row.key}</td>
                <td className="break-all py-0.5 font-mono">
                  {row.secret ? '••••••••' : row.value}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="mt-2 opacity-50">
        Urutan menang: environment → collection → globals.
      </p>
    </div>
  );
}

function isCurl(text: string): boolean {
  return /^\s*curl\s/.test(text);
}

function countOf(rows: readonly KeyValue[]): number {
  return rows.filter((row) => row.enabled && (row.key.trim() || row.value.trim())).length;
}
