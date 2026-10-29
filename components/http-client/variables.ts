import type { Collection, Environment, KeyValue } from '@/lib/http-client/core';

const TOKEN = /\{\{\s*([^{}\s]+)\s*\}\}/g;

export const DYNAMIC_VARS = [
  '$guid',
  '$isoTimestamp',
  '$randomInt',
  '$randomUUID',
  '$timestamp',
  '$uuid',
] as const;

const DYNAMIC_SET = new Set<string>(DYNAMIC_VARS);

export interface VarScopeData {
  environment?: Environment;
  collection?: Collection;
  globals: readonly KeyValue[];
}

export type VarOrigin = 'environment' | 'collection' | 'globals' | 'dynamic' | 'missing';

export type VarLayer = 'environment' | 'collection' | 'globals';

export interface VarDefinition {
  index: number;
  value: string;
  enabled: boolean;
  secret?: boolean;
}

export interface VarLookup {
  name: string;
  origin: VarOrigin;
  layer?: VarLayer;
  scopeLabel: string;
  value?: string;
  secret?: boolean;
  shadowed: string[];
  definitions: VarDefinition[];
}

export type Segment = { kind: 'text'; text: string } | { kind: 'var'; text: string; name: string };

export function tokenize(text: string): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  for (const match of text.matchAll(TOKEN)) {
    const start = match.index;
    if (start > last) out.push({ kind: 'text', text: text.slice(last, start) });
    out.push({ kind: 'var', text: match[0], name: (match[1] ?? '').trim() });
    last = start + match[0].length;
  }
  if (last < text.length) out.push({ kind: 'text', text: text.slice(last) });
  return out;
}

export function lookupVar(name: string, scope: VarScopeData): VarLookup {
  if (DYNAMIC_SET.has(name)) {
    return { name, origin: 'dynamic', scopeLabel: 'dinamis', shadowed: [], definitions: [] };
  }
  const layers: Array<{ layer: VarLayer; label: string; rows: readonly KeyValue[] }> = [
    { layer: 'environment', label: scope.environment?.name ?? 'environment', rows: rowsOf(scope, 'environment') },
    { layer: 'collection', label: 'collection', rows: rowsOf(scope, 'collection') },
    { layer: 'globals', label: 'globals', rows: rowsOf(scope, 'globals') },
  ];
  const found = layers.map((entry) => ({
    ...entry,
    definitions: entry.rows.flatMap((row, index) =>
      row.key === name
        ? [{ index, value: row.value, enabled: row.enabled, ...(row.secret ? { secret: true } : {}) }]
        : [],
    ),
  }));
  const winners = found.filter((entry) => entry.definitions.some((d) => d.enabled));
  const first = winners[0];
  if (first) {
    const enabled = first.definitions.filter((d) => d.enabled);
    const row = enabled[enabled.length - 1]!;
    return {
      name,
      origin: first.layer,
      layer: first.layer,
      scopeLabel: first.label,
      value: row.value,
      ...(row.secret ? { secret: true } : {}),
      shadowed: winners.slice(1).map((entry) => entry.label),
      definitions: first.definitions,
    };
  }
  const dormant = found.find((entry) => entry.definitions.length > 0);
  if (dormant) {
    return {
      name,
      origin: 'missing',
      layer: dormant.layer,
      scopeLabel: dormant.label,
      shadowed: [],
      definitions: dormant.definitions,
    };
  }
  return { name, origin: 'missing', scopeLabel: 'tidak ditemukan', shadowed: [], definitions: [] };
}

export function rowsOf(scope: VarScopeData, layer: VarLayer): readonly KeyValue[] {
  if (layer === 'environment') return scope.environment?.variables ?? [];
  if (layer === 'collection') return scope.collection?.variables ?? [];
  return scope.globals;
}

export function duplicateKeys(rows: readonly KeyValue[]): Set<string> {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const row of rows) {
    if (!row.enabled || !row.key.trim()) continue;
    if (seen.has(row.key)) dupes.add(row.key);
    seen.add(row.key);
  }
  return dupes;
}

export function previewResolved(text: string, scope: VarScopeData): string {
  return tokenize(text)
    .map((segment) => {
      if (segment.kind === 'text') return segment.text;
      const hit = lookupVar(segment.name, scope);
      if (hit.origin === 'missing' || hit.origin === 'dynamic') return segment.text;
      return hit.secret ? '••••••' : (hit.value ?? '');
    })
    .join('');
}

export interface CompletionQuery {
  start: number;
  end: number;
  query: string;
}

export function completionQuery(value: string, caret: number): CompletionQuery | undefined {
  const before = value.slice(0, caret);
  const open = before.lastIndexOf('{{');
  if (open === -1) return undefined;
  const inner = before.slice(open + 2);
  if (/[{}]/.test(inner)) return undefined;
  const closing = /^[^{}]*\}\}/.exec(value.slice(caret));
  return { start: open, end: caret + (closing?.[0].length ?? 0), query: inner.trim() };
}

export function applyCompletion(
  value: string,
  target: CompletionQuery,
  name: string,
): { value: string; caret: number } {
  const inserted = `{{${name}}}`;
  return {
    value: value.slice(0, target.start) + inserted + value.slice(target.end),
    caret: target.start + inserted.length,
  };
}

export interface Completion {
  name: string;
  origin: VarOrigin;
  scopeLabel: string;
  value?: string;
  secret?: boolean;
  disabled?: boolean;
}

const ORIGIN_ORDER: Record<VarOrigin, number> = {
  environment: 0,
  collection: 1,
  globals: 2,
  dynamic: 3,
  missing: 4,
};

export function completionsFor(scope: VarScopeData, query: string): Completion[] {
  const needle = query.trim().toLowerCase();
  const names = new Set<string>();
  for (const layer of ['environment', 'collection', 'globals'] as VarLayer[]) {
    for (const row of rowsOf(scope, layer)) if (row.key.trim()) names.add(row.key);
  }

  const items: Completion[] = [...names].map((name) => {
    const hit = lookupVar(name, scope);
    const layer = hit.layer ?? 'globals';
    return {
      name,
      origin: hit.origin === 'missing' ? layer : hit.origin,
      scopeLabel: hit.scopeLabel,
      ...(hit.value !== undefined ? { value: hit.value } : {}),
      ...(hit.secret ? { secret: true } : {}),
      ...(hit.origin === 'missing' ? { disabled: true } : {}),
    };
  });
  for (const name of DYNAMIC_VARS) {
    items.push({ name, origin: 'dynamic', scopeLabel: 'dinamis' });
  }

  return items
    .filter((item) => !needle || item.name.toLowerCase().includes(needle))
    .sort((a, b) => {
      const aPrefix = a.name.toLowerCase().startsWith(needle) ? 0 : 1;
      const bPrefix = b.name.toLowerCase().startsWith(needle) ? 0 : 1;
      if (aPrefix !== bPrefix) return aPrefix - bPrefix;
      const order = ORIGIN_ORDER[a.origin] - ORIGIN_ORDER[b.origin];
      return order !== 0 ? order : a.name.localeCompare(b.name);
    });
}
