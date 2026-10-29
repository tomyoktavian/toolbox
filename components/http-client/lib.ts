import type {
  Collection,
  HttpMethod,
  HttpRequest,
  KeyValue,
  RequestExample,
  RequestFolder,
} from '@/lib/http-client/core';
import { splitUrl, urlFromParams } from './url-sync';

const METHOD_STYLE: Record<HttpMethod, string> = {
  GET: 'text-emerald-500',
  POST: 'text-amber-500',
  PUT: 'text-sky-500',
  PATCH: 'text-violet-500',
  DELETE: 'text-red-500',
  HEAD: 'text-zinc-400',
  OPTIONS: 'text-zinc-400',
};

const WS_STYLE = 'text-fuchsia-500';

export const CELL =
  'rounded border border-[var(--vscode-panel-border)] bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)]';

export const METHODS = Object.keys(METHOD_STYLE) as HttpMethod[];

export function methodStyle(label: string): string {
  return label === 'WS' ? WS_STYLE : (METHOD_STYLE[label as HttpMethod] ?? '');
}

export function methodLabel(request: HttpRequest): string {
  return request.protocol === 'ws' ? 'WS' : request.method;
}

/**
 * The URL a request is sent to. Importers (Postman, OpenAPI) keep the query only in `params`, so
 * rebuild it from the enabled ones when the stored URL has none.
 */
export function effectiveUrl(request: HttpRequest): string {
  if (splitUrl(request.url).query || !request.params.some((param) => param.enabled)) return request.url;
  return urlFromParams(request.url, request.params);
}

/** A slice of `text` around the first match of `term`, with an ellipsis where it was cut. */
export function matchExcerpt(text: string, term: string, radius = 26): string {
  const at = text.toLowerCase().indexOf(term.toLowerCase());
  if (at === -1 || text.length <= term.length + radius * 2) return text;
  const start = Math.max(0, at - radius);
  const end = Math.min(text.length, at + term.length + radius);
  return `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`;
}

export function statusColor(status: number): string {
  if (status >= 500) return 'text-red-500';
  if (status >= 400) return 'text-amber-500';
  if (status >= 300) return 'text-sky-500';
  return 'text-emerald-500';
}

export interface TreeNode {
  kind: 'folder' | 'request' | 'example';
  id: string;
  name: string;
  depth: number;
  request?: HttpRequest;
  example?: RequestExample;
  parentFolderId?: string;
}

export function flattenCollection(
  collection: Collection,
  expanded: ReadonlySet<string>,
  filter: string,
): TreeNode[] {
  const needle = filter.trim().toLowerCase();
  const matches = (request: HttpRequest): boolean =>
    !needle ||
    request.name.toLowerCase().includes(needle) ||
    effectiveUrl(request).toLowerCase().includes(needle);

  const requestNodes = (request: HttpRequest, depth: number, parentFolderId?: string): TreeNode[] => {
    const head: TreeNode = {
      kind: 'request',
      id: request.id,
      name: request.name,
      depth,
      request,
      ...(parentFolderId ? { parentFolderId } : {}),
    };
    const examples = request.examples ?? [];
    if (examples.length === 0 || !(expanded.has(request.id) || needle)) return [head];
    return [
      head,
      ...examples.map(
        (example): TreeNode => ({
          kind: 'example',
          id: example.id,
          name: example.name,
          depth: depth + 1,
          request,
          example,
        }),
      ),
    ];
  };

  const folderNodes = (folder: RequestFolder, depth: number): TreeNode[] => {
    const children: TreeNode[] = [];
    for (const child of folder.folders) children.push(...folderNodes(child, depth + 1));
    for (const request of folder.requests) {
      if (matches(request)) children.push(...requestNodes(request, depth + 1, folder.id));
    }
    if (needle && children.length === 0) return [];
    const head: TreeNode = { kind: 'folder', id: folder.id, name: folder.name, depth };
    return expanded.has(folder.id) || needle ? [head, ...children] : [head];
  };

  const out: TreeNode[] = [];
  for (const folder of collection.folders) out.push(...folderNodes(folder, 1));
  for (const request of collection.requests) {
    if (matches(request)) out.push(...requestNodes(request, 1));
  }
  return out;
}

export interface TrailEntry {
  id: string;
  name: string;
}

export function folderTrail(collection: Collection, requestId: string): TrailEntry[] {
  const walk = (folders: RequestFolder[], trail: TrailEntry[]): TrailEntry[] | undefined => {
    for (const folder of folders) {
      const here = [...trail, { id: folder.id, name: folder.name }];
      if (folder.requests.some((request) => request.id === requestId)) return here;
      const deeper = walk(folder.folders, here);
      if (deeper) return deeper;
    }
    return undefined;
  };
  if (collection.requests.some((request) => request.id === requestId)) return [];
  return walk(collection.folders, []) ?? [];
}

export function folderPath(collection: Collection, requestId: string): string[] {
  return folderTrail(collection, requestId).map((entry) => entry.id);
}

export function setPair(list: KeyValue[], index: number, patch: Partial<KeyValue>): KeyValue[] {
  return list.map((item, i) => (i === index ? { ...item, ...patch } : item));
}

export function withTrailingBlank(list: readonly KeyValue[]): KeyValue[] {
  const copy = [...list];
  const last = copy[copy.length - 1];
  if (!last || last.key || last.value) copy.push({ key: '', value: '', enabled: true });
  return copy;
}

export function pruneBlank(list: readonly KeyValue[]): KeyValue[] {
  return list.filter((item) => item.key.trim() || item.value.trim());
}

export function prettyJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

export function formatTime(at: number): string {
  const date = new Date(at);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

const DEFAULT_REQUEST_NAME = /^New (HTTP|WebSocket)$/;

export function isDefaultRequestName(name: string): boolean {
  return DEFAULT_REQUEST_NAME.test(name.trim());
}

export function titleFromUrl(url: string): string {
  const withoutScheme = url.trim().replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
  const withoutQuery = withoutScheme.split(/[?#]/)[0] ?? '';
  return withoutQuery.replace(/\/+$/, '');
}
