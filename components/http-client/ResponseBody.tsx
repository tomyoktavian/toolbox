import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { openSearchPanel } from '@codemirror/search';
import { EditorView } from '@codemirror/view';
import CodeMirror, { type ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { vscodeCodeMirror } from '@/lib/http-client/ui/cm-theme';
import { useVscodeDark } from '@/lib/http-client/ui/hooks/use-vscode-dark';

export type BodyLanguage = 'json' | 'javascript' | 'html' | 'xml' | 'text';

export const BODY_LANGUAGES: Array<{ value: BodyLanguage; label: string }> = [
  { value: 'json', label: 'JSON' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'html', label: 'HTML' },
  { value: 'xml', label: 'XML' },
  { value: 'text', label: 'Text' },
];

export function guessLanguage(contentType: string, body: string): BodyLanguage {
  const type = contentType.toLowerCase();
  if (type.includes('json')) return 'json';
  if (type.includes('javascript')) return 'javascript';
  if (type.includes('html')) return 'html';
  if (type.includes('xml')) return 'xml';
  const head = body.trimStart()[0];
  if (head === '{' || head === '[') return 'json';
  if (head === '<') return body.trimStart().startsWith('<?xml') ? 'xml' : 'html';
  return 'text';
}

export interface ResponseBodyHandle {
  search: () => void;
  focus: () => void;
}

export const ResponseBody = forwardRef<
  ResponseBodyHandle,
  { text: string; language: BodyLanguage; wrap: boolean }
>(function ResponseBody({ text, language, wrap }, ref) {
  const editor = useRef<ReactCodeMirrorRef>(null);
  const dark = useVscodeDark();

  useImperativeHandle(ref, () => ({
    search: () => {
      const view = editor.current?.view;
      if (!view) return;
      view.focus();
      openSearchPanel(view);
    },
    focus: () => editor.current?.view?.focus(),
  }));

  const extensions = useMemo(
    () => [
      ...vscodeCodeMirror(dark),
      ...(language === 'json' ? [json()] : language === 'javascript' ? [javascript()] : []),
      ...(wrap ? [EditorView.lineWrapping] : []),
    ],
    [dark, language, wrap],
  );

  return (
    <CodeMirror
      ref={editor}
      value={text}
      height="100%"
      theme="none"
      extensions={extensions}
      readOnly
      basicSetup={{
        lineNumbers: true,
        foldGutter: true,
        highlightActiveLine: false,
        autocompletion: false,
      }}
      className="h-full text-xs [&_.cm-editor]:h-full [&_.cm-scroller]:overflow-auto"
    />
  );
});
