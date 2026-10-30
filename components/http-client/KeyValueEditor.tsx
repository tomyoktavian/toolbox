import { Trash2 } from 'lucide-react';
import type { KeyValue } from '@/lib/http-client/core';
import { VarInput } from './VarInput';
import { CELL, pruneBlank, setPair, withTrailingBlank } from './lib';

export function KeyValueEditor({
  rows,
  onChange,
  keyPlaceholder = 'Nama',
  valuePlaceholder = 'Nilai',
  withDescription = false,
  descriptionPlaceholder = 'Deskripsi',
}: {
  rows: readonly KeyValue[];
  onChange: (next: KeyValue[]) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  /** Adds a column for the row's description. */
  withDescription?: boolean;
  descriptionPlaceholder?: string;
}) {
  const view = withTrailingBlank(rows);
  const commit = (next: KeyValue[]): void => onChange(pruneBlank(next));
  const keyWidth = withDescription ? 'w-1/4' : 'w-1/3';
  const setDescription = (index: number, text: string): void =>
    commit(
      view.map((row, i) => {
        if (i !== index) return row;
        const next = { ...row };
        if (text) next.description = text;
        else delete next.description;
        return next;
      }),
    );

  return (
    <div className="flex flex-col">
      <div className="mb-1 flex items-center gap-1 px-0.5 text-[10px] uppercase tracking-wide opacity-50">
        <span className="w-[13px] shrink-0" />
        <span className={`${keyWidth} min-w-0 pl-2`}>{keyPlaceholder}</span>
        <span className="min-w-0 flex-1 pl-2">{valuePlaceholder}</span>
        {withDescription && <span className="w-1/4 min-w-0 pl-2">{descriptionPlaceholder}</span>}
        <span className="w-[22px] shrink-0" />
      </div>
      <div className="flex flex-col gap-1">
        {view.map((row, index) => (
          <div key={index} className={`flex items-center gap-1 ${row.enabled ? '' : 'opacity-50'}`}>
            <input
              type="checkbox"
              checked={row.enabled}
              onChange={(e) => commit(setPair(view, index, { enabled: e.target.checked }))}
              className="shrink-0"
              data-tip="Aktifkan baris ini"
            />
            <VarInput
              value={row.key}
              placeholder={keyPlaceholder}
              onChange={(key) => commit(setPair(view, index, { key }))}
              className={`${keyWidth} ${CELL}`}
            />
            <VarInput
              value={row.value}
              placeholder={valuePlaceholder}
              onChange={(value) => commit(setPair(view, index, { value }))}
              className={`flex-1 ${CELL}`}
            />
            {withDescription && (
              <input
                value={row.description ?? ''}
                placeholder={descriptionPlaceholder}
                // A blank row is dropped as soon as it is committed, which would swallow what is typed here.
                disabled={!row.key.trim() && !row.value.trim()}
                onChange={(event) => setDescription(index, event.target.value)}
                className={`w-1/4 min-w-0 px-2 py-1 text-xs leading-normal outline-none placeholder:text-[var(--vscode-input-placeholderForeground)] disabled:opacity-50 ${CELL}`}
              />
            )}
            <button
              data-tip="Hapus baris"
              onClick={() => commit(view.filter((_, i) => i !== index))}
              className="shrink-0 rounded p-1 opacity-60 hover:opacity-100"
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
