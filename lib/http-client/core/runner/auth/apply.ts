import type { ResolvedAuth } from '../../model/factory';
import { resolveVars, type VarScope } from '../../vars/resolve';
import { ensureAccessToken, type OAuth2Deps } from './oauth2';

export interface PreparedAuth {
  headers: Array<[string, string]>;
  query: Array<[string, string]>;
  updated?: ResolvedAuth;
}

export function resolveAuthVars(auth: ResolvedAuth, scope: VarScope): ResolvedAuth {
  const r = (value: string): string => resolveVars(value, scope);
  switch (auth.type) {
    case 'none':
      return auth;
    case 'bearer':
      return { ...auth, token: r(auth.token) };
    case 'basic':
      return { ...auth, username: r(auth.username), password: r(auth.password) };
    case 'apiKey':
      return { ...auth, key: r(auth.key), value: r(auth.value) };
    case 'oauth2':
      return {
        ...auth,
        tokenUrl: r(auth.tokenUrl),
        clientId: r(auth.clientId),
        ...(auth.authUrl ? { authUrl: r(auth.authUrl) } : {}),
        ...(auth.clientSecret ? { clientSecret: r(auth.clientSecret) } : {}),
        ...(auth.scope ? { scope: r(auth.scope) } : {}),
        ...(auth.audience ? { audience: r(auth.audience) } : {}),
        ...(auth.redirectUri ? { redirectUri: r(auth.redirectUri) } : {}),
      };
    case 'awsSigV4':
      return {
        ...auth,
        accessKeyId: r(auth.accessKeyId),
        secretAccessKey: r(auth.secretAccessKey),
        region: r(auth.region),
        service: r(auth.service),
        ...(auth.sessionToken ? { sessionToken: r(auth.sessionToken) } : {}),
      };
  }
}

export async function prepareAuth(
  auth: ResolvedAuth,
  deps: OAuth2Deps = {},
): Promise<PreparedAuth> {
  switch (auth.type) {
    case 'none':
    case 'awsSigV4':
      return { headers: [], query: [] };
    case 'bearer':
      return auth.token
        ? { headers: [['Authorization', `Bearer ${auth.token}`]], query: [] }
        : { headers: [], query: [] };
    case 'basic': {
      const encoded = Buffer.from(`${auth.username}:${auth.password}`).toString('base64');
      return { headers: [['Authorization', `Basic ${encoded}`]], query: [] };
    }
    case 'apiKey': {
      if (!auth.key) return { headers: [], query: [] };
      return auth.in === 'query'
        ? { headers: [], query: [[auth.key, auth.value]] }
        : { headers: [[auth.key, auth.value]], query: [] };
    }
    case 'oauth2': {
      const result = await ensureAccessToken(auth, deps);
      return {
        headers: [['Authorization', result.header]],
        query: [],
        ...(result.refreshed ? { updated: result.auth } : {}),
      };
    }
  }
}
