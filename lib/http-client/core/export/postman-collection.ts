import type {
  AuthConfig,
  Collection,
  Environment,
  HttpRequest,
  KeyValue,
  RequestBody,
  RequestExample,
  RequestFolder,
  RequestScripts,
} from '../model/types';

const SCHEMA = 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json';

export function exportPostmanCollection(collection: Collection): string {
  return JSON.stringify(
    {
      info: {
        _postman_id: collection.id,
        name: collection.name,
        schema: SCHEMA,
        ...(collection.description ? { description: collection.description } : {}),
      },
      item: [...collection.folders.map(folderItem), ...collection.requests.map(requestItem)],
      ...(collection.auth.type !== 'none' && collection.auth.type !== 'inherit'
        ? { auth: exportAuth(collection.auth) }
        : {}),
      variable: collection.variables.map(exportVariable),
      ...(exportEvents(collection.scripts) ? { event: exportEvents(collection.scripts) } : {}),
    },
    null,
    2,
  );
}

export function exportPostmanEnvironment(environment: Environment): string {
  return JSON.stringify(
    {
      id: environment.id,
      name: environment.name,
      values: environment.variables.map((v) => ({
        key: v.key,
        value: v.value,
        enabled: v.enabled,
        type: v.secret ? 'secret' : 'default',
      })),
      _postman_variable_scope: 'environment',
    },
    null,
    2,
  );
}

function folderItem(folder: RequestFolder): unknown {
  return {
    name: folder.name,
    item: [...folder.folders.map(folderItem), ...folder.requests.map(requestItem)],
    ...(folder.auth.type !== 'inherit' ? { auth: exportAuth(folder.auth) } : {}),
    ...(exportEvents(folder.scripts) ? { event: exportEvents(folder.scripts) } : {}),
  };
}

function exportEvents(scripts: RequestScripts | undefined): unknown[] | undefined {
  if (!scripts) return undefined;
  const events: unknown[] = [];
  if (scripts.preRequest?.trim()) {
    events.push({
      listen: 'prerequest',
      script: { type: 'text/javascript', exec: scripts.preRequest.split('\n') },
    });
  }
  if (scripts.postResponse?.trim()) {
    events.push({
      listen: 'test',
      script: { type: 'text/javascript', exec: scripts.postResponse.split('\n') },
    });
  }
  return events.length ? events : undefined;
}

function requestItem(request: HttpRequest): unknown {
  const requestBase = {
    method: request.method,
    header: request.headers.map(exportHeader),
    url: exportUrl(request),
    ...(request.auth.type !== 'inherit' ? { auth: exportAuth(request.auth) } : {}),
    ...(request.description ? { description: request.description } : {}),
  };
  return {
    name: request.name,
    request: { ...requestBase, ...exportBody(request.body) },
    response: (request.examples ?? []).map((example) =>
      exampleItem(example, { ...requestBase, ...exportBody(example.requestBody ?? request.body) }),
    ),
    ...(exportEvents(request.scripts) ? { event: exportEvents(request.scripts) } : {}),
  };
}

function exampleItem(example: RequestExample, originalRequest: unknown): unknown {
  return {
    name: example.name,
    originalRequest,
    status: example.statusText,
    code: example.status,
    header: example.headers.map(exportHeader),
    body: example.body,
    ...(example.contentType ? { _postman_previewlanguage: previewLanguageOf(example.contentType) } : {}),
  };
}

function previewLanguageOf(contentType: string): string {
  const type = contentType.toLowerCase();
  if (type.includes('json')) return 'json';
  if (type.includes('html')) return 'html';
  if (type.includes('xml')) return 'xml';
  return 'text';
}

function exportUrl(request: HttpRequest): unknown {
  const query = request.params.map(exportHeader);
  const search = request.params
    .filter((p) => p.enabled)
    .map((p) => `${p.key}=${p.value}`)
    .join('&');
  return {
    raw: search ? `${request.url}?${search}` : request.url,
    ...(query.length ? { query } : {}),
  };
}

function exportBody(body: RequestBody): Record<string, unknown> {
  switch (body.mode) {
    case 'none':
      return {};
    case 'json':
      return {
        body: { mode: 'raw', raw: body.text ?? '', options: { raw: { language: 'json' } } },
      };
    case 'xml':
      return { body: { mode: 'raw', raw: body.text ?? '', options: { raw: { language: 'xml' } } } };
    case 'text':
      return {
        body: { mode: 'raw', raw: body.text ?? '', options: { raw: { language: 'text' } } },
      };
    case 'urlencoded':
      return { body: { mode: 'urlencoded', urlencoded: (body.form ?? []).map(exportHeader) } };
    case 'form':
      return { body: { mode: 'formdata', formdata: (body.form ?? []).map(exportHeader) } };
    case 'graphql':
      return {
        body: {
          mode: 'graphql',
          graphql: {
            query: body.graphql?.query ?? '',
            variables: body.graphql?.variables ?? '',
          },
        },
      };
  }
}

export function exportAuth(auth: AuthConfig): unknown {
  switch (auth.type) {
    case 'none':
    case 'inherit':
      return { type: 'noauth' };
    case 'bearer':
      return { type: 'bearer', bearer: [{ key: 'token', value: auth.token, type: 'string' }] };
    case 'basic':
      return {
        type: 'basic',
        basic: [
          { key: 'username', value: auth.username, type: 'string' },
          { key: 'password', value: auth.password, type: 'string' },
        ],
      };
    case 'apiKey':
      return {
        type: 'apikey',
        apikey: [
          { key: 'key', value: auth.key, type: 'string' },
          { key: 'value', value: auth.value, type: 'string' },
          { key: 'in', value: auth.in, type: 'string' },
        ],
      };
    case 'oauth2':
      return {
        type: 'oauth2',
        oauth2: [
          { key: 'grant_type', value: auth.grantType, type: 'string' },
          { key: 'accessTokenUrl', value: auth.tokenUrl, type: 'string' },
          { key: 'clientId', value: auth.clientId, type: 'string' },
          { key: 'authUrl', value: auth.authUrl ?? '', type: 'string' },
          { key: 'clientSecret', value: auth.clientSecret ?? '', type: 'string' },
          { key: 'scope', value: auth.scope ?? '', type: 'string' },
          { key: 'redirect_uri', value: auth.redirectUri ?? '', type: 'string' },
        ],
      };
    case 'awsSigV4':
      return {
        type: 'awsv4',
        awsv4: [
          { key: 'accessKey', value: auth.accessKeyId, type: 'string' },
          { key: 'secretKey', value: auth.secretAccessKey, type: 'string' },
          { key: 'region', value: auth.region, type: 'string' },
          { key: 'service', value: auth.service, type: 'string' },
          { key: 'sessionToken', value: auth.sessionToken ?? '', type: 'string' },
        ],
      };
  }
}

function exportHeader(item: KeyValue): unknown {
  return {
    key: item.key,
    value: item.value,
    ...(item.enabled ? {} : { disabled: true }),
    ...(item.description ? { description: item.description } : {}),
  };
}

function exportVariable(item: KeyValue): unknown {
  return { key: item.key, value: item.value, ...(item.enabled ? {} : { disabled: true }) };
}
