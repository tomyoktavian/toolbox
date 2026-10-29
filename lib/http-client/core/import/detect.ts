import type { Collection, Environment } from '../model/types';
import { createCollection } from '../model/factory';
import { importNative, isNativeBundle } from '../export/native';
import { hostOf, isCurlCommand, parseCurl } from './curl';
import { importOpenApi, isOpenApiDocument } from './openapi';
import {
  importPostmanCollection,
  importPostmanEnvironment,
  isPostmanCollection,
  isPostmanEnvironment,
} from './postman-collection';

export type ImportSourceKind =
  'postman-collection' | 'openapi' | 'postman-environment' | 'native' | 'curl';

export interface ImportResult {
  kind: ImportSourceKind;
  collections: Collection[];
  environments: Environment[];
}

export function detectImportKind(source: string): ImportSourceKind {
  if (isCurlCommand(source)) return 'curl';
  const value = parseJson(source);
  if (isNativeBundle(value)) return 'native';
  if (isOpenApiDocument(value)) return 'openapi';
  if (isPostmanCollection(value)) return 'postman-collection';
  if (isPostmanEnvironment(value)) return 'postman-environment';
  throw new Error(
    'Unrecognised input — expected a Postman Collection v2.1, a Postman environment, an OpenAPI/Swagger JSON document, a Silak export bundle, or a cURL command.',
  );
}

export function importAny(source: string): ImportResult {
  if (isCurlCommand(source)) {
    const request = parseCurl(source);
    return {
      kind: 'curl',
      collections: [createCollection({ name: hostOf(request.url), requests: [request] })],
      environments: [],
    };
  }
  const value = parseJson(source);
  if (isNativeBundle(value)) {
    const bundle = importNative(value);
    return { kind: 'native', collections: bundle.collections, environments: bundle.environments };
  }
  if (isOpenApiDocument(value)) {
    return { kind: 'openapi', collections: [importOpenApi(value)], environments: [] };
  }
  if (isPostmanCollection(value)) {
    return {
      kind: 'postman-collection',
      collections: [importPostmanCollection(value)],
      environments: [],
    };
  }
  if (isPostmanEnvironment(value)) {
    return {
      kind: 'postman-environment',
      collections: [],
      environments: [importPostmanEnvironment(value)],
    };
  }
  return detectImportKind(source) as never;
}

function parseJson(source: string): unknown {
  const trimmed = source.trim();
  if (!trimmed) throw new Error('The file is empty.');
  try {
    return JSON.parse(trimmed);
  } catch {
    throw new Error(
      'Only JSON is supported for import — convert a YAML spec to JSON first (for example with `npx js-yaml spec.yaml > spec.json`).',
    );
  }
}
