"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { HighlightText } from "../HighlightText";
import type { HostUi, HttpClientHost, PickItem } from "@/lib/http-client/ui/host";

type Pending =
  | { kind: "confirm"; message: string; action: string; resolve: (ok: boolean) => void }
  | { kind: "pick"; placeholder: string; items: PickItem[]; resolve: (id: string | undefined) => void }
  | {
      kind: "input";
      title: string;
      prompt: string;
      placeholder?: string;
      resolve: (value: string | undefined) => void;
    };

function readFile(accept: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) resolve(undefined);
      else void file.text().then(resolve, () => resolve(undefined));
    };
    input.oncancel = () => resolve(undefined);
    input.click();
  });
}

/** Browser versions of the VS Code dialogs the host relies on (confirm, quick pick, input box). */
export function HostDialogs({ host }: { host: HttpClientHost }) {
  const [pending, setPending] = useState<Pending | undefined>();
  const [value, setValue] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    const ui: HostUi = {
      confirm: (message, action = "Hapus") =>
        new Promise((resolve) => setPending({ kind: "confirm", message, action, resolve })),
      pick: (placeholder, items) =>
        new Promise((resolve) => {
          setQuery("");
          setPending({ kind: "pick", placeholder, items, resolve });
        }),
      input: (options) =>
        new Promise((resolve) => {
          setValue("");
          setPending({ kind: "input", ...options, resolve });
        }),
      openFile: readFile,
      toast: (level, message) => (level === "error" ? toast.error(message) : toast(message)),
    };
    host.setUi(ui);
    return () => host.setUi(undefined);
  }, [host]);

  const close = (result?: boolean | string) => {
    if (!pending) return;
    if (pending.kind === "confirm") pending.resolve(result === true);
    else pending.resolve(typeof result === "string" ? result : undefined);
    setPending(undefined);
  };

  const needle = query.trim().toLowerCase();
  const pickItems =
    pending?.kind === "pick"
      ? pending.items.filter((item) => item.label.toLowerCase().includes(needle))
      : [];

  return (
    <>
      <AlertDialog open={pending?.kind === "confirm"} onOpenChange={(open) => !open && close(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pending?.kind === "confirm" ? pending.message : ""}</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => close(true)}>
              {pending?.kind === "confirm" ? pending.action : "Hapus"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={pending?.kind === "pick"} onOpenChange={(open) => !open && close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{pending?.kind === "pick" ? pending.placeholder : ""}</DialogTitle>
          </DialogHeader>
          <div className="relative">
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              autoFocus
              aria-label="Cari collection"
              placeholder="Cari collection…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                // Enter takes the first match, so a typed name is one keystroke from done.
                const first = pickItems[0];
                if (event.key === "Enter" && first) {
                  event.preventDefault();
                  close(first.id);
                }
              }}
              className="pl-8"
            />
          </div>
          <div className="flex max-h-72 min-h-0 flex-col gap-1 overflow-y-auto">
            {pickItems.map((item) => (
              <Button
                key={item.id}
                variant="ghost"
                className="justify-start"
                onClick={() => close(item.id)}
              >
                <HighlightText text={item.label} highlight={query} />
              </Button>
            ))}
            {pending?.kind === "pick" && pickItems.length === 0 && (
              <p className="px-2 py-4 text-center text-xs text-muted-foreground">
                Tidak ada collection yang cocok.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={pending?.kind === "input"} onOpenChange={(open) => !open && close()}>
        <DialogContent>
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (value.trim()) close(value);
            }}
          >
            <DialogHeader>
              <DialogTitle>{pending?.kind === "input" ? pending.title : ""}</DialogTitle>
              <DialogDescription>{pending?.kind === "input" ? pending.prompt : ""}</DialogDescription>
            </DialogHeader>
            <Input
              autoFocus
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder={pending?.kind === "input" ? pending.placeholder : undefined}
            />
            {!value.trim() && <p className="text-xs text-muted-foreground">URL tidak boleh kosong.</p>}
            <DialogFooter>
              <Button type="submit" disabled={!value.trim()}>
                Import
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
