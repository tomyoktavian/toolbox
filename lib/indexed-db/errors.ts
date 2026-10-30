export class IndexedDbError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "IndexedDbError";
  }

  /** The browser ran out of storage; callers can evict old entries and retry. */
  get isQuotaExceeded(): boolean {
    return this.cause instanceof DOMException && this.cause.name === "QuotaExceededError";
  }
}

export function toIndexedDbError(error: unknown, action: string): IndexedDbError {
  if (error instanceof IndexedDbError) return error;
  const detail = error instanceof Error ? error.message : String(error ?? "unknown error");
  return new IndexedDbError(`IndexedDB ${action} failed: ${detail}`, { cause: error });
}
