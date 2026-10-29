"use client";

import { useEffect, useState } from "react";
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

  useEffect(() => {
    const ui: HostUi = {
      confirm: (message, action = "Hapus") =>
        new Promise((resolve) => setPending({ kind: "confirm", message, action, resolve })),
      pick: (placeholder, items) =>
        new Promise((resolve) => setPending({ kind: "pick", placeholder, items, resolve })),
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
          <div className="flex max-h-72 flex-col gap-1 overflow-y-auto">
            {pending?.kind === "pick" &&
              pending.items.map((item) => (
                <Button
                  key={item.id}
                  variant="ghost"
                  className="justify-start"
                  onClick={() => close(item.id)}
                >
                  {item.label}
                </Button>
              ))}
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
