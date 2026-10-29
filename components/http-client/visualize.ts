export class TemplateError extends Error {}

type Node =
  | { type: 'text'; value: string }
  | { type: 'var'; path: string; raw: boolean }
  | { type: 'block'; kind: BlockKind; path: string; body: Node[]; alt: Node[] };

type BlockKind = 'each' | 'if' | 'unless';

const TOKEN = /\{\{\{?\s*([^{}]+?)\s*\}?\}\}/g;
const BLOCKS: BlockKind[] = ['each', 'if', 'unless'];

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function stringify(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') return JSON.stringify(value) ?? '';
  return String(value);
}

function truthy(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === 'object') return Object.keys(value).length > 0;
  return Boolean(value);
}

export function parseTemplate(template: string): Node[] {
  const root: Node[] = [];
  const open: Array<{ node: Extract<Node, { type: 'block' }>; inAlt: boolean }> = [];
  let cursor = 0;

  const target = (): Node[] => {
    const frame = open[open.length - 1];
    if (!frame) return root;
    return frame.inAlt ? frame.node.alt : frame.node.body;
  };
  const text = (value: string): void => {
    if (value) target().push({ type: 'text', value });
  };

  TOKEN.lastIndex = 0;
  for (let match = TOKEN.exec(template); match; match = TOKEN.exec(template)) {
    text(template.slice(cursor, match.index));
    cursor = match.index + match[0].length;
    const token = (match[1] ?? '').trim();
    if (token.startsWith('!')) continue;

    if (token.startsWith('#')) {
      const [name = '', ...rest] = token.slice(1).split(/\s+/);
      const kind = BLOCKS.find((candidate) => candidate === name);
      if (!kind) throw new TemplateError(`Helper {{#${name}}} belum didukung.`);
      const node: Extract<Node, { type: 'block' }> = {
        type: 'block',
        kind,
        path: rest.join(' ') || 'this',
        body: [],
        alt: [],
      };
      target().push(node);
      open.push({ node, inAlt: false });
      continue;
    }

    if (token === 'else') {
      const frame = open[open.length - 1];
      if (!frame) throw new TemplateError('{{else}} tanpa blok pembuka.');
      frame.inAlt = true;
      continue;
    }

    if (token.startsWith('/')) {
      const frame = open.pop();
      const closing = token.slice(1).trim();
      if (!frame) throw new TemplateError(`Penutup {{/${closing}}} tanpa blok pembuka.`);
      if (closing !== frame.node.kind) {
        throw new TemplateError(`{{/${closing}}} tidak cocok dengan {{#${frame.node.kind}}}.`);
      }
      continue;
    }

    target().push({ type: 'var', path: token, raw: match[0].startsWith('{{{') });
  }

  text(template.slice(cursor));
  const unclosed = open[open.length - 1];
  if (unclosed) throw new TemplateError(`Blok {{#${unclosed.node.kind}}} belum ditutup.`);
  return root;
}

function resolve(path: string, scopes: unknown[], indexes: number[]): unknown {
  const trimmed = path.trim();
  if (trimmed === '@index') return indexes[indexes.length - 1];
  if (trimmed === 'this' || trimmed === '.') return scopes[scopes.length - 1];
  const parts = trimmed.replace(/^this\./, '').split('.');
  for (let depth = scopes.length - 1; depth >= 0; depth -= 1) {
    let current = scopes[depth];
    let found = true;
    for (const part of parts) {
      if (current === null || typeof current !== 'object' || !(part in current)) {
        found = false;
        break;
      }
      current = (current as Record<string, unknown>)[part];
    }
    if (found) return current;
  }
  return undefined;
}

function renderNodes(nodes: Node[], scopes: unknown[], indexes: number[]): string {
  let out = '';
  for (const node of nodes) {
    if (node.type === 'text') {
      out += node.value;
      continue;
    }
    if (node.type === 'var') {
      const value = stringify(resolve(node.path, scopes, indexes));
      out += node.raw ? value : escapeHtml(value);
      continue;
    }
    const value = resolve(node.path, scopes, indexes);
    if (node.kind === 'each') {
      const items = Array.isArray(value)
        ? value
        : value && typeof value === 'object'
          ? Object.values(value)
          : [];
      if (items.length === 0) {
        out += renderNodes(node.alt, scopes, indexes);
        continue;
      }
      items.forEach((item, position) => {
        scopes.push(item);
        indexes.push(position);
        out += renderNodes(node.body, scopes, indexes);
        indexes.pop();
        scopes.pop();
      });
      continue;
    }
    const pass = node.kind === 'if' ? truthy(value) : !truthy(value);
    out += renderNodes(pass ? node.body : node.alt, scopes, indexes);
  }
  return out;
}

export function renderTemplate(template: string, data: unknown): string {
  return renderNodes(parseTemplate(template), [data], []);
}

export interface VisualTheme {
  background: string;
  foreground: string;
  border: string;
  font: string;
}

export function visualizeDocument(body: string, theme: VisualTheme): string {
  return [
    '<!doctype html><html><head><meta charset="utf-8">',
    '<style>',
    `body{margin:10px;font:12px/1.55 ${theme.font};color:${theme.foreground};background:${theme.background}}`,
    'table{border-collapse:collapse;width:100%}',
    `th,td{border:1px solid ${theme.border};padding:4px 8px;text-align:left;vertical-align:top}`,
    'th{font-weight:600}',
    'img{max-width:100%}',
    'pre{white-space:pre-wrap;word-break:break-word}',
    '</style></head><body>',
    body,
    '</body></html>',
  ].join('');
}
