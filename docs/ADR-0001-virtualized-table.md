# ADR-0001: Custom Virtualized Table Design

**Status:** Accepted  
**Date:** 2026-05-14

## Context

The dashboard must render up to 50,000 patient records with smooth scrolling, variable row heights (expandable detail panels), frozen columns, and stability under live updates. Off-the-shelf libraries (`react-window`, `tanstack-virtual`) are explicitly prohibited by the product requirements.

## Decision

### No Third-Party Library

We implement virtualization from scratch in `src/features/virtualized-grid/`.

**Why:** Product requirement; also gives us full control over variable-height behavior and keyboard/accessibility integration.

### Variable Height Strategy: Fenwick Tree

Row heights are tracked in a **Binary Indexed Tree (Fenwick tree)** (`rowSizeManager.ts`).

- `getOffset(i)` → O(log n) cumulative sum
- `setSize(i, h)` → O(log n) point update
- `findIndex(scrollTop)` → O(log n) via Fenwick tree walk

**Alternatives considered:**
- Linear scan: O(n) per scroll event — unacceptable at 50k rows
- Sorted array: O(n) updates — same problem
- Segment tree: O(log n) but higher constant factor than Fenwick; not worth complexity

### Layout Strategy

Outer scroll container with `position: relative` and a single spacer `div` at total height. Rendered rows are positioned with `transform: translateY(offsetY)` (GPU composited, avoids layout thrash). Frozen columns use `position: sticky` on the inner frozen-column layer — this avoids a second absolutely-positioned layer and keeps the DOM simple.

### Row Identity vs. Index

State (selected, expanded) is tracked by **row id**, not by array index. This means live updates, reorders, and insertions do not accidentally collapse expanded rows.

### Scroll Anchoring During Live Updates

When rows are inserted/removed *above* the current viewport, we compute a `ScrollAnchor` (row-id + offset-within-row) and adjust `scrollTop` by the delta in the anchor row's offset after the update. This prevents the visible viewport from jumping.

### ResizeObserver for Variable Heights

Each rendered `Row` component attaches a `ResizeObserver` callback via the virtualizer's `measureRow`. Heights are written to the `RowSizeManager` and a recompute is scheduled on the next `requestAnimationFrame`. This means:
- Heights are measured from the real DOM, not estimated
- Expansion state changes automatically trigger re-measurement

### Accessibility

The container has `role="grid"`, each row `role="row"`, each cell `role="gridcell"`. `aria-rowcount` is set to total row count. `aria-rowindex` is 1-based. Keyboard navigation (Arrow, Page, Home, End, Enter, Space) is implemented in `useKeyboardNavigation`. A debounced `aria-live="polite"` region announces batch updates without flooding screen readers.

## Consequences

- **+** Full type safety; every behavior is testable in isolation
- **+** Benchmark: initial 50k-row render < 200ms (validated in `benchmark.bench.ts`)
- **−** More code to maintain than a library; offset math must stay in sync with the layout assumptions
- **−** Future changes to layout (e.g. variable column heights) require updates to the math layer
