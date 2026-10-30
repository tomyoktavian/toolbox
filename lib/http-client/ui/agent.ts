import { agentToken } from "./agent-token";
import { remote } from "./remote";

export interface LocalProxyStatus {
  connected: boolean;
  /** False until the first answer from the server. */
  checked: boolean;
}

const POLL_MS = 4000;
const UNKNOWN: LocalProxyStatus = { connected: false, checked: false };

let status = UNKNOWN;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;

async function check(): Promise<void> {
  // A hidden tab has nobody to show it to.
  if (typeof document !== "undefined" && document.hidden) return;
  let next: LocalProxyStatus;
  try {
    next = { connected: (await remote("agentStatus")).connected, checked: true };
  } catch {
    next = { connected: false, checked: true };
  }
  if (next.connected === status.connected && next.checked === status.checked) return;
  status = next;
  for (const listener of listeners) listener();
}

/** Whether this browser's Local Proxy is connected, polled while something is watching. */
export const localProxy = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    if (listeners.size === 1) {
      void check();
      timer = setInterval(() => void check(), POLL_MS);
    }
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0 && timer) {
        clearInterval(timer);
        timer = undefined;
      }
    };
  },
  getSnapshot: (): LocalProxyStatus => status,
  getServerSnapshot: (): LocalProxyStatus => UNKNOWN,
  /** Look again now, e.g. when the dialog opens. */
  refresh: check,
};

/** The two commands that start the proxy on the user's machine, for this server and this browser. */
export function proxyCommands(origin: string): { download: string; run: string } | undefined {
  const token = agentToken();
  if (!token) return undefined;
  return {
    download: `curl -fsS ${origin}/api/http-client/agent/script -o toolbox-proxy.mjs`,
    run: `node toolbox-proxy.mjs --server ${origin} --token ${token}`,
  };
}
