import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type InputHTMLAttributes,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { Check, Pencil, X } from 'lucide-react';
import type { KeyValue } from '@/lib/http-client/core';
import { useBridge } from '@/lib/http-client/ui/bridge';
import {
  applyCompletion,
  completionQuery,
  completionsFor,
  lookupVar,
  rowsOf,
  tokenize,
  type Completion,
  type CompletionQuery,
  type VarLayer,
  type VarLookup,
  type VarOrigin,
  type VarScopeData,
} from './variables';
import { CELL } from './lib';

const VarScopeContext = createContext<VarScopeData | undefined>(undefined);
export const VarScopeProvider = VarScopeContext.Provider;

const ORIGIN_STYLE: Record<VarOrigin, string> = {
  environment: 'text-orange-400',
  collection: 'text-orange-400',
  globals: 'text-orange-400',
  dynamic: 'text-sky-400',
  missing: 'text-red-400 underline decoration-wavy decoration-red-400/70',
};

const ORIGIN_LABEL: Record<VarOrigin, string> = {
  environment: 'Environment',
  collection: 'Collection',
  globals: 'Globals',
  dynamic: 'Variabel dinamis',
  missing: 'Tidak ditemukan',
};

const CLOSE_DELAY_MS = 150;
const MENU_MAX = 40;

interface Hover {
  name: string;
  rect: DOMRect;
}

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'className'> & {
  value: string;
  onChange: (next: string) => void;
  className?: string;
  mono?: boolean;
};

export function VarInput({ value, onChange, className = '', mono, ...rest }: Props) {
  const scope = useContext(VarScopeContext);
  const inputRef = useRef<HTMLInputElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const caretAfterApply = useRef<number | undefined>(undefined);
  const { hover, show, scheduleClose, pinned, card } = useVarHover(scope);
  const [target, setTarget] = useState<CompletionQuery | undefined>();
  const [active, setActive] = useState(0);

  const options: Completion[] = scope && target ? completionsFor(scope, target.query).slice(0, MENU_MAX) : [];

  const activeIndex = options.length > 0 ? Math.min(active, options.length - 1) : 0;

  const closeMenu = useCallback((): void => setTarget(undefined), []);

  const syncMenu = useCallback((): void => {
    const input = inputRef.current;
    if (!scope || !input) return;
    const caret = input.selectionStart;
    if (caret === null || caret !== input.selectionEnd) {
      setTarget(undefined);
      return;
    }
    const next = completionQuery(input.value, caret);
    setTarget((current) =>
      current && next && current.start === next.start && current.query === next.query ? current : next,
    );
    setActive(0);
  }, [scope]);

  const choose = useCallback(
    (completion: Completion): void => {
      if (!target) return;
      const applied = applyCompletion(value, target, completion.name);
      caretAfterApply.current = applied.caret;
      setTarget(undefined);
      onChange(applied.value);
    },
    [onChange, target, value],
  );

  useLayoutEffect(() => {
    if (mirrorRef.current && inputRef.current) {
      mirrorRef.current.scrollLeft = inputRef.current.scrollLeft;
    }
    const caret = caretAfterApply.current;
    if (caret !== undefined && inputRef.current) {
      caretAfterApply.current = undefined;
      inputRef.current.focus();
      inputRef.current.setSelectionRange(caret, caret);
    }
  }, [value]);

  const onMove = (event: ReactMouseEvent<HTMLInputElement>): void => {
    if (!scope || !mirrorRef.current || pinned.current || target) return;
    const spans = mirrorRef.current.querySelectorAll<HTMLElement>('[data-var]');
    for (const span of spans) {
      const rect = span.getBoundingClientRect();
      if (
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom
      ) {
        show(span.dataset['var'] ?? '', rect);
        return;
      }
    }
    if (hover) scheduleClose();
  };

  const segments = tokenize(value);
  const font = mono ? 'font-mono' : '';

  return (
    <span className={`relative inline-flex min-w-0 items-stretch overflow-hidden ${className}`}>
      <div
        ref={mirrorRef}
        aria-hidden
        className={`pointer-events-none absolute inset-0 overflow-hidden whitespace-pre px-2 py-1 text-xs leading-normal ${font}`}
      >
        {segments.map((segment, index) =>
          segment.kind === 'text' ? (
            <span key={index}>{segment.text}</span>
          ) : (
            <span
              key={index}
              data-var={segment.name}
              className={`rounded-sm ${
                scope ? styleOf(lookupVar(segment.name, scope)) : 'text-orange-400'
              }`}
            >
              {segment.text}
            </span>
          ),
        )}
      </div>
      <input
        ref={inputRef}
        {...rest}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          window.setTimeout(syncMenu, 0);
        }}
        onKeyDown={(e) => {
          if (options.length > 0) {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive(((activeIndex + 1) % options.length + options.length) % options.length);
              return;
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((activeIndex - 1 + options.length) % options.length);
              return;
            }
            if (e.key === 'Enter' || e.key === 'Tab') {
              const picked = options[activeIndex];
              if (picked) {
                e.preventDefault();
                choose(picked);
                return;
              }
            }
            if (e.key === 'Escape') {
              e.preventDefault();
              closeMenu();
              return;
            }
          }
          rest.onKeyDown?.(e);
        }}
        onKeyUp={syncMenu}
        onSelect={syncMenu}
        onFocus={(e) => {
          syncMenu();
          rest.onFocus?.(e);
        }}
        onBlur={(e) => {
          closeMenu();
          rest.onBlur?.(e);
        }}
        onScroll={(e) => {
          if (mirrorRef.current) mirrorRef.current.scrollLeft = e.currentTarget.scrollLeft;
        }}
        onMouseMove={onMove}
        onMouseLeave={scheduleClose}
        spellCheck={false}
        autoComplete="off"
        className={`relative min-w-0 flex-1 bg-transparent px-2 py-1 text-xs leading-normal text-transparent caret-[var(--vscode-input-foreground)] outline-none placeholder:text-[var(--vscode-input-placeholderForeground)] ${font}`}
      />
      {options.length > 0 && inputRef.current && (
        <CompletionMenu
          anchor={inputRef.current.getBoundingClientRect()}
          options={options}
          active={activeIndex}
          onHover={setActive}
          onPick={choose}
        />
      )}
      {card}
    </span>
  );
}

