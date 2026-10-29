export const TREE_INDENT = 16;
export const TREE_GUTTER = 4;
export const CHEVRON_BOX = TREE_INDENT;

export function guideLeft(level: number): number {
  return TREE_GUTTER + level * TREE_INDENT + TREE_INDENT / 2;
}

export function chevronCenter(depth: number): number {
  return TREE_GUTTER + depth * TREE_INDENT + CHEVRON_BOX / 2;
}

export const CHEVRON_STYLE = { width: CHEVRON_BOX, height: CHEVRON_BOX } as const;

export function TreeIndent({ depth }: { depth: number }) {
  if (depth <= 0) return null;
  return (
    <>
      {Array.from({ length: depth }, (_, level) => (
        <span
          key={level}
          aria-hidden
          style={{ left: guideLeft(level) }}
          className="pointer-events-none absolute inset-y-0 w-px bg-[var(--vscode-tree-indentGuidesStroke,var(--vscode-panel-border))]"
        />
      ))}
      <span aria-hidden className="shrink-0" style={{ width: depth * TREE_INDENT }} />
    </>
  );
}
