import { useMemo, useState } from 'react';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { ArrowLeft, Save, Trash2 } from 'lucide-react';
import type { KeyValue, RequestBody, RequestExample } from '@/lib/http-client/core';
import { CodeEditor } from '@/components/http-client/shared/CodeEditor';
import { BodyEditor } from './BodyEditor';
import { KeyValueEditor } from './KeyValueEditor';
import { guessLanguage } from './ResponseBody';
import { prettyJson, statusColor } from './lib';

type Pane = 'body' | 'headers' | 'payload';

export function ExampleEditor({
  example,
  index,
  total,
  onChange,
  onDelete,
  onClose,
}: {
  example: RequestExample;
  index: number;
  total: number;
  onChange: (next: RequestExample) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(example.name);
  const [status, setStatus] = useState(String(example.status));
  const [statusText, setStatusText] = useState(example.statusText);
  // A saved response is usually one minified line; open it formatted. It is only written back when the
  // example is saved, and an invalid or non-JSON body is left exactly as it was.
  const [body, setBody] = useState(() =>
    guessLanguage(example.contentType ?? '', example.body) === 'json' ? prettyJson(example.body) : example.body,
  );
  const [pane, setPane] = useState<Pane>('body');

  const language = useMemo(
    () => guessLanguage(example.contentType ?? '', body),
    [example.contentType, body],
  );
  const bodyExtensions = useMemo(
    () => (language === 'json' ? [json()] : language === 'javascript' ? [javascript()] : []),
    [language],
  );

  const commit = (patch: Partial<RequestExample> = {}): void => {
    const parsed = Number.parseInt(status, 10);
    onChange({
      ...example,
      name: name.trim() || example.name,
      status: Number.isFinite(parsed) ? parsed : example.status,
      statusText,
      body,
      ...patch,
    });
  };

  const setRequestBody = (requestBody: RequestBody): void => commit({ requestBody });

  return (
    <div className="flex h-full min-h-0 flex-col text-xs">
      <div className="flex shrink-0 items-center gap-2 px-3 py-1.5">
        <button
          data-tip="Kembali ke respons"
          className="flex items-center gap-1 opacity-70 hover:opacity-100"
          onClick={onClose}
        >
          <ArrowLeft size={12} /> Respons
        </button>
        <span className="opacity-40">/</span>
        <span className="opacity-60">
          Contoh {index + 1}/{total}
        </span>
        <button
          data-tip="Hapus contoh ini"
          className="ml-auto opacity-60 hover:text-red-400 hover:opacity-100"
          onClick={onDelete}
        >
          <Trash2 size={13} />
        </button>
        <button
          data-tip="Simpan contoh"
          className="flex items-center gap-1 rounded border border-[var(--vscode-panel-border)] px-1.5 py-0.5 opacity-80 hover:bg-[var(--vscode-toolbar-hoverBackground)] hover:opacity-100"
          onClick={() => commit()}
        >
          <Save size={12} /> Simpan
        </button>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2 px-3 pb-2">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          onBlur={() => commit()}
          placeholder="Nama contoh"
          className="min-w-0 flex-1 rounded border border-[var(--vscode-panel-border)] bg-[var(--vscode-input-background)] px-2 py-1 text-xs outline-none"
        />
        <input
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          onBlur={() => {
            const parsed = Number.parseInt(status, 10);
            if (Number.isFinite(parsed)) commit();
            else setStatus(String(example.status));
          }}
          className={`w-16 rounded border border-[var(--vscode-panel-border)] bg-[var(--vscode-input-background)] px-2 py-1 font-mono outline-none ${statusColor(example.status)}`}
        />
        <input
          value={statusText}
          onChange={(event) => setStatusText(event.target.value)}
          onBlur={() => commit()}
          placeholder="Status text"
          className="w-36 rounded border border-[var(--vscode-panel-border)] bg-[var(--vscode-input-background)] px-2 py-1 outline-none"
        />
      </div>

      <div className="flex shrink-0 items-center gap-3 border-b border-[var(--vscode-panel-border)] px-3 text-[11px]">
        {(
          [
            ['body', 'Body'],
            ['headers', 'Headers'],
            ...(example.requestBody ? [['payload', 'Payload request'] as const] : []),
          ] as Array<[Pane, string]>
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setPane(key)}
            className={`-mb-px border-b-2 px-1 py-1.5 ${
              pane === key
                ? 'border-[var(--vscode-focusBorder)] opacity-100'
                : 'border-transparent opacity-60 hover:opacity-90'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 px-3 py-2">
        {pane === 'headers' && (
          <KeyValueEditor
            rows={example.headers}
            onChange={(headers: KeyValue[]) => commit({ headers })}
            keyPlaceholder="Header"
          />
        )}
        {pane === 'payload' && example.requestBody && (
          <BodyEditor body={example.requestBody} onChange={setRequestBody} />
        )}
        {pane === 'body' && (
          <div className="h-full" onBlurCapture={() => commit()}>
            <CodeEditor
              value={body}
              height="100%"
              extensions={bodyExtensions}
              onChange={(text) => setBody(text)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
