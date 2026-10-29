import { createHash, createHmac } from 'node:crypto';
import type { AwsSigV4Auth } from '../../model/types';

export interface SignableRequest {
  method: string;
  url: string;
  headers: Array<[string, string]>;
  body: string;
}

const UNSIGNED_HEADERS = new Set(['authorization', 'connection', 'user-agent', 'content-length']);

function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac('sha256', key).update(data, 'utf8').digest();
}

export function amzDate(at: Date): { stamp: string; date: string } {
  const stamp = at.toISOString().replace(/[:-]|\.\d{3}/g, '');
  return { stamp, date: stamp.slice(0, 8) };
}

function encodeRfc3986(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function canonicalQuery(url: URL): string {
  const pairs: Array<[string, string]> = [];
  for (const [key, value] of url.searchParams)
    pairs.push([encodeRfc3986(key), encodeRfc3986(value)]);
  pairs.sort((a, b) => (a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0])));
  return pairs.map(([k, v]) => `${k}=${v}`).join('&');
}

function canonicalPath(url: URL): string {
  const path = url.pathname || '/';
  return path
    .split('/')
    .map((segment) => encodeRfc3986(decodeURIComponent(segment)))
    .join('/');
}

export function signAwsRequest(
  request: SignableRequest,
  auth: AwsSigV4Auth,
  at: Date = new Date(),
): Array<[string, string]> {
  const url = new URL(request.url);
  const { stamp, date } = amzDate(at);
  const payloadHash = sha256Hex(request.body);

  const headers: Array<[string, string]> = request.headers.filter(
    ([name]) => !UNSIGNED_HEADERS.has(name.toLowerCase()),
  );
  const merged = new Map<string, string>();
  for (const [name, value] of headers) merged.set(name.toLowerCase(), value.trim());
  merged.set('host', url.host);
  merged.set('x-amz-date', stamp);
  merged.set('x-amz-content-sha256', payloadHash);
  if (auth.sessionToken) merged.set('x-amz-security-token', auth.sessionToken);

  const sortedNames = [...merged.keys()].sort();
  const canonicalHeaders = sortedNames
    .map((name) => `${name}:${merged.get(name) ?? ''}\n`)
    .join('');
  const signedHeaders = sortedNames.join(';');

  const canonicalRequest = [
    request.method.toUpperCase(),
    canonicalPath(url),
    canonicalQuery(url),
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const credentialScope = `${date}/${auth.region}/${auth.service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    stamp,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');

  const kDate = hmac(`AWS4${auth.secretAccessKey}`, date);
  const kRegion = hmac(kDate, auth.region);
  const kService = hmac(kRegion, auth.service);
  const kSigning = hmac(kService, 'aws4_request');
  const signature = createHmac('sha256', kSigning).update(stringToSign, 'utf8').digest('hex');

  const out: Array<[string, string]> = [
    ['X-Amz-Date', stamp],
    ['X-Amz-Content-Sha256', payloadHash],
    [
      'Authorization',
      `AWS4-HMAC-SHA256 Credential=${auth.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    ],
  ];
  if (auth.sessionToken) out.push(['X-Amz-Security-Token', auth.sessionToken]);
  return out;
}
