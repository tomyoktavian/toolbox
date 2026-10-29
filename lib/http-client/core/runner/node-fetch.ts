import { request as httpRequest, type IncomingMessage } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { brotliDecompressSync, gunzipSync, inflateSync } from 'node:zlib';

const MAX_REDIRECTS = 20;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

interface Hop {
  status: number;
  statusText: string;
  headers: Array<[string, string]>;
  body: Buffer;
  url: string;
}

function headerList(init: RequestInit['headers']): Array<[string, string]> {
  if (!init) return [];
  if (init instanceof Headers) {
    const out: Array<[string, string]> = [];
    init.forEach((value, key) => out.push([key, value]));
    return out;
  }
  if (Array.isArray(init)) return init.map(([key, value]) => [key, value]);
  return Object.entries(init).flatMap(([key, value]) =>
    value === undefined ? [] : [[key, value] as [string, string]],
  );
}

function bodyBuffer(body: RequestInit['body']): Buffer | undefined {
  if (body === null || body === undefined) return undefined;
  if (typeof body === 'string') return Buffer.from(body, 'utf8');
  if (body instanceof URLSearchParams) return Buffer.from(body.toString(), 'utf8');
  if (body instanceof ArrayBuffer) return Buffer.from(body);
  if (ArrayBuffer.isView(body)) return Buffer.from(body.buffer, body.byteOffset, body.byteLength);
  throw new TypeError('Unsupported request body type for the Node transport.');
}

function decompress(buffer: Buffer, encoding: string | undefined): Buffer {
  switch ((encoding ?? '').trim().toLowerCase()) {
    case 'gzip':
    case 'x-gzip':
      return gunzipSync(buffer);
    case 'deflate':
      return inflateSync(buffer);
    case 'br':
      return brotliDecompressSync(buffer);
    default:
      return buffer;
  }
}

function collect(response: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    response.on('data', (chunk: Buffer) => chunks.push(chunk));
    response.on('end', () => resolve(Buffer.concat(chunks)));
    response.on('error', reject);
  });
}

function hop(
  url: URL,
  method: string,
  headers: Array<[string, string]>,
  body: Buffer | undefined,
  signal: AbortSignal | undefined,
): Promise<Hop> {
  return new Promise((resolve, reject) => {
    const doRequest = url.protocol === 'https:' ? httpsRequest : httpRequest;
    const outgoing: Record<string, string | string[]> = {};
    for (const [key, value] of headers) {
      const lower = key.toLowerCase();
      const existing = outgoing[lower];
      outgoing[lower] = existing === undefined ? value : ([] as string[]).concat(existing, value);
    }
    if (outgoing['accept-encoding'] === undefined)
      outgoing['accept-encoding'] = 'gzip, deflate, br';
    if (body && outgoing['content-length'] === undefined) {
      outgoing['content-length'] = String(body.byteLength);
    }

    const req = doRequest(url, { method, headers: outgoing }, (response) => {
      collect(response)
        .then((raw) => {
          const list: Array<[string, string]> = [];
          for (const [key, value] of Object.entries(response.headers)) {
            if (value === undefined) continue;
            if (Array.isArray(value)) for (const item of value) list.push([key, item]);
            else list.push([key, value]);
          }
          let payload: Buffer;
          try {
            payload = decompress(raw, response.headers['content-encoding']);
          } catch (error) {
            reject(
              new Error(`Failed to decode ${response.headers['content-encoding']} response body.`, {
                cause: error,
              }),
            );
            return;
          }
          resolve({
            status: response.statusCode ?? 0,
            statusText: response.statusMessage ?? '',
            headers: list.filter(([key]) => key !== 'content-encoding' && key !== 'content-length'),
            body: payload,
            url: url.toString(),
          });
        })
        .catch(reject);
    });

    const onAbort = (): void => {
      req.destroy(signal?.reason instanceof Error ? signal.reason : new Error('Aborted'));
    };
    req.on('error', (error) => {
      signal?.removeEventListener('abort', onAbort);
      reject(error);
    });
    req.on('close', () => signal?.removeEventListener('abort', onAbort));
    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener('abort', onAbort, { once: true });
    if (body) req.write(body);
    req.end();
  });
}

export const nodeFetch: typeof fetch = async (input, init = {}) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  let method = (init.method ?? 'GET').toUpperCase();
  let headers = headerList(init.headers);
  let body = bodyBuffer(init.body);
  const signal = init.signal ?? undefined;
  const follow = init.redirect !== 'manual';

  let current = url;
  let redirected = false;
  for (let hops = 0; ; hops++) {
    const result = await hop(current, method, headers, body, signal);
    const location = result.headers.find(([key]) => key === 'location')?.[1];
    if (follow && REDIRECT_STATUSES.has(result.status) && location) {
      if (hops >= MAX_REDIRECTS) throw new Error(`Too many redirects (>${MAX_REDIRECTS}).`);
      const next = new URL(location, current);
      if (
        result.status === 303 ||
        ((result.status === 301 || result.status === 302) && method === 'POST')
      ) {
        method = 'GET';
        body = undefined;
        headers = headers.filter(([key]) => !/^content-(type|length)$/i.test(key));
      }
      if (next.origin !== current.origin) {
        headers = headers.filter(([key]) => !/^(authorization|cookie)$/i.test(key));
      }
      current = next;
      redirected = true;
      continue;
    }
    const bodiless = result.status < 200 || [204, 205, 304].includes(result.status);
    // A Buffer is a valid body at runtime; newer @types/node types it as ArrayBufferLike-backed.
    const response = new Response(bodiless ? null : (result.body as unknown as BodyInit | null), {
      status: result.status,
      statusText: result.statusText,
      headers: result.headers,
    });
    Object.defineProperty(response, 'url', { value: result.url });
    Object.defineProperty(response, 'redirected', { value: redirected });
    return response;
  }
};
