import type { KeyValue } from '@/lib/http-client/core';

export function toBulkText(rows: readonly KeyValue[]): string {
  return rows
    .filter((row) => row.key.trim() || row.value.trim())
    .map((row) => `${row.enabled ? '' : '//'}${row.key}:${row.value}`)
    .join('\n');
}

export function fromBulkText(text: string, previous: readonly KeyValue[]): KeyValue[] {
  const secrets = new Set(previous.filter((row) => row.secret).map((row) => row.key));
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .map((line) => {
      const enabled = !line.startsWith('//');
      const rest = enabled ? line : line.slice(2).trim();
      const colon = rest.indexOf(':');
      const key = (colon === -1 ? rest : rest.slice(0, colon)).trim();
      const value = colon === -1 ? '' : rest.slice(colon + 1).trim();
      return { key, value, enabled, ...(secrets.has(key) ? { secret: true } : {}) };
    })
    .filter((row) => row.key !== '');
}
