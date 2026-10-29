"use client";

import { createContext, useContext, type ReactNode } from "react";

export type BridgeMessage = { type: string; [key: string]: unknown };
type Handler = (msg: BridgeMessage) => void;

/** What a channel needs from the host that owns it. */
export interface ChannelHost {
  receive(channel: PanelChannel, msg: BridgeMessage): void;
  query(channel: PanelChannel, what: string, params?: Record<string, unknown>): Promise<unknown>;
  viewState(channelId: string): Record<string, unknown>;
  saveViewState(channelId: string, patch: Record<string, unknown>): void;
}

/**
 * Stands in for one VS Code webview: messages posted here go to the host, and the host delivers
 * replies only to this panel. Members are arrow functions so components can destructure them.
 */
export class PanelChannel {
  private readonly handlers = new Set<Handler>();

  constructor(
    readonly id: string,
    readonly boot: Record<string, string | undefined>,
    private readonly host: ChannelHost,
  ) {}

  post = (msg: unknown): void => {
    this.host.receive(this, msg as BridgeMessage);
  };

  onMessage = (handler: Handler): (() => void) => {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  };

  deliver = (msg: BridgeMessage): void => {
    for (const handler of this.handlers) handler(msg);
  };

  query = <T = unknown,>(what: string, params?: Record<string, unknown>): Promise<T> =>
    this.host.query(this, what, params) as Promise<T>;

  loadViewState = <T extends Record<string, unknown>>(): Partial<T> =>
    this.host.viewState(this.id) as Partial<T>;

  saveViewState = (patch: Record<string, unknown>): void => {
    this.host.saveViewState(this.id, patch);
  };
}

const BridgeContext = createContext<PanelChannel | null>(null);

export function BridgeProvider({ channel, children }: { channel: PanelChannel; children: ReactNode }) {
  return <BridgeContext.Provider value={channel}>{children}</BridgeContext.Provider>;
}

export function useBridge(): PanelChannel {
  const channel = useContext(BridgeContext);
  if (!channel) throw new Error("useBridge must be used inside a BridgeProvider.");
  return channel;
}
