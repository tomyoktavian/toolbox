import { createCollection, createFolder, createRequest, newId } from '../model/factory';
import type {
  AuthConfig,
  BodyMode,
  Collection,
  Environment,
  HttpMethod,
  KeyValue,
  RequestBody,
  RequestFolder,
  RequestScripts,
  HttpRequest,
  RequestExample,
} from '../model/types';
import { HTTP_METHODS } from '../model/types';

interface RawItem {
  name?: string;
  item?: RawItem[];
  request?: RawRequest | string;
  description?: string;
  auth?: RawAuth;
  event?: RawEvent[];
  response?: RawResponse[];
}

interface RawResponse {
  name?: string;
  code?: number;
  status?: string;
  header?: RawHeader[];
  body?: string;
  originalRequest?: { body?: RawBody };
  _postman_previewlanguage?: string;
}

interface RawEvent {
  listen?: string;
  script?: { exec?: string[] | string };
}

interface RawRequest {
  method?: string;
  url?: RawUrl | string;
  header?: RawHeader[];
  body?: RawBody;
  auth?: RawAuth;
  description?: string;
}

interface RawUrl {
  raw?: string;
  protocol?: string;
  host?: string[] | string;
  path?: Array<string | { value?: string }> | string;
  port?: string;
  query?: RawHeader[];
}

interface RawHeader {
  key?: string;
  value?: string;
  disabled?: boolean;
  enabled?: boolean;
  description?: string;
  type?: string;
}

interface RawBody {
  mode?: string;
  raw?: string;
  urlencoded?: RawHeader[];
  formdata?: RawHeader[];
  graphql?: { query?: string; variables?: string };
  options?: { raw?: { language?: string } };
}

interface RawAuth {
  type?: string;
  bearer?: RawHeader[];
  basic?: RawHeader[];
  apikey?: RawHeader[];
  oauth2?: RawHeader[];
  awsv4?: RawHeader[];
}

export function isPostmanCollection(value: unknown): boolean {
  const root = value as { info?: { schema?: string }; item?: unknown };
  if (!root || typeof root !== 'object') return false;
  if (Array.isArray(root.item) && root.info) return true;
  return typeof root.info?.schema === 'string' && root.info.schema.includes('getpostman.com');
}

export function isPostmanEnvironment(value: unknown): boolean {
  const root = value as { values?: unknown; name?: unknown };
  return Boolean(root && typeof root === 'object' && Array.isArray(root.values));
}

export function importPostmanCollection(source: string | unknown): Collection {
  const root = (typeof source === 'string' ? JSON.parse(source) : source) as {
    info?: { name?: string; description?: unknown };
    item?: RawItem[];
    variable?: RawHeader[];
    auth?: RawAuth;
    event?: RawEvent[];
  };
  if (!isPostmanCollection(root)) {
    throw new Error('Not a Postman Collection (expected an "info" object and an "item" array).');
  }

  const { folders, requests } = splitItems(root.item ?? []);
  const description = descriptionOf(root.info?.description);
  return createCollection({
    name: root.info?.name?.trim() || 'Imported collection',
    auth: convertAuth(root.auth) ?? { type: 'none' },
    variables: (root.variable ?? []).map(toKeyValue),
    folders,
    requests,
    ...(description ? { description } : {}),
    ...(scriptsOf(root.event) ? { scripts: scriptsOf(root.event) } : {}),
  });
}

export function scriptsOf(events: RawEvent[] | undefined): RequestScripts | undefined {
  if (!events?.length) return undefined;
  const pick = (listen: string): string | undefined => {
    const exec = events.find((event) => event.listen === listen)?.script?.exec;
    const code = Array.isArray(exec) ? exec.join('\n') : (exec ?? '');
    return code.trim() ? code : undefined;
  };
  const preRequest = pick('prerequest');
  const postResponse = pick('test');
  if (!preRequest && !postResponse) return undefined;
  return {
    ...(preRequest ? { preRequest } : {}),
    ...(postResponse ? { postResponse } : {}),
  };
}

export function importPostmanEnvironment(source: string | unknown): Environment {
  const root = (typeof source === 'string' ? JSON.parse(source) : source) as {
    name?: string;
    values?: RawHeader[];
  };
  if (!isPostmanEnvironment(root)) {
    throw new Error('Not a Postman environment (expected a "values" array).');
  }
  return {
    id: newId(),
    name: root.name?.trim() || 'Imported environment',
    variables: (root.values ?? []).map(toKeyValue),
    updatedAt: Date.now(),
  };
}

