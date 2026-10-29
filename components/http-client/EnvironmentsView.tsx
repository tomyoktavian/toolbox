import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  Eye,
  EyeOff,
  Globe,
  Layers,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react';
import type { Environment, KeyValue } from '@/lib/http-client/core';
import { Button } from '@/components/http-client/shared/motion/button/base';
import { useBridge } from '@/lib/http-client/ui/bridge';
import { fromBulkText, toBulkText } from './bulk-edit';
import { duplicateKeys } from './variables';
import { pruneBlank, setPair, withTrailingBlank } from './lib';

const GLOBALS = '__globals__';

interface State {
  environments: Environment[];
  globals: KeyValue[];
  activeEnvironmentId?: string;
}

export function EnvironmentsView() {
  const { onMessage, post } = useBridge();
  const [state, setState] = useState<State>({ environments: [], globals: [] });
  const [selected, setSelected] = useState<string>(GLOBALS);
  const [draftName, setDraftName] = useState('');
  const [filter, setFilter] = useState('');
  const [bulk, setBulk] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [reveal, setReveal] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState('');

  useEffect(() => {
    const off = onMessage((msg) => {
      if (msg.type !== 'http-envs-state') return;
      const next = msg as unknown as State & { selectId?: string };
      setState(next);
      setSelected((current) => {
        const wanted = next.selectId ?? current;
        if (wanted === GLOBALS) return GLOBALS;
        return next.environments.some((e) => e.id === wanted)
          ? wanted
          : (next.environments[0]?.id ?? GLOBALS);
      });
    });
    post({ type: 'http-envs-ready' });
    return off;
  }, []);

  const environment = state.environments.find((item) => item.id === selected);
  const rows: KeyValue[] = selected === GLOBALS ? state.globals : (environment?.variables ?? []);

  useEffect(() => {
    setDraftName(environment?.name ?? '');
    setBulk(false);
    setReveal(new Set());
  }, [environment?.id, environment?.name]);

  const dupes = useMemo(() => duplicateKeys(rows), [rows]);
  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    const list = withTrailingBlank(rows);
    if (!needle) return list.map((row, index) => ({ row, index }));
    return list
      .map((row, index) => ({ row, index }))
      .filter(
        ({ row }) =>
          !row.key ||
          row.key.toLowerCase().includes(needle) ||
          row.value.toLowerCase().includes(needle),
      );
  }, [rows, filter]);

  const commit = (next: KeyValue[]): void => {
    const cleaned = pruneBlank(next);
    if (selected === GLOBALS) {
      setState((current) => ({ ...current, globals: cleaned }));
      post({ type: 'http-globals-save', globals: cleaned });
      return;
    }
    if (!environment) return;
    const updated = { ...environment, variables: cleaned };
    setState((current) => ({
      ...current,
      environments: current.environments.map((item) => (item.id === updated.id ? updated : item)),
    }));
    post({ type: 'http-env-save', environment: updated });
  };

  const renameTo = (name: string): void => {
    if (!environment || !name.trim() || name === environment.name) return;
    post({ type: 'http-env-save', environment: { ...environment, name: name.trim() } });
  };

  const create = (): void => {
    const name = creating.trim();
    if (!name) return;
    post({ type: 'http-env-new', name });
    setCreating('');
  };

  return (
    <div className="flex h-full flex-col text-xs">
      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--vscode-panel-border)] px-4 py-2.5">
        <Layers size={15} />
        <span className="text-sm font-medium">Environments</span>
        <span className="opacity-50">
          Berlaku di semua project yang memakai Silak di mesin ini.
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <Button variant="ghost" size="sm" onClick={() => post({ type: 'http-import' })}>
            <Upload size={13} /> Import
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-60 shrink-0 flex-col border-r border-[var(--vscode-panel-border)]">
          <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
            <SideRow
              icon={<Globe size={13} />}
              label="Globals"
              detail={`${state.globals.length} variabel`}
              active={selected === GLOBALS}
              onClick={() => setSelected(GLOBALS)}
            />
            <div className="mt-2 mb-1 px-1.5 font-medium uppercase opacity-50">Environments</div>
            {state.environments.length === 0 && (
              <div className="px-1.5 opacity-60">Belum ada environment.</div>
            )}
            {state.environments.map((item) => (
              <SideRow
                key={item.id}
                icon={
                  item.id === state.activeEnvironmentId ? (
                    <span data-tip="Environment aktif" className="flex items-center text-emerald-500">
                      <Check size={13} />
                    </span>
                  ) : (
                    <span className="inline-block w-[13px]" />
                  )
                }
                label={item.name}
                detail={`${item.variables.length} variabel`}
                active={selected === item.id}
                onClick={() => setSelected(item.id)}
              />
            ))}
          </div>
          <div className="shrink-0 border-t border-[var(--vscode-panel-border)] p-2">
            <div className="flex items-center gap-1">
              <input
                value={creating}
                onChange={(e) => setCreating(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && create()}
                placeholder="Environment baru…"
                className="min-w-0 flex-1 rounded border border-[var(--vscode-panel-border)] bg-[var(--vscode-input-background)] px-2 py-1 text-xs text-[var(--vscode-input-foreground)] outline-none"
              />
              <Button variant="secondary" size="icon" onClick={create} data-tip="Tambah environment">
                <Plus size={13} />
              </Button>
            </div>
          </div>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col">
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--vscode-panel-border)] px-4 py-2">
            {selected === GLOBALS ? (
              <span className="text-sm font-medium">Globals</span>
            ) : (
              <input
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onBlur={() => renameTo(draftName)}
                onKeyDown={(e) => e.key === 'Enter' && renameTo(draftName)}
                data-tip="Nama environment — klik untuk mengubah"
                className="min-w-0 max-w-[240px] flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-sm font-medium outline-none hover:border-[var(--vscode-panel-border)] focus:border-[var(--vscode-focusBorder)]"
              />
            )}

            {environment &&
              (environment.id === state.activeEnvironmentId ? (
                <span
                  data-tip="Environment aktif — dipakai tab request yang baru dibuka"
                  className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-emerald-500"
                >
                  default
                </span>
              ) : (
                <button
                  className="opacity-60 hover:opacity-100"
                  onClick={() => post({ type: 'http-env-activate', environmentId: environment.id })}
                >
                  Jadikan default
                </button>
              ))}

            <div className="ml-auto flex items-center gap-1.5">
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Cari variabel…"
                className="w-40 rounded border border-[var(--vscode-panel-border)] bg-[var(--vscode-input-background)] px-2 py-1 text-xs text-[var(--vscode-input-foreground)] outline-none"
              />
              <button
                className={`rounded px-1.5 py-1 ${bulk ? 'opacity-100' : 'opacity-60'} hover:opacity-100`}
                data-tip="Bulk edit — satu baris per variabel (key:value)"
                onClick={() => {
                  if (!bulk) setBulkText(toBulkText(rows));
                  else commit(fromBulkText(bulkText, rows));
                  setBulk(!bulk);
                }}
              >
                {bulk ? 'Selesai' : 'Bulk edit'}
              </button>
              {environment && (
                <>
                  <IconBtn
                    title="Duplikat environment"
                    onClick={() =>
                      post({ type: 'http-env-duplicate', environmentId: environment.id })
                    }
                  >
                    <Copy size={13} />
                  </IconBtn>
                  <IconBtn
                    title="Export environment (format Postman)"
                    onClick={() => post({ type: 'http-env-export', environmentId: environment.id })}
                  >
                    <Download size={13} />
                  </IconBtn>
                  <IconBtn
                    title="Hapus environment"
                    onClick={() => post({ type: 'http-env-delete', environmentId: environment.id })}
                  >
                    <Trash2 size={13} />
                  </IconBtn>
                </>
              )}
            </div>
          </div>

          {bulk ? (
            <textarea
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              spellCheck={false}
              placeholder={'baseUrl:https://api.test\n//token:matikan dengan //'}
              className="min-h-0 flex-1 resize-none bg-transparent p-4 font-mono text-xs outline-none"
            />
          ) : (
            <div className="min-h-0 flex-1 overflow-auto px-2 py-1">
              <table className="w-full table-fixed">
                <thead className="sticky top-0 bg-[var(--vscode-editor-background)] text-left opacity-60">
                  <tr>
                    <th className="w-8" />
                    <th className="w-1/4 px-2 py-1 font-medium">Variable</th>
                    <th className="px-2 py-1 font-medium">Value</th>
                    <th className="w-24 px-2 py-1 font-medium">Type</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {visible.map(({ row, index }) => {
                    const masked = row.secret && !reveal.has(row.key);
                    return (
                      <tr key={index} className="group align-middle">
                        <td className="px-2">
                          <input
                            type="checkbox"
                            checked={row.enabled}
                            data-tip="Aktifkan variabel"
                            onChange={(e) =>
                              commit(
                                setPair(withTrailingBlank(rows), index, {
                                  enabled: e.target.checked,
                                }),
                              )
                            }
                          />
                        </td>
                        <td className="px-1 py-0.5">
                          <Cell
                            value={row.key}
                            placeholder="nama"
                            {...(row.enabled && dupes.has(row.key)
                              ? { warn: 'Nama ganda — hanya baris terakhir yang berlaku' }
                              : {})}
                            onChange={(key) =>
                              commit(setPair(withTrailingBlank(rows), index, { key }))
                            }
                          />
                        </td>
                        <td className="px-1 py-0.5">
                          <Cell
                            value={row.value}
                            placeholder="nilai"
                            masked={masked}
                            onChange={(value) =>
                              commit(setPair(withTrailingBlank(rows), index, { value }))
                            }
                          />
                        </td>
                        <td className="px-1 py-0.5">
                          <select
                            value={row.secret ? 'secret' : 'default'}
                            onChange={(e) =>
                              commit(
                                setPair(withTrailingBlank(rows), index, {
                                  secret: e.target.value === 'secret',
                                }),
                              )
                            }
                            className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-xs outline-none hover:border-[var(--vscode-panel-border)]"
                          >
                            <option value="default">default</option>
                            <option value="secret">secret</option>
                          </select>
                        </td>
                        <td className="px-1">
                          <span className="flex items-center gap-0.5">
                            {row.secret && (
                              <IconBtn
                                title={masked ? 'Tampilkan nilai' : 'Sembunyikan nilai'}
                                onClick={() =>
                                  setReveal((current) => {
                                    const next = new Set(current);
                                    if (next.has(row.key)) next.delete(row.key);
                                    else next.add(row.key);
                                    return next;
                                  })
                                }
                              >
                                {masked ? <Eye size={12} /> : <EyeOff size={12} />}
                              </IconBtn>
                            )}
                            {(row.key || row.value) && (
                              <IconBtn
                                title="Hapus variabel"
                                onClick={() =>
                                  commit(withTrailingBlank(rows).filter((_, i) => i !== index))
                                }
                              >
                                <Trash2 size={12} />
                              </IconBtn>
                            )}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="shrink-0 border-t border-[var(--vscode-panel-border)] px-4 py-2 opacity-50">
            Perubahan tersimpan otomatis. Urutan menang saat request dikirim: environment →
            collection → globals. Script bisa menulisnya lewat <code>pm.environment.set()</code> /{' '}
            <code>pm.globals.set()</code>.
          </div>
        </section>
      </div>
    </div>
  );
}

function SideRow({
  icon,
  label,
  detail,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  detail: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded px-1.5 py-1.5 text-left ${
        active
          ? 'bg-[var(--vscode-list-activeSelectionBackground)] text-[var(--vscode-list-activeSelectionForeground)]'
          : 'hover:bg-[var(--vscode-list-hoverBackground)]'
      }`}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="shrink-0 opacity-50">{detail}</span>
    </button>
  );
}

function Cell({
  value,
  placeholder,
  masked,
  warn,
  onChange,
}: {
  value: string;
  placeholder: string;
  masked?: boolean;
  warn?: string;
  onChange: (next: string) => void;
}) {
  return (
    <input
      type={masked ? 'password' : 'text'}
      value={value}
      placeholder={placeholder}
      data-tip={warn}
      spellCheck={false}
      onChange={(e) => onChange(e.target.value)}
      className={`w-full rounded border bg-transparent px-1.5 py-1 font-mono text-xs outline-none hover:border-[var(--vscode-panel-border)] focus:border-[var(--vscode-focusBorder)] ${
        warn ? 'border-amber-500/70 text-amber-400' : 'border-transparent'
      }`}
    />
  );
}

function IconBtn({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      data-tip={title}
      onClick={onClick}
      className="rounded p-1 opacity-60 hover:bg-[var(--vscode-toolbar-hoverBackground)] hover:opacity-100"
    >
      {children}
    </button>
  );
}
