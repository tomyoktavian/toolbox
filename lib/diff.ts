export type DiffKind = "equal" | "add" | "remove";

export interface DiffOp {
  kind: DiffKind;
  /** Index into the old lines; null for an added line. */
  oldIndex: number | null;
  /** Index into the new lines; null for a removed line. */
  newIndex: number | null;
}

export interface DiffResult {
  ops: DiffOp[];
  /** True when the inputs differ too much and the result is not a minimal diff. */
  approximate: boolean;
}

/** Beyond this many edits the minimal diff is skipped to keep the page responsive. */
const MAX_EDITS = 3000;

/**
 * Line diff using Myers' O(ND) algorithm. `a` and `b` are the keys used to
 * compare lines, so callers can ignore whitespace without changing the lines
 * they show.
 */
export function diffLines(a: string[], b: string[]): DiffResult {
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }

  const ops: DiffOp[] = [];
  for (let i = 0; i < start; i++) {
    ops.push({ kind: "equal", oldIndex: i, newIndex: i });
  }

  const middle = myers(a.slice(start, endA), b.slice(start, endB));
  for (const op of middle.ops) {
    ops.push({
      kind: op.kind,
      oldIndex: op.oldIndex === null ? null : op.oldIndex + start,
      newIndex: op.newIndex === null ? null : op.newIndex + start,
    });
  }

  const tail = a.length - endA;
  for (let i = 0; i < tail; i++) {
    ops.push({ kind: "equal", oldIndex: endA + i, newIndex: endB + i });
  }

  return { ops, approximate: middle.approximate };
}

function myers(a: string[], b: string[]): DiffResult {
  const n = a.length;
  const m = b.length;
  if (n === 0 && m === 0) return { ops: [], approximate: false };
  if (n === 0) return { ops: addAll(m), approximate: false };
  if (m === 0) return { ops: removeAll(n), approximate: false };

  const max = n + m;
  const offset = max + 1;
  const v = new Int32Array(2 * max + 3);
  // trace[d] holds v for k in [-d - 1, d + 1] as it was before round d.
  const trace: Int32Array[] = [];

  let found = false;
  for (let d = 0; d <= max && !found; d++) {
    if (d > MAX_EDITS) {
      return { ops: [...removeAll(n), ...addAll(m)], approximate: true };
    }
    trace.push(v.slice(offset - d - 1, offset + d + 2));
    for (let k = -d; k <= d; k += 2) {
      let x: number;
      if (k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1])) {
        x = v[offset + k + 1];
      } else {
        x = v[offset + k - 1] + 1;
      }
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      v[offset + k] = x;
      if (x >= n && y >= m) {
        found = true;
        break;
      }
    }
  }

  const reversed: DiffOp[] = [];
  let x = n;
  let y = m;
  for (let d = trace.length - 1; d >= 0; d--) {
    const snapshot = trace[d];
    const at = (k: number) => snapshot[k + d + 1];
    const k = x - y;
    const prevK =
      k === -d || (k !== d && at(k - 1) < at(k + 1)) ? k + 1 : k - 1;
    const prevX = at(prevK);
    const prevY = prevX - prevK;

    while (x > prevX && y > prevY) {
      x--;
      y--;
      reversed.push({ kind: "equal", oldIndex: x, newIndex: y });
    }
    if (d > 0) {
      if (x === prevX) {
        y--;
        reversed.push({ kind: "add", oldIndex: null, newIndex: y });
      } else {
        x--;
        reversed.push({ kind: "remove", oldIndex: x, newIndex: null });
      }
    }
  }

  return { ops: reversed.reverse(), approximate: false };
}

function addAll(count: number): DiffOp[] {
  return Array.from({ length: count }, (_, i) => ({
    kind: "add" as const,
    oldIndex: null,
    newIndex: i,
  }));
}

function removeAll(count: number): DiffOp[] {
  return Array.from({ length: count }, (_, i) => ({
    kind: "remove" as const,
    oldIndex: i,
    newIndex: null,
  }));
}

export interface SplitRow {
  left: { index: number; kind: "equal" | "remove" } | null;
  right: { index: number; kind: "equal" | "add" } | null;
}

/** Pair removed and added lines side by side; equal lines appear on both sides. */
export function toSplitRows(ops: DiffOp[]): SplitRow[] {
  const rows: SplitRow[] = [];
  let i = 0;
  while (i < ops.length) {
    const op = ops[i];
    if (op.kind === "equal") {
      rows.push({
        left: { index: op.oldIndex!, kind: "equal" },
        right: { index: op.newIndex!, kind: "equal" },
      });
      i++;
      continue;
    }
    const removed: DiffOp[] = [];
    const added: DiffOp[] = [];
    while (i < ops.length && ops[i].kind !== "equal") {
      (ops[i].kind === "remove" ? removed : added).push(ops[i]);
      i++;
    }
    const count = Math.max(removed.length, added.length);
    for (let j = 0; j < count; j++) {
      rows.push({
        left: removed[j] ? { index: removed[j].oldIndex!, kind: "remove" } : null,
        right: added[j] ? { index: added[j].newIndex!, kind: "add" } : null,
      });
    }
  }
  return rows;
}

export function splitLines(text: string): string[] {
  if (text === "") return [];
  const lines = text.split(/\r?\n/);
  if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

export function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortKeysDeep((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
}

export type JsonFormat =
  | { ok: true; text: string }
  | { ok: false; error: string };

/** Pretty print JSON so two documents can be compared line by line. */
export function formatJson(text: string, sortKeys: boolean): JsonFormat {
  if (!text.trim()) return { ok: true, text: "" };
  try {
    const parsed: unknown = JSON.parse(text);
    return {
      ok: true,
      text: JSON.stringify(sortKeys ? sortKeysDeep(parsed) : parsed, null, 2),
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