function splitItems(items: readonly RawItem[]): {
  folders: RequestFolder[];
  requests: HttpRequest[];
} {
  const folders: RequestFolder[] = [];
  const requests: HttpRequest[] = [];
  for (const item of items) {
    if (Array.isArray(item.item)) {
      const child = splitItems(item.item);
      const folderScripts = scriptsOf(item.event);
      folders.push(
        createFolder({
          name: item.name?.trim() || 'Folder',
          auth: convertAuth(item.auth) ?? { type: 'inherit' },
          folders: child.folders,
          requests: child.requests,
          ...(folderScripts ? { scripts: folderScripts } : {}),
        }),
      );
    } else if (item.request) {
      requests.push(convertRequest(item));
    }
  }
  return { folders, requests };
}

function convertRequest(item: RawItem): HttpRequest {
  const raw: RawRequest =
    typeof item.request === 'string' ? { method: 'GET', url: item.request } : (item.request ?? {});
  const url = buildUrl(raw.url);
  const protocol = /^wss?:\/\//i.test(url) ? 'ws' : 'rest';
  const description = descriptionOf(raw.description ?? item.description);
  const scripts = scriptsOf(item.event);
  const examples = examplesOf(item.response);
  return createRequest({
    name: item.name?.trim() || url || 'Request',
    protocol,
    method: normalizeMethod(raw.method),
    url,
    params: queryOf(raw.url).map(toKeyValue),
    headers: (raw.header ?? []).map(toKeyValue),
    body: convertBody(raw.body),
    auth: convertAuth(raw.auth) ?? { type: 'inherit' },
    ...(description ? { description } : {}),
    ...(scripts ? { scripts } : {}),
    ...(examples ? { examples } : {}),
  });
}

function examplesOf(responses: readonly RawResponse[] | undefined): RequestExample[] | undefined {
  const examples = (responses ?? []).map((response) => {
    const headers = (response.header ?? []).map(toKeyValue);
    const contentType = headers.find((header) => header.key.toLowerCase() === 'content-type')?.value;
    const requestBody = response.originalRequest?.body
      ? convertBody(response.originalRequest.body)
      : undefined;
    return {
      id: newId(),
      name: response.name?.trim() || `Example ${response.code ?? ''}`.trim(),
      status: response.code ?? 0,
      statusText: response.status ?? '',
      headers,
      body: response.body ?? '',
      ...(contentType ? { contentType } : {}),
      ...(requestBody && requestBody.mode !== 'none' ? { requestBody } : {}),
      createdAt: Date.now(),
    };
  });
  return examples.length > 0 ? examples : undefined;
}

function normalizeMethod(method: string | undefined): HttpMethod {
  const upper = (method ?? 'GET').toUpperCase() as HttpMethod;
  return HTTP_METHODS.includes(upper) ? upper : 'GET';
}

export function buildUrl(url: RawUrl | string | undefined): string {
  if (!url) return '';
  if (typeof url === 'string') return url;
  if (url.raw) return stripQuery(url.raw);
  const host = Array.isArray(url.host) ? url.host.join('.') : (url.host ?? '');
  const path = Array.isArray(url.path)
    ? url.path.map((p) => (typeof p === 'string' ? p : (p.value ?? ''))).join('/')
    : (url.path ?? '');
  const scheme = url.protocol ? `${url.protocol}://` : '';
  const port = url.port ? `:${url.port}` : '';
  const joined = path ? `${host}${port}/${path.replace(/^\//, '')}` : `${host}${port}`;
  return `${scheme}${joined}`;
}

function stripQuery(raw: string): string {
  const index = raw.indexOf('?');
  return index === -1 ? raw : raw.slice(0, index);
}

function queryOf(url: RawUrl | string | undefined): RawHeader[] {
  if (!url) return [];
  if (typeof url === 'string') return parseQueryString(url);
  if (url.query?.length) return url.query;
  return url.raw ? parseQueryString(url.raw) : [];
}

