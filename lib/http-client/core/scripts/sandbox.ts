import { createContext, runInContext } from 'node:vm';
import type { HttpResponse } from '../model/types';

export type VarBucket = 'environment' | 'collection' | 'globals';

export interface ScriptRequestView {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string;
}

export interface ScriptLog {
  level: 'log' | 'warn' | 'error';
  text: string;
}

export interface ScriptTestResult {
  name: string;
  passed: boolean;
  error?: string;
}

export type VarChanges = Record<string, string | null>;

export interface ScriptVisualization {
  template: string;
  data?: unknown;
}

export interface ScriptOutcome {
  logs: ScriptLog[];
  tests: ScriptTestResult[];
  changes: Record<VarBucket, VarChanges>;
  request?: ScriptRequestView;
  error?: string;
  skipRequest?: boolean;
  visualization?: ScriptVisualization;
}

export interface ScriptContext {
  phase: 'pre-request' | 'post-response';
  request: ScriptRequestView;
  response?: HttpResponse;
  variables: Record<VarBucket, Record<string, string>>;
}

export const SCRIPT_TIMEOUT_MS = 2_000;
const MAX_LOG_CHARS = 2_000;

class AssertionError extends Error {}

function stringify(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keysA = Object.keys(a as object);
  const keysB = Object.keys(b as object);
  if (keysA.length !== keysB.length) return false;
  return keysA.every((key) =>
    deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
  );
}

function buildExpect(value: unknown, negated = false): Record<string, unknown> {
  const assert = (ok: boolean, message: string): void => {
    if (ok === negated) {
      throw new AssertionError(negated ? `expected NOT: ${message}` : message);
    }
  };
  const chain: Record<string, unknown> = {
    equal: (other: unknown) =>
      assert(Object.is(value, other), `expected ${stringify(value)} to equal ${stringify(other)}`),
    eql: (other: unknown) =>
      assert(
        deepEqual(value, other),
        `expected ${stringify(value)} to deeply equal ${stringify(other)}`,
      ),
    include: (needle: unknown) => {
      const ok = Array.isArray(value)
        ? value.some((item) => deepEqual(item, needle))
        : typeof value === 'string'
          ? value.includes(String(needle))
          : false;
      assert(ok, `expected ${stringify(value)} to include ${stringify(needle)}`);
    },
    match: (pattern: RegExp) =>
      assert(pattern.test(String(value)), `expected ${stringify(value)} to match ${pattern}`),
    a: (type: string) =>
      assert(
        (Array.isArray(value) ? 'array' : typeof value) === type,
        `expected ${stringify(value)} to be a ${type}`,
      ),
    property: (name: string) =>
      assert(
        Boolean(value && typeof value === 'object' && name in (value as object)),
        `expected ${stringify(value)} to have property ${name}`,
      ),
    length: (n: number) =>
      assert(
        (value as { length?: number })?.length === n,
        `expected length ${(value as { length?: number })?.length} to be ${n}`,
      ),
    above: (n: number) =>
      assert(Number(value) > n, `expected ${stringify(value)} to be above ${n}`),
    below: (n: number) =>
      assert(Number(value) < n, `expected ${stringify(value)} to be below ${n}`),
    oneOf: (list: unknown[]) =>
      assert(
        list.some((item) => deepEqual(item, value)),
        `expected ${stringify(value)} to be one of ${stringify(list)}`,
      ),
  };
  Object.defineProperty(chain, 'true', {
    get: () => assert(value === true, `expected ${stringify(value)} to be true`),
  });
  Object.defineProperty(chain, 'false', {
    get: () => assert(value === false, `expected ${stringify(value)} to be false`),
  });
  Object.defineProperty(chain, 'ok', {
    get: () => assert(Boolean(value), `expected ${stringify(value)} to be truthy`),
  });
  Object.defineProperty(chain, 'undefined', {
    get: () => assert(value === undefined, `expected ${stringify(value)} to be undefined`),
  });
  Object.defineProperty(chain, 'empty', {
    get: () =>
      assert(
        (value as { length?: number })?.length === 0 ||
          (typeof value === 'object' && value !== null && Object.keys(value).length === 0),
        `expected ${stringify(value)} to be empty`,
      ),
  });

  const root: Record<string, unknown> = { ...chain };
  root.to = { ...chain, be: chain, have: chain, deep: chain };
  if (!negated) {
    (root.to as Record<string, unknown>).not = buildExpect(value, true).to;
    root.not = buildExpect(value, true);
  }
  return root;
}

