import { describe, it, expect } from 'vitest';
import { RowSizeManager } from './rowSizeManager';
import { getVisibleRange } from './math';

describe('Virtualized grid performance assertions', () => {
  it('RowSizeManager init for 50,000 rows completes under 50ms', () => {
    const t0 = performance.now();
    new RowSizeManager(50_000, 48);
    expect(performance.now() - t0).toBeLessThan(50);
  });

  it('getVisibleRange on 50,000 rows completes under 1ms', () => {
    const sm = new RowSizeManager(50_000, 48);
    const t0 = performance.now();
    getVisibleRange(0, 768, sm, 5);
    expect(performance.now() - t0).toBeLessThan(1);
  });

  it('getVisibleRange scrolled to end of 50,000 rows completes under 1ms', () => {
    const sm = new RowSizeManager(50_000, 48);
    const totalH = sm.totalHeight();
    const t0 = performance.now();
    getVisibleRange(totalH - 768, 768, sm, 5);
    expect(performance.now() - t0).toBeLessThan(1);
  });

  it('50,000 sequential setSize updates complete under 500ms', () => {
    const sm = new RowSizeManager(50_000, 48);
    const t0 = performance.now();
    for (let i = 0; i < 50_000; i++) {
      sm.setSize(i, 48 + (i % 3) * 24);
    }
    expect(performance.now() - t0).toBeLessThan(500);
  });

  it('findIndex on 50,000 rows completes under 1ms', () => {
    const sm = new RowSizeManager(50_000, 48);
    const t0 = performance.now();
    sm.findIndex(50_000 * 48 * 0.75);
    expect(performance.now() - t0).toBeLessThan(1);
  });
});
