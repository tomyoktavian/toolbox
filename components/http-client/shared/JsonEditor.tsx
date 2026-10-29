import { json } from '@codemirror/lang-json';
import { CodeEditor } from './CodeEditor';

export function JsonEditor({
  value,
  onChange,
  height = '260px',
  readOnly = false,
}: {
  value: string;
  onChange: (v: string) => void;
  height?: string;
  readOnly?: boolean;
}) {
  return (
    <CodeEditor
      value={value}
      onChange={onChange}
      height={height}
      readOnly={readOnly}
      extensions={[json()]}
    />
  );
}
