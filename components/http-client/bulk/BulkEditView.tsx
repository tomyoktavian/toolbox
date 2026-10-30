import { useEffect, useRef, useState } from 'react';
import { json } from '@codemirror/lang-json';
import { FileJson, FileText, Info } from 'lucide-react';
import type { KeyValue } from '@/lib/http-client/core';
import { VarCodeEditor } from '../VarCodeEditor';
import { convertItemsToFormat, parseJsonFormat, parseTextFormat, type BulkFormat } from './bulk-format';

// Ported from network-recorder's postmanV2 BulkEditView (params only).

const JSON_EXTENSIONS = [json()];
const TEXT_EXTENSIONS: typeof JSON_EXTENSIONS = [];

function enabledKey(items: readonly KeyValue[]): string {
  return JSON.stringify(
    items.filter((item) => item.enabled).map(({ key, value, description }) => ({ key, value, description })),
  );
}

export function BulkEditView({
  items,
  onChange,
  kind = 'params',
}: {
  items: readonly KeyValue[];
  onChange: (items: KeyValue[]) => void;
  /** Query params nest bracket keys and type their values; headers stay flat text. */
  kind?: 'params' | 'headers';
}) {
  const structured = kind === 'params';
  const [bulkFormat, setBulkFormat] = useState<BulkFormat>('json');
  const [bulkText, setBulkText] = useState(() =>
    convertItemsToFormat('json', items.filter((item) => item.enabled), structured),
  );
  const lastEnabledItemsRef = useRef(enabledKey(items));

  // Only enabled params are edited here. Refresh the text when they change outside the editor
  // (the table, the URL bar); edits made here are recorded first so typing is never rewritten.
  useEffect(() => {
    const key = enabledKey(items);
    if (key === lastEnabledItemsRef.current) return;
    lastEnabledItemsRef.current = key;
    setBulkText(convertItemsToFormat(bulkFormat, items.filter((item) => item.enabled), structured));
  }, [items, bulkFormat, structured]);

  const toggleFormat = (): void => {
    const newFormat: BulkFormat = bulkFormat === 'text' ? 'json' : 'text';
    const currentItems = bulkFormat === 'json' ? parseJsonFormat(bulkText) : parseTextFormat(bulkText);
    setBulkText(currentItems.length > 0 ? convertItemsToFormat(newFormat, currentItems, structured) : bulkText);
    setBulkFormat(newFormat);
  };

  const handleChange = (val: string): void => {
    setBulkText(val);
    const parsedItems = bulkFormat === 'text' ? parseTextFormat(val) : parseJsonFormat(val);
    let next: KeyValue[] | undefined;
    if (parsedItems.length > 0) {
      // Keep every disabled param and replace the enabled ones with what was parsed.
      next = [...items.filter((item) => !item.enabled), ...parsedItems];
    } else if (val.trim() === '') {
      // An empty editor disables everything rather than deleting it.
      next = items.map((item) => ({ ...item, enabled: false }));
    }
    if (!next) return;
    lastEnabledItemsRef.current = enabledKey(next);
    onChange(next);
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex shrink-0 items-start gap-2">
        <div className="flex flex-1 items-start gap-2 rounded border border-sky-500/20 bg-sky-500/10 p-2 text-sky-700 dark:text-sky-300">
          <Info size={13} className="mt-0.5 shrink-0" />
          <p className="text-[11px] leading-relaxed">
            {bulkFormat === 'text' ? (
              <>
                Format: <span className="font-mono">key:value</span> (satu per baris), deskripsi opsional:{' '}
                <span className="font-mono">key:value:desc:deskripsi</span>
                <br />
                Contoh:{' '}
                <span className="font-mono">
                  {kind === 'params' ? 'page:1:desc:untuk pagination' : 'Accept:application/json:desc:format respons'}
                </span>
              </>
            ) : (
              <>
                Format: <span className="font-mono">JSON object</span>, deskripsi opsional sebagai komentar di
                akhir baris
                <br />
                Contoh:{' '}
                <span className="font-mono">
                  {kind === 'params' ? '"page": 1, // untuk pagination' : '"Accept": "application/json", // format respons'}
                </span>
                {kind === 'headers' && (
                  <>
                    <br />
                    Nilai header selalu teks, jadi ditulis di dalam tanda kutip.
                  </>
                )}
              </>
            )}
          </p>
        </div>
        <button
          onClick={toggleFormat}
          data-tip={`Ganti ke format ${bulkFormat === 'text' ? 'JSON' : 'Text'}`}
          className="flex shrink-0 items-center gap-1 rounded border border-[var(--vscode-panel-border)] px-2 py-1 hover:bg-[var(--vscode-toolbar-hoverBackground)]"
        >
          {bulkFormat === 'text' ? <FileJson size={12} /> : <FileText size={12} />}
          {bulkFormat === 'text' ? 'JSON' : 'Text'}
        </button>
      </div>
      <div className="min-h-40 flex-1">
        <VarCodeEditor
          value={bulkText}
          onChange={handleChange}
          height="100%"
          extensions={bulkFormat === 'json' ? JSON_EXTENSIONS : TEXT_EXTENSIONS}
        />
      </div>
    </div>
  );
}
