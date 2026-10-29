import { createHash, randomBytes } from 'node:crypto';
import type { OAuth2Auth } from '../../model/types';
import { nodeFetch } from '../node-fetch';

export interface TokenResponse {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  tokenType?: string;
  scope?: string;
}

export interface OAuth2Deps {
  fetch?: typeof fetch;
  now?: () => number;
}

export interface PkcePair {
  verifier: string;
  challenge: string;
}

const REFRESH_SKEW_MS = 60_000;

export function createPkcePair(): PkcePair {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

export function buildAuthorizeUrl(
  auth: OAuth2Auth,
  options: { state: string; pkce?: PkcePair },
): string {
  if (!auth.authUrl) throw new Error('OAuth2 authorization_code needs an authorization URL.');
  const url = new URL(auth.authUrl);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', auth.clientId);
  if (auth.redirectUri) url.searchParams.set('redirect_uri', auth.redirectUri);
  if (auth.scope) url.searchParams.set('scope', auth.scope);
  if (auth.audience) url.searchParams.set('audience', auth.audience);
  url.searchParams.set('state', options.state);
  if (options.pkce) {
    url.searchParams.set('code_challenge', options.pkce.challenge);
    url.searchParams.set('code_challenge_method', 'S256');
  }
  return url.toString();
}

function parseTokenPayload(payload: Record<string, unknown>, now: number): TokenResponse {
  const accessToken = typeof payload.access_token === 'string' ? payload.access_token : '';
  if (!accessToken) throw new Error('Token endpoint returned no access_token.');
  const expiresIn = Number(payload.expires_in);
  return {
    accessToken,
    ...(typeof payload.refresh_token === 'string' ? { refreshToken: payload.refresh_token } : {}),
    ...(Number.isFinite(expiresIn) && expiresIn > 0 ? { expiresAt: now + expiresIn * 1000 } : {}),
    ...(typeof payload.token_type === 'string' ? { tokenType: payload.token_type } : {}),
    ...(typeof payload.scope === 'string' ? { scope: payload.scope } : {}),
  };
}

async function postToken(
  auth: OAuth2Auth,
  form: Record<string, string>,
  deps: OAuth2Deps,
): Promise<TokenResponse> {
  if (!auth.tokenUrl) throw new Error('OAuth2 needs a token URL.');
  const doFetch = deps.fetch ?? nodeFetch;
  const now = deps.now ?? Date.now;
  const body = new URLSearchParams(form);
  const headers: Record<string, string> = {
    'content-type': 'application/x-www-form-urlencoded',
    accept: 'application/json',
  };
  if (auth.clientSecret) {
    const basic = Buffer.from(`${auth.clientId}:${auth.clientSecret}`).toString('base64');
    headers.authorization = `Basic ${basic}`;
  }
  const response = await doFetch(auth.tokenUrl, { method: 'POST', headers, body });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Token endpoint responded ${response.status}: ${text.slice(0, 300)}`);
  }
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(text) as Record<string, unknown>;
  } catch {
    payload = Object.fromEntries(new URLSearchParams(text));
  }
  return parseTokenPayload(payload, now());
}

export function clientCredentialsToken(
  auth: OAuth2Auth,
  deps: OAuth2Deps = {},
): Promise<TokenResponse> {
  return postToken(
    auth,
    {
      grant_type: 'client_credentials',
      client_id: auth.clientId,
      ...(auth.clientSecret ? { client_secret: auth.clientSecret } : {}),
      ...(auth.scope ? { scope: auth.scope } : {}),
      ...(auth.audience ? { audience: auth.audience } : {}),
    },
    deps,
  );
}

export function exchangeAuthorizationCode(
  auth: OAuth2Auth,
  options: { code: string; verifier?: string },
  deps: OAuth2Deps = {},
): Promise<TokenResponse> {
  return postToken(
    auth,
    {
      grant_type: 'authorization_code',
      code: options.code,
      client_id: auth.clientId,
      ...(auth.clientSecret ? { client_secret: auth.clientSecret } : {}),
      ...(auth.redirectUri ? { redirect_uri: auth.redirectUri } : {}),
      ...(options.verifier ? { code_verifier: options.verifier } : {}),
    },
    deps,
  );
}

export function refreshAccessToken(
  auth: OAuth2Auth,
  refreshToken: string,
  deps: OAuth2Deps = {},
): Promise<TokenResponse> {
  return postToken(
    auth,
    {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: auth.clientId,
      ...(auth.clientSecret ? { client_secret: auth.clientSecret } : {}),
      ...(auth.scope ? { scope: auth.scope } : {}),
    },
    deps,
  );
}

export function tokenExpired(auth: OAuth2Auth, now: number): boolean {
  return auth.expiresAt !== undefined && auth.expiresAt - REFRESH_SKEW_MS <= now;
}

export interface EnsureTokenResult {
  auth: OAuth2Auth;
  header: string;
  refreshed: boolean;
}

export async function ensureAccessToken(
  auth: OAuth2Auth,
  deps: OAuth2Deps = {},
): Promise<EnsureTokenResult> {
  const now = (deps.now ?? Date.now)();
  const prefix = auth.headerPrefix?.trim() || 'Bearer';
  const usable = auth.accessToken && !tokenExpired(auth, now);
  if (usable) {
    return { auth, header: `${prefix} ${auth.accessToken}`, refreshed: false };
  }

  let token: TokenResponse;
  if (auth.refreshToken) {
    token = await refreshAccessToken(auth, auth.refreshToken, deps);
  } else if (auth.grantType === 'client_credentials') {
    token = await clientCredentialsToken(auth, deps);
  } else {
    throw new Error(
      'OAuth2 authorization_code has no token yet — run "Get token" in the request tab first.',
    );
  }

  const next: OAuth2Auth = {
    ...auth,
    accessToken: token.accessToken,
    ...(token.refreshToken ? { refreshToken: token.refreshToken } : {}),
    ...(token.expiresAt !== undefined ? { expiresAt: token.expiresAt } : {}),
  };
  return { auth: next, header: `${prefix} ${token.accessToken}`, refreshed: true };
}
