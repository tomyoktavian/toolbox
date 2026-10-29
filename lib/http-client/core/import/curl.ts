import { createRequest } from '../model/factory';
import { HTTP_METHODS, type HttpMethod, type HttpRequest, type KeyValue } from '../model/types';

export function isCurlCommand(text: string): boolean {
  return /^\s*curl(\s|$)/.test(text);
}

export function tokenizeShell(input: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let inToken = false;
  let quote: '"' | "'" | '$' | undefined;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]!;
    if (quote === "'") {
      if (ch === "'") quote = undefined;
      else current += ch;
      continue;
    }
    if (quote === '$') {
      if (ch === "'") quote = undefined;
      else if (ch === '\\') {
        const next = input[++i] ?? '';
        current += next === 'n' ? '\n' : next === 't' ? '\t' : next === 'r' ? '\r' : next;
      } else current += ch;
      continue;
    }
    if (quote === '"') {
      if (ch === '"') quote = undefined;
      else if (ch === '\\' && /["\\$`\n]/.test(input[i + 1] ?? '')) {
        const next = input[++i]!;
        if (next !== '\n') current += next;
      } else current += ch;
      continue;
    }
    if (ch === '\\') {
      const next = input[i + 1];
      if (next === '\n') {
        i += 1;
        if (input[i + 1] === '\r') i += 1;
        continue;
      }
      if (next === '\r' && input[i + 2] === '\n') {
        i += 2;
        continue;
      }
      current += next ?? '';
      i += 1;
      inToken = true;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      inToken = true;
      continue;
    }
    if (ch === '$' && input[i + 1] === "'") {
      quote = '$';
      i += 1;
      inToken = true;
      continue;
    }
    if (/\s/.test(ch)) {
      if (inToken) tokens.push(current);
      current = '';
      inToken = false;
      continue;
    }
    current += ch;
    inToken = true;
  }
  if (inToken) tokens.push(current);
  return tokens;
}

const DATA_FLAGS = new Set(['-d', '--data', '--data-raw', '--data-binary', '--data-ascii']);
const NO_VALUE_FLAGS = new Set([
  '-L',
  '--location',
  '-k',
  '--insecure',
  '--compressed',
  '-s',
  '--silent',
  '-S',
  '--show-error',
  '-v',
  '--verbose',
  '-i',
  '--include',
  '-I',
  '--head',
  '-G',
  '--get',
  '-f',
  '--fail',
  '--http1.1',
  '--http2',
  '-g',
  '--globoff',
  '-N',
  '--no-buffer',
]);
const IGNORED_VALUE_FLAGS = new Set([
  '-o',
  '--output',
  '-m',
  '--max-time',
  '--connect-timeout',
  '-w',
  '--write-out',
  '--retry',
  '-x',
  '--proxy',
  '--cacert',
  '--cert',
  '--key',
  '-c',
  '--cookie-jar',
  '--limit-rate',
]);

