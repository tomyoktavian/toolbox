import { useState } from 'react';
import { Eraser, Plug, PlugZap, Send } from 'lucide-react';
import type { WsSessionState } from '@/lib/http-client/core';
import { Button } from '@/components/http-client/shared/motion/button/base';
import { formatTime } from './lib';

const ARROW: Record<string, string> = { in: '↓', out: '↑', system: '·' };
const DIRECTION_LABEL: Record<string, string> = {
  in: 'Diterima dari server',
  out: 'Dikirim ke server',
  system: 'Pesan sistem',
};
const TONE: Record<string, string> = {
  in: 'text-emerald-500',
  out: 'text-sky-500',
  system: 'opacity-50',
};

export function WsConsole({
  session,
  onOpen,
  onClose,
  onSend,
  onClear,
  autoReconnect,
  onAutoReconnectChange,
}: {
  session?: WsSessionState;
  onOpen: () => void;
  onClose: () => void;
  onSend: (data: string) => void;
  onClear: () => void;
  autoReconnect: boolean;
  onAutoReconnectChange: (value: boolean) => void;
}) {
  const [draft, setDraft] = useState('');
  const status = session?.status ?? 'idle';
  const connected = status === 'open';

  const send = (): void => {
    if (!draft.trim()) return;
    onSend(draft);
    setDraft('');
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--vscode-panel-border)] px-3 py-2 text-xs">
        <span
          className={
            connected
              ? 'text-emerald-500'
              : status === 'error'
                ? 'text-[var(--vscode-errorForeground)]'
                : 'opacity-60'
          }
        >
          {status}
        </span>
        {session?.error && <span className="truncate opacity-70">{session.error}</span>}
        <label className="ml-auto flex items-center gap-1 opacity-70">
          <input
            type="checkbox"
            checked={autoReconnect}
            onChange={(e) => onAutoReconnectChange(e.target.checked)}
          />
          Auto-reconnect
        </label>
        <Button variant="ghost" size="sm" onClick={onClear} data-tip="Bersihkan log">
          <Eraser size={13} />
        </Button>
        {connected ? (
          <Button variant="secondary" size="sm" onClick={onClose}>
            <PlugZap size={13} /> Disconnect
          </Button>
        ) : (
          <Button variant="primary" size="sm" onClick={onOpen}>
            <Plug size={13} /> Connect
          </Button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2 font-mono text-[11px]">
        {(session?.messages ?? []).length === 0 && (
          <div className="opacity-60">Belum ada pesan.</div>
        )}
        {(session?.messages ?? []).map((message, index) => (
          <div key={index} className="flex gap-2">
            <span
              data-tip={DIRECTION_LABEL[message.direction] ?? message.direction}
              className={`shrink-0 ${TONE[message.direction] ?? ''}`}
            >
              {ARROW[message.direction]}
            </span>
            <span className="shrink-0 opacity-40">{formatTime(message.at)}</span>
            <span className={`break-all ${message.direction === 'system' ? 'opacity-60' : ''}`}>
              {message.data}
            </span>
          </div>
        ))}
      </div>

      <div className="flex shrink-0 items-end gap-2 border-t border-[var(--vscode-panel-border)] px-3 py-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              send();
            }
          }}
          rows={2}
          placeholder="Kirim pesan… (Cmd/Ctrl+Enter)"
          className="min-w-0 flex-1 resize-y rounded border border-[var(--vscode-panel-border)] bg-[var(--vscode-input-background)] px-2 py-1 font-mono text-[11px] text-[var(--vscode-input-foreground)] outline-none"
        />
        <Button variant="primary" size="sm" disabled={!connected} onClick={send}>
          <Send size={13} /> Kirim
        </Button>
      </div>
    </div>
  );
}
