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
  return [...parsed, ...disabled];
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
