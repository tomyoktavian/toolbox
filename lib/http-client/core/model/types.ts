export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

export const HTTP_METHODS: readonly HttpMethod[] = [
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
  'OPTIONS',
];

export type RequestProtocol = 'rest' | 'ws';

export interface KeyValue {
  key: string;
  value: string;
  enabled: boolean;
  secret?: boolean;
  description?: string;
}

export type OAuth2GrantType = 'authorization_code' | 'client_credentials';

export interface OAuth2Auth {
  type: 'oauth2';
  grantType: OAuth2GrantType;
  authUrl?: string;
  tokenUrl: string;
  clientId: string;
  clientSecret?: string;
  scope?: string;
  redirectUri?: string;
  audience?: string;
  usePkce?: boolean;
  headerPrefix?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
}

export interface AwsSigV4Auth {
  type: 'awsSigV4';
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  region: string;
  service: string;
}

export type AuthConfig =
  | { type: 'none' }
  | { type: 'inherit' }
  | { type: 'bearer'; token: string }
  | { type: 'basic'; username: string; password: string }
  | { type: 'apiKey'; key: string; value: string; in: 'header' | 'query' }
  | OAuth2Auth
  | AwsSigV4Auth;

export type AuthKind = AuthConfig['type'];

export type BodyMode = 'none' | 'json' | 'text' | 'xml' | 'urlencoded' | 'form' | 'graphql';

export interface RequestBody {
  mode: BodyMode;
  text?: string;
  form?: KeyValue[];
  graphql?: { query: string; variables?: string };
}

export interface RequestScripts {
  preRequest?: string;
  postResponse?: string;
}

export interface HttpRequest {
  id: string;
  name: string;
  protocol: RequestProtocol;
  method: HttpMethod;
  url: string;
  description?: string;
  params: KeyValue[];
  headers: KeyValue[];
  body: RequestBody;
  auth: AuthConfig;
  scripts?: RequestScripts;
  wsProtocols?: string[];
  examples?: RequestExample[];
}

export interface RequestExample {
  id: string;
  name: string;
  status: number;
  statusText: string;
  headers: KeyValue[];
  body: string;
  contentType?: string;
  requestBody?: RequestBody;
  createdAt: number;
}

export interface RequestFolder {
  id: string;
  name: string;
  description?: string;
  auth: AuthConfig;
  scripts?: RequestScripts;
  folders: RequestFolder[];
  requests: HttpRequest[];
}

export interface Collection {
  id: string;
  name: string;
  description?: string;
  auth: AuthConfig;
  variables: KeyValue[];
  scripts?: RequestScripts;
  folders: RequestFolder[];
  requests: HttpRequest[];
  updatedAt: number;
}

export interface Environment {
  id: string;
  name: string;
  variables: KeyValue[];
  updatedAt: number;
}

export interface ResponseCookie {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: string;
  httpOnly: boolean;
  secure: boolean;
  sameSite?: string;
}

export interface HttpResponse {
  url: string;
  status: number;
  statusText: string;
  headers: Array<[string, string]>;
  cookies: ResponseCookie[];
  body: string;
  bodyBase64?: string;
  contentType: string;
  sizeBytes: number;
  timeMs: number;
  redirected: boolean;
  truncated: boolean;
}

export interface ResponseHistoryEntry {
  id: string;
  requestId: string;
  at: number;
  method: HttpMethod;
  environmentName?: string;
  testsPassed: number;
  testsTotal: number;
  response: HttpResponse;
}

export type ResponseHistorySummary = Omit<ResponseHistoryEntry, 'response'> &
  Pick<HttpResponse, 'url' | 'status' | 'statusText' | 'timeMs' | 'sizeBytes'>;

export type WsMessageDirection = 'in' | 'out' | 'system';

export interface WsMessage {
  direction: WsMessageDirection;
  at: number;
  data: string;
}

export type WsStatus = 'idle' | 'connecting' | 'open' | 'closed' | 'error';

export interface WsSessionState {
  id: string;
  requestId: string;
  url: string;
  status: WsStatus;
  error?: string;
  messages: WsMessage[];
}

export interface CollectionSummary {
  id: string;
  name: string;
  description?: string;
  updatedAt: number;
  requestCount: number;
}
