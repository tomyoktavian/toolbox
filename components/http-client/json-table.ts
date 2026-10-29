export type JsonKind = 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';

export function kindOf(value: unknown): JsonKind {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  const type = typeof value;
  if (type === 'object') return 'object';
  if (type === 'number' || type === 'bigint') return 'number';
  if (type === 'boolean') return 'boolean';
  return 'string';
}

export function isContainer(value: unknown): boolean {
  const kind = kindOf(value);
  return kind === 'object' || kind === 'array';
}

export function countOf(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  if (kindOf(value) === 'object') return Object.keys(value as object).length;
  return 0;
}

export function badgeOf(value: unknown): string | undefined {
  const kind = kindOf(value);
  if (kind === 'array') return `[${countOf(value) || ''}]`;
  if (kind === 'object') return `{${countOf(value) || ''}}`;
  return undefined;
}

export function tableColumns(items: unknown[]): string[] | undefined {
  if (items.length === 0) return undefined;
  const columns: string[] = [];
  for (const item of items) {
    if (kindOf(item) !== 'object') return undefined;
    for (const key of Object.keys(item as object)) {
      if (!columns.includes(key)) columns.push(key);
    }
  }
  return columns.length ? columns : undefined;
}

export function formatScalar(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return '';
  return typeof value === 'string' ? value : String(value);
}
