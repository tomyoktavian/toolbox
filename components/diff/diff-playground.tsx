"use client";

import { useMemo, useState } from "react";
import { AlertCircle, ArrowLeftRight, Eraser, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import {
  diffLines,
  formatJson,
  splitLines,
  toSplitRows,
  type DiffOp,
} from "@/lib/diff";

type Mode = "text" | "json";
type View = "split" | "unified";

const SAMPLES: Record<Mode, { original: string; modified: string }> = {
  text: {
    original: "Selamat pagi\nHari ini cerah\nKita berangkat jam 8\nSampai jumpa",
    modified:
      "Selamat pagi\nHari ini mendung\nKita berangkat jam 8\nJangan lupa bawa payung\nSampai jumpa",
  },
  json: {
    original: JSON.stringify(
      { id: 1024, nama: "Budi Santoso", peran: ["admin"], aktif: true },
      null,
      2,
    ),
    modified: JSON.stringify(
      {
        id: 1024,
        nama: "Budi S.",
        peran: ["admin", "editor"],
        aktif: true,
        email: "budi@contoh.id",
      },
      null,
      2,
    ),
  },
};

const removedCell = "bg-red-500/10";
const addedCell = "bg-emerald-500/10";
const numberCell =
  "w-12 min-w-12 select-none px-2 text-right align-top text-muted-foreground";
const textCell = "px-2 align-top break-all whitespace-pre-wrap";

function printable(text: string | undefined) {
  return text ? text : " ";
}

function normalizeSpaces(line: string) {
  return line.trim().replace(/\s+/g, " ");
}

export function DiffPlayground() {
  const [original, setOriginal] = useState("");
  const [modified, setModified] = useState("");
  const [mode, setMode] = useState<Mode>("text");
  const [view, setView] = useState<View>("split");
  const [ignoreWhitespace, setIgnoreWhitespace] = useState(false);
  const [sortKeys, setSortKeys] = useState(false);

  const prepared = useMemo(() => {
    let a = original;
    let b = modified;
    const errors: { side: string; message: string }[] = [];

    if (mode === "json") {
      const formattedA = formatJson(original, sortKeys);
      const formattedB = formatJson(modified, sortKeys);
      if (formattedA.ok) a = formattedA.text;
      else errors.push({ side: "Asli", message: formattedA.error });
      if (formattedB.ok) b = formattedB.text;
      else errors.push({ side: "Baru", message: formattedB.error });
    }

    return { linesA: splitLines(a), linesB: splitLines(b), errors };
  }, [original, modified, mode, sortKeys]);

  const result = useMemo(() => {
    const { linesA, linesB, errors } = prepared;
    if (errors.length > 0 || linesA.length + linesB.length === 0) return null;

    const key = ignoreWhitespace && mode === "text" ? normalizeSpaces : (l: string) => l;
    const { ops, approximate } = diffLines(linesA.map(key), linesB.map(key));
    return {
      ops,
      approximate,
      added: ops.filter((op) => op.kind === "add").length,
      removed: ops.filter((op) => op.kind === "remove").length,
    };
  }, [prepared, ignoreWhitespace, mode]);

  const loadSample = () => {
    setOriginal(SAMPLES[mode].original);
    setModified(SAMPLES[mode].modified);
  };

  const swap = () => {
    setOriginal(modified);
    setModified(original);
  };

  const clear = () => {
    setOriginal("");
    setModified("");
  };

  const textareaClass =
    "min-h-64 w-full resize-y rounded-lg border bg-card px-3 py-2.5 font-mono text-[13px] leading-relaxed outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-lg border bg-background p-3">
        <Tabs value={mode} onValueChange={(value) => setMode(value as Mode)}>
          <TabsList className="h-8">
            <TabsTrigger value="text" className="px-3 text-xs">
              Teks
            </TabsTrigger>
            <TabsTrigger value="json" className="px-3 text-xs">
              JSON
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <Tabs value={view} onValueChange={(value) => setView(value as View)}>
          <TabsList className="h-8">
            <TabsTrigger value="split" className="px-3 text-xs">
              Berdampingan
            </TabsTrigger>
            <TabsTrigger value="unified" className="px-3 text-xs">
              Gabungan
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {mode === "text" ? (
          <label className="flex items-center gap-2 text-[13px]">
            <input
              type="checkbox"
              checked={ignoreWhitespace}
              onChange={(event) => setIgnoreWhitespace(event.target.checked)}
              className="size-4"
            />
            Abaikan perbedaan spasi
          </label>
        ) : (
          <label className="flex items-center gap-2 text-[13px]">
            <input
              type="checkbox"
              checked={sortKeys}
              onChange={(event) => setSortKeys(event.target.checked)}
              className="size-4"
            />
            Urutkan kunci
          </label>
        )}

        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={loadSample}>
            <FileText className="size-3.5" />
            Contoh
          </Button>
          <Button variant="outline" size="sm" onClick={swap}>
            <ArrowLeftRight className="size-3.5" />
            Tukar
          </Button>
          <Button variant="outline" size="sm" onClick={clear}>
            <Eraser className="size-3.5" />
            Kosongkan
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="diff-original" className="text-sm font-medium">
            Asli
          </label>
          <textarea
            id="diff-original"
            value={original}
            onChange={(event) => setOriginal(event.target.value)}
            spellCheck={false}
            placeholder={mode === "json" ? '{ "nama": "Budi" }' : "Tempel teks asli"}
            className={textareaClass}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="diff-modified" className="text-sm font-medium">
            Baru
          </label>
          <textarea
            id="diff-modified"
            value={modified}
            onChange={(event) => setModified(event.target.value)}
            spellCheck={false}
            placeholder={mode === "json" ? '{ "nama": "Budi S." }' : "Tempel teks baru"}
            className={textareaClass}
          />
        </div>
      </div>

      {prepared.errors.map(({ side, message }) => (
        <Alert key={side} variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>JSON {side} tidak valid</AlertTitle>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      ))}

      {result ? (
        <section aria-labelledby="judul-hasil" className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <h2 id="judul-hasil" className="text-sm font-semibold">
              Hasil
            </h2>
            {result.added + result.removed === 0 ? (
              <span className="text-[13px] text-muted-foreground">
                Tidak ada perbedaan.
              </span>
            ) : (
              <span className="flex gap-2 font-mono text-xs">
                <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-emerald-700 dark:text-emerald-300">
                  +{result.added}
                </span>
                <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-red-700 dark:text-red-300">
                  −{result.removed}
                </span>
              </span>
            )}
            {result.approximate && (
              <span className="text-xs text-muted-foreground">
                Kedua teks terlalu berbeda, jadi hasilnya ditampilkan tanpa mencari
                baris yang sama.
              </span>
            )}
          </div>
          <div className="overflow-auto rounded-lg border bg-card font-mono text-[13px] leading-relaxed">
            {view === "split" ? (
              <SplitView
                ops={result.ops}
                linesA={prepared.linesA}
                linesB={prepared.linesB}
              />
            ) : (
              <UnifiedView
                ops={result.ops}
                linesA={prepared.linesA}
                linesB={prepared.linesB}
              />
            )}
          </div>
        </section>
      ) : (
        prepared.errors.length === 0 && (
          <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            Tempel dua teks di atas untuk melihat perbedaannya.
          </p>
        )
      )}
    </div>
  );
}