/**
 * Hover state for the variable card, shared by VarInput and the CodeMirror body editors: a short
 * close delay lets the pointer travel onto the card, and pinning (while editing) keeps it open.
 */
export function useVarHover(scope: VarScopeData | undefined) {
  const closeTimer = useRef<number | undefined>(undefined);
  const pinned = useRef(false);
  const [hover, setHover] = useState<Hover | undefined>();

  const cancelClose = useCallback((): void => {
    if (closeTimer.current !== undefined) window.clearTimeout(closeTimer.current);
    closeTimer.current = undefined;
  }, []);
  const scheduleClose = useCallback((): void => {
    if (pinned.current) return;
    cancelClose();
    closeTimer.current = window.setTimeout(() => setHover(undefined), CLOSE_DELAY_MS);
  }, [cancelClose]);
  const pin = useCallback(
    (on: boolean): void => {
      pinned.current = on;
      if (on) cancelClose();
    },
    [cancelClose],
  );
  const close = useCallback((): void => {
    pinned.current = false;
    cancelClose();
    setHover(undefined);
  }, [cancelClose]);
  const show = useCallback(
    (name: string, rect: DOMRect): void => {
      if (pinned.current) return;
      cancelClose();
      setHover((current) => (current?.name === name ? current : { name, rect }));
    },
    [cancelClose],
  );

  const card =
    hover && scope ? (
      <HoverCard
        name={hover.name}
        rect={hover.rect}
        scope={scope}
        onEnter={cancelClose}
        onLeave={scheduleClose}
        onPin={pin}
        onClose={close}
      />
    ) : null;

  return { hover, show, scheduleClose, pinned, card };
}

export function useVarScope(): VarScopeData | undefined {
  return useContext(VarScopeContext);
}

function CompletionMenu({
  anchor,
  options,
  active,
  onHover,
  onPick,
}: {
  anchor: DOMRect;
  options: Completion[];
  active: number;
  onHover: (index: number) => void;
  onPick: (completion: Completion) => void;
}) {
  const width = Math.max(260, Math.min(anchor.width, 460));
  const left = Math.max(8, Math.min(anchor.left, window.innerWidth - width - 8));
  const below = window.innerHeight - anchor.bottom > 220;
  return createPortal(
    <div
      style={{
        position: 'fixed',
        left,
        width,
        ...(below ? { top: anchor.bottom + 2 } : { bottom: window.innerHeight - anchor.top + 2 }),
        zIndex: 60,
      }}
      className="max-h-52 overflow-y-auto rounded-md border border-[var(--vscode-editorWidget-border,var(--vscode-panel-border))] bg-[var(--vscode-editorWidget-background)] py-1 text-xs shadow-lg"
    >
      {options.map((option, index) => (
        <button
          key={`${option.origin}:${option.name}`}
          onMouseDown={(e) => e.preventDefault()}
          onMouseEnter={() => onHover(index)}
          onClick={() => onPick(option)}
          className={`flex w-full items-center gap-2 px-2 py-1 text-left ${
            index === active ? 'bg-[var(--vscode-list-activeSelectionBackground)]' : ''
          }`}
        >
          <span
            className={`min-w-0 shrink-0 font-mono ${ORIGIN_STYLE[option.origin].split(' ')[0]} ${
              option.disabled ? 'line-through opacity-60' : ''
            }`}
          >
            {option.name}
          </span>
          <span className="min-w-0 flex-1 truncate opacity-60">
            {option.origin === 'dynamic'
              ? 'dibuat saat dikirim'
              : option.disabled
                ? 'semua barisnya nonaktif'
                : option.secret
                  ? '••••••••'
                  : (option.value ?? '')}
          </span>
          <span className="shrink-0 opacity-40">{option.scopeLabel}</span>
        </button>
      ))}
    </div>,
    document.body,
  );
}

