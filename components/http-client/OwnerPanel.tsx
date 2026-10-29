import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Folder, Layers, Save } from 'lucide-react';
import type {
  AuthConfig,
  Collection,
  Environment,
  KeyValue,
  RequestFolder,
  RequestScripts,
} from '@/lib/http-client/core';
import { Button } from '@/components/http-client/shared/motion/button/base';
import { useBridge } from '@/lib/http-client/ui/bridge';
import { AuthEditor } from './AuthEditor';
import { KeyValueEditor } from './KeyValueEditor';
import { ScriptEditor } from './ScriptEditor';
import { VarScopeProvider } from './VarInput';
import { CELL } from './lib';

interface PanelViewState extends Record<string, unknown> {
  httpCollectionId?: string;
  httpFolderId?: string;
}

interface OwnerDraft {
  name: string;
  description: string;
  auth: AuthConfig;
  scripts: RequestScripts;
  variables: KeyValue[];
}

type Tab = 'overview' | 'auth' | 'pre-request' | 'tests' | 'variables';

const TAB_LABEL: Record<Tab, string> = {
  overview: 'Overview',
  auth: 'Authorization',
  'pre-request': 'Pre-request Script',
  tests: 'Tests',
  variables: 'Variables',
};

function draftOf(collection: Collection, folder?: RequestFolder): OwnerDraft {
  const owner = folder ?? collection;
  return {
    name: owner.name,
    description: owner.description ?? '',
    auth: owner.auth,
    scripts: {
      preRequest: owner.scripts?.preRequest ?? '',
      postResponse: owner.scripts?.postResponse ?? '',
    },
    variables: folder ? [] : collection.variables,
  };
}

