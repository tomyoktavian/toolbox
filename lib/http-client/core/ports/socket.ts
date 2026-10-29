export interface WsSocketHandlers {
  onOpen: () => void;
  onMessage: (data: string) => void;
  onClose: (code: number, reason: string) => void;
  onError: (message: string) => void;
}

export interface WsSocketHandle {
  send: (data: string) => void;
  close: (code?: number, reason?: string) => void;
}

export interface WsConnectOptions {
  headers: Record<string, string>;
  protocols?: string[];
}

export type WsConnect = (
  url: string,
  options: WsConnectOptions,
  handlers: WsSocketHandlers,
) => WsSocketHandle;
