# ADR-0002: Filter Expression System (Typed AST)

**Status:** Accepted  
**Date:** 2026-05-14

## Context

Care coordinators need multi-dimensional filtering: AND, OR, NOT, comparisons (eq, neq, contains, startsWith, gt, gte, lt, lte), and range queries. Filters must be:
- Shareable via URL
- Saved as presets
- Applied instantly client-side (50k rows)
- Simultaneously sent to the server for records not yet in memory

## Decision

### Typed AST (no string parsing)

Filters are represented as a **discriminated union TypeScript type** (`FilterNode`) in `src/features/filters/ast/types.ts`. Every node carries its kind at the type level, enabling exhaustive switch handling.

**Why not a string DSL?**
- No untyped `any` escapes
- Compiler enforces all operators are handled
- Serialization/deserialization is mechanical and round-trip testable
- Much easier to property-test (fast-check can generate random `FilterNode` trees)

### Serialization Format

```
and(eq(status,critical),gte(age,65))
```

- Human-readable enough to paste into a URL or discuss with support
- Commas and parens in values are escaped with backslash
- `encodeURIComponent` wraps the whole thing for URL embedding
- No external parser dependencies; hand-written recursive descent in `serialize.ts`

**Alternatives considered:**
- JSON in URL: verbose, not human-readable, ~3x longer
- RSQL/FIQL: additional dependency, complex grammar, limited TypeScript types
- GraphQL-style: too heavy for a URL param

### Evaluation

`evaluate(node, patient): boolean` is a pure function in `evaluator.ts`. It dispatches on `node.kind` via an exhaustive switch; new node types cause a compile error until the switch is updated.

### Worker Isolation

Client-side evaluation runs in a **Web Worker** (`filter.worker.ts`). The worker receives the full dataset once and re-evaluates on each filter change. The main thread receives only the filtered ID set and maps IDs to row data. This keeps the main thread free while evaluating 50k rows.

### Hybrid Filtering

`useFilterPipeline` fires both:
1. Worker evaluation (instant, from in-memory dataset)
2. `POST /patients/filter` for records not yet loaded

Results are merged in `merge.ts` (deduplicated by id, server records appended after client matches). The UI presents one unified loading state via TanStack Query's `isFetching` flag.

### Preset Conflict Resolution

Presets carry a `version` integer. `PUT /presets/:id` returns HTTP 409 with `{ serverVersion, serverPayload }` when the server version differs from the submitted `version`. The client surfaces a `ConflictModal` with a diff view; the user explicitly picks "keep mine", "use server", or can merge manually.

## Consequences

- **+** 100% branch coverage is achievable and maintained by CI
- **+** Serialization is round-trip safe (property-tested with fast-check)
- **+** Adding a new operator only requires: new type union member + new case in evaluator + new serialize case
- **−** Custom serialization is non-standard; external tools expecting SQL/OData need a converter layer
- **−** Worker communication has ~0.5ms message-passing overhead — irrelevant at human interaction speeds but measurable in micro-benchmarks
