import { randomUUID } from 'node:crypto';
import type { Collection, Environment, KeyValue } from '../model/types';

export type VarScope = Readonly<Record<string, string>>;

const TOKEN = /\{\{\s*([^{}\s]+)\s*\}\}/g;
const MAX_PASSES = 5;

export function buildScope(...sources: ReadonlyArray<readonly KeyValue[] | undefined>): VarScope {
  const scope: Record<string, string> = {};
  for (const source of sources) {
    if (!source) continue;
    for (const item of source) {
      if (!item.enabled || !item.key) continue;
      scope[item.key] = item.value;
    }
  }
  return scope;
}

export function scopeFor(
  collection?: Collection,
  environment?: Environment,
  globals?: readonly KeyValue[],
): VarScope {
  return buildScope(globals, collection?.variables, environment?.variables);
}

export function dynamicValue(name: string): string | undefined {
  switch (name) {
    case '$timestamp':
      return String(Math.floor(Date.now() / 1000));
    case '$isoTimestamp':
      return new Date().toISOString();
    case '$randomInt':
      return String(Math.floor(Math.random() * 1000));
    case '$guid':
    case '$uuid':
    case '$randomUUID':
      return randomUUID();
    default:
      return undefined;
  }
}

export function resolveVars(input: string, scope: VarScope): string {
  let text = input;
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let changed = false;
    text = text.replace(TOKEN, (match, rawName: string) => {
      const name = rawName.trim();
      const dynamic = dynamicValue(name);
      if (dynamic !== undefined) {
        changed = true;
        return dynamic;
      }
      const value = scope[name];
      if (value === undefined) return match;
      changed = true;
      return value;
    });
    if (!changed) break;
  }
  return text;
}

export function missingVars(input: string, scope: VarScope): string[] {
  const out = new Set<string>();
  for (const match of input.matchAll(TOKEN)) {
    const name = (match[1] ?? '').trim();
    if (!name) continue;
    if (dynamicValue(name) !== undefined) continue;
    if (scope[name] === undefined) out.add(name);
  }
  return [...out];
}

export function resolvePairs(pairs: readonly KeyValue[], scope: VarScope): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const pair of pairs) {
    if (!pair.enabled || !pair.key.trim()) continue;
    out.push([resolveVars(pair.key, scope), resolveVars(pair.value, scope)]);
  }
  return out;
}
