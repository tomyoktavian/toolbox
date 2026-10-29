import { useEffect, useState } from 'react';
import { FileText, Table2 } from 'lucide-react';
import type { KeyValue } from '@/lib/http-client/core';
import { useBridge } from '@/lib/http-client/ui/bridge';
import { KeyValueEditor } from '../KeyValueEditor';
import { BulkEditView } from './BulkEditView';

/** Query params as the table, or as bulk text/JSON; the choice is remembered per panel. */
export function ParamsEditor({
  rows,
  onChange,
}: {
  rows: readonly KeyValue[];
  onChange: (next: KeyValue[]) => void;
}) {
  const { loadViewState, saveViewState } = useBridge();
  const [bulk, setBulk] = useState(() => loadViewState<{ httpParamsBulk?: boolean }>().httpParamsBulk ?? false);

  useEffect(() => {
    saveViewState({ httpParamsBulk: bulk });
  }, [bulk, saveViewState]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex shrink-0 items-center">
        <span className="opacity-60">Query Params</span>
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
          <BulkEditView items={rows} onChange={onChange} />
        ) : (
          <KeyValueEditor rows={rows} onChange={onChange} keyPlaceholder="Query param" />
        )}
      </div>
    </div>
  );
}
