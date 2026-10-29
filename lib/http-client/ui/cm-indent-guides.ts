import { getIndentUnit } from '@codemirror/language';
import { RangeSetBuilder, type Extension } from '@codemirror/state';
import { Decoration, ViewPlugin, type DecorationSet, type EditorView, type ViewUpdate } from '@codemirror/view';
import { guideDepths } from './indent-guides';

function build(view: EditorView): DecorationSet {
  const unit = getIndentUnit(view.state) || 2;
  const builder = new RangeSetBuilder<Decoration>();
  for (const range of view.visibleRanges) {
    const lines: Array<{ from: number; text: string }> = [];
    for (let pos = range.from; pos <= range.to; ) {
      const line = view.state.doc.lineAt(pos);
      lines.push({ from: line.from, text: line.text });
      if (line.to >= view.state.doc.length) break;
      pos = line.to + 1;
    }
    const depths = guideDepths(
      lines.map((line) => line.text),
      unit,
      view.state.tabSize,
    );
    lines.forEach((line, index) => {
      const depth = depths[index] ?? 0;
      if (depth <= 0) return;
      builder.add(
        line.from,
        line.from,
        Decoration.line({
          class: 'cm-indentGuides',
          attributes: { style: `--guide-count:${depth};--guide-unit:${unit}` },
        }),
      );
    });
  }
  return builder.finish();
}

export function indentGuides(): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = build(view);
      }

      update(update: ViewUpdate): void {
        if (update.docChanged || update.viewportChanged || update.geometryChanged) {
          this.decorations = build(update.view);
        }
      }
    },
    { decorations: (plugin) => plugin.decorations },
  );
}
