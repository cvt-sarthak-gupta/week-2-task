import type { RowSizeManager } from './rowSizeManager';

export interface VisibleRange {
  readonly startIndex: number;
  readonly endIndex: number; // exclusive
  readonly offsetY: number; // translateY for the rendered rows container
}

/**
 * Pure function — computes which rows should be rendered.
 * Used for unit testing in isolation.
 */
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
  offset: number; // px from top of row to viewport top
}

/**
 * After inserting/removing rows above the viewport, computes the new scrollTop
 * to keep the anchored row in the same visual position.
 */
export function computeAnchoredScrollTop(anchor: ScrollAnchor, sizeManager: RowSizeManager): number {
  return sizeManager.getOffset(anchor.index) + anchor.offset;
}
