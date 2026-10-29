import { createCollection, createFolder, createRequest } from '../model/factory';
import type {
  AuthConfig,
  Collection,
  HttpMethod,
  KeyValue,
  RequestBody,
  RequestFolder,
  HttpRequest,
} from '../model/types';
import { HTTP_METHODS } from '../model/types';

type Json = Record<string, unknown>;

const METHOD_KEYS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch'] as const;
const MAX_SCHEMA_DEPTH = 6;

export function isOpenApiDocument(value: unknown): boolean {
  const root = value as { swagger?: unknown; openapi?: unknown; paths?: unknown } | undefined;
  if (!root || typeof root !== 'object') return false;
  return (
    (typeof root.swagger === 'string' || typeof root.openapi === 'string') &&
    typeof root.paths === 'object'
  );
}

export function importOpenApi(source: string | unknown): Collection {
  const root = (typeof source === 'string' ? JSON.parse(source) : source) as Json;
  if (!isOpenApiDocument(root)) {
    throw new Error('Not an OpenAPI/Swagger document (needs "openapi" or "swagger" plus "paths").');
  }
  const v3 = typeof root.openapi === 'string';
  const info = (root.info ?? {}) as Json;
  const baseUrl = resolveBaseUrl(root, v3);

  const byTag = new Map<string, HttpRequest[]>();
  const untagged: HttpRequest[] = [];
  const paths = (root.paths ?? {}) as Json;

  for (const [path, rawItem] of Object.entries(paths)) {
    const item = deref(root, rawItem) as Json | undefined;
    if (!item) continue;
    const shared = Array.isArray(item.parameters) ? (item.parameters as unknown[]) : [];
    for (const method of METHOD_KEYS) {
      const operation = item[method] as Json | undefined;
      if (!operation || typeof operation !== 'object') continue;
      const request = buildRequest(root, v3, path, method, operation, shared);
      const tag = Array.isArray(operation.tags) ? String(operation.tags[0] ?? '') : '';
      if (tag) {
        const bucket = byTag.get(tag);
        if (bucket) bucket.push(request);
        else byTag.set(tag, [request]);
      } else {
        untagged.push(request);
      }
    }
  }

  const folders: RequestFolder[] = [...byTag.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, requests]) => createFolder({ name, requests }));

  const variables: KeyValue[] = [{ key: 'baseUrl', value: baseUrl, enabled: true }];
  const description = typeof info.description === 'string' ? info.description.trim() : '';

  return createCollection({
    name: typeof info.title === 'string' && info.title.trim() ? info.title.trim() : 'Imported API',
    auth: resolveSecurity(root, v3),
    variables,
    folders,
    requests: untagged,
    ...(description ? { description } : {}),
  });
}

function resolveBaseUrl(root: Json, v3: boolean): string {
  if (v3) {
    const servers = Array.isArray(root.servers) ? (root.servers as Json[]) : [];
    const first = servers[0];
    let url = typeof first?.url === 'string' ? first.url : '';
    const vars = (first?.variables ?? {}) as Json;
    for (const [name, raw] of Object.entries(vars)) {
      const value = (raw as Json)?.default;
      if (typeof value === 'string') url = url.split(`{${name}}`).join(value);
    }
    return url.replace(/\/$/, '') || 'http://localhost';
  }
  const schemes = Array.isArray(root.schemes) ? (root.schemes as string[]) : [];
  const scheme = schemes.includes('https') ? 'https' : (schemes[0] ?? 'https');
  const host = typeof root.host === 'string' ? root.host : 'localhost';
  const basePath = typeof root.basePath === 'string' ? root.basePath : '';
  return `${scheme}://${host}${basePath}`.replace(/\/$/, '');
}