function parseQueryString(raw: string): RawHeader[] {
  const index = raw.indexOf('?');
  if (index === -1) return [];
  return raw
    .slice(index + 1)
    .split('&')
    .filter(Boolean)
    .map((pair) => {
      const eq = pair.indexOf('=');
      return eq === -1
        ? { key: pair, value: '' }
        : { key: pair.slice(0, eq), value: pair.slice(eq + 1) };
    });
}

function convertBody(body: RawBody | undefined): RequestBody {
  if (!body || !body.mode) return { mode: 'none' };
  switch (body.mode) {
    case 'raw': {
      const language = body.options?.raw?.language;
      const mode: BodyMode = language === 'xml' ? 'xml' : language === 'json' ? 'json' : 'text';
      return { mode, text: body.raw ?? '' };
    }
    case 'urlencoded':
      return { mode: 'urlencoded', form: (body.urlencoded ?? []).map(toKeyValue) };
    case 'formdata':
      return { mode: 'form', form: (body.formdata ?? []).map(toKeyValue) };
    case 'graphql':
      return {
        mode: 'graphql',
        graphql: {
          query: body.graphql?.query ?? '',
          ...(body.graphql?.variables ? { variables: body.graphql.variables } : {}),
        },
      };
    default:
      return { mode: 'none' };
  }
}

function pick(entries: RawHeader[] | undefined, key: string): string {
  return entries?.find((entry) => entry.key === key)?.value ?? '';
}

export function convertAuth(auth: RawAuth | undefined): AuthConfig | undefined {
  if (!auth?.type) return undefined;
  switch (auth.type) {
    case 'noauth':
      return { type: 'none' };
    case 'bearer':
      return { type: 'bearer', token: pick(auth.bearer, 'token') };
    case 'basic':
      return {
        type: 'basic',
        username: pick(auth.basic, 'username'),
        password: pick(auth.basic, 'password'),
      };
    case 'apikey': {
      const where = pick(auth.apikey, 'in');
      return {
        type: 'apiKey',
        key: pick(auth.apikey, 'key'),
        value: pick(auth.apikey, 'value'),
        in: where === 'query' ? 'query' : 'header',
      };
    }
    case 'oauth2': {
      const grant = pick(auth.oauth2, 'grant_type');
      const accessToken = pick(auth.oauth2, 'accessToken');
      return {
        type: 'oauth2',
        grantType: grant === 'client_credentials' ? 'client_credentials' : 'authorization_code',
        tokenUrl: pick(auth.oauth2, 'accessTokenUrl'),
        clientId: pick(auth.oauth2, 'clientId'),
        ...(pick(auth.oauth2, 'authUrl') ? { authUrl: pick(auth.oauth2, 'authUrl') } : {}),
        ...(pick(auth.oauth2, 'clientSecret')
          ? { clientSecret: pick(auth.oauth2, 'clientSecret') }
          : {}),
        ...(pick(auth.oauth2, 'scope') ? { scope: pick(auth.oauth2, 'scope') } : {}),
        ...(pick(auth.oauth2, 'redirect_uri')
          ? { redirectUri: pick(auth.oauth2, 'redirect_uri') }
          : {}),
        ...(accessToken ? { accessToken } : {}),
      };
    }
    case 'awsv4':
      return {
        type: 'awsSigV4',
        accessKeyId: pick(auth.awsv4, 'accessKey'),
        secretAccessKey: pick(auth.awsv4, 'secretKey'),
        region: pick(auth.awsv4, 'region') || 'us-east-1',
        service: pick(auth.awsv4, 'service') || 'execute-api',
        ...(pick(auth.awsv4, 'sessionToken')
          ? { sessionToken: pick(auth.awsv4, 'sessionToken') }
          : {}),
      };
    default:
      return undefined;
  }
}

function toKeyValue(entry: RawHeader): KeyValue {
  return {
    key: entry.key ?? '',
    value: entry.value ?? '',
    enabled: entry.disabled !== true && entry.enabled !== false,
    ...(entry.type === 'secret' ? { secret: true } : {}),
    ...(entry.description ? { description: entry.description } : {}),
  };
}

function descriptionOf(value: unknown): string | undefined {
  if (typeof value === 'string') return value.trim() || undefined;
  const content = (value as { content?: unknown } | undefined)?.content;
  return typeof content === 'string' ? content.trim() || undefined : undefined;
}
