import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import type { AuthConfig, AuthKind } from '@/lib/http-client/core';
import { Button } from '@/components/http-client/shared/motion/button/base';
import { VarInput } from './VarInput';
import { CELL } from './lib';

const KINDS: Array<{ value: AuthKind; label: string }> = [
  { value: 'inherit', label: 'Inherit dari induk' },
  { value: 'none', label: 'Tanpa auth' },
  { value: 'bearer', label: 'Bearer token' },
  { value: 'basic', label: 'Basic' },
  { value: 'apiKey', label: 'API Key' },
  { value: 'oauth2', label: 'OAuth 2.0' },
  { value: 'awsSigV4', label: 'AWS Signature v4' },
];

function blank(kind: AuthKind): AuthConfig {
  switch (kind) {
    case 'bearer':
      return { type: 'bearer', token: '' };
    case 'basic':
      return { type: 'basic', username: '', password: '' };
    case 'apiKey':
      return { type: 'apiKey', key: '', value: '', in: 'header' };
    case 'oauth2':
      return {
        type: 'oauth2',
        grantType: 'client_credentials',
        tokenUrl: '',
        clientId: '',
        usePkce: true,
      };
    case 'awsSigV4':
      return {
        type: 'awsSigV4',
        accessKeyId: '',
        secretAccessKey: '',
        region: 'us-east-1',
        service: 'execute-api',
      };
    case 'none':
      return { type: 'none' };
    case 'inherit':
      return { type: 'inherit' };
  }
}

