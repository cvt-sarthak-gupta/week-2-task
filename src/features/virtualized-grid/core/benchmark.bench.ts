import { bench, describe } from 'vitest';
import { RowSizeManager } from './rowSizeManager';
import { getVisibleRange } from './math';

describe('Virtualized grid benchmarks', () => {
  bench('RowSizeManager init 50,000 rows', () => {
    new RowSizeManager(50_000, 48);
  });

  bench('getVisibleRange on 50,000 rows', () => {
    const sm = new RowSizeManager(50_000, 48);
    getVisibleRange(0, 768, sm, 5);
  });

  bench('getVisibleRange scrolled to 50,000th row', () => {
    const sm = new RowSizeManager(50_000, 48);
    const totalH = sm.totalHeight();
    getVisibleRange(totalH - 768, 768, sm, 5);
  });

  bench('50,000 sequential setSize updates', () => {
    const sm = new RowSizeManager(50_000, 48);
    for (let i = 0; i < 50_000; i++) {
      sm.setSize(i, 48 + (i % 3) * 24); // mix of heights
    }
  });

  bench('RowSizeManager.findIndex on 50,000 rows', () => {
    const sm = new RowSizeManager(50_000, 48);
    // findIndex at 75% scroll
    sm.findIndex(50_000 * 48 * 0.75);
  });
});
