import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { RowSizeManager } from '../core/rowSizeManager';
import { getVisibleRange, computeAnchoredScrollTop } from '../core/math';
import type { VisibleRange } from '../core/math';

interface VirtualizerOptions {
  count: number;
  defaultRowHeight?: number;
  overscan?: number;
}

interface VirtualizerResult {
  containerRef: React.RefObject<HTMLDivElement | null>;
  totalHeight: number;
  visibleRange: VisibleRange;
  measureRow: (index: number, el: HTMLElement | null) => void;
  scrollToIndex: (index: number, behavior?: ScrollBehavior) => void;
}

export function useVirtualizer({ count, defaultRowHeight = 48, overscan = 3 }: VirtualizerOptions): VirtualizerResult {
  const containerRef = useRef<HTMLDivElement>(null);
  const sizeManagerRef = useRef<RowSizeManager | null>(null);
  const rafRef = useRef<number | null>(null);

  if (!sizeManagerRef.current || sizeManagerRef.current.count !== count) {
    const next = new RowSizeManager(count, defaultRowHeight);
    if (sizeManagerRef.current) {
      const prev = sizeManagerRef.current;
      const container = containerRef.current;
      const anchorIndex = prev.findIndex(container?.scrollTop ?? 0);
      const anchorOffset = (container?.scrollTop ?? 0) - prev.getOffset(anchorIndex);

      for (let i = 0; i < Math.min(prev.count, count); i++) {
        next.setSize(i, prev.getSize(i));
      }
      sizeManagerRef.current = next;

      if (container && anchorIndex < count) {
        container.scrollTop = computeAnchoredScrollTop({ index: anchorIndex, offset: anchorOffset }, next);
      }
    } else {
      sizeManagerRef.current = next;
    }
  }

  const [visibleRange, setVisibleRange] = useState<VisibleRange>(() =>
    getVisibleRange(0, 600, sizeManagerRef.current!, overscan),
  );
  const [totalHeight, setTotalHeight] = useState(() => sizeManagerRef.current!.totalHeight());

  const recompute = useCallback(() => {
    rafRef.current = null;
    const container = containerRef.current;
    if (!container || !sizeManagerRef.current) return;
    const nextRange = getVisibleRange(container.scrollTop, container.clientHeight, sizeManagerRef.current, overscan);
    const nextTotal = sizeManagerRef.current.totalHeight();
    setVisibleRange(nextRange);
    setTotalHeight(nextTotal);
  }, [overscan]);

  const scheduleRecompute = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(recompute);
  }, [recompute]);

  useLayoutEffect(() => {
    recompute();
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(scheduleRecompute);
    ro.observe(container);
    container.addEventListener('scroll', scheduleRecompute, { passive: true });
    return () => {
      ro.disconnect();
      container.removeEventListener('scroll', scheduleRecompute);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [scheduleRecompute]);

  useEffect(() => {
    scheduleRecompute();
  }, [count, scheduleRecompute]);

  const measureRow = useCallback(
    (index: number, el: HTMLElement | null) => {
      if (!el || !sizeManagerRef.current) return;
      const height = el.getBoundingClientRect().height;
      if (height > 0 && height !== sizeManagerRef.current.getSize(index)) {
        const container = containerRef.current;
        const prevOffset = sizeManagerRef.current.getOffset(index);
        const delta = height - sizeManagerRef.current.getSize(index);
        sizeManagerRef.current.setSize(index, height);
        if (container && prevOffset < container.scrollTop) {
          container.scrollTop += delta;
        }
        scheduleRecompute();
      }
    },
    [scheduleRecompute],
  );

  const scrollToIndex = useCallback((index: number, behavior: ScrollBehavior = 'smooth') => {
    const container = containerRef.current;
    const sm = sizeManagerRef.current;
    if (!container || !sm) return;
    const targetOffset = sm.getOffset(index);
    container.scrollTo({ top: targetOffset, behavior });
  }, []);

  return { containerRef, totalHeight, visibleRange, measureRow, scrollToIndex };
}
