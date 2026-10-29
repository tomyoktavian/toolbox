import { autocompletion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import type { Extension } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  MatchDecorator,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view';
import { styleOf } from './VarInput';
import { completionsFor, lookupVar, type VarScopeData } from './variables';

const TOKEN = /\{\{\s*([^{}\s]+)\s*\}\}/g;
const MENU_MAX = 40;

export interface VarHoverHandlers {
  onHover: (name: string, rect: DOMRect) => void;
  onLeave: () => void;
}

// Syntax highlighting may nest its own coloured span inside the variable mark; let it inherit.
const varTheme = EditorView.baseTheme({
  '.cm-var *': { color: 'inherit !important' },
});

function completionSource(scope: VarScopeData) {
  return (context: CompletionContext): CompletionResult | null => {
    const before = context.matchBefore(/\{\{[^{}]*$/);
    if (!before) return null;
    const from = before.from + 2;
    return {
      from,
      validFor: /^[^{}]*$/,
      options: completionsFor(scope, before.text.slice(2))
        .slice(0, MENU_MAX)
        .map((option) => ({
          label: option.name,
          detail: option.disabled ? `${option.scopeLabel} (nonaktif)` : option.scopeLabel,
          ...(option.value !== undefined ? { info: option.secret ? '••••••' : option.value } : {}),
          apply: (view: EditorView, _completion: unknown, start: number, end: number) => {
            const insert = `${option.name}}}`;
            const closing = view.state.sliceDoc(end, end + 2) === '}}' ? end + 2 : end;
            view.dispatch({
              changes: { from: start, to: closing, insert },
              selection: { anchor: start + insert.length },
            });
          },
        })),
    };
  };
}

/**
 * The VarInput behaviour for CodeMirror: `{{name}}` is coloured by where it resolves, hovering it
 * reports the token so the shared variable card can open, and typing `{{` suggests names.
 */
export function varExtensions(
  scope: VarScopeData | undefined,
  handlers: VarHoverHandlers,
): Extension[] {
  const decorator = new MatchDecorator({
    regexp: TOKEN,
    decoration: (match) => {
      const name = match[1] ?? '';
      return Decoration.mark({
        class: `cm-var ${scope ? styleOf(lookupVar(name, scope)) : 'text-orange-400'}`,
        attributes: { 'data-var': name },
      });
    },
  });

  const highlight = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = decorator.createDeco(view);
      }
      update(update: ViewUpdate) {
        this.decorations = decorator.updateDeco(update, this.decorations);
      }
    },
    { decorations: (plugin) => plugin.decorations },
  );

  const hover = EditorView.domEventHandlers({
    mousemove(event) {
      const token = (event.target as Element | null)?.closest?.('[data-var]') as HTMLElement | null;
      if (token) handlers.onHover(token.dataset['var'] ?? '', token.getBoundingClientRect());
      else handlers.onLeave();
      return false;
    },
    mouseleave() {
      handlers.onLeave();
      return false;
    },
  });

  return [
    varTheme,
    highlight,
    hover,
    ...(scope ? [autocompletion({ override: [completionSource(scope)] })] : []),
  ];
}
