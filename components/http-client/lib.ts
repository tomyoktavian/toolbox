import type {
  Collection,
  HttpMethod,
  HttpRequest,
  HttpResponse,
  KeyValue,
  RequestBody,
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

// Headers that differ on every call without the response being different: timestamps, per-call ids,
// cookies, rate-limit counters, and anything derived from the transport rather than the content.
const VOLATILE_HEADER =
  /^(date|age|expires|set-cookie|content-length|connection|keep-alive|transfer-encoding|server-timing|traceparent|tracestate|via|cf-ray|x-amz-cf-id)$|(^|-)(request|correlation|trace)-?id$|rate-?limit|response-time|runtime|duration/i;

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, sortKeys(item)]),
    );
  }
  return value;
}

/** JSON compares by content (key order and whitespace do not matter); anything else by trimmed text. */
function normalizedText(text: string): string {
  try {
    return JSON.stringify(sortKeys(JSON.parse(text)));
  } catch {
    return text.trim();
  }
}

function pairsKey(pairs: readonly KeyValue[] | undefined): string {
  return JSON.stringify(
    (pairs ?? []).filter((pair) => pair.enabled && pair.key.trim()).map((pair) => [pair.key, pair.value]),
  );
}

function requestBodyKey(body: RequestBody | undefined): string {
  if (!body || body.mode === 'none') return '';
  if (body.mode === 'form' || body.mode === 'urlencoded') return `${body.mode}:${pairsKey(body.form)}`;
  if (body.mode === 'graphql') {
    return `graphql:${normalizedText(body.graphql?.query ?? '')}|${normalizedText(body.graphql?.variables ?? '')}`;
  }
  return `${body.mode}:${normalizedText(body.text ?? '')}`;
}

function responseHeadersKey(headers: ReadonlyArray<readonly [string, string]>): string {
  return headers
    .filter(([name]) => !VOLATILE_HEADER.test(name))
    .map(([name, value]) => `${name.toLowerCase()}: ${value.trim()}`)
    .sort()
    .join('\n');
}

/**
 * Whether a saved example already holds this exchange: the same request payload and the same
 * response (status, body, and the headers that are not per-call noise).
 */
export function responseMatchesExample(
  example: RequestExample,
  response: HttpResponse,
  requestBody: RequestBody,
): boolean {
  // A binary body is not kept in an example, so there is nothing to compare it with.
  if (response.bodyBase64) return false;
  return (
    example.status === response.status &&
    normalizedText(example.body) === normalizedText(response.body) &&
    responseHeadersKey(example.headers.filter((header) => header.enabled).map((header) => [header.key, header.value])) ===
      responseHeadersKey(response.headers) &&
    requestBodyKey(example.requestBody) === requestBodyKey(requestBody)
  );
}

/**
 * The name for a new example: the status and the request's own name ("200 Catalog list"), so the
 * sidebar reads like the endpoint and says which response it is. A counter tells equal names apart.
 */
export function exampleName(
  requestName: string,
  status: number,
  existing: readonly RequestExample[],
): string {
  const base = `${status} ${requestName.trim() || 'Contoh'}`;
  const taken = new Set(existing.map((example) => example.name));
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base} (${n})`;
    if (!taken.has(candidate)) return candidate;
  }
}

/** The name without a leading status code, for places that already show the status next to it. */
export function exampleLabel(example: RequestExample): string {
  const prefix = `${example.status} `;
  return example.name.startsWith(prefix) && example.name.length > prefix.length
    ? example.name.slice(prefix.length)
    : example.name;
}

/**
 * Examples are written to the collection the moment they change, so the saved list is the truth for
 * them: one deleted from the sidebar has to leave an open tab too. The form fields in `draft`, which
 * may hold unsaved edits, are left as they are.
 */
export function withSavedExamples(draft: HttpRequest, saved: HttpRequest): HttpRequest {
  const next = { ...draft };
  if (saved.examples) next.examples = saved.examples;
  else delete next.examples;
  return next;
}
