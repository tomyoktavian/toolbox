import { authChain, type ResolvedAuth } from '../model/factory';
import type {
  Collection,
  Environment,
  HttpRequest,
  HttpResponse,
  KeyValue,
  ResponseCookie,
} from '../model/types';
import {
  missingVars,
  resolvePairs,
  resolveVars,
  scopeFor,
  type VarScope,
} from '../vars/resolve';
import { prepareAuth, resolveAuthVars } from './auth/apply';
import { signAwsRequest } from './auth/aws-sigv4';
import { encodeBody } from './body';
import { nodeFetch } from './node-fetch';

export const DEFAULT_TIMEOUT_MS = 60_000;
export const MAX_BODY_CHARS = 2_000_000;

const BINARY_HINT = /^(image|audio|video|font)\/|application\/(octet-stream|pdf|zip|gzip)/i;

export interface SendContext {
  collection?: Collection;
  environment?: Environment;
  globals?: readonly KeyValue[];
  folderPath?: readonly string[];
  timeoutMs?: number;
  followRedirects?: boolean;
  signal?: AbortSignal;
  onAuthRefreshed?: (auth: ResolvedAuth) => void;
}

export interface RunnerDeps {
  fetch?: typeof fetch;
  now?: () => number;
}

export interface PreparedRequest {
  method: string;
  url: string;
  headers: Array<[string, string]>;
  body?: string;
  auth: ResolvedAuth;
}

export async function prepareRequest(
  request: HttpRequest,
  ctx: SendContext = {},
  deps: RunnerDeps = {},
): Promise<PreparedRequest> {
  const scope = scopeFor(ctx.collection, ctx.environment, ctx.globals);
  const missing = missingVars(request.url, scope);
  const url = parseRequestUrl(resolveVars(request.url, scope), request.protocol, missing);
  appendMissingParams(url, resolvePairs(request.params, scope));

  const headers: Array<[string, string]> = resolvePairs(request.headers, scope);
  const encoded = encodeBody(request.body, scope);
  if (encoded.contentType && !hasHeader(headers, 'content-type')) {
    headers.push(['Content-Type', encoded.contentType]);
  }

  const auth = resolveAuth(request, ctx, scope);
  const prepared = await prepareAuth(auth, deps);
  for (const [key, value] of prepared.query) url.searchParams.append(key, value);
  headers.push(...prepared.headers);
  if (prepared.updated) ctx.onAuthRefreshed?.(prepared.updated);

  const effectiveAuth = prepared.updated ?? auth;
  if (effectiveAuth.type === 'awsSigV4') {
    headers.push(
      ...signAwsRequest(
        {
          method: request.method,
          url: url.toString(),
          headers,
          body: encoded.body ?? '',
        },
        effectiveAuth,
        new Date((deps.now ?? Date.now)()),
      ),
    );
  }

  return {
    method: request.method,
    url: url.toString(),
    headers,
    auth: effectiveAuth,
    ...(encoded.body !== undefined ? { body: encoded.body } : {}),
  };
}

export async function sendRestRequest(
  request: HttpRequest,
  ctx: SendContext = {},
  deps: RunnerDeps = {},
): Promise<HttpResponse> {
  const doFetch = deps.fetch ?? nodeFetch;
  const now = deps.now ?? Date.now;
  const prepared = await prepareRequest(request, ctx, deps);

  const controller = new AbortController();
  const timeoutMs = ctx.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = (): void => controller.abort();
  if (ctx.signal?.aborted) controller.abort();
  else ctx.signal?.addEventListener('abort', onAbort);

  const startedAt = now();
  try {
    const response = await doFetch(prepared.url, {
      method: prepared.method,
      headers: prepared.headers,
      redirect: ctx.followRedirects === false ? 'manual' : 'follow',
      signal: controller.signal,
      ...(prepared.body !== undefined && prepared.method !== 'GET' && prepared.method !== 'HEAD'
        ? { body: prepared.body }
        : {}),
    });
    return await readResponse(response, now() - startedAt, prepared.url);
  } catch (error) {
    const message =
      controller.signal.aborted && !ctx.signal?.aborted
        ? `Request timed out after ${timeoutMs} ms.`
        : describeError(error);
    throw new Error(message, { cause: error });
  } finally {
    clearTimeout(timer);
    ctx.signal?.removeEventListener('abort', onAbort);
  }
}

export function describeError(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  for (let depth = 0; current !== undefined && current !== null && depth < 5; depth++) {
    const message =
      current instanceof Error ? current.message : typeof current === 'string' ? current : '';
    const code = (current as { code?: unknown }).code;
    const line = [message, typeof code === 'string' && !message.includes(code) ? code : '']
      .filter(Boolean)
      .join(' ');
    if (line && parts[parts.length - 1] !== line) parts.push(line);
    current = (current as { cause?: unknown }).cause;
  }
  return parts.join(' — ') || String(error);
}

