import type { KeyValue } from '@/lib/http-client/core';

export function splitUrl(url: string): { base: string; query: string } {
  const index = url.indexOf('?');
  return index === -1
    ? { base: url, query: '' }
    : { base: url.slice(0, index), query: url.slice(index + 1) };
}

export function paramsFromUrl(url: string, previous: readonly KeyValue[]): KeyValue[] {
  const { query } = splitUrl(url);
  const disabled = previous.filter((param) => !param.enabled);
  const parsed = query
    .split('&')
    .filter((pair) => pair !== '')
    .map((pair) => {
      const eq = pair.indexOf('=');
      const key = eq === -1 ? pair : pair.slice(0, eq);
      const value = eq === -1 ? '' : pair.slice(eq + 1);
      return { key: decodeSafe(key), value: decodeSafe(value), enabled: true };
    });
  return [...withDescriptions(parsed, previous.filter((param) => param.enabled)), ...disabled];
}

/**
 * The URL carries only key and value, so a description has to be taken from the params it replaces:
 * from the one with the same key, or (when the count did not change, i.e. a key was edited in place)
 * from the one at the same position. After a param is added or removed, positions say nothing.
 */
function withDescriptions(parsed: KeyValue[], earlier: readonly KeyValue[]): KeyValue[] {
  const taken = new Set<number>();
  const source = parsed.map((param) => {
    const found = earlier.findIndex((item, index) => !taken.has(index) && item.key === param.key);
    if (found !== -1) taken.add(found);
    return found === -1 ? undefined : found;
  });
  if (parsed.length === earlier.length) {
    source.forEach((from, index) => {
      if (from === undefined && !taken.has(index)) {
        source[index] = index;
        taken.add(index);
      }
    });
  }
  return parsed.map((param, index) => {
    const from = source[index];
    const description = from === undefined ? undefined : earlier[from]?.description;
    return description ? { ...param, description } : param;
  });
}

export function urlFromParams(url: string, params: readonly KeyValue[]): string {
  const { base } = splitUrl(url);
  const query = params
    .filter((param) => param.enabled && (param.key.trim() || param.value.trim()))
    .map((param) => `${encodeSafe(param.key)}=${encodeSafe(param.value)}`)
    .join('&');
  return query ? `${base}?${query}` : base;
}

function decodeSafe(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, ' '));
  } catch {
    return value;
  }
}

function encodeSafe(value: string): string {
  return value.replace(/[%&#+]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`);
}
