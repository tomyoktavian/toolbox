import { randomUUID } from "node:crypto";

/** One request for the Local Proxy to run on the user's machine. */
export interface AgentJob {
  id: string;
  method: string;
  url: string;
  headers: Array<[string, string]>;
  bodyBase64?: string;
  redirect: "follow" | "manual";
  timeoutMs: number;
}

export type AgentResult =
  | {
      id: string;
      ok: true;
      status: number;
      statusText: string;
      headers: Array<[string, string]>;
      bodyBase64: string;
      url: string;
      redirected: boolean;
    }
  | { id: string; ok: false; error: string };

interface Pending {
  resolve: (result: AgentResult) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface Channel {
  queue: AgentJob[];
  wakers: Set<() => void>;
  lastSeen: number;
  pending: Map<string, Pending>;
}

/** How long a poll waits for work before answering "nothing"; the agent polls again straight away. */
export const POLL_WINDOW_MS = 20_000;
// An agent is "connected" while it keeps polling: one window plus slack for the round trip.
const ALIVE_MS = POLL_WINDOW_MS + 10_000;
const DEFAULT_TIMEOUT_MS = 120_000;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

// On globalThis, like the runtime: route modules may be loaded more than once in dev.
function channels(): Map<string, Channel> {
  const holder = globalThis as unknown as Record<string, Map<string, Channel> | undefined>;
  return (holder.__httpClientAgentChannels ??= new Map());
}

function channelFor(token: string): Channel {
  const all = channels();
  let channel = all.get(token);
  if (!channel) {
    channel = { queue: [], wakers: new Set(), lastSeen: 0, pending: new Map() };
    all.set(token, channel);
  }
  return channel;
}

/** The pairing token from a header value, or undefined when it is missing or malformed. */
export function parseAgentToken(value: string | null | undefined): string | undefined {
  const token = value?.trim();
  return token && TOKEN_PATTERN.test(token) ? token : undefined;
}

export function agentConnected(token: string | undefined): boolean {
  if (!token) return false;
  const channel = channels().get(token);
  return Boolean(channel && Date.now() - channel.lastSeen < ALIVE_MS);
}

/**
 * The agent asks for work. Answers with the next job, or undefined once the window passes. A window
 * of 0 answers at once: the agent's first call uses it, so "connected" shows without a 20 s wait.
 */
export async function agentPoll(
  token: string,
  signal: AbortSignal,
  windowMs = POLL_WINDOW_MS,
): Promise<AgentJob | undefined> {
  const channel = channelFor(token);
  channel.lastSeen = Date.now();
  if (channel.queue.length === 0 && windowMs > 0 && !signal.aborted) {
    await new Promise<void>((resolve) => {
      const done = (): void => {
        clearTimeout(timer);
        signal.removeEventListener("abort", done);
        channel.wakers.delete(done);
        resolve();
      };
      const timer = setTimeout(done, windowMs);
      signal.addEventListener("abort", done, { once: true });
      channel.wakers.add(done);
    });
  }
  channel.lastSeen = Date.now();
  return channel.queue.shift();
}

/** The agent hands back what a job produced. False when nobody is waiting for it any more. */
export function agentRespond(token: string, result: AgentResult): boolean {
  const pending = channels().get(token)?.pending.get(result.id);
  if (!pending) return false;
  clearTimeout(pending.timer);
  channels().get(token)?.pending.delete(result.id);
  pending.resolve(result);
  return true;
}

function bodyBase64(body: RequestInit["body"]): string | undefined {
  if (body === null || body === undefined) return undefined;
  if (typeof body === "string") return Buffer.from(body, "utf8").toString("base64");
  if (body instanceof URLSearchParams) return Buffer.from(body.toString(), "utf8").toString("base64");
  if (body instanceof ArrayBuffer) return Buffer.from(body).toString("base64");
  if (ArrayBuffer.isView(body)) {
    return Buffer.from(body.buffer, body.byteOffset, body.byteLength).toString("base64");
  }
  throw new TypeError("Unsupported request body type for the Local Proxy.");
}

function headerPairs(init: RequestInit["headers"]): Array<[string, string]> {
  if (!init) return [];
  if (init instanceof Headers) return [...init.entries()];
  if (Array.isArray(init)) return init.map(([key, value]) => [key, value]);
  return Object.entries(init).flatMap(([key, value]) =>
    value === undefined ? [] : [[key, value] as [string, string]],
  );
}

/**
 * Sends a request through the user's Local Proxy and returns what came back as a Response, the same
 * shape the runner gets from its normal fetch (`url` and `redirected` included).
 */
export function fetchViaAgent(
  token: string,
  url: string,
  init: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  const channel = channelFor(token);
  const encodedBody = bodyBase64(init.body);
  const job: AgentJob = {
    id: randomUUID(),
    method: (init.method ?? "GET").toUpperCase(),
    url,
    headers: headerPairs(init.headers),
    ...(encodedBody !== undefined ? { bodyBase64: encodedBody } : {}),
    redirect: init.redirect === "manual" ? "manual" : "follow",
    timeoutMs,
  };
  const signal = init.signal ?? undefined;

  return new Promise<Response>((resolve, reject) => {
    const settle = (): void => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      channel.pending.delete(job.id);
      const queued = channel.queue.indexOf(job);
      if (queued !== -1) channel.queue.splice(queued, 1);
    };
    const onAbort = (): void => {
      settle();
      reject(signal?.reason instanceof Error ? signal.reason : new Error("Aborted"));
    };
    // The agent enforces timeoutMs itself; this one covers an agent that vanished mid-request.
    const timer = setTimeout(() => {
      settle();
      reject(new Error("Local Proxy tidak menjawab. Pastikan prosesnya masih berjalan di komputer Anda."));
    }, timeoutMs + 10_000);
    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener("abort", onAbort, { once: true });

    channel.pending.set(job.id, {
      timer,
      reject,
      resolve: (result) => {
        settle();
        if (!result.ok) {
          reject(new Error(result.error));
          return;
        }
        const bodiless = result.status < 200 || [204, 205, 304].includes(result.status);
        const response = new Response(
          bodiless ? null : (Buffer.from(result.bodyBase64, "base64") as unknown as BodyInit),
          { status: result.status, statusText: result.statusText, headers: result.headers },
        );
        Object.defineProperty(response, "url", { value: result.url });
        Object.defineProperty(response, "redirected", { value: result.redirected });
        resolve(response);
      },
    });
    channel.queue.push(job);
    for (const wake of [...channel.wakers]) wake();
  });
}
