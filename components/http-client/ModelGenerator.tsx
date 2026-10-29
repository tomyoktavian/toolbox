import { useMemo, useState } from 'react';
import { Check, Copy, Download, X } from 'lucide-react';
import { ResponseBody } from './ResponseBody';
import { emit, TARGETS, type TargetLanguage } from './codegen/emit';
import { inferSchema, pascalCase } from './codegen/schema';
import { CELL } from './lib';

export interface SavePayload {
  body: string;
  contentType: string;
  fileName: string;
  base64?: boolean;
}

export function ModelGenerator({
  json,
  requestName,
  onSave,
  onClose,
}: {
  json: unknown;
  requestName: string;
  onSave: (payload: SavePayload) => void;
  onClose: () => void;
}) {
  const [target, setTarget] = useState<TargetLanguage>('typescript');
  const [rootName, setRootName] = useState(`${pascalCase(requestName)}Response`);
  const [copied, setCopied] = useState(false);

  const code = useMemo(() => {
    try {
      return emit(inferSchema(json, rootName.trim() || 'Response'), target);
    } catch (error) {
      return `// Gagal membangun model: ${error instanceof Error ? error.message : String(error)}`;
    }
  }, [json, rootName, target]);

  const meta = TARGETS.find((item) => item.value === target)!;
  const fileName = `${target === 'python' ? rootName.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase() : rootName}.${meta.extension}`;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--vscode-panel-border)] px-3 py-1.5 text-xs">
        <span className="font-medium">Model dari response</span>
        <select
          value={target}
          data-tip="Bahasa model yang dihasilkan"
          onChange={(e) => setTarget(e.target.value as TargetLanguage)}
          className="rounded border border-[var(--vscode-panel-border)] bg-[var(--vscode-dropdown-background)] px-1.5 py-0.5 text-xs text-[var(--vscode-dropdown-foreground)] outline-none"
        >
          {TARGETS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
        <input
          value={rootName}
          onChange={(e) => setRootName(e.target.value)}
          spellCheck={false}
          placeholder="Nama tipe akar"
          className={`w-48 px-2 py-0.5 font-mono text-xs outline-none ${CELL}`}
        />
        <span className="ml-auto flex items-center gap-1">
          <button
            data-tip={copied ? 'Tersalin' : 'Salin kode'}
            onClick={() =>
              void navigator.clipboard.writeText(code).then(() => {
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1200);
              })
            }
            className="rounded p-0.5 opacity-70 hover:opacity-100"
          >
            {copied ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
          </button>
          <button
            data-tip={`Simpan sebagai ${fileName}`}
            onClick={() => onSave({ body: code, contentType: 'text/plain', fileName })}
            className="rounded p-0.5 opacity-70 hover:opacity-100"
          >
            <Download size={13} />
          </button>
          <button data-tip="Tutup" onClick={onClose} className="rounded p-0.5 opacity-70 hover:opacity-100">
            <X size={13} />
          </button>
        </span>
      </div>
      <div className="min-h-0 flex-1">
        <ResponseBody
          text={code}
          language={target === 'typescript' ? 'javascript' : target === 'jsonschema' ? 'json' : 'text'}
          wrap={false}
        />
      </div>
    </div>
  );
}
