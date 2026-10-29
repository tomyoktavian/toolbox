import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { badgeOf, countOf, formatScalar, isContainer, kindOf, tableColumns } from './json-table';

const PAGE = 100;
const BORDER = 'border-[var(--vscode-panel-border)]';
const SCALAR_CLASS: Record<string, string> = {
  number: 'text-[var(--vscode-charts-blue,#4fc1ff)]',
  boolean: 'text-[var(--vscode-charts-purple,#c586c0)]',
  null: 'opacity-50 italic',
  string: 'opacity-90',
};

export function JsonTable({ value }: { value: unknown }) {
  if (!isContainer(value)) {
    return <div className="p-3 font-mono text-[11px]">{formatScalar(value)}</div>;
  }
  return (
    <div className={`border-t ${BORDER} font-sans text-xs`}>
      <Block value={value} />
    </div>
  );
}

function Block({ value }: { value: unknown }): ReactNode {
  if (Array.isArray(value)) {
    const columns = tableColumns(value);
    return columns ? <RowsTable rows={value} columns={columns} /> : <List items={value} />;
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) return <Empty />;
  return (
    <div>
      {entries.map(([key, item]) =>
        isContainer(item) && countOf(item) > 0 ? (
          <Section key={key} name={key} value={item} />
        ) : (
          <Pair key={key} name={key} value={item} />
        ),
      )}
    </div>
  );
}

function Section({ name, value }: { name: string; value: unknown }) {
  const [open, setOpen] = useState(true);
  return (
    <div className={`border-b ${BORDER} last:border-b-0`}>
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-1.5 px-2 py-1 text-left hover:bg-[var(--vscode-list-hoverBackground)]"
      >
        {open ? (
          <ChevronDown size={12} className="shrink-0 opacity-70" />
        ) : (
          <ChevronRight size={12} className="shrink-0 opacity-70" />
        )}
        <span className="font-semibold">{name}</span>
        <Badge value={value} />
      </button>
      {open && (
        <div className={`ml-3 border-l ${BORDER}`}>
          <Block value={value} />
        </div>
      )}
    </div>
  );
}

function Pair({ name, value }: { name: string; value: unknown }) {
  return (
    <div className={`grid grid-cols-[minmax(6rem,14rem)_1fr] border-b ${BORDER} last:border-b-0`}>
      <div className={`truncate border-r ${BORDER} px-2 py-1 font-semibold`} data-tip={name}>
        {name}
      </div>
      <div className="min-w-0 px-2 py-1">
        <Scalar value={value} />
      </div>
    </div>
  );
}

function RowsTable({ rows, columns }: { rows: unknown[]; columns: string[] }) {
  const [limit, setLimit] = useState(PAGE);
  const shown = rows.slice(0, limit);
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className={`border-b ${BORDER} text-left`}>
            <th className={`w-10 border-r ${BORDER} px-2 py-1 font-semibold opacity-50`} />
            {columns.map((column) => (
              <th key={column} className={`border-r ${BORDER} px-2 py-1 font-semibold last:border-r-0`}>
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((row, index) => (
            <tr key={index} className={`border-b ${BORDER} last:border-b-0 align-top`}>
              <td className={`border-r ${BORDER} px-2 py-1 font-semibold opacity-50`}>{index}</td>
              {columns.map((column) => (
                <td key={column} className={`min-w-0 border-r ${BORDER} px-2 py-1 last:border-r-0`}>
                  <Cell value={(row as Record<string, unknown>)[column]} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <More total={rows.length} limit={limit} onMore={() => setLimit(limit + PAGE)} />
    </div>
  );
}

function List({ items }: { items: unknown[] }) {
  const [limit, setLimit] = useState(PAGE);
  return (
    <div>
      {items.slice(0, limit).map((item, index) => (
        <div
          key={index}
          className={`grid grid-cols-[minmax(2.5rem,4rem)_1fr] border-b ${BORDER} last:border-b-0`}
        >
          <div className={`border-r ${BORDER} px-2 py-1 font-semibold opacity-50`}>{index}</div>
          <div className="min-w-0 px-2 py-1">
            <Cell value={item} />
          </div>
        </div>
      ))}
      <More total={items.length} limit={limit} onMore={() => setLimit(limit + PAGE)} />
    </div>
  );
}

function Cell({ value }: { value: unknown }) {
  const [open, setOpen] = useState(false);
  if (!isContainer(value) || countOf(value) === 0) return <Scalar value={value} />;
  return (
    <div className="min-w-0">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 opacity-80 hover:opacity-100"
        data-tip={open ? 'Tutup isi' : 'Lihat isi'}
      >
        {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        <Badge value={value} />
      </button>
      {open && (
        <div className={`mt-1 rounded border ${BORDER}`}>
          <Block value={value} />
        </div>
      )}
    </div>
  );
}

function Scalar({ value }: { value: unknown }) {
  const kind = kindOf(value);
  if (isContainer(value)) return <Badge value={value} />;
  const text = formatScalar(value);
  return (
    <span className={`block truncate font-mono text-[11px] ${SCALAR_CLASS[kind] ?? ''}`} data-tip={text}>
      {text}
    </span>
  );
}

function Badge({ value }: { value: unknown }) {
  return (
    <span className="rounded bg-[var(--vscode-panel-border)]/60 px-1 font-mono text-[10px] opacity-80">
      {badgeOf(value)}
    </span>
  );
}

function More({ total, limit, onMore }: { total: number; limit: number; onMore: () => void }) {
  if (total <= limit) return null;
  return (
    <button
      onClick={onMore}
      className="w-full px-2 py-1 text-left opacity-70 hover:bg-[var(--vscode-list-hoverBackground)] hover:opacity-100"
    >
      Tampilkan {Math.min(PAGE, total - limit)} baris lagi · {total - limit} tersisa
    </button>
  );
}

function Empty() {
  return <div className="px-2 py-1 opacity-50">kosong</div>;
}
