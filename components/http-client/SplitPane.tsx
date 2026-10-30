import { useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';

export type SplitDirection = 'vertical' | 'horizontal';

const MIN_RATIO = 0.15;
const MAX_RATIO = 0.85;

export function clampRatio(ratio: number, max: number = MAX_RATIO): number {
  return Math.min(max, Math.max(MIN_RATIO, ratio));
}

export function SplitPane({
  direction,
  ratio,
  onRatioChange,
  onRatioCommit,
  first,
  second,
  maxRatio = MAX_RATIO,
}: {
  direction: SplitDirection;
  ratio: number;
  /** Called on every move while dragging. */
  onRatioChange: (ratio: number) => void;
  /** Called once with the final ratio when the drag ends or the divider is reset. */
  onRatioCommit?: (ratio: number) => void;
  first: ReactNode;
  second: ReactNode;
  maxRatio?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const vertical = direction === 'vertical';

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const container = containerRef.current;
    if (!container) return;
    event.preventDefault();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const bounds = container.getBoundingClientRect();
    let latest: number | undefined;
    const move = (e: PointerEvent): void => {
      const next = vertical
        ? (e.clientY - bounds.top) / bounds.height
        : (e.clientX - bounds.left) / bounds.width;
      latest = clampRatio(next, maxRatio);
      onRatioChange(latest);
    };
    const up = (): void => {
      if (latest !== undefined) onRatioCommit?.(latest);
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', up);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  };

  const size = `${clampRatio(ratio, maxRatio) * 100}%`;

  return (
    <div
      ref={containerRef}
      className={`flex min-h-0 min-w-0 flex-1 ${vertical ? 'flex-col' : 'flex-row'}`}
    >
      <div
        className="min-h-0 min-w-0 shrink-0 overflow-hidden"
        style={vertical ? { height: size } : { width: size }}
      >
        {first}
      </div>
      <div
        role="separator"
        aria-orientation={vertical ? 'horizontal' : 'vertical'}
        onPointerDown={onPointerDown}
        onDoubleClick={() => {
          const half = clampRatio(0.5, maxRatio);
          onRatioChange(half);
          onRatioCommit?.(half);
        }}
        data-tip="Geser untuk mengubah ukuran · klik dua kali untuk 50/50"
        className={`group relative z-10 shrink-0 select-none touch-none ${
          vertical ? 'h-1.5 cursor-row-resize' : 'w-1.5 cursor-col-resize'
        }`}
      >
        <div
          className={`absolute bg-[var(--vscode-panel-border)] transition-colors group-hover:bg-[var(--vscode-focusBorder)] group-active:bg-[var(--vscode-focusBorder)] ${
            vertical ? 'inset-x-0 top-1/2 h-px -translate-y-1/2' : 'inset-y-0 left-1/2 w-px -translate-x-1/2'
          }`}
        />
      </div>
      <div className="min-h-0 min-w-0 flex-1 overflow-hidden">{second}</div>
    </div>
  );
}
