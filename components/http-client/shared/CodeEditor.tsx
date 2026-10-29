import { useMemo } from 'react';
import type { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import CodeMirror from '@uiw/react-codemirror';
import { vscodeCodeMirror } from '@/lib/http-client/ui/cm-theme';
import { useVscodeDark } from '@/lib/http-client/ui/hooks/use-vscode-dark';

const fillAndScroll = EditorView.theme({
  '&': { height: '100%' },
  '.cm-scroller': { overflow: 'auto' },
});

export function CodeEditor({
  value,
  onChange,
  height = '260px',
  readOnly = false,
  autoFocus = false,
  placeholder,
  lineNumbers = true,
  resizable = false,
  minHeight = '64px',
  extensions = [],
  autocomplete = false,
}: {
  value: string;
  onChange: (v: string) => void;
  height?: string;
  readOnly?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
  lineNumbers?: boolean;
  resizable?: boolean;
  minHeight?: string;
  extensions?: Extension[];
  autocomplete?: boolean;
}) {
  const dark = useVscodeDark();
  const theme = useMemo(() => vscodeCodeMirror(dark), [dark]);

  return (
    <div
      className={`flex flex-col overflow-hidden rounded-lg border border-input text-xs ${
        resizable ? 'resize-y' : ''
      }`}
      style={{ height, minHeight, ...(resizable ? { paddingBottom: 8 } : {}) }}
    >
      <CodeMirror
        value={value}
        style={{ flex: '1 1 0%', minHeight: 0, overflow: 'hidden' }}
        theme="none"
        extensions={[...theme, fillAndScroll, ...extensions]}
        onChange={onChange}
        editable={!readOnly}
        autoFocus={autoFocus}
        {...(placeholder ? { placeholder } : {})}
        basicSetup={{
          lineNumbers,
          foldGutter: lineNumbers,
          highlightActiveLine: !readOnly,
          autocompletion: autocomplete,
        }}
      />
    </div>
  );
}
