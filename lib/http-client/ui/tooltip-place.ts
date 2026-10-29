export interface TipBox {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface TipSize {
  width: number;
  height: number;
}

export const TIP_GAP = 8;
export const TIP_EDGE = 8;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

export function placeTooltip(
  anchor: TipBox,
  size: TipSize,
  viewport: TipSize,
): { top: number; left: number } {
  const above = anchor.top - TIP_GAP - size.height;
  const below = anchor.bottom + TIP_GAP;
  const fitsAbove = above >= TIP_EDGE;
  const fitsBelow = below + size.height <= viewport.height - TIP_EDGE;
  const roomAbove = anchor.top;
  const roomBelow = viewport.height - anchor.bottom;
  const top = fitsAbove || (!fitsBelow && roomAbove > roomBelow) ? above : below;
  return {
    top: clamp(top, TIP_EDGE, viewport.height - TIP_EDGE - size.height),
    left: clamp(
      (anchor.left + anchor.right) / 2 - size.width / 2,
      TIP_EDGE,
      viewport.width - TIP_EDGE - size.width,
    ),
  };
}
