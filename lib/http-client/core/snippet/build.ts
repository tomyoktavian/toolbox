import { authChain, type ResolvedAuth } from '../model/factory';
import type { Collection, Environment, HttpRequest, KeyValue, RequestBody } from '../model/types';
import { resolveAuthVars } from '../runner/auth/apply';
import { stripJsonComments } from '../runner/body';
import { normalizeUrl } from '../runner/rest-runner';
import { resolveVars, scopeFor } from '../vars/resolve';
import type { SnippetBody, SnippetRequest } from './generate';

export interface SnippetContext {
  collection?: Collection;
  environment?: Environment;
  globals?: readonly KeyValue[];
  folderPath?: readonly string[];
  /** Substitute variable values; when false, `{{name}}` stays in the generated code. */
  resolve: boolean;
}

const TOKEN = /\{\{\s*[^{}\s]+\s*\}\}/g;

/** encodeURIComponent that leaves `{{variable}}` tokens readable. */
function encodeComponent(value: string): string {
  let out = '';
  let last = 0;
  for (const match of value.matchAll(TOKEN)) {
    out += encodeURIComponent(value.slice(last, match.index)) + match[0];
    last = match.index + match[0].length;
  }
  return out + encodeURIComponent(value.slice(last));
}

function authParts(
  auth: ResolvedAuth,
  notes: string[],
): { headers: Array<[string, string]>; query: Array<[string, string]> } {
  const none = { headers: [], query: [] };
  switch (auth.type) {
    case 'none':
      return none;
    case 'bearer':
      return auth.token ? { headers: [['Authorization', `Bearer ${auth.token}`]], query: [] } : none;
    case 'basic': {
      const credentials = `${auth.username}:${auth.password}`;
      // A base64 of the placeholder text would be meaningless, so show what goes into it.
      const value = credentials.includes('{{')
        ? `Basic <base64(${credentials})>`
        : `Basic ${Buffer.from(credentials).toString('base64')}`;
      return { headers: [['Authorization', value]], query: [] };
    }
    case 'apiKey':
      if (!auth.key) return none;
      return auth.in === 'query'
        ? { headers: [], query: [[auth.key, auth.value]] }
        : { headers: [[auth.key, auth.value]], query: [] };
    case 'oauth2': {
      const prefix = auth.headerPrefix?.trim() || 'Bearer';
      if (!auth.accessToken) {
        notes.push('OAuth2: belum ada access token. Ambil token dulu di tab Authorization.');
      }
      return {
        headers: [['Authorization', `${prefix} ${auth.accessToken ?? '<access_token>'}`]],
        query: [],
      };
    }
    case 'awsSigV4':
      notes.push('AWS Signature V4 tidak disertakan: tanda tangannya bergantung pada waktu request.');
      return none;
  }
}

/**
 * Describes a request the way the runner would send it, without sending it, so the code
 * generators have one structure to work from.
 */
export function buildSnippetRequest(request: HttpRequest, ctx: SnippetContext): SnippetRequest {
  const scope = scopeFor(ctx.collection, ctx.environment, ctx.globals);
  const text = (value: string): string => (ctx.resolve ? resolveVars(value, scope) : value);
  const pairs = (rows: readonly KeyValue[]): Array<[string, string]> =>
    rows
      .filter((row) => row.enabled && row.key.trim())
      .map((row): [string, string] => [text(row.key.trim()), text(row.value)]);
  const notes: string[] = [];

  let url = text(request.url.trim());
  if (!url) throw new Error('URL request masih kosong.');
  if (!url.startsWith('{{')) url = normalizeUrl(url, 'rest');

  const chained: ResolvedAuth = ctx.collection
    ? authChain(ctx.collection, ctx.folderPath ?? [], request).auth
    : request.auth.type === 'inherit'
      ? { type: 'none' }
      : request.auth;
  const auth = authParts(ctx.resolve ? resolveAuthVars(chained, scope) : chained, notes);
  for (const [key, value] of auth.query) {
    url += `${url.includes('?') ? '&' : '?'}${encodeComponent(key)}=${encodeComponent(value)}`;
  }

  const headers = pairs(request.headers);
  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  const encoded = hasBody ? snippetBody(request.body, text, pairs) : {};
  if (encoded.contentType && !headers.some(([name]) => name.toLowerCase() === 'content-type')) {
    headers.push(['Content-Type', encoded.contentType]);
  }
  headers.push(...auth.headers);

  return {
    method: request.method,
    url,
    headers,
    ...(encoded.body ? { body: encoded.body } : {}),
    notes,
  };
}

function snippetBody(
  body: RequestBody,
  text: (value: string) => string,
  pairs: (rows: readonly KeyValue[]) => Array<[string, string]>,
): { body?: SnippetBody; contentType?: string } {
  switch (body.mode) {
    case 'none':
      return {};
    case 'json':
      return {
        body: { kind: 'raw', text: stripJsonComments(text(body.text ?? '')) },
        contentType: 'application/json',
      };
    case 'xml':
      return { body: { kind: 'raw', text: text(body.text ?? '') }, contentType: 'application/xml' };
    case 'text':
      return { body: { kind: 'raw', text: text(body.text ?? '') }, contentType: 'text/plain' };
    case 'urlencoded':
      return {
        body: {
          kind: 'raw',
          text: pairs(body.form ?? [])
            .map(([key, value]) => `${encodeComponent(key)}=${encodeComponent(value)}`)
            .join('&'),
        },
        contentType: 'application/x-www-form-urlencoded',
      };
    case 'form':
      // The client library picks the multipart boundary and Content-Type itself.
      return { body: { kind: 'form', fields: pairs(body.form ?? []) } };
    case 'graphql': {
      const query = text(body.graphql?.query ?? '');
      const rawVariables = text(body.graphql?.variables ?? '').trim();
      let variables: unknown = undefined;
      if (rawVariables) {
        try {
          variables = JSON.parse(rawVariables);
        } catch {
          // Variables that still hold `{{name}}` placeholders are not valid JSON yet.
          throw new Error('Variables GraphQL bukan JSON yang valid. Nyalakan "Pakai nilai variabel" atau perbaiki isinya.');
        }
      }
      return {
        body: {
          kind: 'raw',
          text: JSON.stringify(variables === undefined ? { query } : { query, variables }),
        },
        contentType: 'application/json',
      };
    }
  }
}