function buildRequest(
  root: Json,
  v3: boolean,
  path: string,
  method: string,
  operation: Json,
  sharedParameters: readonly unknown[],
): HttpRequest {
  const parameters = [
    ...sharedParameters,
    ...(Array.isArray(operation.parameters) ? operation.parameters : []),
  ]
    .map((p) => deref(root, p) as Json | undefined)
    .filter((p): p is Json => Boolean(p));

  const params: KeyValue[] = [];
  const headers: KeyValue[] = [];
  let urlPath = path;

  for (const parameter of parameters) {
    const name = String(parameter.name ?? '');
    if (!name) continue;
    const where = String(parameter.in ?? '');
    const example = scalarExample(root, parameter, v3);
    if (where === 'query') {
      params.push({
        key: name,
        value: example,
        enabled: parameter.required === true,
        ...(typeof parameter.description === 'string'
          ? { description: parameter.description }
          : {}),
      });
    } else if (where === 'header') {
      headers.push({ key: name, value: example, enabled: parameter.required === true });
    } else if (where === 'path') {
      urlPath = urlPath.split(`{${name}}`).join(`:${name}`);
    }
  }

  const { body, contentType } = buildBody(root, v3, operation, parameters);
  if (contentType && !headers.some((h) => h.key.toLowerCase() === 'content-type')) {
    headers.push({ key: 'Content-Type', value: contentType, enabled: true });
  }

  const upper = method.toUpperCase() as HttpMethod;
  const summary =
    typeof operation.summary === 'string' && operation.summary.trim()
      ? operation.summary.trim()
      : typeof operation.operationId === 'string' && operation.operationId
        ? operation.operationId
        : `${upper} ${path}`;
  const description = typeof operation.description === 'string' ? operation.description.trim() : '';

  return createRequest({
    name: summary,
    method: HTTP_METHODS.includes(upper) ? upper : 'GET',
    url: `{{baseUrl}}${urlPath}`,
    params,
    headers,
    body,
    auth: { type: 'inherit' },
    ...(description ? { description } : {}),
  });
}

function buildBody(
  root: Json,
  v3: boolean,
  operation: Json,
  parameters: readonly Json[],
): { body: RequestBody; contentType?: string } {
  if (v3) {
    const requestBody = deref(root, operation.requestBody) as Json | undefined;
    const content = (requestBody?.content ?? {}) as Json;
    const jsonKey = Object.keys(content).find((key) => key.includes('json'));
    if (jsonKey) {
      const media = deref(root, content[jsonKey]) as Json | undefined;
      const schema = deref(root, media?.schema) as Json | undefined;
      return {
        body: { mode: 'json', text: JSON.stringify(exampleFor(root, schema, 0), null, 2) },
        contentType: 'application/json',
      };
    }
    const formKey = Object.keys(content).find((key) => key.includes('form'));
    if (formKey) {
      const media = deref(root, content[formKey]) as Json | undefined;
      const schema = deref(root, media?.schema) as Json | undefined;
      return {
        body: { mode: 'urlencoded', form: formFields(root, schema) },
        contentType: 'application/x-www-form-urlencoded',
      };
    }
    return { body: { mode: 'none' } };
  }

  const bodyParam = parameters.find((p) => p.in === 'body');
  if (bodyParam) {
    const schema = deref(root, bodyParam.schema) as Json | undefined;
    return {
      body: { mode: 'json', text: JSON.stringify(exampleFor(root, schema, 0), null, 2) },
      contentType: 'application/json',
    };
  }
  const formParams = parameters.filter((p) => p.in === 'formData');
  if (formParams.length > 0) {
    return {
      body: {
        mode: 'urlencoded',
        form: formParams.map((p) => ({
          key: String(p.name ?? ''),
          value: scalarExample(root, p, false),
          enabled: true,
        })),
      },
      contentType: 'application/x-www-form-urlencoded',
    };
  }
  return { body: { mode: 'none' } };
}

function formFields(root: Json, schema: Json | undefined): KeyValue[] {
  const example = exampleFor(root, schema, 0);
  if (!example || typeof example !== 'object' || Array.isArray(example)) return [];
  return Object.entries(example as Json).map(([key, value]) => ({
    key,
    value: typeof value === 'string' ? value : JSON.stringify(value),
    enabled: true,
  }));
}