export function AuthEditor({
  auth,
  onChange,
  onFetchToken,
  inheritLabel = 'Inherit dari folder/collection induk',
}: {
  auth: AuthConfig;
  onChange: (next: AuthConfig) => void;
  onFetchToken?: () => void;
  inheritLabel?: string | false;
}) {
  const kinds = KINDS.flatMap((kind) => {
    if (kind.value !== 'inherit') return [kind];
    return inheritLabel === false ? [] : [{ value: kind.value, label: inheritLabel }];
  });
  return (
    <div className="flex flex-col gap-2 text-xs">
      <label className="flex items-center gap-2">
        <span className="w-28 shrink-0 opacity-70">Tipe</span>
        <select
          value={auth.type}
          onChange={(e) => onChange(blank(e.target.value as AuthKind))}
          className="flex-1 rounded border border-[var(--vscode-panel-border)] bg-[var(--vscode-dropdown-background)] px-2 py-1 text-xs text-[var(--vscode-dropdown-foreground)] outline-none"
        >
          {kinds.map((kind) => (
            <option key={kind.value} value={kind.value}>
              {kind.label}
            </option>
          ))}
        </select>
      </label>

      {auth.type === 'bearer' && (
        <Field
          label="Token"
          value={auth.token}
          onChange={(token) => onChange({ ...auth, token })}
        />
      )}

      {auth.type === 'basic' && (
        <>
          <Field
            label="Username"
            value={auth.username}
            onChange={(username) => onChange({ ...auth, username })}
          />
          <Field
            label="Password"
            value={auth.password}
            secret
            onChange={(password) => onChange({ ...auth, password })}
          />
        </>
      )}

      {auth.type === 'apiKey' && (
        <>
          <Field label="Nama" value={auth.key} onChange={(key) => onChange({ ...auth, key })} />
          <Field
            label="Nilai"
            value={auth.value}
            secret
            onChange={(value) => onChange({ ...auth, value })}
          />
          <label className="flex items-center gap-2">
            <span className="w-28 shrink-0 opacity-70">Kirim di</span>
            <select
              value={auth.in}
              onChange={(e) => onChange({ ...auth, in: e.target.value as 'header' | 'query' })}
              className="flex-1 rounded border border-[var(--vscode-panel-border)] bg-[var(--vscode-dropdown-background)] px-2 py-1 text-xs text-[var(--vscode-dropdown-foreground)] outline-none"
            >
              <option value="header">Header</option>
              <option value="query">Query string</option>
            </select>
          </label>
        </>
      )}

      {auth.type === 'oauth2' && (
        <>
          <label className="flex items-center gap-2">
            <span className="w-28 shrink-0 opacity-70">Grant</span>
            <select
              value={auth.grantType}
              onChange={(e) =>
                onChange({
                  ...auth,
                  grantType: e.target.value as 'authorization_code' | 'client_credentials',
                })
              }
              className="flex-1 rounded border border-[var(--vscode-panel-border)] bg-[var(--vscode-dropdown-background)] px-2 py-1 text-xs text-[var(--vscode-dropdown-foreground)] outline-none"
            >
              <option value="client_credentials">Client Credentials</option>
              <option value="authorization_code">Authorization Code</option>
            </select>
          </label>
          {auth.grantType === 'authorization_code' && (
            <>
              <Field
                label="Auth URL"
                value={auth.authUrl ?? ''}
                onChange={(authUrl) => onChange({ ...auth, authUrl })}
              />
              <Field
                label="Redirect URI"
                value={auth.redirectUri ?? ''}
                placeholder="http://127.0.0.1:47830/callback"
                onChange={(redirectUri) => onChange({ ...auth, redirectUri })}
              />
              <label className="flex items-center gap-2">
                <span className="w-28 shrink-0 opacity-70">PKCE</span>
                <input
                  type="checkbox"
                  checked={auth.usePkce !== false}
                  onChange={(e) => onChange({ ...auth, usePkce: e.target.checked })}
                />
              </label>
            </>
          )}
          <Field
            label="Token URL"
            value={auth.tokenUrl}
            onChange={(tokenUrl) => onChange({ ...auth, tokenUrl })}
          />
          <Field
            label="Client ID"
            value={auth.clientId}
            onChange={(clientId) => onChange({ ...auth, clientId })}
          />
          <Field
            label="Client Secret"
            value={auth.clientSecret ?? ''}
            secret
            onChange={(clientSecret) => onChange({ ...auth, clientSecret })}
          />
          <Field
            label="Scope"
            value={auth.scope ?? ''}
            onChange={(scope) => onChange({ ...auth, scope })}
          />
          <Field
            label="Audience"
            value={auth.audience ?? ''}
            onChange={(audience) => onChange({ ...auth, audience })}
          />
          <div className="flex items-center gap-2">
            <span className="w-28 shrink-0 opacity-70">Token</span>
            <span className="flex-1 truncate opacity-60">
              {auth.accessToken
                ? `tersimpan${auth.expiresAt ? ` · kedaluwarsa ${new Date(auth.expiresAt).toLocaleTimeString()}` : ''}`
                : 'belum ada'}
            </span>
            {auth.grantType === 'authorization_code' && onFetchToken && (
              <Button variant="secondary" size="sm" onClick={onFetchToken}>
                Ambil token
              </Button>
            )}
            {auth.accessToken && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const next = { ...auth };
                  delete next.accessToken;
                  delete next.refreshToken;
                  delete next.expiresAt;
                  onChange(next);
                }}
              >
                Hapus
              </Button>
            )}
          </div>
          {auth.grantType === 'client_credentials' && (
            <p className="opacity-60">
              Token diambil & diperbarui otomatis saat Send, disimpan di request ini.
            </p>
          )}
        </>
      )}

      {auth.type === 'awsSigV4' && (
        <>
          <Field
            label="Access Key ID"
            value={auth.accessKeyId}
            onChange={(accessKeyId) => onChange({ ...auth, accessKeyId })}
          />
          <Field
            label="Secret Key"
            value={auth.secretAccessKey}
            secret
            onChange={(secretAccessKey) => onChange({ ...auth, secretAccessKey })}
          />
          <Field
            label="Session Token"
            value={auth.sessionToken ?? ''}
            secret
            onChange={(sessionToken) => onChange({ ...auth, sessionToken })}
          />
          <Field
            label="Region"
            value={auth.region}
            onChange={(region) => onChange({ ...auth, region })}
          />
          <Field
            label="Service"
            value={auth.service}
            onChange={(service) => onChange({ ...auth, service })}
          />
        </>
      )}

      {auth.type === 'inherit' && (
        <p className="opacity-60">Memakai auth folder/collection induknya.</p>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  secret,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  secret?: boolean;
  placeholder?: string;
}) {
  const [reveal, setReveal] = useState(false);
  return (
    <label className="flex items-center gap-2">
      <span className="w-28 shrink-0 opacity-70">{label}</span>
      {secret && !reveal ? (
        <input
          type="password"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={`min-w-0 flex-1 px-2 py-1 text-xs outline-none ${CELL}`}
        />
      ) : (
        <VarInput
          value={value}
          {...(placeholder ? { placeholder } : {})}
          onChange={onChange}
          className={`flex-1 ${CELL}`}
        />
      )}
      {secret && (
        <button
          type="button"
          data-tip={reveal ? 'Sembunyikan' : 'Tampilkan'}
          onClick={() => setReveal(!reveal)}
          className="shrink-0 rounded p-1 opacity-60 hover:opacity-100"
        >
          {reveal ? <EyeOff size={12} /> : <Eye size={12} />}
        </button>
      )}
    </label>
  );
}
