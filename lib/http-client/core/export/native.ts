import { createCollection, createEnvironment } from '../model/factory';
import type { Collection, Environment } from '../model/types';

export const NATIVE_FORMAT = 'silak-http-client';
export const NATIVE_VERSION = 1;

export interface NativeBundle {
  format: typeof NATIVE_FORMAT;
  version: number;
  exportedAt: string;
  collections: Collection[];
  environments: Environment[];
}

export function exportNative(
  collections: readonly Collection[],
  environments: readonly Environment[],
): string {
  const bundle: NativeBundle = {
    format: NATIVE_FORMAT,
    version: NATIVE_VERSION,
    exportedAt: new Date().toISOString(),
    collections: [...collections],
    environments: [...environments],
  };
  return JSON.stringify(bundle, null, 2);
}

export function isNativeBundle(value: unknown): value is NativeBundle {
  const bundle = value as NativeBundle | undefined;
  return Boolean(bundle && typeof bundle === 'object' && bundle.format === NATIVE_FORMAT);
}

export function importNative(source: string | unknown): {
  collections: Collection[];
  environments: Environment[];
} {
  const bundle = (typeof source === 'string' ? JSON.parse(source) : source) as unknown;
  if (!isNativeBundle(bundle)) {
    throw new Error(`Not a ${NATIVE_FORMAT} bundle.`);
  }
  if (bundle.version > NATIVE_VERSION) {
    throw new Error(
      `Bundle version ${bundle.version} is newer than this build supports (${NATIVE_VERSION}).`,
    );
  }
  return {
    collections: (bundle.collections ?? []).map((c) => createCollection(c)),
    environments: (bundle.environments ?? []).map((e) => createEnvironment(e)),
  };
}
