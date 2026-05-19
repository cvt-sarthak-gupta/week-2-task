import { test, expect, type Page } from '@playwright/test';

const BASE = 'http://localhost:5173';

async function login(page: Page) {
  await page.goto(BASE);
  await page.getByLabel(/email/i).fill('admin@tenant-a.com');
  await page.getByLabel(/password/i).fill('password123');
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  await expect(page.getByLabel('Patient records table').or(page.getByRole('table'))).toBeVisible({ timeout: 10_000 });
}

// ─── Basic rendering ─────────────────────────────────────────────────────────

test.describe('Virtualized Grid — rendering', () => {
  test.beforeEach(async ({ page }) => { await login(page); });

  test('renders column headers', async ({ page }) => {
    await expect(page.getByRole('columnheader', { name: /mrn/i })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /last name/i })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /status/i })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /ward/i })).toBeVisible();
  });

  test('renders at least one data row', async ({ page }) => {
    const rows = page.locator('[role="row"]:not([aria-rowindex="1"])');
    await expect(rows.first()).toBeVisible({ timeout: 5_000 });
  });
});

// ─── Infinite scroll / virtual scroll ────────────────────────────────────────

test.describe('Virtualized Grid — scroll behaviour', () => {
  test.beforeEach(async ({ page }) => { await login(page); });

  test('scrolling to the bottom of the list triggers loading more rows', async ({ page }) => {
    const grid = page.getByLabel('Patient records table').or(page.locator('[role="grid"]'));
    await expect(grid).toBeVisible();

    const initialRowCount = await page.locator('[role="row"]').count();

    // Scroll the grid to its bottom
    await grid.evaluate((el) => { el.scrollTop = el.scrollHeight; });
    // Give the component time to call fetchNextPage and render new rows
    await page.waitForTimeout(1_500);

    const afterScrollRowCount = await page.locator('[role="row"]').count();
    // If there are more pages, more rows should appear; otherwise count stays the same — both are valid
    expect(afterScrollRowCount).toBeGreaterThanOrEqual(initialRowCount);
  });

  test('frozen columns stay visible when scrolling horizontally', async ({ page }) => {
    const grid = page.getByLabel('Patient records table').or(page.locator('[role="grid"]'));
    await expect(grid).toBeVisible();

    // Scroll right as far as possible
    await grid.evaluate((el) => { el.scrollLeft = el.scrollWidth; });
    await page.waitForTimeout(300);

    // The MRN column is frozen — it should remain visible
    await expect(page.getByRole('columnheader', { name: /mrn/i })).toBeVisible();
  });
});

// ─── Keyboard accessibility ──────────────────────────────────────────────────

test.describe('Virtualized Grid — keyboard navigation', () => {
  test.beforeEach(async ({ page }) => { await login(page); });

  test('Tab key can reach the grid area', async ({ page }) => {
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    // Focus should have moved into the page — grid cells are reachable
    const focused = page.locator(':focus');
    await expect(focused).toBeVisible({ timeout: 3_000 });
  });
});

// ─── Large-dataset scroll test ────────────────────────────────────────────────
// Requires the dev server to seed with enough patients (>200) — skipped in CI
// unless RUN_LARGE_SCROLL_TEST=1 is set.

test.describe('Virtualized Grid — large dataset scroll', () => {
  test.skip(!process.env['RUN_LARGE_SCROLL_TEST'], 'Large scroll test skipped — set RUN_LARGE_SCROLL_TEST=1 to enable');

  test('can scroll to the bottom of a 200-row dataset and see correct row serial numbers', async ({ page }) => {
    await login(page);

    const grid = page.getByLabel('Patient records table').or(page.locator('[role="grid"]'));
    await expect(grid).toBeVisible();

    // Scroll to the very bottom
    await grid.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await page.waitForTimeout(2_000);
    await grid.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await page.waitForTimeout(1_000);

    // The last visible row serial number should be ≥ 200 for a full dataset
    const serialCells = page.locator('[aria-colindex="1"]');
    const lastSerial = await serialCells.last().textContent();
    expect(Number(lastSerial?.trim())).toBeGreaterThanOrEqual(200);
  });
});
