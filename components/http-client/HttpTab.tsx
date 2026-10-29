import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import {
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Copy,
  Download,
  FileCode2,
  Folder,
  FolderOpen,
  FolderPlus,
  Globe,
  Layers,
  Link2,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Settings2,
  SlidersHorizontal,
  Terminal,
  Trash2,
  Upload,
} from 'lucide-react';
import type { Collection, Environment, HttpRequest, RequestFolder } from '@/lib/http-client/core';
import { Button } from '@/components/http-client/shared/motion/button/base';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/http-client/shared/motion/popover';
import { CHEVRON_STYLE, TreeIndent } from '@/components/http-client/shared/TreeIndent';
import { useBridge } from '@/lib/http-client/ui/bridge';
import { SelectField } from './SelectField';
import { HighlightText, RequestLabel } from './HighlightText';
import { effectiveUrl, flattenCollection, folderPath, methodLabel, methodStyle } from './lib';

interface TreePayload {
  collections: Collection[];
  environments: Environment[];
  activeEnvironmentId?: string;
}

const ENV_MIN_HEIGHT = 64;
const ENV_MAX_HEIGHT = 480;

interface MenuItem {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  danger?: boolean;
}

interface NewItem {
  label: string;
  icon: ReactNode;
  action: Record<string, unknown> | 'curl';
}

const NEW_MENU: NewItem[][] = [
  [
    {
      label: 'HTTP request',
      icon: <Globe size={12} />,
      action: { type: 'http-request-new', protocol: 'rest' },
    },
    {
      label: 'WebSocket',
      icon: <span className="text-[9px] font-bold">WS</span>,
      action: { type: 'http-request-new', protocol: 'ws' },
    },
  ],
  [
    { label: 'Collection', icon: <Layers size={12} />, action: { type: 'http-collection-new' } },
    { label: 'Folder', icon: <FolderPlus size={12} />, action: { type: 'http-folder-new' } },
    {
      label: 'Environment',
      icon: <SlidersHorizontal size={12} />,
      action: { type: 'http-env-new' },
    },
  ],
  [
    {
      label: 'Import file (Postman / OpenAPI / cURL)',
      icon: <Upload size={12} />,
      action: { type: 'http-import' },
    },
    {
      label: 'Import URL (OpenAPI / Swagger)…',
      icon: <Link2 size={12} />,
      action: { type: 'http-import-url' },
    },
    { label: 'Import cURL…', icon: <Terminal size={12} />, action: 'curl' },
  ],
  [
    {
      label: 'Backup (export semua collection + environment)',
      icon: <Download size={12} />,
      action: { type: 'http-export', format: 'native' },
    },
  ],
];

function collectExpandableIds(
  folders: readonly RequestFolder[],
  requests: readonly HttpRequest[],
): string[] {
  return [
    ...requests.filter((request) => (request.examples?.length ?? 0) > 0).map((request) => request.id),
    ...folders.flatMap((folder) => [
      folder.id,
      ...collectExpandableIds(folder.folders, folder.requests),
    ]),
  ];
}

