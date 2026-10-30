"use client";

import { useState, useSyncExternalStore } from "react";
import { Cable, Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { localProxy, proxyCommands } from "@/lib/http-client/ui/agent";

function CommandLine({ label, command }: { label: string; command: string }) {
  const [copied, setCopied] = useState(false);
  const copy = (): void => {
    void navigator.clipboard.writeText(command).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-start gap-2 rounded-md border bg-muted/40 p-2">
        <code className="min-w-0 flex-1 break-all font-mono text-xs">{command}</code>
        <button
          type="button"
          onClick={copy}
          aria-label={`Salin: ${label}`}
          className="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
        </button>
      </div>
    </div>
  );
}

/** Footer button for the Local Proxy: its status at a glance, and the steps to connect it. */
export function LocalProxyButton() {
  const status = useSyncExternalStore(localProxy.subscribe, localProxy.getSnapshot, localProxy.getServerSnapshot);
  const [open, setOpen] = useState(false);
  const commands = open ? proxyCommands(window.location.origin) : undefined;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          void localProxy.refresh();
        }}
        data-tip={
          status.connected
            ? "Local Proxy terhubung: request ke localhost lewat komputer Anda"
            : "Local Proxy belum terhubung: sambungkan agar server bisa menjangkau localhost Anda"
        }
        className="flex items-center gap-1.5 rounded px-1.5 py-0.5 hover:bg-accent"
      >
        <Cable size={12} />
        Local Proxy
        <span
          aria-hidden
          className={cn("size-1.5 rounded-full", status.connected ? "bg-emerald-500" : "bg-muted-foreground/40")}
        />
        <span className="sr-only">{status.connected ? "terhubung" : "belum terhubung"}</span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Local Proxy
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] font-normal",
                  status.connected ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-muted text-muted-foreground",
                )}
              >
                {status.connected ? "Terhubung" : "Belum terhubung"}
              </span>
            </DialogTitle>
            <DialogDescription>
              Request ke <span className="font-mono">localhost</span>, <span className="font-mono">127.0.0.1</span>,
              dan <span className="font-mono">[::1]</span> diteruskan lewat proxy ini di komputer Anda, karena server
              tidak bisa menjangkau komputer Anda. URL lain tetap dikirim oleh server seperti biasa.
            </DialogDescription>
          </DialogHeader>

          {commands ? (
            <div className="flex flex-col gap-3">
              <CommandLine label="1. Unduh programnya (sekali saja)" command={commands.download} />
              <CommandLine label="2. Jalankan di komputer Anda, biarkan terminalnya terbuka" command={commands.run} />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Browser ini tidak bisa menyimpan token pairing.</p>
          )}

          <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
            <li>Butuh Node.js 18 atau lebih baru. Tidak ada dependency dan tidak ada port yang dibuka.</li>
            <li>Proxy hanya mau menjangkau alamat lokal; alamat lain, termasuk jaringan kantor, ditolak.</li>
            <li>Token di atas mengikat browser ini dengan proxy Anda. Jangan dibagikan.</li>
            <li>Jika aplikasi ini berjalan di komputer Anda sendiri, proxy tidak diperlukan.</li>
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}
