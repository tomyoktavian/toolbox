import { javascript } from '@codemirror/lang-javascript';
import { CodeEditor } from '@/components/http-client/shared/CodeEditor';

interface Snippet {
  label: string;
  code: string;
}

const PRE_REQUEST: Snippet[] = [
  { label: 'Set an environment variable', code: `pm.environment.set('key', 'value');` },
  { label: 'Get an environment variable', code: `pm.environment.get('key');` },
  { label: 'Set a global variable', code: `pm.globals.set('key', 'value');` },
  { label: 'Add a header', code: `pm.request.headers['X-Trace'] = 'silak';` },
  { label: 'Timestamp into a variable', code: `pm.environment.set('now', String(Date.now()));` },
  { label: 'Skip this request', code: `pm.execution.skipRequest();` },
];

const TESTS: Snippet[] = [
  {
    label: 'Status code is 200',
    code: `pm.test('status is 200', () => pm.response.to.have.status(200));`,
  },
  {
    label: 'Save a token from the body',
    code: `pm.environment.set('token', pm.response.json().token);`,
  },
  {
    label: 'Body contains a value',
    code: `pm.test('body has id', () => pm.expect(pm.response.json()).to.have.property('id'));`,
  },
  {
    label: 'Response time under 500 ms',
    code: `pm.test('is fast', () => pm.expect(pm.response.responseTime).to.be.below(500));`,
  },
  {
    label: 'Visualize as a table',
    code: `pm.visualizer.setTemplate(
  '<table><tr><th>#</th><th>name</th></tr>{{#each rows}}<tr><td>{{@index}}</td><td>{{name}}</td></tr>{{/each}}</table>',
  { rows: pm.response.json().data },
);`,
  },
  { label: 'Log the body', code: `console.log(pm.response.text());` },
  { label: 'Clear a variable', code: `pm.environment.unset('token');` },
];

export function ScriptEditor({
  phase,
  value,
  onChange,
}: {
  phase: 'pre-request' | 'tests';
  value: string;
  onChange: (next: string) => void;
}) {
  const snippets = phase === 'pre-request' ? PRE_REQUEST : TESTS;
  const append = (code: string): void => onChange(value ? `${value.replace(/\s*$/, '')}\n${code}\n` : `${code}\n`);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 md:flex-row">
      <div className="min-h-0 min-w-0 flex-1">
        <CodeEditor
          value={value}
          onChange={onChange}
          height="100%"
          minHeight="160px"
          extensions={[javascript()]}
          placeholder={
            phase === 'pre-request'
              ? '// Runs before the request is sent.\n// pm.environment.set("token", "…")'
              : '// Runs after the response arrives.\n// pm.test("status is 200", () => pm.response.to.have.status(200))'
          }
        />
      </div>
      <div className="shrink-0 overflow-x-auto text-[11px] md:w-52 md:overflow-y-auto">
        <div className="mb-1 hidden font-medium uppercase opacity-60 md:block">Snippets</div>
        <div className="flex gap-1 md:block">
          {snippets.map((snippet) => (
            <button
              key={snippet.label}
              onClick={() => append(snippet.code)}
              className="shrink-0 whitespace-nowrap rounded px-1.5 py-1 text-left opacity-80 hover:bg-[var(--vscode-list-hoverBackground)] hover:opacity-100 md:mb-0.5 md:block md:w-full md:whitespace-normal"
            >
              {snippet.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