export function HttpTab() {
  const { loadViewState, onMessage, post, query, saveViewState } = useBridge();
  const [tree, setTree] = useState<TreePayload>({ collections: [], environments: [] });
  const [filter, setFilter] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(loadViewState<{ httpExpanded?: string[] }>().httpExpanded ?? []),
  );
  const [openCollections, setOpenCollections] = useState<Set<string>>(
    () => new Set(loadViewState<{ httpOpenCollections?: string[] }>().httpOpenCollections ?? []),
  );
  const [envCollapsed, setEnvCollapsed] = useState(
    () => loadViewState<{ httpEnvCollapsed?: boolean }>().httpEnvCollapsed ?? false,
  );
  const [envHeight, setEnvHeight] = useState<number | undefined>(
    () => loadViewState<{ httpEnvHeight?: number }>().httpEnvHeight,
  );
  const envListRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [newOpen, setNewOpen] = useState(false);
  const [curlOpen, setCurlOpen] = useState(false);
  const [curlText, setCurlText] = useState('');
  const [curlTarget, setCurlTarget] = useState('');
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | undefined>();
  const [activeCollectionId, setActiveCollectionId] = useState<string | undefined>();
  const activeRow = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!activeId || !activeCollectionId) return;
    const collection = tree.collections.find((item) => item.id === activeCollectionId);
    if (!collection) return;
    setOpenCollections((prev) => (prev.has(collection.id) ? prev : new Set(prev).add(collection.id)));
    const path = folderPath(collection, activeId);
    if (path.length === 0) return;
    setExpanded((prev) => {
      const missing = path.filter((id) => !prev.has(id));
      if (missing.length === 0) return prev;
      const next = new Set(prev);
      for (const id of missing) next.add(id);
      return next;
    });
  }, [tree, activeId, activeCollectionId]);

  useEffect(() => {
    activeRow.current?.scrollIntoView({ block: 'nearest' });
  }, [activeId, expanded, openCollections, tree]);

  useEffect(() => {
    saveViewState({ httpOpenCollections: [...openCollections], httpExpanded: [...expanded] });
  }, [openCollections, expanded]);

  useEffect(() => {
    saveViewState({ httpEnvCollapsed: envCollapsed, httpEnvHeight: envHeight });
  }, [envCollapsed, envHeight]);

  const refresh = (): void => {
    setLoading(true);
    void query<TreePayload>('httpTree')
      .then((payload) => {
        if (!payload) return;
        setTree(payload);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    refresh();
    return onMessage((msg) => {
      if (msg.type === 'http-open') {
        const payload = msg as unknown as {
          open: Array<{ collectionId: string; requestId: string }>;
          activeRequestId?: string;
        };
        const active = payload.open.find((item) => item.requestId === payload.activeRequestId);
        setOpenIds(new Set(payload.open.map((item) => item.requestId)));
        setActiveId(payload.activeRequestId);
        setActiveCollectionId(active?.collectionId);
        return;
      }
      if (msg.type !== 'http-tree') return;
      setTree(msg as unknown as TreePayload);
    });
  }, []);

  const toggle = (set: Set<string>, id: string, apply: (next: Set<string>) => void): void => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    apply(next);
  };

  const onEnvResizeStart = (event: ReactPointerEvent<HTMLDivElement>): void => {
    event.preventDefault();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const startY = event.clientY;
    const startHeight = envHeight ?? envListRef.current?.getBoundingClientRect().height ?? ENV_MIN_HEIGHT;
    const move = (e: PointerEvent): void => {
      const next = startHeight - (e.clientY - startY);
      setEnvHeight(Math.min(ENV_MAX_HEIGHT, Math.max(ENV_MIN_HEIGHT, next)));
    };
    const up = (): void => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', up);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  };

  const expandAll = (): void => {
    if (tree.collections.length === 0) return;
    setExpanded(
      new Set(
        tree.collections.flatMap((collection) =>
          collectExpandableIds(collection.folders, collection.requests),
        ),
      ),
    );
    setOpenCollections(new Set(tree.collections.map((collection) => collection.id)));
  };

  const collapseAll = (): void => {
    setExpanded(new Set());
    setOpenCollections(new Set());
  };

  const activeEnvironment = useMemo(
    () => tree.environments.find((e) => e.id === tree.activeEnvironmentId),
    [tree],
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-1 px-2 pt-2">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Cari collection / request…"
          className="min-w-0 flex-1 rounded border border-[var(--vscode-panel-border)] bg-[var(--vscode-input-background)] px-2 py-1 text-xs text-[var(--vscode-input-foreground)] outline-none"
        />
        <IconAction title="Expand semua" onClick={expandAll}>
          <ChevronsUpDown size={13} />
        </IconAction>
        <IconAction title="Collapse semua" onClick={collapseAll}>
          <ChevronsDownUp size={13} />
        </IconAction>
        <IconAction title="Muat ulang" onClick={refresh}>
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </IconAction>
        <Popover
          open={newOpen}
          onOpenChange={setNewOpen}
          side="bottom"
          align="end"
          sideOffset={4}
          panelRadius={8}
          gooStrength={0}
        >
          <PopoverTrigger>
            <button
              data-tip="Menu…"
              className="rounded p-0.5 opacity-70 hover:bg-[var(--vscode-toolbar-hoverBackground)] hover:opacity-100"
            >
              <MoreHorizontal size={13} />
            </button>
          </PopoverTrigger>
          <PopoverContent className="flex w-56 flex-col p-1 text-xs">
            {NEW_MENU.map((section, index) => (
              <div
                key={index}
                className={
                  index > 0 ? 'mt-1 border-t border-[var(--vscode-panel-border)] pt-1' : ''
                }
              >
                {section.map((item) => (
                  <button
                    key={item.label}
                    onClick={() => {
                      setNewOpen(false);
                      if (item.action === 'curl') {
                        setCurlOpen(true);
                        return;
                      }
                      post(item.action);
                    }}
                    className="flex w-full items-center gap-2 rounded px-2 py-1 text-left hover:bg-[var(--vscode-list-hoverBackground)]"
                  >
                    <span className="flex w-4 shrink-0 items-center justify-center opacity-80">
                      {item.icon}
                    </span>
                    {item.label}
                  </button>
                ))}
              </div>
            ))}
          </PopoverContent>
        </Popover>
      </div>

      {curlOpen && (
        <div className="mx-2 mt-2 flex shrink-0 flex-col gap-1.5 rounded border border-[var(--vscode-panel-border)] bg-[var(--vscode-editorWidget-background)] p-2 text-xs">
          <div className="flex items-center gap-2">
            <Terminal size={12} className="opacity-70" />
            <span className="font-medium">Import cURL</span>
            <button
              className="ml-auto opacity-60 hover:opacity-100"
              onClick={() => setCurlOpen(false)}
            >
              tutup
            </button>
          </div>
          <textarea
            value={curlText}
            onChange={(e) => setCurlText(e.target.value)}
            rows={5}
            spellCheck={false}
            placeholder={
              "curl --location 'https://api.test/login' \\\n  --header 'Content-Type: application/json' \\\n  --data-raw '{\"email\":\"a@b.c\"}'"
            }
            className="resize-y rounded border border-[var(--vscode-panel-border)] bg-[var(--vscode-input-background)] px-2 py-1 font-mono text-[11px] text-[var(--vscode-input-foreground)] outline-none"
          />
          <div className="flex items-center gap-1.5">
            <SelectField
              value={curlTarget}
              onChange={setCurlTarget}
              tip="Collection tujuan"
              className="min-w-0 flex-1"
              options={[
                { value: '', label: 'Collection baru (nama dari host)' },
                ...tree.collections.map((collection) => ({ value: collection.id, label: collection.name })),
              ]}
            />
            <Button
              variant="primary"
              size="sm"
              disabled={!curlText.trim()}
              onClick={() => {
                post({
                  type: 'http-import-curl',
                  text: curlText,
                  ...(curlTarget ? { collectionId: curlTarget } : {}),
                });
                setCurlText('');
                setCurlOpen(false);
              }}
            >
              Import
            </Button>
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto px-1 py-2">
        {tree.collections.length === 0 && !loading && (
          <div className="px-2 text-xs opacity-60">
            Belum ada collection. Buat satu, atau import file/URL Postman/OpenAPI.
          </div>
        )}

        {tree.collections.map((collection) => {
          const open = openCollections.has(collection.id);
          const nodes = open ? flattenCollection(collection, expanded, filter) : [];
          const owned =
            (collection.auth.type !== 'none' && collection.auth.type !== 'inherit') ||
            Boolean(
              collection.scripts?.preRequest?.trim() || collection.scripts?.postResponse?.trim(),
            );
          return (
            <div key={collection.id} className="mb-1">
              <Row
                depth={0}
                chevron={open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                onChevron={() => toggle(openCollections, collection.id, setOpenCollections)}
                icon={<Layers size={13} className="shrink-0 text-amber-400/90" />}
                label={
                  <span className="font-medium">
                    <HighlightText text={collection.name} highlight={filter} />
                  </span>
                }
                badge={
                  owned ? (
                    <span
                      data-tip="Collection ini punya auth atau script sendiri"
                      className="flex items-center opacity-50"
                    >
                      <Settings2 size={10} />
                    </span>
                  ) : undefined
                }
                onClick={() => toggle(openCollections, collection.id, setOpenCollections)}
                menu={[
                  {
                    label: 'Request baru',
                    icon: <Plus size={12} />,
                    onClick: () =>
                      post({
                        type: 'http-request-new',
                        collectionId: collection.id,
                        protocol: 'rest',
                      }),
                  },
                  {
                    label: 'WebSocket baru',
                    icon: <span className="text-[9px] font-bold">WS</span>,
                    onClick: () =>
                      post({
                        type: 'http-request-new',
                        collectionId: collection.id,
                        protocol: 'ws',
                      }),
                  },
                  {
                    label: 'Folder baru',
                    icon: <FolderPlus size={12} />,
                    onClick: () => post({ type: 'http-folder-new', collectionId: collection.id }),
                  },
                  {
                    label: 'Pengaturan (nama, auth, script, variabel)',
                    icon: <Settings2 size={12} />,
                    onClick: () =>
                      post({ type: 'http-collection-open', collectionId: collection.id }),
                  },
                  {
                    label: 'Export Postman v2.1',
                    icon: <Download size={12} />,
                    onClick: () =>
                      post({ type: 'http-export', collectionId: collection.id, format: 'postman' }),
                  },
                  {
                    label: 'Hapus collection',
                    icon: <Trash2 size={12} />,
                    danger: true,
                    onClick: () =>
                      post({ type: 'http-collection-delete', collectionId: collection.id }),
                  },
                ]}
              />

              {nodes.map((node) =>
                node.kind === 'folder' ? (
                  <Row
                    key={`f:${node.id}`}
                    depth={node.depth}
                    chevron={
                      expanded.has(node.id) ? <ChevronDown size={12} /> : <ChevronRight size={12} />
                    }
                    onChevron={() => toggle(expanded, node.id, setExpanded)}
                    icon={
                      expanded.has(node.id) ? (
                        <FolderOpen size={13} className="shrink-0 text-sky-400/90" />
                      ) : (
                        <Folder size={13} className="shrink-0 text-sky-400/90" />
                      )
                    }
                    label={<HighlightText text={node.name} highlight={filter} />}
                    onClick={() => toggle(expanded, node.id, setExpanded)}
                    menu={[
                      {
                        label: 'Request baru di folder ini',
                        icon: <Plus size={12} />,
                        onClick: () =>
                          post({
                            type: 'http-request-new',
                            collectionId: collection.id,
                            folderId: node.id,
                            protocol: 'rest',
                          }),
                      },
                      {
                        label: 'Sub-folder baru',
                        icon: <FolderPlus size={12} />,
                        onClick: () =>
                          post({
                            type: 'http-folder-new',
                            collectionId: collection.id,
                            parentFolderId: node.id,
                          }),
                      },
                      {
                        label: 'Pengaturan (nama, auth, script)',
                        icon: <Settings2 size={12} />,
                        onClick: () =>
                          post({
                            type: 'http-folder-open',
                            collectionId: collection.id,
                            folderId: node.id,
                          }),
                      },
                      {
                        label: 'Hapus folder',
                        icon: <Trash2 size={12} />,
                        danger: true,
                        onClick: () =>
                          post({
                            type: 'http-folder-delete',
                            collectionId: collection.id,
                            folderId: node.id,
                          }),
                      },
                    ]}
                  />
                ) : node.kind === 'example' ? (
                  <Row
                    key={`e:${node.request!.id}:${node.id}`}
                    depth={node.depth}
                    icon={
                      <span
                        className="w-[26px] shrink-0 text-center text-[9px] font-bold leading-none opacity-60 underline decoration-dotted"
                        data-tip="Contoh respons"
                      >
                        e.g.
                      </span>
                    }
                    label={node.name}
                    title={`${node.example!.status} ${node.example!.statusText}`}
                    onClick={() =>
                      post({
                        type: 'http-open',
                        collectionId: collection.id,
                        requestId: node.request!.id,
                        exampleId: node.id,
                      })
                    }
                    menu={[
                      {
                        label: 'Hapus contoh',
                        icon: <Trash2 size={12} />,
                        danger: true,
                        onClick: () =>
                          post({
                            type: 'http-example-delete',
                            collectionId: collection.id,
                            requestId: node.request!.id,
                            exampleId: node.id,
                          }),
                      },
                    ]}
                  />
                ) : (
                  <Row
                    key={`r:${node.id}`}
                    depth={node.depth}
                    {...((node.request!.examples?.length ?? 0) > 0
                      ? {
                          chevron: expanded.has(node.id) ? (
                            <ChevronDown size={12} />
                          ) : (
                            <ChevronRight size={12} />
                          ),
                          onChevron: () => toggle(expanded, node.id, setExpanded),
                        }
                      : {})}
                    icon={
                      <>
                        <FileCode2 size={13} className="shrink-0 opacity-60" />
                        <span
                          className={`w-9 shrink-0 text-[9px] font-bold ${methodStyle(
                            methodLabel(node.request!),
                          )}`}
                        >
                          {methodLabel(node.request!)}
                        </span>
                      </>
                    }
                    label={<RequestLabel request={node.request!} filter={filter} />}
                    title={effectiveUrl(node.request!) || 'Buka request'}
                    active={activeId === node.id}
                    opened={openIds.has(node.id)}
                    {...(activeId === node.id ? { innerRef: activeRow } : {})}
                    onClick={() =>
                      post({ type: 'http-open', collectionId: collection.id, requestId: node.id })
                    }
                    menu={[
                      {
                        label: 'Duplikat',
                        icon: <Copy size={12} />,
                        onClick: () =>
                          post({
                            type: 'http-request-duplicate',
                            collectionId: collection.id,
                            requestId: node.id,
                          }),
                      },
                      {
                        label: 'Hapus request',
                        icon: <Trash2 size={12} />,
                        danger: true,
                        onClick: () =>
                          post({
                            type: 'http-request-delete',
                            collectionId: collection.id,
                            requestId: node.id,
                          }),
                      },
                    ]}
                  />
                ),
              )}
            </div>
          );
        })}
      </div>

      <div className="flex shrink-0 flex-col border-t border-[var(--vscode-panel-border)] text-xs">
        {!envCollapsed && (
          <div
            onPointerDown={onEnvResizeStart}
            onDoubleClick={() => setEnvHeight(undefined)}
            data-tip="Geser untuk mengubah tinggi · klik dua kali untuk reset"
            className="group relative h-1.5 shrink-0 cursor-row-resize touch-none select-none"
          >
            <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-[var(--vscode-panel-border)] transition-colors group-hover:bg-[var(--vscode-focusBorder)] group-active:bg-[var(--vscode-focusBorder)]" />
          </div>
        )}
        <div className="px-2 py-2">
          <div className={envCollapsed ? '' : 'mb-1 flex items-center justify-between gap-2'}>
            <span className="flex min-w-0 items-center gap-1.5">
              <button
                className="shrink-0 rounded p-0.5 opacity-60 hover:opacity-100"
                data-tip={envCollapsed ? 'Perluas environment' : 'Ciutkan environment'}
                onClick={() => setEnvCollapsed(!envCollapsed)}
              >
                {envCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
              </button>
              <button
                className="flex min-w-0 items-center gap-1.5 font-medium uppercase opacity-60 hover:opacity-100"
                data-tip="Buka pengaturan environment"
                onClick={() => post({ type: 'http-envs-open' })}
              >
                <SlidersHorizontal size={12} /> Environments
              </button>
            </span>
            {!envCollapsed && (
              <IconAction title="Environment baru" onClick={() => post({ type: 'http-env-new' })}>
                <Plus size={12} />
              </IconAction>
            )}
          </div>
          {!envCollapsed && (
            <>
              <div
                ref={envListRef}
                className="mb-2 flex flex-col overflow-y-auto"
                style={{ ...(envHeight !== undefined ? { height: envHeight } : {}), maxHeight: 'calc(100vh - 220px)' }}
              >
                {tree.environments.length === 0 && (
                  <button
                    className="text-left opacity-60 hover:opacity-100"
                    onClick={() => post({ type: 'http-envs-open' })}
                  >
                    Belum ada environment — klik untuk mengatur.
                  </button>
                )}
                {tree.environments.map((environment) => (
                  <div
                    key={environment.id}
                    className="group flex w-max min-w-full items-center gap-1 rounded px-1 py-0.5 hover:bg-[var(--vscode-list-hoverBackground)]"
                  >
                    <button
                      className="shrink-0 rounded p-0.5"
                      data-tip={
                        environment.id === activeEnvironment?.id
                          ? 'Environment default'
                          : 'Jadikan environment default'
                      }
                      onClick={() => post({ type: 'http-env-activate', environmentId: environment.id })}
                    >
                      <span
                        className={`block h-1.5 w-1.5 rounded-full ${
                          environment.id === activeEnvironment?.id
                            ? 'bg-emerald-500'
                            : 'bg-[var(--vscode-panel-border)]'
                        }`}
                      />
                    </button>
                    <button
                      className="flex flex-1 items-center gap-1.5 whitespace-nowrap text-left"
                      data-tip="Buka pengaturan environment"
                      onClick={() => post({ type: 'http-envs-open', environmentId: environment.id })}
                    >
                      <span>{environment.name}</span>
                      <span className="shrink-0 opacity-40">{environment.variables.length}</span>
                    </button>
                    <span className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
                      <IconAction
                        title="Export environment"
                        onClick={() => post({ type: 'http-env-export', environmentId: environment.id })}
                      >
                        <Download size={12} />
                      </IconAction>
                      <IconAction
                        title="Hapus environment"
                        onClick={() => post({ type: 'http-env-delete', environmentId: environment.id })}
                      >
                        <Trash2 size={12} />
                      </IconAction>
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({
  depth,
  chevron,
  onChevron,
  icon,
  label,
  badge,
  title,
  active,
  opened,
  innerRef,
  onClick,
  menu,
}: {
  depth: number;
  chevron?: ReactNode;
  onChevron?: () => void;
  icon: ReactNode;
  label: ReactNode;
  badge?: ReactNode;
  title?: string;
  active?: boolean;
  opened?: boolean;
  innerRef?: React.Ref<HTMLDivElement>;
  onClick: () => void;
  menu: MenuItem[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <div
      ref={innerRef}
      className={`group relative flex w-max min-w-full items-center rounded px-1 py-0.5 text-xs hover:bg-[var(--vscode-list-hoverBackground)] ${
        active ? 'bg-[var(--vscode-list-inactiveSelectionBackground)]' : ''
      } ${open ? 'bg-[var(--vscode-list-hoverBackground)]' : ''}`}
      style={{ paddingLeft: 4 }}
    >
      <TreeIndent depth={depth} />
      {chevron ? (
        <button
          onClick={onChevron}
          data-tip="Buka atau tutup isinya"
          style={CHEVRON_STYLE}
          className="flex shrink-0 items-center justify-center rounded opacity-70 hover:opacity-100"
        >
          {chevron}
        </button>
      ) : (
        <span className="shrink-0" style={CHEVRON_STYLE} />
      )}
      <button
        onClick={onClick}
        data-tip={title}
        className="ml-1 flex flex-1 items-center gap-1.5 whitespace-nowrap text-left"
      >
        {icon}
        <span className={active ? 'font-medium' : ''}>{label}</span>
        {badge}
      </button>
      {opened && (
        <span
          data-tip="Terbuka di tab"
          className="ml-1 size-1.5 shrink-0 rounded-full bg-[var(--vscode-charts-blue,#4fc1ff)]"
        />
      )}
      <span className={`ml-1 shrink-0 items-center ${open ? 'flex' : 'hidden group-hover:flex'}`}>
        <Popover
          open={open}
          onOpenChange={setOpen}
          side="bottom"
          align="end"
          sideOffset={4}
          panelRadius={8}
          gooStrength={0}
        >
          <PopoverTrigger>
            <button
              data-tip="Aksi lainnya"
              className="rounded p-0.5 opacity-70 hover:bg-[var(--vscode-toolbar-hoverBackground)] hover:opacity-100"
            >
              <MoreHorizontal size={13} />
            </button>
          </PopoverTrigger>
          <PopoverContent className="flex w-56 flex-col p-1 text-xs">
            {menu.map((item) => (
              <button
                key={item.label}
                onClick={() => {
                  setOpen(false);
                  item.onClick();
                }}
                className={`flex items-center gap-2 rounded px-2 py-1 text-left hover:bg-[var(--vscode-list-hoverBackground)] ${
                  item.danger ? 'text-[var(--vscode-errorForeground)]' : ''
                }`}
              >
                <span className="flex w-4 shrink-0 items-center justify-center opacity-80">
                  {item.icon}
                </span>
                {item.label}
              </button>
            ))}
          </PopoverContent>
        </Popover>
      </span>
    </div>
  );
}

function IconAction({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      data-tip={title}
      onClick={onClick}
      className="rounded p-0.5 opacity-70 hover:bg-[var(--vscode-toolbar-hoverBackground)] hover:opacity-100"
    >
      {children}
    </button>
  );
}
