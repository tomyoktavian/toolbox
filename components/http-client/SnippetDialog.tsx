import { useEffect, useMemo, useState } from 'react';
import { javascript } from '@codemirror/lang-javascript';
import { php } from '@codemirror/lang-php';
import { StreamLanguage } from '@codemirror/language';
import { go } from '@codemirror/legacy-modes/mode/go';
import { python } from '@codemirror/legacy-modes/mode/python';
import { shell } from '@codemirror/legacy-modes/mode/shell';
import type { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { Check, Code, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import type { HttpRequest } from '@/lib/http-client/core';
import {
  SNIPPET_LANGUAGES,
  generateSnippet,
  type SnippetLanguage,
  type SnippetRequest,
} from '@/lib/http-client/core/snippet/generate';
import { rpc } from '@/lib/http-client/ui/rpc';
import { CodeEditor } from './shared/CodeEditor';
import { methodStyle } from './lib';

// Snippets hold whole URLs and bodies on one line, so wrap them instead of scrolling sideways.
const LANGUAGE_EXTENSIONS: Record<SnippetLanguage, Extension[]> = {
  curl: [StreamLanguage.define(shell), EditorView.lineWrapping],
  javascript: [javascript(), EditorView.lineWrapping],
  python: [StreamLanguage.define(python), EditorView.lineWrapping],
  php: [php(), EditorView.lineWrapping],
  go: [StreamLanguage.define(go), EditorView.lineWrapping],
};

const noop = (): void => {};

const LANGUAGE_KEY = 'http-client:snippet-language';

function readLanguage(): SnippetLanguage {
  try {
    const saved = localStorage.getItem(LANGUAGE_KEY);
    return SNIPPET_LANGUAGES.some((item) => item.id === saved) ? (saved as SnippetLanguage) : 'curl';
  } catch {
    return 'curl';
  }
}

interface Props {
  /** The request to show code for; the dialog is open while this is set. */
  request: HttpRequest | undefined;
  collectionId: string;
  environmentId: string | undefined;
  onClose: () => void;
}

export function SnippetDialog({ request, collectionId, environmentId, onClose }: Props) {
  return (
    <Dialog open={request !== undefined} onOpenChange={(open) => !open && onClose()}>
      {/* The dialog is a grid; without a bounded column a long URL widens it past the viewport. */}
      <DialogContent className="grid-cols-[minmax(0,1fr)] sm:max-w-3xl">
        {request && (
          <SnippetContent request={request} collectionId={collectionId} environmentId={environmentId} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function SnippetContent({
  request,
  collectionId,
  environmentId,
}: {
  request: HttpRequest;
  collectionId: string;
  environmentId: string | undefined;
}) {
  const [language, setLanguage] = useState<SnippetLanguage>(readLanguage);
  // On by default so the snippet is ready to run. Not remembered: the switch resets every time.
  const [resolve, setResolve] = useState(true);
  const [result, setResult] = useState<{ resolve: boolean; snippet?: SnippetRequest; error?: string }>();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    rpc('snippet', collectionId, request, environmentId, resolve).then(
      (snippet) => {
        if (!cancelled) setResult({ resolve, snippet });
      },
      (error: unknown) => {
        if (!cancelled) setResult({ resolve, error: error instanceof Error ? error.message : String(error) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [request, collectionId, environmentId, resolve]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  // Until the answer for the current switch position arrives, show the loading state.
  const current = result?.resolve === resolve ? result : undefined;
  const code = useMemo(
    () => (current?.snippet ? generateSnippet(language, current.snippet) : ''),
    [language, current],
  );

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {}
  };

  return (
    <>
      <DialogHeader className="flex-row items-center gap-3 pr-8">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
          <Code size={18} className="text-muted-foreground" />
        </div>
        <div className="min-w-0">
          <DialogTitle>Code Snippet</DialogTitle>
          <DialogDescription className="truncate font-mono text-xs" title={request.url}>
            <span className={cn('font-semibold', methodStyle(request.method))}>{request.method}</span>{' '}
            {request.url}
          </DialogDescription>
        </div>
      </DialogHeader>

      <div className="flex flex-wrap items-center gap-1.5">
        {SNIPPET_LANGUAGES.map((item) => (
          <button
            key={item.id}
            onClick={() => {
              setLanguage(item.id);
              try {
                localStorage.setItem(LANGUAGE_KEY, item.id);
              } catch {}
            }}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium transition-colors',
              language === item.id
                ? 'bg-foreground text-background'
                : 'bg-muted text-muted-foreground hover:text-foreground',
            )}
          >
            {item.label}
          </button>
        ))}
        <Button variant="outline" size="sm" className="ml-auto" onClick={() => void copy()} disabled={!code}>
          {copied ? <Check /> : <Copy />}
          {copied ? 'Tersalin' : 'Copy'}
        </Button>
      </div>

      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <Switch size="sm" checked={resolve} onCheckedChange={(checked) => setResolve(checked)} />
        Pakai nilai variabel dari environment aktif
        {resolve && <span className="text-amber-600 dark:text-amber-400">· snippet memuat nilai asli, termasuk secret</span>}
      </label>

      <div className="h-80 min-h-0">
        {current?.error ? (
          <p className="rounded-lg bg-destructive/10 p-3 text-xs text-destructive">{current.error}</p>
        ) : current?.snippet ? (
          <CodeEditor
            value={code}
            onChange={noop}
            height="100%"
            readOnly
            lineNumbers={false}
            extensions={LANGUAGE_EXTENSIONS[language]}
          />
        ) : (
          <p className="text-xs text-muted-foreground">Menyiapkan snippet…</p>
        )}
      </div>

      {current?.snippet && current.snippet.notes.length > 0 && (
        <ul className="space-y-1 text-xs text-amber-600 dark:text-amber-400">
          {current.snippet.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}
    </>
  );
}
