import type { KeyValue } from '@/lib/http-client/core';
import { flattenObject, toCommentedJson } from './bulk-json';
import { parseLooseJson } from './json-fix';

export type BulkFormat = 'text' | 'json';

/** `key:value:desc:description` — the description is optional. */
const DESCRIPTION_MARK = ':desc:';

function oneLine(text: string): string {
  return text.replace(/\s*\r?\n\s*/g, ' ').trim();
}

/** `structured`: see toCommentedJson (query params are structured, headers are not). */
export function convertItemsToFormat(
  format: BulkFormat,
  items: readonly KeyValue[],
  structured = true,
): string {
  if (format === 'text') {
    return items
      .map((item) => {
        const description = item.description ? oneLine(item.description) : '';
        return `${item.key}:${item.value}${description ? `${DESCRIPTION_MARK}${description}` : ''}`;
      })
      .join('\n');
  }
  // JSON: the nested structure from bracket notation, descriptions as trailing comments.
  return toCommentedJson(items, structured);
}

export function parseTextFormat(text: string): KeyValue[] {
  const items: KeyValue[] = [];
  for (const line of text.split('\n').filter((row) => row.trim())) {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;
    const key = line.substring(0, colonIndex).trim();
    const rest = line.substring(colonIndex + 1);
    // The first ":desc:" ends the value; everything after it is the description.
    const markAt = rest.indexOf(DESCRIPTION_MARK);
    const value = (markAt === -1 ? rest : rest.slice(0, markAt)).trim();
    const description = markAt === -1 ? '' : rest.slice(markAt + DESCRIPTION_MARK.length).trim();
    if (key) items.push({ key, value, enabled: true, ...(description ? { description } : {}) });
  }
  return items;
}

export function parseJsonFormat(text: string): KeyValue[] {
  const parsed = parseLooseJson(text);
  if (!parsed) return [];
  return flattenObject(parsed.value).map(({ key, value }) => {
    const description = parsed.notes.get(key);
    return { key, value, enabled: true, ...(description ? { description } : {}) };
  });
}