interface ViewProps {
  ops: DiffOp[];
  linesA: string[];
  linesB: string[];
}

function SplitView({ ops, linesA, linesB }: ViewProps) {
  const rows = toSplitRows(ops);
  return (
    <table className="w-full table-fixed border-collapse">
      <caption className="sr-only">Perbedaan dua teks, berdampingan</caption>
      <colgroup>
        <col className="w-12" />
        <col />
        <col className="w-12" />
        <col />
      </colgroup>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            <td className={cn(numberCell, row.left?.kind === "remove" && removedCell)}>
              {row.left ? row.left.index + 1 : ""}
            </td>
            <td
              className={cn(
                textCell,
                "border-r",
                row.left?.kind === "remove" && removedCell,
                !row.left && "bg-muted/40",
              )}
            >
              {row.left ? printable(linesA[row.left.index]) : ""}
            </td>
            <td className={cn(numberCell, row.right?.kind === "add" && addedCell)}>
              {row.right ? row.right.index + 1 : ""}
            </td>
            <td
              className={cn(
                textCell,
                row.right?.kind === "add" && addedCell,
                !row.right && "bg-muted/40",
              )}
            >
              {row.right ? printable(linesB[row.right.index]) : ""}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function UnifiedView({ ops, linesA, linesB }: ViewProps) {
  return (
    <table className="w-full table-fixed border-collapse">
      <caption className="sr-only">Perbedaan dua teks, digabung</caption>
      <colgroup>
        <col className="w-12" />
        <col className="w-12" />
        <col className="w-6" />
        <col />
      </colgroup>
      <tbody>
        {ops.map((op, i) => {
          const rowClass =
            op.kind === "remove" ? removedCell : op.kind === "add" ? addedCell : "";
          const text =
            op.kind === "remove"
              ? linesA[op.oldIndex!]
              : linesB[op.newIndex!];
          return (
            <tr key={i} className={rowClass}>
              <td className={numberCell}>{op.oldIndex !== null ? op.oldIndex + 1 : ""}</td>
              <td className={numberCell}>{op.newIndex !== null ? op.newIndex + 1 : ""}</td>
              <td
                aria-hidden="true"
                className={cn(
                  "select-none text-center align-top",
                  op.kind === "remove" && "text-red-700 dark:text-red-300",
                  op.kind === "add" && "text-emerald-700 dark:text-emerald-300",
                )}
              >
                {op.kind === "remove" ? "−" : op.kind === "add" ? "+" : ""}
              </td>
              <td className={textCell}>{printable(text)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
