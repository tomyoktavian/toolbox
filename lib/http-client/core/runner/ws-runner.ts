import { authChain } from '../model/factory';
import type {
  Collection,
  Environment,
  HttpRequest,
  KeyValue,
  WsMessage,
  WsSessionState,
} from '../model/types';
import type { WsConnect, WsSocketHandle } from '../ports/socket';
import { missingVars, resolvePairs, resolveVars, scopeFor } from '../vars/resolve';
import { prepareAuth, resolveAuthVars } from './auth/apply';
import { appendMissingParams, parseRequestUrl } from './rest-runner';

export const DEFAULT_WS_HISTORY = 500;
const RECONNECT_DELAYS_MS = [1_000, 2_000, 5_000, 10_000];

export interface WsOpenContext {
  collection?: Collection;
  environment?: Environment;
  globals?: readonly KeyValue[];
  folderPath?: readonly string[];
  autoReconnect?: boolean;
}

export interface WsRunnerDeps {
  connect: WsConnect;
  now?: () => number;
  schedule?: (fn: () => void, delayMs: number) => void;
  maxMessages?: number;
}

interface Live {
  state: WsSessionState;
  socket?: WsSocketHandle;
  ctx: WsOpenContext;
  request: HttpRequest;
  attempt: number;
  closedByUser: boolean;
}

export class WsRunner {
  private readonly sessions = new Map<string, Live>();
  private readonly listeners = new Set<(state: WsSessionState) => void>();
  private readonly now: () => number;
  private readonly schedule: (fn: () => void, delayMs: number) => void;
  private readonly maxMessages: number;

  constructor(private readonly deps: WsRunnerDeps) {
    this.now = deps.now ?? Date.now;
    this.schedule = deps.schedule ?? ((fn, delay) => void setTimeout(fn, delay));
    this.maxMessages = deps.maxMessages ?? DEFAULT_WS_HISTORY;
  }

  onChange(listener: (state: WsSessionState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  state(requestId: string): WsSessionState | undefined {
    return this.sessions.get(requestId)?.state;
  }

  async open(request: HttpRequest, ctx: WsOpenContext = {}): Promise<WsSessionState> {
    this.close(request.id);
    const live: Live = {
      state: {
        id: `${request.id}:${this.now()}`,
        requestId: request.id,
        url: '',
        status: 'connecting',
        messages: [],
      },
      ctx,
      request,
      attempt: 0,
      closedByUser: false,
    };
    this.sessions.set(request.id, live);
    await this.dial(live);
    return live.state;
  }

  send(requestId: string, data: string): boolean {
    const live = this.sessions.get(requestId);
    if (!live?.socket || live.state.status !== 'open') return false;
    live.socket.send(data);
    this.record(live, { direction: 'out', at: this.now(), data });
    return true;
  }

  close(requestId: string): void {
    const live = this.sessions.get(requestId);
    if (!live) return;
    live.closedByUser = true;
    live.socket?.close(1000, 'closed by user');
    live.socket = undefined;
    if (live.state.status !== 'closed') {
      live.state.status = 'closed';
      this.record(live, { direction: 'system', at: this.now(), data: 'Connection closed.' });
    }
  }

  clear(requestId: string): void {
    const live = this.sessions.get(requestId);
    if (!live) return;
    live.state.messages = [];
    this.emit(live);
  }

  dispose(): void {
    for (const requestId of [...this.sessions.keys()]) this.close(requestId);
    this.sessions.clear();
    this.listeners.clear();
  }

  private async dial(live: Live): Promise<void> {
    const { request, ctx } = live;
    const scope = scopeFor(ctx.collection, ctx.environment, ctx.globals);
    let url: string;
    const headers: Record<string, string> = {};
    try {
      const parsed = parseRequestUrl(
        resolveVars(request.url, scope),
        'ws',
        missingVars(request.url, scope),
      );
      if (parsed.protocol === 'http:') parsed.protocol = 'ws:';
      if (parsed.protocol === 'https:') parsed.protocol = 'wss:';
      appendMissingParams(parsed, resolvePairs(request.params, scope));
      for (const [key, value] of resolvePairs(request.headers, scope)) headers[key] = value;
      const chained = ctx.collection
        ? authChain(ctx.collection, ctx.folderPath ?? [], request).auth
        : request.auth.type === 'inherit'
          ? ({ type: 'none' } as const)
          : request.auth;
      const prepared = await prepareAuth(resolveAuthVars(chained, scope));
      for (const [key, value] of prepared.headers) headers[key] = value;
      for (const [key, value] of prepared.query) parsed.searchParams.append(key, value);
      url = parsed.toString();
    } catch (error) {
      live.state.status = 'error';
      live.state.error = error instanceof Error ? error.message : String(error);
      this.record(live, {
        direction: 'system',
        at: this.now(),
        data: `Error: ${live.state.error}`,
      });
      return;
    }

    live.state.url = url;
    live.state.status = 'connecting';
    delete live.state.error;
    this.record(live, { direction: 'system', at: this.now(), data: `Connecting to ${url}…` });

    live.socket = this.deps.connect(
      url,
      {
        headers,
        ...(request.wsProtocols?.length ? { protocols: request.wsProtocols } : {}),
      },
      {
        onOpen: () => {
          live.attempt = 0;
          live.state.status = 'open';
          this.record(live, { direction: 'system', at: this.now(), data: 'Connected.' });
        },
        onMessage: (data) => this.record(live, { direction: 'in', at: this.now(), data }),
        onClose: (code, reason) => {
          live.socket = undefined;
          live.state.status = 'closed';
          this.record(live, {
            direction: 'system',
            at: this.now(),
            data: `Closed (${code})${reason ? `: ${reason}` : ''}.`,
          });
          this.maybeReconnect(live);
        },
        onError: (message) => {
          live.state.status = 'error';
          live.state.error = message;
          this.record(live, { direction: 'system', at: this.now(), data: `Error: ${message}` });
        },
      },
    );
  }

  private maybeReconnect(live: Live): void {
    if (live.closedByUser || !live.ctx.autoReconnect) return;
    const delay =
      RECONNECT_DELAYS_MS[Math.min(live.attempt, RECONNECT_DELAYS_MS.length - 1)] ?? 10_000;
    live.attempt += 1;
    if (live.attempt > RECONNECT_DELAYS_MS.length) {
      this.record(live, {
        direction: 'system',
        at: this.now(),
        data: 'Reconnect gave up after 4 attempts.',
      });
      return;
    }
    this.record(live, {
      direction: 'system',
      at: this.now(),
      data: `Reconnecting in ${Math.round(delay / 1000)} s (attempt ${live.attempt})…`,
    });
    this.schedule(() => {
      if (live.closedByUser || this.sessions.get(live.request.id) !== live) return;
      void this.dial(live);
    }, delay);
  }

  private record(live: Live, message: WsMessage): void {
    live.state.messages.push(message);
    if (live.state.messages.length > this.maxMessages) {
      live.state.messages.splice(0, live.state.messages.length - this.maxMessages);
    }
    this.emit(live);
  }

  private emit(live: Live): void {
    for (const listener of this.listeners) listener(live.state);
  }
}