function scalarExample(root: Json, parameter: Json, v3: boolean): string {
  if (parameter.example !== undefined) return String(parameter.example);
  const schema = v3
    ? ((deref(root, parameter.schema) as Json | undefined) ?? {})
    : (parameter as Json);
  const value = exampleFor(root, schema, MAX_SCHEMA_DEPTH - 1);
  if (value === null || value === undefined) return '';
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

export function exampleFor(root: Json, schema: Json | undefined, depth: number): unknown {
  if (!schema || depth > MAX_SCHEMA_DEPTH) return null;
  const node = deref(root, schema) as Json | undefined;
  if (!node) return null;

  if (node.example !== undefined) return node.example;
  if (node.default !== undefined) return node.default;
  if (Array.isArray(node.enum) && node.enum.length > 0) return node.enum[0];

  if (Array.isArray(node.allOf)) {
    const merged: Json = {};
    for (const part of node.allOf) {
      const value = exampleFor(root, part as Json, depth + 1);
      if (value && typeof value === 'object' && !Array.isArray(value)) Object.assign(merged, value);
    }
    return merged;
  }
  const variant = (node.oneOf ?? node.anyOf) as unknown[] | undefined;
  if (Array.isArray(variant) && variant.length > 0) {
    return exampleFor(root, variant[0] as Json, depth + 1);
  }

  const type = typeof node.type === 'string' ? node.type : node.properties ? 'object' : 'string';
  switch (type) {
    case 'object': {
      const properties = (node.properties ?? {}) as Json;
      const out: Json = {};
      for (const [key, value] of Object.entries(properties)) {
        out[key] = exampleFor(root, value as Json, depth + 1);
      }
      return out;
    }
    case 'array':
      return [exampleFor(root, node.items as Json, depth + 1)];
    case 'integer':
    case 'number':
      return 0;
    case 'boolean':
      return true;
    case 'null':
      return null;
    default:
      return node.format === 'date-time' ? new Date(0).toISOString() : 'string';
  }
}

export function deref(root: Json, node: unknown, seen = new Set<string>()): unknown {
  if (!node || typeof node !== 'object') return node;
  const ref = (node as Json).$ref;
  if (typeof ref !== 'string') return node;
  if (!ref.startsWith('#/') || seen.has(ref)) return {};
  seen.add(ref);
  let current: unknown = root;
  for (const segment of ref.slice(2).split('/')) {
    const key = segment.replace(/~1/g, '/').replace(/~0/g, '~');
    if (!current || typeof current !== 'object') return {};
    current = (current as Json)[key];
  }
  return deref(root, current, seen);
}

function resolveSecurity(root: Json, v3: boolean): AuthConfig {
  const schemes = v3
    ? (((root.components as Json | undefined)?.securitySchemes ?? {}) as Json)
    : ((root.securityDefinitions ?? {}) as Json);
  const first = Object.values(schemes)[0] as Json | undefined;
  if (!first) return { type: 'none' };

  const type = String(first.type ?? '').toLowerCase();
  if (type === 'http') {
    const scheme = String(first.scheme ?? '').toLowerCase();
    if (scheme === 'basic') return { type: 'basic', username: '', password: '' };
    return { type: 'bearer', token: '' };
  }
  if (type === 'apikey') {
    return {
      type: 'apiKey',
      key: String(first.name ?? 'X-API-Key'),
      value: '',
      in: first.in === 'query' ? 'query' : 'header',
    };
  }
  if (type === 'oauth2') {
    const flows = (first.flows ?? {}) as Json;
    const clientCredentials = flows.clientCredentials as Json | undefined;
    const authorizationCode = flows.authorizationCode as Json | undefined;
    const tokenUrl =
      (typeof clientCredentials?.tokenUrl === 'string' ? clientCredentials.tokenUrl : '') ||
      (typeof authorizationCode?.tokenUrl === 'string' ? authorizationCode.tokenUrl : '') ||
      (typeof first.tokenUrl === 'string' ? first.tokenUrl : '');
    const authUrl =
      (typeof authorizationCode?.authorizationUrl === 'string'
        ? authorizationCode.authorizationUrl
        : '') || (typeof first.authorizationUrl === 'string' ? first.authorizationUrl : '');
    return {
      type: 'oauth2',
      grantType:
        clientCredentials && !authorizationCode ? 'client_credentials' : 'authorization_code',
      tokenUrl,
      clientId: '',
      ...(authUrl ? { authUrl } : {}),
    };
  }
  if (type === 'basic') return { type: 'basic', username: '', password: '' };
  return { type: 'none' };
}