async function readResponse(
  response: Response,
  timeMs: number,
  requestUrl: string,
): Promise<HttpResponse> {
  const headers: Array<[string, string]> = [];
  response.headers.forEach((value, key) => headers.push([key, value]));
  const contentType = response.headers.get('content-type') ?? '';
  const buffer = Buffer.from(await response.arrayBuffer());
  const binary = BINARY_HINT.test(contentType);
  const text = binary ? '' : buffer.toString('utf8');
  const truncated = text.length > MAX_BODY_CHARS;

  return {
    url: response.url || requestUrl,
    status: response.status,
    statusText: response.statusText,
    headers,
    cookies: parseSetCookies(response.headers),
    body: truncated ? text.slice(0, MAX_BODY_CHARS) : text,
    contentType,
    sizeBytes: buffer.byteLength,
    timeMs,
    redirected: response.redirected,
    truncated,
    ...(binary ? { bodyBase64: buffer.toString('base64') } : {}),
  };
}

export function parseSetCookies(headers: Headers): ResponseCookie[] {
  const raw =
    typeof (headers as { getSetCookie?: () => string[] }).getSetCookie === 'function'
      ? (headers as { getSetCookie: () => string[] }).getSetCookie()
      : headers.get('set-cookie')
        ? [headers.get('set-cookie') as string]
        : [];
  return raw.map(parseSetCookie);
}

export function parseSetCookie(raw: string): ResponseCookie {
  const [pair = '', ...attributes] = raw.split(';');
  const eq = pair.indexOf('=');
  const cookie: ResponseCookie = {
    name: eq === -1 ? pair.trim() : pair.slice(0, eq).trim(),
    value: eq === -1 ? '' : pair.slice(eq + 1).trim(),
    httpOnly: false,
    secure: false,
  };
  for (const attribute of attributes) {
    const [rawName = '', ...rest] = attribute.split('=');
    const name = rawName.trim().toLowerCase();
    const value = rest.join('=').trim();
    if (name === 'domain') cookie.domain = value;
    else if (name === 'path') cookie.path = value;
    else if (name === 'expires') cookie.expires = value;
    else if (name === 'samesite') cookie.sameSite = value;
    else if (name === 'httponly') cookie.httpOnly = true;
    else if (name === 'secure') cookie.secure = true;
  }
  return cookie;
}

function resolveAuth(request: HttpRequest, ctx: SendContext, scope: VarScope): ResolvedAuth {
  const chained: ResolvedAuth = ctx.collection
    ? authChain(ctx.collection, ctx.folderPath ?? [], request).auth
    : request.auth.type === 'inherit'
      ? { type: 'none' }
      : request.auth;
  return resolveAuthVars(chained, scope);
}

function hasHeader(headers: readonly (readonly [string, string])[], name: string): boolean {
  return headers.some(([key]) => key.toLowerCase() === name);
}

export function parseRequestUrl(
  resolved: string,
  protocol: 'rest' | 'ws',
  missing: readonly string[],
): URL {
  const raw = resolved.trim();
  if (!raw) throw new Error('Request URL is empty.');
  if (missing.length > 0) {
    throw new Error(
      `URL still has unresolved variables: ${missing.map((name) => `{{${name}}}`).join(', ')}. Set them in the selected environment or the collection.`,
    );
  }
  try {
    return new URL(normalizeUrl(raw, protocol));
  } catch {
    throw new Error(`Invalid URL: ${raw}`);
  }
}

export function appendMissingParams(url: URL, pairs: ReadonlyArray<[string, string]>): void {
  const present = new Map<string, number>();
  for (const [key, value] of url.searchParams) {
    const id = `${key}\u0000${value}`;
    present.set(id, (present.get(id) ?? 0) + 1);
  }
  for (const [key, value] of pairs) {
    const id = `${key}\u0000${value}`;
    const left = present.get(id) ?? 0;
    if (left > 0) {
      present.set(id, left - 1);
      continue;
    }
    url.searchParams.append(key, value);
  }
}

export function normalizeUrl(url: string, protocol: 'rest' | 'ws'): string {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) return url;
  return protocol === 'ws' ? `ws://${url}` : `http://${url}`;
}

export function formatResponseSummary(response: HttpResponse, maxChars = 20_000): string {
  const head = `${response.status} ${response.statusText} · ${response.timeMs} ms · ${formatBytes(response.sizeBytes)}`;
  const headers = response.headers.map(([key, value]) => `${key}: ${value}`).join('\n');
  const body = response.bodyBase64
    ? `<binary ${response.contentType || 'body'}, ${formatBytes(response.sizeBytes)}>`
    : response.body.length > maxChars
      ? `${response.body.slice(0, maxChars)}\n… truncated (${response.body.length} chars total)`
      : response.body;
  return `${head}\n${response.url}\n\n${headers}\n\n${body}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