function saveRows(
  post: (msg: unknown) => void,
  scope: VarScopeData,
  layer: VarLayer,
  rows: KeyValue[],
): void {
  if (layer === 'environment' && scope.environment) {
    post({ type: 'http-env-save', environment: { ...scope.environment, variables: rows } });
  } else if (layer === 'collection' && scope.collection) {
    const { collection } = scope;
    post({
      type: 'http-collection-save',
      collectionId: collection.id,
      name: collection.name,
      ...(collection.description ? { description: collection.description } : {}),
      variables: rows,
      auth: collection.auth,
      ...(collection.scripts ? { scripts: collection.scripts } : {}),
    });
  } else {
    post({ type: 'http-globals-save', globals: rows });
  }
}

const DORMANT_STYLE = 'text-zinc-400 line-through';

export function styleOf(lookup: VarLookup): string {
  return lookup.origin === 'missing' && lookup.definitions.length > 0
    ? DORMANT_STYLE
    : ORIGIN_STYLE[lookup.origin];
}

function HoverCard({
  name,
  rect,
  scope,
  onEnter,
  onLeave,
  onPin,
  onClose,
}: {
  name: string;
  rect: DOMRect;
  scope: VarScopeData;
  onEnter: () => void;
  onLeave: () => void;
  onPin: (on: boolean) => void;
  onClose: () => void;
}) {
  const { post } = useBridge();
  const lookup = lookupVar(name, scope);
  const layer = lookup.layer;
  const rows = layer ? rowsOf(scope, layer) : [];
  const dormant = lookup.origin === 'missing' && lookup.definitions.length > 0;
  const absent = lookup.origin === 'missing' && lookup.definitions.length === 0;
  const enabledDefinitions = lookup.definitions.filter((d) => d.enabled);
  const winnerIndex = enabledDefinitions[enabledDefinitions.length - 1]?.index;
  const [editing, setEditing] = useState<number | 'new' | undefined>(absent ? 'new' : undefined);
  const [draft, setDraft] = useState('');
  const editRef = useRef<HTMLInputElement>(null);
  const inside = useRef(false);

  useEffect(() => {
    if (editing !== undefined && editing !== 'new') editRef.current?.focus();
  }, [editing]);

  const addLayer: VarLayer = scope.environment ? 'environment' : 'globals';
  const addTarget = scope.environment ? scope.environment.name : 'globals';

  const commit = (): void => {
    if (editing === 'new') {
      if (draft.trim()) {
        saveRows(post, scope, addLayer, [...rowsOf(scope, addLayer), { key: name, value: draft, enabled: true }]);
      }
      onClose();
      return;
    }
    if (editing !== undefined && layer) {
      const current = rows[editing];
      if (current && current.value !== draft) {
        saveRows(post,
          scope,
          layer,
          rows.map((row, index) => (index === editing ? { ...row, value: draft } : row)),
        );
      }
    }
    onPin(false);
    setEditing(undefined);
  };
  const cancel = (): void => {
    onPin(false);
    if (editing === 'new') {
      onClose();
      return;
    }
    setEditing(undefined);
  };
  const toggle = (index: number): void => {
    if (!layer) return;
    saveRows(post,
      scope,
      layer,
      rows.map((row, i) => (i === index ? { ...row, enabled: !row.enabled } : row)),
    );
  };

  const top = rect.bottom + 6;
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - 300));

  const editorFor = (index: number | 'new', secret: boolean | undefined) => (
    <>
      <input
        ref={editRef}
        type={secret ? 'password' : 'text'}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') cancel();
        }}
        onFocus={() => onPin(true)}
        onBlur={() => {
          onPin(false);
          if (!inside.current) onLeave();
        }}
        placeholder={index === 'new' ? `nilai untuk ${addTarget}` : 'nilai variabel'}
        spellCheck={false}
        className={`min-w-0 flex-1 px-1.5 py-0.5 font-mono text-xs outline-none ${CELL}`}
      />
      <button
        data-tip="Simpan (Enter)"
        onMouseDown={(e) => e.preventDefault()}
        onClick={commit}
        className="rounded p-0.5 opacity-70 hover:opacity-100"
      >
        <Check size={12} />
      </button>
      <button
        data-tip="Batal (Esc)"
        onMouseDown={(e) => e.preventDefault()}
        onClick={cancel}
        className="rounded p-0.5 opacity-70 hover:opacity-100"
      >
        <X size={12} />
      </button>
    </>
  );

  return createPortal(
    <div
      onMouseEnter={() => {
        inside.current = true;
        onEnter();
      }}
      onMouseLeave={() => {
        inside.current = false;
        onLeave();
      }}
      style={{ position: 'fixed', top, left, zIndex: 50 }}
      className="w-80 rounded-md border border-[var(--vscode-editorWidget-border,var(--vscode-panel-border))] bg-[var(--vscode-editorWidget-background)] p-2.5 text-xs text-[var(--vscode-editorWidget-foreground,var(--vscode-foreground))] shadow-lg"
    >
      <div className="mb-1.5 flex items-center gap-2">
        <span className={`font-mono font-medium ${styleOf(lookup).split(' ')[0]}`}>
          {`{{${name}}}`}
        </span>
        <span className="ml-auto rounded bg-[var(--vscode-badge-background)] px-1.5 py-0.5 text-[10px] text-[var(--vscode-badge-foreground)]">
          {dormant ? 'Nonaktif' : ORIGIN_LABEL[lookup.origin]}
        </span>
      </div>

      {lookup.origin === 'dynamic' && (
        <p className="opacity-70">Nilai dibuat baru setiap kali request dikirim.</p>
      )}

      {absent && (
        <>
          <p className="mb-1.5 opacity-70">
            Belum ada di environment aktif, collection, maupun globals. Isi nilainya untuk
            menambahkannya ke <span className="font-medium">{addTarget}</span>:
          </p>
          <div className="flex items-center gap-2 py-0.5">{editorFor('new', false)}</div>
        </>
      )}

      {lookup.definitions.length > 0 && (
        <>
          <Row label="Scope" value={lookup.scopeLabel} />
          {lookup.shadowed.length > 0 && (
            <Row label="Menimpa" value={lookup.shadowed.join(', ')} />
          )}
          {dormant && (
            <p className="mb-1 text-amber-400">
              Semua barisnya nonaktif — centang salah satu supaya dipakai.
            </p>
          )}
          {lookup.definitions.length > 1 && !dormant && (
            <p className="mb-1 text-amber-400">
              Didefinisikan {lookup.definitions.length}× di {lookup.scopeLabel}; baris aktif
              terakhir yang berlaku.
            </p>
          )}
          <div className="flex flex-col gap-0.5">
            {lookup.definitions.map((definition) => (
              <div
                key={definition.index}
                className={`flex items-center gap-2 rounded px-1 py-0.5 ${
                  definition.index === winnerIndex && lookup.definitions.length > 1
                    ? 'bg-[var(--vscode-list-hoverBackground)]'
                    : ''
                } ${definition.enabled ? '' : 'opacity-60'}`}
              >
                <input
                  type="checkbox"
                  checked={definition.enabled}
                  data-tip={definition.enabled ? 'Nonaktifkan baris ini' : 'Aktifkan baris ini'}
                  onChange={() => toggle(definition.index)}
                  className="shrink-0"
                />
                {editing === definition.index ? (
                  editorFor(definition.index, definition.secret)
                ) : (
                  <>
                    <span
                      className={`min-w-0 flex-1 break-all font-mono ${
                        definition.enabled ? '' : 'line-through'
                      }`}
                    >
                      {definition.secret ? '••••••••' : definition.value || '—'}
                    </span>
                    {definition.index === winnerIndex && lookup.definitions.length > 1 && (
                      <span className="shrink-0 text-[10px] uppercase opacity-60">berlaku</span>
                    )}
                    <button
                      data-tip="Ubah nilai"
                      onClick={() => {
                        setDraft(definition.value);
                        setEditing(definition.index);
                      }}
                      className="shrink-0 rounded p-0.5 opacity-70 hover:opacity-100"
                    >
                      <Pencil size={12} />
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {lookup.origin !== 'dynamic' && editing === undefined && (
        <button
          className="mt-2 text-[var(--vscode-textLink-foreground)] hover:underline"
          onClick={() =>
            post(
              layer === 'collection' && scope.collection
                ? { type: 'http-collection-open', collectionId: scope.collection.id }
                : {
                    type: 'http-envs-open',
                    ...(layer === 'environment' && scope.environment
                      ? { environmentId: scope.environment.id }
                      : {}),
                  },
            )
          }
        >
          {layer === 'collection' ? 'Buka pengaturan collection' : 'Buka pengaturan variabel'}
        </button>
      )}
    </div>,
    document.body,
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2 py-0.5">
      <span className="w-14 shrink-0 opacity-60">{label}</span>
      <span className="min-w-0 flex-1 break-all">{value || '—'}</span>
    </div>
  );
}
