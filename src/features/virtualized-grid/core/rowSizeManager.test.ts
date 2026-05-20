import { describe, it, expect } from 'vitest';
import { RowSizeManager } from './rowSizeManager';

describe('RowSizeManager — construction', () => {
  it('count reflects the number of rows', () => {
    expect(new RowSizeManager(100).count).toBe(100);
  });

  it('zero rows is valid', () => {
    const m = new RowSizeManager(0);
    expect(m.count).toBe(0);
    expect(m.totalHeight()).toBe(0);
  });

  it('default row height is 48px', () => {
    const m = new RowSizeManager(1);
    expect(m.getSize(0)).toBe(48);
  });

  it('custom default height is used for all rows', () => {
    const m = new RowSizeManager(5, 100);
    for (let i = 0; i < 5; i++) {
      expect(m.getSize(i)).toBe(100);
    }
  });

  it('totalHeight equals count × defaultSize', () => {
    const m = new RowSizeManager(10, 50);
    expect(m.totalHeight()).toBe(500);
  });
});

describe('RowSizeManager — getSize / setSize', () => {
  it('getSize returns the current row height', () => {
    const m = new RowSizeManager(5, 48);
    m.setSize(2, 120);
    expect(m.getSize(2)).toBe(120);
  });

  it('setSize out-of-bounds is a no-op', () => {
    const m = new RowSizeManager(3, 48);
    expect(() => m.setSize(-1, 100)).not.toThrow();
    expect(() => m.setSize(3, 100)).not.toThrow();
    expect(m.totalHeight()).toBe(3 * 48); // unchanged
  });

  it('setSize to same value has no effect on totalHeight', () => {
    const m = new RowSizeManager(5, 48);
    m.setSize(2, 48); // no change
    expect(m.totalHeight()).toBe(5 * 48);
  });

  it('totalHeight updates after setSize', () => {
    const m = new RowSizeManager(5, 48); // 240 total
    m.setSize(0, 100); // +52
    expect(m.totalHeight()).toBe(240 - 48 + 100);
  });

  it('can set multiple rows independently', () => {
    const m = new RowSizeManager(10, 48);
    m.setSize(0, 100);
    m.setSize(5, 200);
    expect(m.getSize(0)).toBe(100);
    expect(m.getSize(5)).toBe(200);
    expect(m.getSize(3)).toBe(48); // unchanged
  });
});

describe('RowSizeManager — getOffset', () => {
  it('getOffset(0) is always 0', () => {
    const m = new RowSizeManager(10, 48);
    expect(m.getOffset(0)).toBe(0);
  });

  it('negative index returns 0', () => {
    const m = new RowSizeManager(10, 48);
    expect(m.getOffset(-5)).toBe(0);
  });

  it('getOffset(n) returns cumulative height of rows 0..n-1', () => {
    const m = new RowSizeManager(5, 48);
    expect(m.getOffset(1)).toBe(48);
    expect(m.getOffset(2)).toBe(96);
    expect(m.getOffset(5)).toBe(240);
  });

  it('getOffset accounts for variable-height rows', () => {
    const m = new RowSizeManager(5, 48);
    m.setSize(0, 100); // row 0 = 100
    m.setSize(1, 200); // row 1 = 200
    expect(m.getOffset(2)).toBe(300); // 100 + 200
    expect(m.getOffset(3)).toBe(300 + 48); // + row 2 (default)
  });

  it('getOffset beyond count is clamped to totalHeight', () => {
    const m = new RowSizeManager(3, 48);
    expect(m.getOffset(100)).toBe(m.totalHeight());
  });
});

describe('RowSizeManager — findIndex', () => {
  it('scrollTop <= 0 returns index 0', () => {
    const m = new RowSizeManager(100, 48);
    expect(m.findIndex(0)).toBe(0);
    expect(m.findIndex(-10)).toBe(0);
  });

  it('uniform rows: finds correct index by scrollTop', () => {
    const m = new RowSizeManager(100, 50);
    expect(m.findIndex(0)).toBe(0);
    expect(m.findIndex(50)).toBe(1);
    expect(m.findIndex(100)).toBe(2);
    expect(m.findIndex(499)).toBe(9);
  });

  it('scrollTop at exact row boundary returns that row', () => {
    const m = new RowSizeManager(10, 48);
    // Row 5 starts at 5 × 48 = 240
    expect(m.findIndex(240)).toBe(5);
  });

  it('variable heights: locates correct row', () => {
    const m = new RowSizeManager(5, 48);
    m.setSize(0, 100); // 0..99
    m.setSize(1, 200); // 100..299
    expect(m.findIndex(0)).toBe(0);
    expect(m.findIndex(99)).toBe(0);
    expect(m.findIndex(100)).toBe(1);
    expect(m.findIndex(299)).toBe(1);
    expect(m.findIndex(300)).toBe(2);
  });

  it('scrollTop beyond total height returns the last row index', () => {
    const m = new RowSizeManager(5, 48);
    expect(m.findIndex(9999)).toBe(4);
  });

  it('single row grid', () => {
    const m = new RowSizeManager(1, 100);
    expect(m.findIndex(0)).toBe(0);
    expect(m.findIndex(50)).toBe(0);
  });

  it('large grid (50,000 rows) finds correct index efficiently', () => {
    const m = new RowSizeManager(50_000, 48);
    expect(m.findIndex(48 * 25_000)).toBe(25_000);
    expect(m.findIndex(48 * 49_999)).toBe(49_999);
  });
});

describe('RowSizeManager — resize', () => {
  it('growing the grid adds rows with default size', () => {
    const m = new RowSizeManager(5, 48);
    m.resize(10);
    expect(m.count).toBe(10);
    expect(m.getSize(7)).toBe(48);
    expect(m.totalHeight()).toBe(10 * 48);
  });

  it('shrinking the grid reduces count', () => {
    const m = new RowSizeManager(10, 48);
    m.resize(5);
    expect(m.count).toBe(5);
    expect(m.totalHeight()).toBe(5 * 48);
  });

  it('resize preserves existing custom row heights', () => {
    const m = new RowSizeManager(5, 48);
    m.setSize(2, 120);
    m.resize(10);
    expect(m.getSize(2)).toBe(120);
  });

  it('resize to zero is valid', () => {
    const m = new RowSizeManager(5, 48);
    m.resize(0);
    expect(m.count).toBe(0);
    expect(m.totalHeight()).toBe(0);
  });

  it('resize to same size is idempotent', () => {
    const m = new RowSizeManager(5, 48);
    m.setSize(1, 100);
    m.resize(5);
    expect(m.getSize(1)).toBe(100);
    expect(m.totalHeight()).toBe(4 * 48 + 100);
  });

  it('findIndex still works after resize', () => {
    const m = new RowSizeManager(5, 50);
    m.resize(10);
    expect(m.findIndex(350)).toBe(7); // 7 × 50 = 350
  });
});
