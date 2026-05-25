import { test, expect } from 'vitest';
import { RowSizeManager } from './rowSizeManager';
import { getVisibleRange } from './math';

test('RowSizeManager initialises 50,000 uniform rows in ≤200ms', () => {
  const start = performance.now();
  new RowSizeManager(50_000, 48);
  expect(performance.now() - start).toBeLessThan(200);
});

test('getVisibleRange on 50,000 rows resolves in ≤5ms', () => {
  const sm = new RowSizeManager(50_000, 48);
  const start = performance.now();
  getVisibleRange(0, 768, sm, 5);
  expect(performance.now() - start).toBeLessThan(5);
});

test('getVisibleRange at end of 50,000-row list resolves in ≤5ms', () => {
  const sm = new RowSizeManager(50_000, 48);
  const totalH = sm.totalHeight();
  const start = performance.now();
  getVisibleRange(totalH - 768, 768, sm, 5);
  expect(performance.now() - start).toBeLessThan(5);
});

test('50,000 sequential setSize updates complete in ≤500ms', () => {
  const sm = new RowSizeManager(50_000, 48);
  const start = performance.now();
  for (let i = 0; i < 50_000; i++) sm.setSize(i, 48 + (i % 3) * 24);
  expect(performance.now() - start).toBeLessThan(500);
});

test('RowSizeManager.findIndex binary search on 50,000 rows resolves in ≤1ms', () => {
  const sm = new RowSizeManager(50_000, 48);
  const target = 50_000 * 48 * 0.75;
  const start = performance.now();
  sm.findIndex(target);
  expect(performance.now() - start).toBeLessThan(1);
});