export function parseCurl(text: string): HttpRequest {
  const tokens = tokenizeShell(text.trim());
  const start = tokens.findIndex((token) => token === 'curl');
  if (start === -1) throw new Error('Not a cURL command — it should start with "curl".');
  const args = tokens.slice(start + 1);

  let method: string | undefined;
  let url = '';
  const headers: KeyValue[] = [];
  const data: string[] = [];
  const urlencoded: string[] = [];
  const form: KeyValue[] = [];
  let user: string | undefined;
  let head = false;
  let get = false;

  const take = (flag: string, index: number): string => {
    const value = args[index + 1];
    if (value === undefined) throw new Error(`Flag ${flag} is missing its value.`);
    return value;
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === '-X' || arg === '--request') {
      method = take(arg, i++);
    } else if (arg.startsWith('-X') && arg.length > 2) {
      method = arg.slice(2);
    } else if (arg === '-H' || arg === '--header') {
      const raw = take(arg, i++);
      const colon = raw.indexOf(':');
      if (colon === -1) continue;
      headers.push({
        key: raw.slice(0, colon).trim(),
        value: raw.slice(colon + 1).trim(),
        enabled: true,
      });
    } else if (DATA_FLAGS.has(arg)) {
      data.push(take(arg, i++));
    } else if (arg === '--data-urlencode') {
      urlencoded.push(take(arg, i++));
    } else if (arg === '-F' || arg === '--form' || arg === '--form-string') {
      const raw = take(arg, i++);
      const eq = raw.indexOf('=');
      form.push({
        key: eq === -1 ? raw : raw.slice(0, eq),
        value: eq === -1 ? '' : raw.slice(eq + 1),
        enabled: true,
      });
    } else if (arg === '-u' || arg === '--user') {
      user = take(arg, i++);
    } else if (arg === '-A' || arg === '--user-agent') {
      headers.push({ key: 'User-Agent', value: take(arg, i++), enabled: true });
    } else if (arg === '-e' || arg === '--referer') {
      headers.push({ key: 'Referer', value: take(arg, i++), enabled: true });
    } else if (arg === '-b' || arg === '--cookie') {
      headers.push({ key: 'Cookie', value: take(arg, i++), enabled: true });
    } else if (arg === '--url') {
      url = take(arg, i++);
    } else if (arg === '-I' || arg === '--head') {
      head = true;
    } else if (arg === '-G' || arg === '--get') {
      get = true;
    } else if (NO_VALUE_FLAGS.has(arg)) {
      continue;
    } else if (IGNORED_VALUE_FLAGS.has(arg)) {
      i += 1;
    } else if (arg.startsWith('-') && arg.length > 1) {
      if (args[i + 1] !== undefined && !args[i + 1]!.startsWith('-') && !url) i += 1;
    } else if (!url) {
      url = arg;
    }
  }

  if (!url) throw new Error('No URL found in the cURL command.');
  url = url.replace(/^['"]|['"]$/g, '');

  const contentType = headers.find((h) => h.key.toLowerCase() === 'content-type')?.value ?? '';
  const request = createRequest({ auth: { type: 'none' } });
  request.headers = headers.filter((h) => h.key.toLowerCase() !== 'content-length');

  if (get && (data.length || urlencoded.length)) {
    const query = [...data, ...urlencoded].join('&');
    url += (url.includes('?') ? '&' : '?') + query;
  } else if (form.length) {
    request.body = { mode: 'form', form };
  } else if (data.length || urlencoded.length) {
    const text =
      data.join('&') + (urlencoded.length ? (data.length ? '&' : '') + urlencoded.join('&') : '');
    if (/json/i.test(contentType) || (!contentType && /^\s*[[{]/.test(text))) {
      request.body = { mode: 'json', text };
    } else if (
      /x-www-form-urlencoded/i.test(contentType) ||
      (!contentType && /^[^=&\s]+=[^&]*(&[^=&\s]+=[^&]*)*$/.test(text))
    ) {
      request.body = { mode: 'urlencoded', form: parsePairs(text) };
    } else if (/xml/i.test(contentType)) {
      request.body = { mode: 'xml', text };
    } else {
      request.body = { mode: 'text', text };
    }
  }

  const resolvedMethod = (
    method ?? (head ? 'HEAD' : request.body.mode !== 'none' && !get ? 'POST' : 'GET')
  ).toUpperCase();
  request.method = (HTTP_METHODS as readonly string[]).includes(resolvedMethod)
    ? (resolvedMethod as HttpMethod)
    : 'GET';

  if (user) {
    const colon = user.indexOf(':');
    request.auth = {
      type: 'basic',
      username: colon === -1 ? user : user.slice(0, colon),
      password: colon === -1 ? '' : user.slice(colon + 1),
    };
  }

  const parsedUrl = safeUrl(url);
  request.url = url;
  request.params = parsedUrl
    ? [...parsedUrl.searchParams].map(([key, value]) => ({ key, value, enabled: true }))
    : [];
  request.name = nameFor(request.method, url, parsedUrl);
  return request;
}

function parsePairs(text: string): KeyValue[] {
  return text
    .split('&')
    .filter(Boolean)
    .map((pair) => {
      const eq = pair.indexOf('=');
      const decode = (v: string): string => {
        try {
          return decodeURIComponent(v.replace(/\+/g, ' '));
        } catch {
          return v;
        }
      };
      return {
        key: decode(eq === -1 ? pair : pair.slice(0, eq)),
        value: decode(eq === -1 ? '' : pair.slice(eq + 1)),
        enabled: true,
      };
    });
}

function safeUrl(url: string): URL | undefined {
  try {
    return new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(url) ? url : `http://${url}`);
  } catch {
    return undefined;
  }
}

export function nameFor(method: string, url: string, parsed = safeUrl(url)): string {
  const path = parsed ? decodeURIComponent(parsed.pathname) : url;
  const trimmed = path.replace(/\/+$/, '') || '/';
  return `${method} ${trimmed}`;
}

export function hostOf(url: string): string {
  return safeUrl(url)?.host || 'Imported';
}