export function runScript(code: string, ctx: ScriptContext): ScriptOutcome {
  const logs: ScriptLog[] = [];
  const tests: ScriptTestResult[] = [];
  const changes: Record<VarBucket, VarChanges> = { environment: {}, collection: {}, globals: {} };
  const values: Record<VarBucket, Record<string, string>> = {
    environment: { ...ctx.variables.environment },
    collection: { ...ctx.variables.collection },
    globals: { ...ctx.variables.globals },
  };
  const request: ScriptRequestView = {
    ...ctx.request,
    headers: { ...ctx.request.headers },
  };
  let skipRequest = false;
  let visualization: ScriptVisualization | undefined;

  if (!code.trim())
    return { logs, tests, changes, request, ...(skipRequest ? { skipRequest } : {}) };

  const bucket = (name: VarBucket): Record<string, unknown> => ({
    get: (key: string) => values[name][key],
    has: (key: string) => values[name][key] !== undefined,
    set: (key: string, value: unknown) => {
      values[name][key] = String(value);
      changes[name][key] = String(value);
    },
    unset: (key: string) => {
      delete values[name][key];
      changes[name][key] = null;
    },
    clear: () => {
      for (const key of Object.keys(values[name])) {
        delete values[name][key];
        changes[name][key] = null;
      }
    },
    toObject: () => ({ ...values[name] }),
  });

  const lookup = (key: string): string | undefined =>
    values.environment[key] ?? values.collection[key] ?? values.globals[key];

  const log =
    (level: ScriptLog['level']) =>
    (...args: unknown[]) => {
      logs.push({ level, text: args.map(stringify).join(' ').slice(0, MAX_LOG_CHARS) });
    };

  const responseApi = ctx.response
    ? (() => {
        const body = ctx.response.body;
        const headers = Object.fromEntries(
          ctx.response.headers.map(([key, value]) => [key.toLowerCase(), value]),
        );
        const api: Record<string, unknown> = {
          code: ctx.response.status,
          status: ctx.response.statusText,
          responseTime: ctx.response.timeMs,
          responseSize: ctx.response.sizeBytes,
          text: () => body,
          json: () => JSON.parse(body),
          headers: {
            get: (name: string) => headers[name.toLowerCase()],
            has: (name: string) => headers[name.toLowerCase()] !== undefined,
            toObject: () => ({ ...headers }),
          },
        };
        const status = ctx.response.status;
        api.to = {
          have: {
            status: (expected: number | string) => {
              const ok =
                typeof expected === 'number'
                  ? status === expected
                  : ctx.response?.statusText === expected;
              if (!ok) throw new AssertionError(`expected status ${expected} but got ${status}`);
            },
            header: (name: string) => {
              if (headers[name.toLowerCase()] === undefined) {
                throw new AssertionError(`expected response header ${name}`);
              }
            },
            jsonBody: () => {
              JSON.parse(body);
            },
          },
          be: {
            ok: (): void => {
              if (status >= 400) {
                throw new AssertionError(`expected a 2xx/3xx status but got ${status}`);
              }
            },
          },
        };
        return api;
      })()
    : undefined;

  const pm: Record<string, unknown> = {
    environment: bucket('environment'),
    collectionVariables: bucket('collection'),
    globals: bucket('globals'),
    variables: {
      get: lookup,
      has: (key: string) => lookup(key) !== undefined,
      set: (key: string, value: unknown) => {
        values.environment[key] = String(value);
        changes.environment[key] = String(value);
      },
      replaceIn: (text: string) =>
        text.replace(/\{\{\s*([^{}\s]+)\s*\}\}/g, (match, name: string) => lookup(name) ?? match),
      toObject: () => ({ ...values.globals, ...values.collection, ...values.environment }),
    },
    request,
    info: { eventName: ctx.phase, requestName: '' },
    test: (name: string, fn: () => void) => {
      try {
        fn();
        tests.push({ name, passed: true });
      } catch (error) {
        tests.push({
          name,
          passed: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
    expect: (value: unknown) => buildExpect(value),
    execution: {
      skipRequest: () => {
        skipRequest = true;
      },
    },
    visualizer: {
      setTemplate: (template: unknown, data?: unknown) => {
        visualization =
          typeof template === 'string'
            ? { template, ...(data === undefined ? {} : { data }) }
            : undefined;
      },
      clear: () => {
        visualization = undefined;
      },
    },
    ...(responseApi ? { response: responseApi } : {}),
  };

  const sandbox = {
    pm,
    console: { log: log('log'), info: log('log'), warn: log('warn'), error: log('error') },
    JSON,
    Math,
    Date,
    Number,
    String,
    Boolean,
    Array,
    Object,
    RegExp,
    Error,
    URL,
    URLSearchParams,
    encodeURIComponent,
    decodeURIComponent,
    atob,
    btoa,
    TextEncoder,
    TextDecoder,
    ...(responseApi
      ? { responseCode: { code: ctx.response?.status }, responseBody: ctx.response?.body }
      : {}),
  };

  try {
    runInContext(code, createContext(sandbox), { timeout: SCRIPT_TIMEOUT_MS });
  } catch (error) {
    return {
      logs,
      tests,
      changes,
      request,
      error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
      ...(skipRequest ? { skipRequest: true } : {}),
      ...(visualization ? { visualization } : {}),
    };
  }

  return {
    logs,
    tests,
    changes,
    request,
    ...(skipRequest ? { skipRequest: true } : {}),
    ...(visualization ? { visualization } : {}),
  };
}
