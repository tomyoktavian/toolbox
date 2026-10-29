import { createServer, type Server } from 'node:http';

export interface CallbackResult {
  code: string;
  state?: string;
}

const PAGE = (message: string): string =>
  `<!DOCTYPE html><html lang="id"><head><meta charset="utf-8"><title>Silak</title></head><body style="font-family:system-ui;padding:32px"><h3>${message}</h3><p>Tab ini boleh ditutup.</p></body></html>`;

export function parseRedirectUri(redirectUri: string): { port: number; path: string } {
  const url = new URL(redirectUri);
  if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') {
    throw new Error(
      `Redirect URI must point at 127.0.0.1 so Silak can catch the code locally (got ${url.hostname}).`,
    );
  }
  return { port: Number(url.port || '80'), path: url.pathname || '/' };
}

export function awaitAuthorizationCode(
  redirectUri: string,
  expectedState: string,
  timeoutMs = 180_000,
): { promise: Promise<CallbackResult>; cancel: () => void } {
  const { port, path } = parseRedirectUri(redirectUri);
  let server: Server | undefined;
  let timer: NodeJS.Timeout | undefined;

  const cleanup = (): void => {
    if (timer) clearTimeout(timer);
    server?.close();
    server = undefined;
  };

  const promise = new Promise<CallbackResult>((resolve, reject) => {
    server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
      if (url.pathname !== path) {
        res.writeHead(404).end();
        return;
      }
      const error = url.searchParams.get('error');
      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state') ?? undefined;
      if (error) {
        res.writeHead(200, { 'content-type': 'text/html' }).end(PAGE(`Login gagal: ${error}`));
        cleanup();
        reject(new Error(`Authorization failed: ${error}`));
        return;
      }
      if (!code) {
        res.writeHead(400, { 'content-type': 'text/html' }).end(PAGE('Kode tidak ditemukan.'));
        return;
      }
      if (state !== expectedState) {
        res.writeHead(400, { 'content-type': 'text/html' }).end(PAGE('State tidak cocok.'));
        cleanup();
        reject(new Error('Authorization state mismatch — the flow was not the one Silak started.'));
        return;
      }
      res.writeHead(200, { 'content-type': 'text/html' }).end(PAGE('Login berhasil.'));
      cleanup();
      resolve({ code, ...(state ? { state } : {}) });
    });
    server.on('error', (err) => {
      cleanup();
      reject(err);
    });
    server.listen(port, '127.0.0.1');
    timer = setTimeout(() => {
      cleanup();
      reject(new Error('Timed out waiting for the OAuth2 redirect.'));
    }, timeoutMs);
  });

  return { promise, cancel: cleanup };
}
