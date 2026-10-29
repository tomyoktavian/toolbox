import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { placeTooltip } from '@/lib/http-client/ui/tooltip-place';

const SHOW_DELAY = 140;
const WARM_MS = 350;

interface Anchor {
  text: string;
  rect: DOMRect;
}

function tipOf(element: Element | null | undefined): HTMLElement | undefined {
  const found = element?.closest<HTMLElement>('[data-tip]');
  return found && found.getAttribute('data-tip')?.trim() ? found : undefined;
}

function tipAt(x: number, y: number): HTMLElement | undefined {
  const hit = document.elementFromPoint(x, y);
  const direct = tipOf(hit);
  if (direct || !hit) return direct;
  const covered = hit.querySelectorAll<HTMLElement>(':scope > [data-tip], :scope > * > [data-tip]');
  for (const candidate of covered) {
    const rect = candidate.getBoundingClientRect();
    if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
      return candidate.getAttribute('data-tip')?.trim() ? candidate : undefined;
    }
  }
  return undefined;
}

export function TooltipLayer() {
  const [anchor, setAnchor] = useState<Anchor | undefined>();
  const [placement, setPlacement] = useState<{ top: number; left: number } | undefined>();
  const bubbleRef = useRef<HTMLDivElement>(null);
  const currentRef = useRef<HTMLElement | undefined>(undefined);
  const timerRef = useRef<number | undefined>(undefined);
  const hiddenAtRef = useRef(0);
  const openRef = useRef(false);

  useEffect(() => {
    let frame = 0;
    let pointerX = 0;
    let pointerY = 0;

    const clearTimer = (): void => {
      if (timerRef.current !== undefined) {
        window.clearTimeout(timerRef.current);
        timerRef.current = undefined;
      }
    };

    const close = (): void => {
      if (openRef.current) {
        openRef.current = false;
        hiddenAtRef.current = Date.now();
        setAnchor(undefined);
        setPlacement(undefined);
      }
    };

    const hide = (): void => {
      clearTimer();
      currentRef.current = undefined;
      close();
    };

    const open = (element: HTMLElement): void => {
      const text = element.getAttribute('data-tip')?.trim();
      if (!text || !element.isConnected) return;
      openRef.current = true;
      setPlacement(undefined);
      setAnchor({ text, rect: element.getBoundingClientRect() });
    };

    const focus = (element: HTMLElement | undefined): void => {
      if (element === currentRef.current) return;
      clearTimer();
      currentRef.current = element;
      close();
      if (!element) return;
      const warm = Date.now() - hiddenAtRef.current < WARM_MS;
      timerRef.current = window.setTimeout(() => open(element), warm ? 0 : SHOW_DELAY);
    };

    const probe = (): void => {
      frame = 0;
      focus(tipAt(pointerX, pointerY));
    };

    const onMove = (event: PointerEvent): void => {
      pointerX = event.clientX;
      pointerY = event.clientY;
      if (frame) return;
      frame = requestAnimationFrame(probe);
    };

    const onFocusIn = (event: FocusEvent): void => {
      const element = tipOf(event.target as Element | null);
      currentRef.current = element;
      clearTimer();
      if (element) open(element);
      else hide();
    };

    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('pointerdown', hide, true);
    window.addEventListener('pointerleave', hide, true);
    window.addEventListener('keydown', hide, true);
    window.addEventListener('wheel', hide, true);
    window.addEventListener('scroll', hide, true);
    window.addEventListener('blur', hide);
    document.addEventListener('focusin', onFocusIn, true);
    document.addEventListener('focusout', hide, true);
    document.addEventListener('visibilitychange', hide);

    return () => {
      clearTimer();
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerdown', hide, true);
      window.removeEventListener('pointerleave', hide, true);
      window.removeEventListener('keydown', hide, true);
      window.removeEventListener('wheel', hide, true);
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('blur', hide);
      document.removeEventListener('focusin', onFocusIn, true);
      document.removeEventListener('focusout', hide, true);
      document.removeEventListener('visibilitychange', hide);
    };
  }, []);

  useEffect(() => {
    let frame = 0;
    const pending = new Set<ParentNode>([document]);

    const name = (element: HTMLElement): void => {
      const text = element.getAttribute('data-tip')?.trim();
      if (text && !element.getAttribute('aria-label') && !element.textContent?.trim()) {
        element.setAttribute('aria-label', text);
      }
    };

    const flush = (): void => {
      frame = 0;
      for (const root of pending) {
        if (root instanceof HTMLElement) name(root);
        root.querySelectorAll?.<HTMLElement>('[data-tip]').forEach(name);
      }
      pending.clear();
    };

    const schedule = (root: ParentNode): void => {
      pending.add(root);
      if (!frame) frame = requestAnimationFrame(flush);
    };

    schedule(document);
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === 'attributes') schedule(record.target as ParentNode);
        else record.addedNodes.forEach((node) => node.nodeType === 1 && schedule(node as ParentNode));
      }
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributeFilter: ['data-tip'],
    });
    return () => {
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  useLayoutEffect(() => {
    const bubble = bubbleRef.current;
    if (!anchor || !bubble) return;
    setPlacement(
      placeTooltip(
        anchor.rect,
        { width: bubble.offsetWidth, height: bubble.offsetHeight },
        { width: window.innerWidth, height: window.innerHeight },
      ),
    );
  }, [anchor]);

  if (!anchor) return null;

  return (
    <div
      ref={bubbleRef}
      role="tooltip"
      className="pointer-events-none fixed z-[10000] max-h-[40vh] max-w-[22rem] overflow-hidden rounded-md border border-[var(--vscode-editorHoverWidget-border,var(--vscode-panel-border))] bg-[var(--vscode-editorHoverWidget-background,var(--vscode-editorWidget-background))] px-2 py-1 text-xs leading-snug break-words whitespace-pre-wrap text-[var(--vscode-editorHoverWidget-foreground,var(--vscode-foreground))] shadow-md"
      style={{
        top: placement?.top ?? anchor.rect.top,
        left: placement?.left ?? anchor.rect.left,
        opacity: placement ? 1 : 0,
      }}
    >
      {anchor.text}
    </div>
  );
}
