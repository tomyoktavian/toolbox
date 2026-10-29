import { randomBytes } from 'node:crypto';
import type { RequestBody } from '../model/types';
import { resolvePairs, resolveVars, type VarScope } from '../vars/resolve';

export interface EncodedBody {
  body?: string;
  contentType?: string;
}

export function encodeBody(body: RequestBody, scope: VarScope): EncodedBody {
  switch (body.mode) {
    case 'none':
      return {};
    case 'json':
      return {
        body: stripJsonComments(resolveVars(body.text ?? '', scope)),
        contentType: 'application/json',
      };
    case 'xml':
      return { body: resolveVars(body.text ?? '', scope), contentType: 'application/xml' };
    case 'text':
      return { body: resolveVars(body.text ?? '', scope), contentType: 'text/plain' };
    case 'urlencoded': {
      const params = new URLSearchParams();
      for (const [key, value] of resolvePairs(body.form ?? [], scope)) params.append(key, value);
      return { body: params.toString(), contentType: 'application/x-www-form-urlencoded' };
    }
    case 'form': {
      const boundary = `----SilakFormBoundary${randomBytes(8).toString('hex')}`;
      const parts = resolvePairs(body.form ?? [], scope).map(
        ([key, value]) =>
          `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`,
      );
      return {
        body: `${parts.join('')}--${boundary}--\r\n`,
        contentType: `multipart/form-data; boundary=${boundary}`,
      };
    }
    case 'graphql': {
      const query = resolveVars(body.graphql?.query ?? '', scope);
      const rawVariables = resolveVars(body.graphql?.variables ?? '', scope).trim();
      let variables: unknown = undefined;
      if (rawVariables) {
        try {
          variables = JSON.parse(rawVariables);
        } catch {
          throw new Error('GraphQL variables must be valid JSON.');
        }
      }
      return {
        body: JSON.stringify(variables === undefined ? { query } : { query, variables }),
        contentType: 'application/json',
      };
    }
  }
}

export function stripJsonComments(text: string): string {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const ch = text[i]!;
    if (ch === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== '"') j += text[j] === '\\' ? 2 : 1;
      out += text.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (ch === '/' && text[i + 1] === '/') {
      const end = text.indexOf('\n', i);
      i = end === -1 ? text.length : end;
      continue;
    }
    if (ch === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      i = end === -1 ? text.length : end + 2;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}
