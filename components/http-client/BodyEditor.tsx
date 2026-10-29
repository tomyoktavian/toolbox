import type { BodyMode, RequestBody } from '@/lib/http-client/core';
import { json } from '@codemirror/lang-json';
import { SelectField } from './SelectField';
import { KeyValueEditor } from './KeyValueEditor';
import { VarCodeEditor } from './VarCodeEditor';
import { prettyJson } from './lib';

const JSON_EXTENSIONS = [json()];

const MODES: Array<{ value: BodyMode; label: string }> = [
  { value: 'none', label: 'None' },
  { value: 'json', label: 'JSON' },
  { value: 'text', label: 'Text' },
  { value: 'xml', label: 'XML' },
  { value: 'urlencoded', label: 'Form URL-encoded' },
  { value: 'form', label: 'Multipart form' },
  { value: 'graphql', label: 'GraphQL' },
];

export function BodyEditor({
  body,
  onChange,
}: {
  body: RequestBody;
  onChange: (next: RequestBody) => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-2 text-xs">
      <div className="flex items-center gap-2">
        <SelectField
          value={body.mode}
          tip="Tipe body request"
          onChange={(mode) => onChange({ ...body, mode })}
          options={MODES}
          className="min-w-36"
        />
        {body.mode === 'json' && (
          <button
            className="opacity-70 hover:opacity-100"
            onClick={() => onChange({ ...body, text: prettyJson(body.text ?? '') })}
          >
            Rapikan
          </button>
        )}
      </div>

      {body.mode === 'none' && <p className="opacity-60">Request ini dikirim tanpa body.</p>}

      {body.mode === 'json' && (
        <div className="min-h-0 flex-1">
          <VarCodeEditor extensions={JSON_EXTENSIONS}
            value={body.text ?? ''}
            height="100%"
            onChange={(text) => onChange({ ...body, text })}
          />
        </div>
      )}

      {(body.mode === 'text' || body.mode === 'xml') && (
        <div className="min-h-0 flex-1">
          <VarCodeEditor
            value={body.text ?? ''}
            height="100%"
            onChange={(text) => onChange({ ...body, text })}
          />
        </div>
      )}

      {(body.mode === 'urlencoded' || body.mode === 'form') && (
        <KeyValueEditor
          rows={body.form ?? []}
          onChange={(form) => onChange({ ...body, form })}
          keyPlaceholder="Field"
        />
      )}

      {body.mode === 'graphql' && (
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          <span className="shrink-0 opacity-70">Query</span>
          <div className="min-h-0 flex-1">
            <VarCodeEditor
              value={body.graphql?.query ?? ''}
              height="100%"
              onChange={(query) =>
                onChange({ ...body, graphql: { ...(body.graphql ?? { query: '' }), query } })
              }
            />
          </div>
          <span className="shrink-0 opacity-70">Variables (JSON)</span>
          <div className="h-36 shrink-0">
            <VarCodeEditor extensions={JSON_EXTENSIONS}
              value={body.graphql?.variables ?? ''}
              height="100%"
              onChange={(variables) =>
                onChange({
                  ...body,
                  graphql: { ...(body.graphql ?? { query: '' }), variables },
                })
              }
            />
          </div>
        </div>
      )}
    </div>
  );
}
