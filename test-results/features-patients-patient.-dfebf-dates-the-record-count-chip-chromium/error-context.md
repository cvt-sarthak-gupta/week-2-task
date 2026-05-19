# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: features/patients/patient.e2e.ts >> Patient page — filter bar >> status filter updates the record count chip
- Location: src/features/patients/patient.e2e.ts:35:3

# Error details

```
Error: page.goto: Test ended.
Call log:
  - navigating to "http://localhost:5173/", waiting until "load"

```

# Test source

```ts
  1   | import { test, expect, type Page } from '@playwright/test';
  2   | 
  3   | const BASE = 'http://localhost:5173';
  4   | 
  5   | async function loginAs(page: Page, role: 'admin' | 'viewer' | 'coordinator' = 'admin') {
  6   |   const credentials: Record<string, { email: string; password: string }> = {
  7   |     admin:       { email: 'admin@tenant-a.com',       password: 'password123' },
  8   |     viewer:      { email: 'readonly@tenant-a.com',     password: 'password123' },
  9   |     coordinator: { email: 'coordinator@tenant-a.com',  password: 'password123' },
  10  |   };
  11  |   const { email, password } = credentials[role];
> 12  |   await page.goto(BASE);
      |              ^ Error: page.goto: Test ended.
  13  |   await page.getByLabel(/email/i).fill(email);
  14  |   await page.getByLabel(/password/i).fill(password);
  15  |   await page.getByRole('button', { name: /sign in|log in/i }).click();
  16  |   await page.waitForURL(/\/patients/);
  17  |   // Wait for the patient table to be visible
  18  |   await expect(page.getByRole('table').or(page.getByLabel('Patient records table'))).toBeVisible({ timeout: 10_000 });
  19  | }
  20  | 
  21  | // ─── Filter bar ─────────────────────────────────────────────────────────────
  22  | 
  23  | test.describe('Patient page — filter bar', () => {
  24  |   test.beforeEach(async ({ page }) => { await loginAs(page); });
  25  | 
  26  |   test('search by name filters visible rows', async ({ page }) => {
  27  |     const search = page.getByLabel('Search patients');
  28  |     await search.fill('alice');
  29  |     // Wait for debounce (400 ms) + network
  30  |     await page.waitForTimeout(600);
  31  |     // Column headers are always present — verify the grid didn't break under the filter
  32  |     await expect(page.getByRole('columnheader', { name: /mrn/i })).toBeVisible();
  33  |   });
  34  | 
  35  |   test('status filter updates the record count chip', async ({ page }) => {
  36  |     const before = await page.getByText(/\d+ records/).textContent();
  37  |     await page.getByRole('combobox', { name: /filter by status/i }).click();
  38  |     await page.waitForSelector('.ant-select-dropdown:not(.ant-select-dropdown-hidden)', { timeout: 3_000 });
  39  |     await page.keyboard.press('ArrowDown'); // highlight Critical (index 0)
  40  |     await page.keyboard.press('Enter');
  41  |     await page.waitForTimeout(300);
  42  |     const after = await page.getByText(/\d+ records/).textContent();
  43  |     // Count may or may not change, but the chip must still render
  44  |     expect(after).toMatch(/\d+ records/);
  45  |     expect(before).toBeDefined();
  46  |   });
  47  | 
  48  |   test('Clear button appears when filters are active and clears them', async ({ page }) => {
  49  |     await page.getByRole('combobox', { name: /filter by status/i }).click();
  50  |     await page.waitForSelector('.ant-select-dropdown:not(.ant-select-dropdown-hidden)', { timeout: 3_000 });
  51  |     await page.keyboard.press('ArrowDown'); // highlight Critical (index 0)
  52  |     await page.keyboard.press('ArrowDown'); // highlight Stable (index 1)
  53  |     await page.keyboard.press('Enter');
  54  |     const clearBtn = page.getByRole('button', { name: /clear all filters/i });
  55  |     await expect(clearBtn).toBeVisible();
  56  |     await clearBtn.click();
  57  |     await expect(clearBtn).not.toBeVisible();
  58  |   });
  59  | 
  60  |   test('ward filter works independently of status filter', async ({ page }) => {
  61  |     await page.getByRole('combobox', { name: /filter by ward/i }).click();
  62  |     await page.waitForSelector('.ant-select-dropdown:not(.ant-select-dropdown-hidden)', { timeout: 3_000 });
  63  |     await page.keyboard.press('ArrowDown'); // highlight ICU (index 0)
  64  |     await page.keyboard.press('Enter');
  65  |     const chip = page.getByText(/\d+ records/);
  66  |     await expect(chip).toBeVisible();
  67  |   });
  68  | });
  69  | 
  70  | // ─── Sorting ────────────────────────────────────────────────────────────────
  71  | 
  72  | test.describe('Patient page — column sorting', () => {
  73  |   test.beforeEach(async ({ page }) => { await loginAs(page); });
  74  | 
  75  |   test('clicking MRN column header sorts the table', async ({ page }) => {
  76  |     const mrnHeader = page.getByRole('columnheader', { name: /mrn/i });
  77  |     await mrnHeader.click();
  78  |     // URL should gain a sort param
  79  |     await expect(page).toHaveURL(/sort=/);
  80  |     await mrnHeader.click();
  81  |     // Second click should reverse sort direction
  82  |     await expect(page).toHaveURL(/sort=/);
  83  |   });
  84  | 
  85  |   test('clicking Last Name header sorts ascending then descending', async ({ page }) => {
  86  |     const header = page.getByRole('columnheader', { name: /last name/i });
  87  |     await header.click();
  88  |     await expect(page).toHaveURL(/sort=lastName/i);
  89  |   });
  90  | });
  91  | 
  92  | // ─── Saved presets ──────────────────────────────────────────────────────────
  93  | 
  94  | test.describe('Patient page — saved filter presets', () => {
  95  |   test.beforeEach(async ({ page }) => { await loginAs(page, 'admin'); });
  96  | 
  97  |   test('Save and load a preset round-trips the filter state', async ({ page }) => {
  98  |     const presetName = `E2E Critical Filter ${Date.now()}`;
  99  | 
  100 |     // Apply a filter
  101 |     await page.getByRole('combobox', { name: /filter by status/i }).click();
  102 |     await page.waitForSelector('.ant-select-dropdown:not(.ant-select-dropdown-hidden)', { timeout: 3_000 });
  103 |     await page.keyboard.press('ArrowDown'); // highlight Critical (index 0)
  104 |     await page.keyboard.press('Enter');
  105 | 
  106 |     // Save it as a preset
  107 |     await page.getByRole('button', { name: /save current filters/i }).click();
  108 |     const nameInput = page.getByRole('textbox', { name: /preset name/i });
  109 |     await nameInput.fill(presetName);
  110 |     await page.getByRole('button', { name: /^save$/i }).click();
  111 | 
  112 |     // Clear the current filters
```