export interface HttpClientStoragePort {
  /** Absolute directory that holds `collections/` and `environments/`. */
  root: () => string;
}

export function staticStorage(root: string): HttpClientStoragePort {
  return { root: () => root };
}