export function OwnerPanel() {
  const { boot, loadViewState, onMessage, post, saveViewState } = useBridge();
  const saved = loadViewState<PanelViewState>();
  const collectionId = boot.collectionId ?? saved.httpCollectionId ?? '';
  const folderId = boot.folderId ?? saved.httpFolderId;

  const [collection, setCollection] = useState<Collection | undefined>();
  const [folder, setFolder] = useState<RequestFolder | undefined>();
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [globals, setGlobals] = useState<KeyValue[]>([]);
  const [activeEnvironmentId, setActiveEnvironmentId] = useState<string | undefined>();
  const [saved0, setSaved0] = useState<OwnerDraft | undefined>();
  const [draft, setDraft] = useState<OwnerDraft | undefined>();
  const [tab, setTab] = useState<Tab>('overview');
  const draftRef = useRef<OwnerDraft | undefined>(undefined);
  draftRef.current = draft;

  const dirty = useMemo(
    () => Boolean(draft && saved0 && JSON.stringify(draft) !== JSON.stringify(saved0)),
    [draft, saved0],
  );

  useEffect(() => {
    saveViewState({ httpCollectionId: collectionId, ...(folderId ? { httpFolderId: folderId } : {}) });
  }, [collectionId, folderId]);

  useEffect(() => {
    const off = onMessage((msg) => {
      if (msg.type !== 'http-owner-state') return;
      const state = msg as unknown as {
        collection: Collection;
        folder?: RequestFolder;
        environments: Environment[];
        globals: KeyValue[];
        activeEnvironmentId?: string;
      };
      setCollection(state.collection);
      setFolder(state.folder);
      setEnvironments(state.environments);
      setGlobals(state.globals);
      setActiveEnvironmentId(state.activeEnvironmentId);
      const next = draftOf(state.collection, state.folder);
      setSaved0(next);
      setDraft((current) => current ?? next);
    });
    post({ type: 'http-owner-panel-ready', collectionId, ...(folderId ? { folderId } : {}) });
    return off;
  }, [collectionId, folderId]);

  const update = (patch: Partial<OwnerDraft>): void =>
    setDraft((current) => (current ? { ...current, ...patch } : current));

  const save = useCallback((): void => {
    const current = draftRef.current;
    if (!current || !current.name.trim()) return;
    const scripts: RequestScripts = {
      ...(current.scripts.preRequest?.trim() ? { preRequest: current.scripts.preRequest } : {}),
      ...(current.scripts.postResponse?.trim()
        ? { postResponse: current.scripts.postResponse }
        : {}),
    };
    const shared = {
      collectionId,
      name: current.name.trim(),
      ...(current.description.trim() ? { description: current.description } : {}),
      auth: current.auth,
      ...(Object.keys(scripts).length ? { scripts } : {}),
    };
    post(
      folderId
        ? { type: 'http-folder-save', folderId, ...shared }
        : { type: 'http-collection-save', variables: current.variables, ...shared },
    );
    setSaved0({ ...current, name: current.name.trim() });
  }, [collectionId, folderId]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key === 's') {
        event.preventDefault();
        save();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [save]);

  const tabs = useMemo<Tab[]>(
    () =>
      folderId
        ? ['overview', 'auth', 'pre-request', 'tests']
        : ['overview', 'auth', 'pre-request', 'tests', 'variables'],
    [folderId],
  );

  if (!draft || !collection) return <div className="p-4 text-xs opacity-60">Memuat…</div>;

  const environment = environments.find((e) => e.id === activeEnvironmentId);
  const scope = { ...(environment ? { environment } : {}), collection, globals };
  const Icon = folderId ? Folder : Layers;

  return (
    <VarScopeProvider value={scope}>
      <div className="flex h-full flex-col text-xs">
        <div className="flex shrink-0 items-center gap-2 px-3 py-1.5">
          <Icon size={14} className="shrink-0 opacity-70" />
          {folder && (
            <>
              <button
                className="truncate opacity-50 hover:opacity-100 hover:underline"
                onClick={() => post({ type: 'http-collection-open', collectionId })}
              >
                {collection.name}
              </button>
              <span className="opacity-30">/</span>
            </>
          )}
          <span className="truncate font-medium">{draft.name || '(tanpa nama)'}</span>
          {dirty && <span className="h-1.5 w-1.5 rounded-full bg-amber-400" data-tip="Belum disimpan" />}
          <div className="ml-auto flex items-center gap-1.5">
            <Button
              variant={dirty ? 'primary' : 'ghost'}
              size="sm"
              onClick={save}
              data-tip="Cmd/Ctrl+S"
            >
              <Save size={13} /> Save
            </Button>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3 border-y border-[var(--vscode-panel-border)] px-3">
          {tabs.map((name) => (
            <button
              key={name}
              onClick={() => setTab(name)}
              className={`whitespace-nowrap py-1.5 ${
                tab === name ? 'border-b-2 border-[var(--vscode-focusBorder)]' : 'opacity-60'
              }`}
            >
              {TAB_LABEL[name]}
              {name === 'auth' && draft.auth.type !== 'none' && draft.auth.type !== 'inherit' && ' •'}
              {name === 'pre-request' && draft.scripts.preRequest?.trim() && ' •'}
              {name === 'tests' && draft.scripts.postResponse?.trim() && ' •'}
              {name === 'variables' && draft.variables.length > 0 && ` (${draft.variables.length})`}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-3">
          {tab === 'overview' && (
            <div className="flex max-w-2xl flex-col gap-3">
              <label className="flex flex-col gap-1">
                <span className="opacity-70">Nama</span>
                <input
                  value={draft.name}
                  onChange={(e) => update({ name: e.target.value })}
                  className={`px-2 py-1 text-xs outline-none ${CELL}`}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="opacity-70">Deskripsi</span>
                <textarea
                  value={draft.description}
                  onChange={(e) => update({ description: e.target.value })}
                  rows={6}
                  placeholder="Catatan untuk tim: tujuan API ini, cara autentikasi, hal yang perlu diperhatikan…"
                  className={`resize-y px-2 py-1 text-xs outline-none ${CELL}`}
                />
              </label>
              <p className="opacity-60">
                {folderId
                  ? 'Auth dan script folder berlaku untuk semua request di dalamnya (setelah collection, sebelum request).'
                  : 'Auth, script, dan variabel collection berlaku untuk semua folder dan request di dalamnya.'}
              </p>
            </div>
          )}

          {tab === 'auth' && (
            <div className="max-w-2xl">
              <AuthEditor
                auth={draft.auth}
                onChange={(auth) => update({ auth })}
                inheritLabel={folderId ? 'Inherit dari collection' : false}
              />
            </div>
          )}

          {tab === 'pre-request' && (
            <div className="h-full min-h-[240px]">
              <ScriptEditor
                phase="pre-request"
                value={draft.scripts.preRequest ?? ''}
                onChange={(preRequest) => update({ scripts: { ...draft.scripts, preRequest } })}
              />
            </div>
          )}

          {tab === 'tests' && (
            <div className="h-full min-h-[240px]">
              <ScriptEditor
                phase="tests"
                value={draft.scripts.postResponse ?? ''}
                onChange={(postResponse) => update({ scripts: { ...draft.scripts, postResponse } })}
              />
            </div>
          )}

          {tab === 'variables' && !folderId && (
            <div className="max-w-3xl">
              <KeyValueEditor
                rows={draft.variables}
                onChange={(variables) => update({ variables })}
                keyPlaceholder="Variabel"
                valuePlaceholder="Nilai"
              />
              <p className="mt-3 opacity-60">
                Variabel collection dipakai lewat <span className="font-mono">{'{{nama}}'}</span>;
                environment aktif menimpanya, globals ditimpa olehnya.
              </p>
            </div>
          )}
        </div>
      </div>
    </VarScopeProvider>
  );
}
