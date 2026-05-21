import type { RowSizeManager } from './rowSizeManager';

export interface VisibleRange {
  readonly startIndex: number;
  readonly endIndex: number;
  readonly offsetY: number;
}

export function getVisibleRange(
  scrollTop: number,
  viewportHeight: number,
  sizeManager: RowSizeManager,
  overscan = 3,
): VisibleRange {
  const count = sizeManager.count;
  if (count === 0) return { startIndex: 0, endIndex: 0, offsetY: 0 };

  const startIndex = Math.max(0, sizeManager.findIndex(scrollTop) - overscan);
  const endScrollTop = scrollTop + viewportHeight;
  let endIndex = sizeManager.findIndex(endScrollTop) + overscan + 1;
  endIndex = Math.min(endIndex, count);

  const offsetY = sizeManager.getOffset(startIndex);

  return { startIndex, endIndex, offsetY };
}

export interface ScrollAnchor {
  index: number;
  offset: number;
}

export function computeAnchoredScrollTop(anchor: ScrollAnchor, sizeManager: RowSizeManager): number {
  return sizeManager.getOffset(anchor.index) + anchor.offset;
}
