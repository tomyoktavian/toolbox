import { useEffect, useState } from 'react';
import { FileText, Table2 } from 'lucide-react';
import type { KeyValue } from '@/lib/http-client/core';
import { useBridge } from '@/lib/http-client/ui/bridge';
import { KeyValueEditor } from '../KeyValueEditor';
import { BulkEditView } from './BulkEditView';

type Kind = 'params' | 'headers';

const CONFIG: Record<Kind, { title: string; placeholder: string; viewKey: string }> = {
  params: { title: 'Query Params', placeholder: 'Query param', viewKey: 'httpParamsBulk' },
  headers: { title: 'Headers', placeholder: 'Header', viewKey: 'httpHeadersBulk' },
};

/** Key/value pairs as the table (with a description column), or as bulk text/JSON; the choice is remembered per panel. */
function PairsEditor({
  kind,
  rows,
  onChange,
}: {
  kind: Kind;
  rows: readonly KeyValue[];
  onChange: (next: KeyValue[]) => void;
}) {
  const { title, placeholder, viewKey } = CONFIG[kind];
  const { loadViewState, saveViewState } = useBridge();
  const [bulk, setBulk] = useState(() => loadViewState<Record<string, boolean>>()[viewKey] ?? false);

  useEffect(() => {
    saveViewState({ [viewKey]: bulk });
  }, [bulk, saveViewState, viewKey]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex shrink-0 items-center">
        <span className="opacity-60">{title}</span>
        <button
          onClick={() => setBulk(!bulk)}
          className={`ml-auto flex items-center gap-1 rounded px-2 py-1 hover:bg-[var(--vscode-toolbar-hoverBackground)] ${
            bulk ? 'bg-[var(--vscode-list-activeSelectionBackground)]' : 'opacity-80'
          }`}
        >
          {bulk ? <Table2 size={12} /> : <FileText size={12} />}
          {bulk ? 'Table' : 'Bulk Edit'}
        </button>
      </div>
      <div className="min-h-0 flex-1">
        {bulk ? (
          <BulkEditView items={rows} onChange={onChange} kind={kind} />
        ) : (
          <KeyValueEditor rows={rows} onChange={onChange} keyPlaceholder={placeholder} withDescription />
        )}
      </div>
    </div>
  );
}

export function ParamsEditor(props: { rows: readonly KeyValue[]; onChange: (next: KeyValue[]) => void }) {
  return <PairsEditor kind="params" {...props} />;
}

export function HeadersEditor(props: { rows: readonly KeyValue[]; onChange: (next: KeyValue[]) => void }) {
  return <PairsEditor kind="headers" {...props} />;
}
