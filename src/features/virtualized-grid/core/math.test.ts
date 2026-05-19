import { describe, it, expect } from 'vitest';
import { getVisibleRange } from './math';
import { RowSizeManager } from './rowSizeManager';

function makeUniform(count: number, height = 48): RowSizeManager {
  return new RowSizeManager(count, height);
}

describe('getVisibleRange', () => {
  it('empty grid returns zeros', () => {
    const sm = makeUniform(0);
    const r = getVisibleRange(0, 600, sm, 3);
    expect(r).toEqual({ startIndex: 0, endIndex: 0, offsetY: 0 });
  });

  it('renders visible rows + overscan at top', () => {
    const sm = makeUniform(100, 50); // 100 rows, 50px each
    const r = getVisibleRange(0, 200, sm, 3);
    expect(r.startIndex).toBe(0);
    expect(r.endIndex).toBeGreaterThanOrEqual(4 + 3); // 4 visible + 3 overscan
    expect(r.offsetY).toBe(0);
  });

  it('correct offsetY when scrolled', () => {
    const sm = makeUniform(100, 50);
    const r = getVisibleRange(500, 200, sm, 0); // row 10 is at offset 500
    expect(r.startIndex).toBe(10);
    expect(r.offsetY).toBe(500);
  });

  it('does not exceed count', () => {
    const sm = makeUniform(5, 50);
    const r = getVisibleRange(0, 600, sm, 10); // viewport bigger than total
    expect(r.endIndex).toBeLessThanOrEqual(5);
  });

  it('single row grid', () => {
    const sm = makeUniform(1, 48);
    const r = getVisibleRange(0, 600, sm, 3);
    expect(r.startIndex).toBe(0);
    expect(r.endIndex).toBe(1);
    expect(r.offsetY).toBe(0);
  });

  it('scrolled to last row', () => {
    const sm = makeUniform(1000, 48);
    const totalH = 1000 * 48;
    const r = getVisibleRange(totalH - 48, 48, sm, 0);
    expect(r.endIndex).toBe(1000);
  });

  it('overscan does not go below zero', () => {
    const sm = makeUniform(100, 50);
    const r = getVisibleRange(50, 200, sm, 10); // row 1 visible, overscan tries to go to -9
    expect(r.startIndex).toBeGreaterThanOrEqual(0);
  });

  it('variable heights — correct offset', () => {
    const sm = new RowSizeManager(10, 48);
    sm.setSize(0, 100);
    sm.setSize(1, 200);
    const r = getVisibleRange(300, 200, sm, 0); // after row 0 (100) + row 1 (200) = 300
    expect(r.startIndex).toBe(2);
    expect(r.offsetY).toBe(sm.getOffset(2));
  });
});
