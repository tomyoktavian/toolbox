import { useEffect, useRef, useState } from 'react';
import { json } from '@codemirror/lang-json';
import { FileJson, FileText, Info } from 'lucide-react';
import type { KeyValue } from '@/lib/http-client/core';
import { VarCodeEditor } from '../VarCodeEditor';
import { buildNestedObject, flattenObject } from './bulk-json';
import { fixJsonString } from './json-fix';

// Ported from network-recorder's postmanV2 BulkEditView (params only).

type BulkFormat = 'text' | 'json';

const JSON_EXTENSIONS = [json()];
const TEXT_EXTENSIONS: typeof JSON_EXTENSIONS = [];

function convertItemsToFormat(format: BulkFormat, items: readonly KeyValue[]): string {
  if (format === 'text') return items.map((item) => `${item.key}:${item.value}`).join('\n');
  // JSON format - build nested structure from bracket notation
  return JSON.stringify(buildNestedObject([...items]), null, 2);
}

function parseTextFormat(text: string): KeyValue[] {
  const items: KeyValue[] = [];
  for (const line of text.split('\n').filter((row) => row.trim())) {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;
    const key = line.substring(0, colonIndex).trim();
    const value = line.substring(colonIndex + 1).trim();
    if (key) items.push({ key, value, enabled: true });
  }
  return items;
}

function parseJsonFormat(text: string): KeyValue[] {
  try {
    const parsed = JSON.parse(fixJsonString(text));
    return flattenObject(parsed).map(({ key, value }) => ({ key, value, enabled: true }));
  } catch {
    return [];
  }
}

function enabledKey(items: readonly KeyValue[]): string {
  return JSON.stringify(items.filter((item) => item.enabled).map(({ key, value }) => ({ key, value })));
}

export function BulkEditView({
  items,
  onChange,
}: {
  items: readonly KeyValue[];
  onChange: (items: KeyValue[]) => void;
}) {
  const [bulkFormat, setBulkFormat] = useState<BulkFormat>('json');
  const [bulkText, setBulkText] = useState(() =>
    convertItemsToFormat('json', items.filter((item) => item.enabled)),
  );
  const lastEnabledItemsRef = useRef(enabledKey(items));

  // Only enabled params are edited here. Refresh the text when they change outside the editor
  // (the table, the URL bar); edits made here are recorded first so typing is never rewritten.
  useEffect(() => {
    const key = enabledKey(items);
    if (key === lastEnabledItemsRef.current) return;
    lastEnabledItemsRef.current = key;
    setBulkText(convertItemsToFormat(bulkFormat, items.filter((item) => item.enabled)));
  }, [items, bulkFormat]);

  const toggleFormat = (): void => {
    const newFormat: BulkFormat = bulkFormat === 'text' ? 'json' : 'text';
    const source = bulkFormat === 'json' ? fixJsonString(bulkText) : bulkText;
    const currentItems = bulkFormat === 'json' ? parseJsonFormat(source) : parseTextFormat(source);
    setBulkText(currentItems.length > 0 ? convertItemsToFormat(newFormat, currentItems) : source);
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
                Format: <span className="font-mono">key:value</span> (satu per baris)
                <br />
                Contoh: <span className="font-mono">page:1</span>
              </>
            ) : (
              <>
                Format: <span className="font-mono">JSON object</span>
                <br />
                Contoh: <span className="font-mono">{'{"page":"1","limit":"10"}'}</span>
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
