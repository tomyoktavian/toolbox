import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import type { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { tags as t } from '@lezer/highlight';
import { indentGuides } from './cm-indent-guides';

const DARK_FALLBACK = {
  string: '#ce9178',
  number: '#b5cea8',
  keyword: '#569cd6',
  property: '#9cdcfe',
  variable: '#9cdcfe',
  function: '#dcdcaa',
  type: '#4ec9b0',
  comment: '#6a9955',
  regexp: '#d16969',
  invalid: '#f44747',
  punctuation: '#d4d4d4',
};

const LIGHT_FALLBACK = {
  string: '#a31515',
  number: '#098658',
  keyword: '#0000ff',
  property: '#0451a5',
  variable: '#001080',
  function: '#795e26',
  type: '#267f99',
  comment: '#008000',
  regexp: '#811f3f',
  invalid: '#cd3131',
  punctuation: '#000000',
};

function themed(variable: string, fallback: string): string {
  return `var(--vscode-${variable}, ${fallback})`;
}

export interface TokenColors {
  string: string;
  number: string;
  bool: string;
  property: string;
  keyword: string;
  fn: string;
  type: string;
  variable: string;
  punctuation: string;
  comment: string;
  regexp: string;
  invalid: string;
  link: string;
}

export function tokenColors(dark: boolean): TokenColors {
  const base = dark ? DARK_FALLBACK : LIGHT_FALLBACK;
  return {
    string: themed('debugTokenExpression-string', base.string),
    number: themed('debugTokenExpression-number', base.number),
    bool: themed('debugTokenExpression-boolean', base.keyword),
    property: themed('debugTokenExpression-name', base.property),
    keyword: themed('symbolIcon-keywordForeground', base.keyword),
    fn: themed('symbolIcon-functionForeground', base.function),
    type: themed('symbolIcon-classForeground', base.type),
    variable: themed('symbolIcon-variableForeground', base.variable),
    punctuation: themed('editor-foreground', base.punctuation),
    comment: base.comment,
    regexp: base.regexp,
    invalid: themed('editorError-foreground', base.invalid),
    link: themed('textLink-foreground', base.property),
  };
}

export function vscodeHighlightStyle(dark: boolean): HighlightStyle {
  const { string, number, bool, property, keyword, fn, type, variable, punctuation, comment, regexp, invalid, link } =
    tokenColors(dark);

  return HighlightStyle.define(
    [
      { tag: [t.comment, t.lineComment, t.blockComment, t.docComment], color: comment, fontStyle: 'italic' },
      { tag: [t.string, t.special(t.string), t.docString], color: string },
      { tag: [t.number, t.integer, t.float], color: number },
      { tag: [t.bool, t.null, t.atom], color: bool },
      { tag: [t.propertyName, t.attributeName], color: property },
      { tag: [t.keyword, t.moduleKeyword, t.controlKeyword, t.operatorKeyword, t.self], color: keyword },
      { tag: [t.function(t.variableName), t.function(t.propertyName), t.labelName], color: fn },
      { tag: [t.typeName, t.className, t.namespace, t.tagName, t.annotation], color: type },
      { tag: [t.variableName, t.definition(t.variableName), t.local(t.variableName)], color: variable },
      { tag: [t.constant(t.variableName), t.standard(t.variableName)], color: bool },
      { tag: [t.regexp, t.escape, t.special(t.propertyName)], color: regexp },
      { tag: [t.operator, t.punctuation, t.separator, t.bracket, t.squareBracket, t.brace, t.paren], color: punctuation },
      { tag: [t.link, t.url], color: link, textDecoration: 'underline' },
      { tag: t.heading, color: keyword, fontWeight: 'bold' },
      { tag: t.emphasis, fontStyle: 'italic' },
      { tag: t.strong, fontWeight: 'bold' },
      { tag: t.strikethrough, textDecoration: 'line-through' },
      { tag: t.invalid, color: invalid },
    ],
    { themeType: dark ? 'dark' : 'light' },
  );
}

export function vscodeEditorTheme(dark: boolean): Extension {
  return EditorView.theme(
    {
      '&': {
        color: 'var(--vscode-editor-foreground, inherit)',
        backgroundColor: 'var(--vscode-editor-background, transparent)',
      },
      '.cm-content': {
        caretColor: 'var(--vscode-editorCursor-foreground, currentColor)',
        fontFamily: 'var(--vscode-editor-font-family, ui-monospace, monospace)',
      },
      '.cm-scroller': { fontFamily: 'var(--vscode-editor-font-family, ui-monospace, monospace)' },
      '.cm-cursor, .cm-dropCursor': {
        borderLeftColor: 'var(--vscode-editorCursor-foreground, currentColor)',
      },
      '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
        backgroundColor: 'var(--vscode-editor-selectionBackground, #264f78)',
      },
      '.cm-selectionMatch': {
        backgroundColor: 'var(--vscode-editor-selectionHighlightBackground, transparent)',
      },
      '.cm-activeLine': {
        backgroundColor: 'var(--vscode-editor-lineHighlightBackground, transparent)',
      },
      '.cm-gutters': {
        backgroundColor: 'var(--vscode-editorGutter-background, var(--vscode-editor-background, transparent))',
        color: 'var(--vscode-editorLineNumber-foreground, #858585)',
        borderRight: '1px solid var(--vscode-editorGutter-border, transparent)',
      },
      '.cm-activeLineGutter': {
        backgroundColor: 'transparent',
        color: 'var(--vscode-editorLineNumber-activeForeground, var(--vscode-editor-foreground))',
      },
      '.cm-foldGutter span': { color: 'var(--vscode-editorGutter-foldingControlForeground, inherit)' },
      '.cm-foldPlaceholder': {
        backgroundColor: 'var(--vscode-editor-foldPlaceholderBackground, transparent)',
        border: '1px solid var(--vscode-editorGutter-border, currentColor)',
        color: 'var(--vscode-editorLineNumber-foreground, inherit)',
      },
      '.cm-searchMatch': {
        backgroundColor: 'var(--vscode-editor-findMatchHighlightBackground, rgba(234,92,0,0.33))',
      },
      '.cm-searchMatch.cm-searchMatch-selected': {
        backgroundColor: 'var(--vscode-editor-findMatchBackground, rgba(234,92,0,0.6))',
      },
      '.cm-matchingBracket, &.cm-focused .cm-matchingBracket': {
        backgroundColor: 'var(--vscode-editorBracketMatch-background, transparent)',
        outline: '1px solid var(--vscode-editorBracketMatch-border, currentColor)',
      },
      '.cm-panels': {
        backgroundColor: 'var(--vscode-editorWidget-background, inherit)',
        color: 'var(--vscode-editorWidget-foreground, inherit)',
        border: 'none',
        borderTop: '1px solid var(--vscode-editorWidget-border, transparent)',
      },
      '.cm-panels input, .cm-panels select': {
        backgroundColor: 'var(--vscode-input-background, transparent)',
        color: 'var(--vscode-input-foreground, inherit)',
        border: '1px solid var(--vscode-input-border, transparent)',
      },
      '.cm-panels button': {
        backgroundColor: 'var(--vscode-button-secondaryBackground, transparent)',
        color: 'var(--vscode-button-secondaryForeground, inherit)',
        border: 'none',
        backgroundImage: 'none',
      },
      '.cm-tooltip': {
        backgroundColor: 'var(--vscode-editorHoverWidget-background, inherit)',
        color: 'var(--vscode-editorHoverWidget-foreground, inherit)',
        border: '1px solid var(--vscode-editorHoverWidget-border, transparent)',
      },
      '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
        backgroundColor: 'var(--vscode-list-activeSelectionBackground, transparent)',
        color: 'var(--vscode-list-activeSelectionForeground, inherit)',
      },
      '.cm-placeholder': { color: 'var(--vscode-input-placeholderForeground, #888)' },
      '.cm-indentGuides': {
        backgroundImage:
          'repeating-linear-gradient(to right, var(--vscode-editorIndentGuide-background1, var(--vscode-editorIndentGuide-background, rgba(127,127,127,0.35))) 0 1px, transparent 1px calc(var(--guide-unit, 2) * 1ch))',
        backgroundSize: 'calc(var(--guide-count, 0) * var(--guide-unit, 2) * 1ch) 100%',
        backgroundRepeat: 'no-repeat',
      },
    },
    { dark },
  );
}

export function vscodeCodeMirror(dark: boolean): Extension[] {
  return [vscodeEditorTheme(dark), syntaxHighlighting(vscodeHighlightStyle(dark)), indentGuides()];
}
