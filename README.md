# Healthcare SaaS Dashboard

Production-grade, multi-tenant patient management dashboard for clinical care coordinators. Handles 50,000+ live patient records with real-time streaming, custom virtualization, typed filter AST, capability-based RBAC, and full offline support.

## Quick Start

```bash
# Install all dependencies (frontend + server)
npm install
cd server && npm install && cd ..

# Start both frontend dev server and mock server
npm run dev
# → Frontend: http://localhost:5173
# → Mock API: http://localhost:3001

# Demo credentials
# coordinator@tenant-a.com / password123   (standard access)
# admin@tenant-a.com / password123          (full access)
# readonly@tenant-a.com / password123       (view only)
```

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Start frontend + mock server concurrently |
| `npm run dev:client` | Frontend only (Vite) |
| `npm run dev:server` | Mock server only (Express + WS + SSE) |
| `npm run typecheck` | TypeScript strict check (frontend + server) |
| `npm run lint` | ESLint (includes jsx-a11y + no-role-checks rule) |
| `npm test` | Vitest unit + integration tests |
| `npm run test:bench` | Performance benchmarks |
| `npm run test:e2e` | Playwright end-to-end tests |
| `npm run test:coverage` | Coverage report (enforces 100% branches on critical modules) |
| `npm run build` | Production build (fails if initial chunk > 100KB gzip) |

## Architecture Overview

```
src/
  app/                     Application bootstrap, router, providers
  core/
    api/                   Fetch client, token refresh, query keys
    auth/                  JWT auth context
    permissions/           Capability engine, Gate, useCan
    realtime/              WS + SSE transports, connection manager, event bus
    workers/               stream.worker.ts, filter.worker.ts (off-main-thread)
    offline/               SQLite WASM, repositories, queue, diff, sync orchestrator
    config/                Typed env
    testing/               MSW handlers, test factories
  features/
    patients/              Patient page, API hooks, login
    filters/               Typed AST (types, evaluator, serializer, merge)
    virtualized-grid/      Custom virtualizer (no react-window/tanstack-virtual)
    sync/                  Offline banner, conflict modal
  shared/                  Types, utils, hooks, accessibility primitives

server/
  src/
    core/                  SOLID base classes (IRepository, BaseCrudService, etc.)
    infrastructure/        InMemoryStore (tenant-keyed)
    modules/               auth, patients, permissions, presets, sync
    ws.ts                  WebSocket broadcaster
    sse.ts                 SSE broadcaster (mirrors WS)
    scripts/seed.ts        Generates 50,000 patients across 3 tenants
```

## Key Architectural Decisions

See [`docs/ADR-0001-virtualized-table.md`](docs/ADR-0001-virtualized-table.md) — custom Fenwick-tree-backed virtualization.

See [`docs/ADR-0002-filter-expression-system.md`](docs/ADR-0002-filter-expression-system.md) — typed AST, URL serialization, hybrid client+server filtering.

## Feature Summary

### Feature 1 — Real-Time Streaming
- WebSocket with exponential-backoff reconnect (1s → 30s, full jitter) and heartbeat (ping every 15s, 5s timeout)
- Automatic SSE fallback on WS failure — same event bus, no data loss
- All event processing in a Web Worker: dedup by event id, out-of-order reconciliation by `(entityId, version)`, batched rAF flush at 60fps

### Feature 2 — Custom Virtualized Grid
- No react-window / tanstack-virtual — built from scratch
- Fenwick tree for O(log n) variable-height offset queries
- Frozen columns via CSS `position: sticky`; column widths persisted to `localStorage`
- Multi-column sorting with priority indicators
- Row identity (not index) for stable selection/expansion under live updates
- Full keyboard navigation: Arrow, Page, Home/End, Enter, Space
- WCAG 2.1 AA: `role="grid"`, `aria-rowindex`, debounced `aria-live` announcements

### Feature 3 — Multi-Dimensional Filter Engine
- Typed `FilterNode` discriminated union: `and`, `or`, `not`, `compare` (8 operators), `range`
- Type-preserving URL serialization: `and(eq(status,s:critical),gte(age,n:65))` — round-trip safe (property-tested)
- Filter evaluation in Web Worker; result (filtered ID set) delivered to main thread
- Hybrid: worker evaluates local dataset instantly, server queried in parallel, results merged without double-spinner
- Saved presets with version-based optimistic locking + conflict modal on 409

### Feature 4 — Role-Based UI Composition
- `PermissionSchema` fetched once at login, cached locally
- `useCan("capability")` — never `user.role === "admin"` (ESLint custom rule blocks it)
- `<Gate cap="...">` — unauthorized content is **not rendered**, not just CSS-hidden
- Capabilities × feature flags — both must be true for access
- Client-side API guard: `apiFetch` rejects calls for denied capabilities before they hit the network

### Feature 5 — Offline + Sync
- SQLite WASM (`@sqlite.org/sqlite-wasm`) with OPFS persistence; in-memory fallback for unsupported browsers
- Typed repository layer: `PatientRepository`, `QueueRepository`, `ConflictRepository`
- Offline queue: ordered, persists across page refresh/browser restart
- Sync orchestrator: `computeDiff` (minimal patch set), replay queue in order, 409 → `ConflictModal`

### Feature 6 — Quality
- **TypeScript**: strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`
- **Tests**: 89 unit/integration tests; 100% branch coverage enforced on filter AST, queue, diff
- **Benchmarks**: 50k-row Fenwick init < 2ms; `getVisibleRange` < 1ms
- **Bundle budget**: Vite plugin fails production build over 100KB gzip on initial chunk
- **Accessibility**: `vitest-axe` in component tests; full keyboard navigation; icons+text+color for status

## SOLID Principles Applied (Mock Server)

The mock server in `server/` mirrors the `solid-node-dev` pattern:
- **S**: `PatientController` = HTTP only; `PatientService` = business logic; `PatientRepository` = data access
- **O**: `BaseRepository<T>` extended per entity; never modified
- **L**: Any concrete repository is substitutable behind `IRepository<T>`
- **I**: `IReadRepository<T>` / `IWriteRepository<T>` split
- **D**: Controllers depend on `IService` interfaces; never on repositories directly

To swap the mock server for a real Postgres + TypeORM backend: replace `InMemoryStore` with a TypeORM `DataSource` in each repository constructor. All interfaces stay identical.

## Performance Report

See [`docs/PERFORMANCE-REPORT.json`](docs/PERFORMANCE-REPORT.json) (generated by `npm run test:bench`).

Key numbers on a mid-range Mac M1:
- `RowSizeManager init (50k rows)`: ~0.74ms
- `getVisibleRange (50k rows)`: ~0.64ms
- `findIndex (50k rows)`: ~0.76ms
- `50k setSize updates`: ~1.17ms

All well under the 200ms requirement.
