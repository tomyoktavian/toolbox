export function columnOf(text: string, tabSize: number): number {
  let column = 0;
  for (const char of text) {
    if (char === '\t') column += tabSize - (column % tabSize);
    else if (char === ' ') column += 1;
    else break;
  }
  return column;
}

export function isBlank(text: string): boolean {
  return text.trim().length === 0;
}

export function guideDepths(lines: string[], unit: number, tabSize = unit): number[] {
  const width = Math.max(1, unit);
  const raw = lines.map((line) =>
    isBlank(line) ? undefined : Math.floor(columnOf(line, tabSize) / width),
  );
  return raw.map((depth, index) => {
    if (depth !== undefined) return depth;
    let before = 0;
    for (let i = index - 1; i >= 0; i -= 1) {
      const found = raw[i];
      if (found !== undefined) {
        before = found;
        break;
      }
    }
    let after = 0;
    for (let i = index + 1; i < raw.length; i += 1) {
      const found = raw[i];
      if (found !== undefined) {
        after = found;
        break;
      }
    }
    return Math.min(before, after);
  });
}
