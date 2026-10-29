import { useEffect, useState } from 'react';

// next-themes toggles the `dark` class on <html>; in VS Code this read the webview body classes.
export function readVscodeDark(): boolean {
  if (typeof document === 'undefined') return false;
  return document.documentElement.classList.contains('dark');
}

export function useVscodeDark(): boolean {
  const [dark, setDark] = useState(readVscodeDark);

  useEffect(() => {
    const sync = (): void => setDark(readVscodeDark());
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  return dark;
}
