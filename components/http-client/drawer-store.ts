let open = false;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export const sidebarDrawer = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getSnapshot(): boolean {
    return open;
  },
  getServerSnapshot(): boolean {
    return false;
  },
  set(value: boolean): void {
    if (value === open) return;
    open = value;
    emit();
  },
  toggle(): void {
    sidebarDrawer.set(!sidebarDrawer.getSnapshot());
  },
};
