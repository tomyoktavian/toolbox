import type { HttpRequest, ScriptLog, ScriptReport, ScriptTestResult } from "@/lib/http-client/core";
import type { ClientOps } from "./rpc";
import { generateSnippet } from "@/lib/http-client/core/snippet/generate";

type SendResult = Awaited<ReturnType<ClientOps["send"]>>;

/** Kept per entry so a few huge responses cannot fill the browser's memory. */
const MAX_BODY_CHARS = 200_000;
/** The console is a rolling log; the oldest entries drop off. */
export const MAX_CONSOLE_ENTRIES = 200;

export interface ConsoleEntry {
  id: string;
  at: number;
  requestId: string;
  requestName: string;
  method: string;
  url: string;
  status?: number;
  statusText?: string;
  timeMs?: number;
  sizeBytes?: number;
  requestHeaders: Array<[string, string]>;
  requestBody?: string;
  responseHeaders: Array<[string, string]>;
  responseBody?: string;
  /** Why the response body is missing or cut short. */
  responseNote?: string;
  error?: string;
  skipped?: boolean;
  logs: Array<ScriptLog & { phase: ScriptReport["phase"] }>;
  tests: ScriptTestResult[];
}

export function isFailedEntry(entry: ConsoleEntry): boolean {
  return Boolean(entry.error) || (entry.status ?? 0) >= 400 || entry.tests.some((test) => !test.passed);
}

/** Builds a console entry from what was sent and what came back. */
export function buildConsoleEntry(request: HttpRequest, outcome: SendResult): ConsoleEntry {
  const { response, sent } = outcome;
  const enabledHeaders = request.headers
    .filter((row) => row.enabled && row.key.trim())
    .map((row): [string, string] => [row.key, row.value]);

  let responseBody: string | undefined;
  let responseNote: string | undefined;
  if (response) {
    if (response.bodyBase64) {
      responseNote = `Body biner (${response.contentType || "tanpa content-type"}), tidak ditampilkan.`;
    } else if (response.body.length > MAX_BODY_CHARS) {
      responseBody = response.body.slice(0, MAX_BODY_CHARS);
      responseNote = `Dipotong: ${MAX_BODY_CHARS.toLocaleString("id-ID")} dari ${response.body.length.toLocaleString("id-ID")} karakter.`;
    } else {
      responseBody = response.body;
      if (response.truncated) responseNote = "Body sudah dipotong oleh client karena terlalu besar.";
    }
  }

  const requestBody = sent ? sent.body : request.body.mode === "none" ? undefined : request.body.text;

  return {
    id: crypto.randomUUID(),
    at: Date.now(),
    requestId: request.id,
    requestName: request.name,
    method: sent?.method ?? request.method,
    url: sent?.url ?? request.url,
    ...(response
      ? {
          status: response.status,
          statusText: response.statusText,
          timeMs: response.timeMs,
          sizeBytes: response.sizeBytes,
        }
      : {}),
    requestHeaders: sent?.headers ?? enabledHeaders,
    ...(requestBody ? { requestBody } : {}),
    responseHeaders: response?.headers ?? [],
    ...(responseBody !== undefined ? { responseBody } : {}),
    ...(responseNote ? { responseNote } : {}),
    ...(outcome.error ? { error: outcome.error } : {}),
    ...(outcome.skipped ? { skipped: true } : {}),
    logs: outcome.reports.flatMap((report) => report.logs.map((log) => ({ ...log, phase: report.phase }))),
    tests: outcome.reports.flatMap((report) => report.tests),
  };
}

export function curlFor(entry: ConsoleEntry): string {
  return generateSnippet("curl", {
    method: entry.method,
    url: entry.url,
    headers: entry.requestHeaders,
    ...(entry.requestBody ? { body: { kind: "raw", text: entry.requestBody } } : {}),
    notes: [],
  });
}
