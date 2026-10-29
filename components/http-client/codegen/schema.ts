export type Primitive = 'string' | 'number' | 'integer' | 'boolean' | 'any';

export type Shape =
  | { kind: 'prim'; type: Primitive }
  | { kind: 'array'; item: Shape }
  | { kind: 'ref'; name: string };

export interface Field {
  key: string;
  shape: Shape;
  optional: boolean;
  nullable: boolean;
}

export interface Model {
  name: string;
  fields: Field[];
}

export interface Schema {
  rootName: string;
  root: Shape;
  rootNullable: boolean;
  models: Model[];
}

type RawShape =
  | { kind: 'prim'; type: Primitive }
  | { kind: 'array'; item: RawShape }
  | { kind: 'obj'; fields: Map<string, RawField>; count: number };

interface RawField {
  shape: RawShape;
  seen: number;
  nullable: boolean;
}

const ANY: RawShape = { kind: 'prim', type: 'any' };

function rawOf(value: unknown): { shape: RawShape; nullable: boolean } {
  if (value === null || value === undefined) return { shape: ANY, nullable: true };
  if (Array.isArray(value)) {
    let item: RawShape | undefined;
    let nullable = false;
    for (const entry of value) {
      const inner = rawOf(entry);
      nullable = nullable || inner.nullable;
      item = item ? merge(item, inner.shape) : inner.shape;
    }
    return { shape: { kind: 'array', item: item ?? ANY }, nullable: false };
  }
  if (typeof value === 'object') {
    const fields = new Map<string, RawField>();
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      const inner = rawOf(entry);
      fields.set(key, { shape: inner.shape, seen: 1, nullable: inner.nullable });
    }
    return { shape: { kind: 'obj', fields, count: 1 }, nullable: false };
  }
  if (typeof value === 'number') {
    return { shape: { kind: 'prim', type: Number.isInteger(value) ? 'integer' : 'number' }, nullable: false };
  }
  if (typeof value === 'boolean') return { shape: { kind: 'prim', type: 'boolean' }, nullable: false };
  return { shape: { kind: 'prim', type: 'string' }, nullable: false };
}

function merge(a: RawShape, b: RawShape): RawShape {
  if (a.kind === 'prim' && a.type === 'any') return b;
  if (b.kind === 'prim' && b.type === 'any') return a;
  if (a.kind === 'prim' && b.kind === 'prim') {
    if (a.type === b.type) return a;
    const numeric = new Set(['integer', 'number']);
    if (numeric.has(a.type) && numeric.has(b.type)) return { kind: 'prim', type: 'number' };
    return ANY;
  }
  if (a.kind === 'array' && b.kind === 'array') return { kind: 'array', item: merge(a.item, b.item) };
  if (a.kind === 'obj' && b.kind === 'obj') {
    const fields = new Map<string, RawField>();
    for (const [key, field] of a.fields) fields.set(key, { ...field });
    for (const [key, field] of b.fields) {
      const existing = fields.get(key);
      fields.set(
        key,
        existing
          ? {
              shape: merge(existing.shape, field.shape),
              seen: existing.seen + field.seen,
              nullable: existing.nullable || field.nullable,
            }
          : { ...field },
      );
    }
    return { kind: 'obj', fields, count: a.count + b.count };
  }
  return ANY;
}

export function pascalCase(text: string): string {
  const words = text
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
  const joined = words.map((w) => w[0]!.toUpperCase() + w.slice(1)).join('');
  const safe = joined.replace(/^[0-9]/, (d) => `_${d}`);
  return safe || 'Model';
}

export function camelCase(text: string): string {
  const pascal = pascalCase(text);
  return pascal[0]!.toLowerCase() + pascal.slice(1);
}

export function snakeCase(text: string): string {
  return text
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .join('_')
    .toLowerCase()
    .replace(/^[0-9]/, (d) => `_${d}`);
}

export function singular(word: string): string {
  if (/ies$/i.test(word) && word.length > 4) return word.slice(0, -3) + 'y';
  if (/(ss|us|is)$/i.test(word)) return word;
  if (/s$/i.test(word) && word.length > 3) return word.slice(0, -1);
  return word;
}

export function inferSchema(value: unknown, rootName: string): Schema {
  const raw = rawOf(value);
  const models: Model[] = [];
  const signatures = new Map<string, string>();
  const used = new Set<string>();

  const signatureOf = (shape: RawShape): string => {
    if (shape.kind === 'prim') return shape.type;
    if (shape.kind === 'array') return `[${signatureOf(shape.item)}]`;
    return `{${[...shape.fields.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, field]) => `${key}${field.nullable ? '?' : ''}:${signatureOf(field.shape)}`)
      .join(',')}}`;
  };

  const uniqueName = (base: string): string => {
    let name = base;
    for (let n = 2; used.has(name); n++) name = `${base}${n}`;
    used.add(name);
    return name;
  };

  const lower = (shape: RawShape, nameHint: string): Shape => {
    if (shape.kind === 'prim') return shape;
    if (shape.kind === 'array') return { kind: 'array', item: lower(shape.item, singular(nameHint)) };
    const signature = signatureOf(shape);
    const known = signatures.get(signature);
    if (known) return { kind: 'ref', name: known };
    const name = uniqueName(pascalCase(nameHint));
    signatures.set(signature, name);
    const model: Model = { name, fields: [] };
    models.push(model);
    for (const [key, field] of shape.fields) {
      model.fields.push({
        key,
        shape: lower(field.shape, key),
        optional: field.seen < shape.count,
        nullable: field.nullable,
      });
    }
    return { kind: 'ref', name };
  };

  const lowered: Shape =
    raw.shape.kind === 'array'
      ? { kind: 'array', item: lower(raw.shape.item, `${rootName}Item`) }
      : lower(raw.shape, rootName);
  return { rootName: pascalCase(rootName), root: lowered, rootNullable: raw.nullable, models };
}
