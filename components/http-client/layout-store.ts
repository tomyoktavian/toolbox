import { clampRatio, type SplitDirection } from './SplitPane';

export interface PaneLayout {
  split: SplitDirection;
  splitRatio: number;
}

const KEY = 'http-client:pane-layout';
const DEFAULT_LAYOUT: PaneLayout = { split: 'vertical', splitRatio: 0.4 };

function read(): PaneLayout {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_LAYOUT;
    const value = JSON.parse(raw) as Partial<PaneLayout>;
    return {
      split: value.split === 'horizontal' ? 'horizontal' : 'vertical',
      splitRatio:
        typeof value.splitRatio === 'number' ? clampRatio(value.splitRatio) : DEFAULT_LAYOUT.splitRatio,
    };
  } catch {
    return DEFAULT_LAYOUT;
  }
}

// Read on first use, not at import, so importing this on the server never touches localStorage.
let current: PaneLayout | undefined;
const listeners = new Set<() => void>();
let watching = false;

function emit(): void {
  for (const listener of listeners) listener();
}

function watchOtherTabs(): void {
  if (watching) return;
  watching = true;
  window.addEventListener('storage', (event) => {
    if (event.key !== KEY) return;
    current = read();
    emit();
  });
}

/**
 * How the request and response panes are arranged. One value for every request tab, in every
 * browser tab: change it anywhere and all of them follow, and it is still there after a reload.
 */
export const paneLayout = {
  subscribe(listener: () => void): () => void {
    watchOtherTabs();
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot(): PaneLayout {
    return (current ??= read());
  },
  getServerSnapshot(): PaneLayout {
    return DEFAULT_LAYOUT;
  },
  set(patch: Partial<PaneLayout>): void {
    current = { ...paneLayout.getSnapshot(), ...patch };
    try {
      localStorage.setItem(KEY, JSON.stringify(current));
    } catch {}
    emit();
  },
};
