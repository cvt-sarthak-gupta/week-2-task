# Healthcare Dashboard — Codebase Guide

## Project Overview

A multi-tenant healthcare SaaS dashboard. Clinical care coordinators manage 50,000+ live patient records per tenant. Production-grade: offline-first, real-time streaming, virtualized grid, RBAC, and a typed filter AST.

**Stack:** React 19, TypeScript (strict), Vite, TanStack Query v5, Ant Design v5, SQLite WASM, WebSocket/SSE, Express, JWT.

---

## Local Setup

```bash
# Prerequisites: Node 20+

# 1. Copy and configure environment variables
cp .env.example .env
# Edit .env: set JWT_SECRET to a random 64-byte hex string

# 2. Install frontend dependencies
npm install

# 3. Install backend dependencies
cd server && npm install && cd ..

# 4. Start both servers concurrently
npm run dev          # starts Vite (port 5173) + Express (port 3001)
```

**Demo users (all passwords: `password123`):**
| Email | Role | Tenant |
|---|---|---|
| coordinator@tenant-a.com | coordinator | tenant-a |
| admin@tenant-a.com | admin | tenant-a |
| readonly@tenant-a.com | readonly | tenant-a |
| coordinator@tenant-b.com | coordinator | tenant-b |

---

## Monorepo Structure

```
/                        ← Frontend (Vite + React)
├── src/
│   ├── app/             ← Bootstrap, routing, providers
│   ├── core/            ← Domain-agnostic infrastructure
│   │   ├── api/         ← HTTP client, token management, query keys
│   │   ├── auth/        ← AuthContext, JWT decode
│   │   ├── permissions/ ← Capability engine, Gate component, useCan hook
│   │   ├── realtime/    ← ConnectionManager, WS/SSE transports, reconnect
│   │   ├── offline/     ← SQLite WASM client, PatientRepo, QueueRepo, sync orchestrator
│   │   └── workers/     ← Web Worker for stream dedup/batching, filter worker
│   ├── features/
│   │   ├── patients/    ← PatientPage, FilterBar, api hooks, presets
│   │   ├── filters/     ← FilterBuilder UI + typed AST (types, evaluator, serializer)
│   │   └── virtualized-grid/ ← Custom virtualizer (Fenwick tree, keyboard nav, a11y)
│   └── shared/          ← Types (Patient, User, etc.), utils, hooks
├── docs/                ← ADRs
└── server/              ← Backend (Express + WebSocket/SSE)
    └── src/
        ├── core/        ← BaseController, BaseRepository, errors, filter deserializer
        ├── infrastructure/ ← InMemoryStore (tenant-keyed, sorted cache)
        └── modules/     ← auth, patients, presets, permissions (NestJS-style)
```

---

## Architecture Decisions

### Why custom virtualized grid? (ADR-0001)
`react-window` and `tanstack-virtual` do not support variable-height rows with a ResizeObserver out of the box. Built from scratch using a **Fenwick tree** for O(log n) cumulative height queries. See `docs/ADR-0001-virtualized-table.md`.

### Why a typed filter AST? (ADR-0002)
Filters need to be: (a) evaluated client-side against SQLite data, (b) evaluated server-side against the in-memory store, (c) URL-serialized for bookmarking. A discriminated-union AST guarantees all three are consistent. See `docs/ADR-0002-filter-expression-system.md`.

---

## Key Rules

### Permission System
**Never compare `user.role` directly.** Use `useCan('capability')` or `<Gate cap="capability">`.
The ESLint config (`eslint.config.js`) enforces this with a `no-restricted-syntax` rule.

```tsx
// ✗ Wrong
if (user.role === 'admin') { ... }

// ✓ Correct
const canEdit = useCan('editPatientStatus');
<Gate cap="editPatientStatus"><EditButton /></Gate>
```

### Tenant Isolation
Tenant ID **always** comes from `req.ctx.tenantId` (populated by `authMiddleware` from the verified JWT). It is never accepted from query parameters or request bodies. WS/SSE broadcasts are filtered by `event.tenantId` — clients only receive events for their own tenant.

### Offline / SQLite
All patient reads in the frontend go through the local SQLite replica (`PatientRepository.findFiltered`), never directly to the server. The server is only called during:
1. Initial bootstrap (`usePatientBootstrap`)
2. Reconnect sync (`useSyncOnReconnect`)
3. Infinite scroll server fallback (when SQLite doesn't have the page yet)

### Filter Field Sort Safety
`PatientRepository.findFiltered` validates sort field names against the `SORTABLE_FIELDS` allowlist before interpolating into SQL. Never add user-supplied field names to SQL without this check.

---

## Running Tests

```bash
# Frontend (Vitest + jsdom + Playwright)
npm test                 # unit + integration tests (Vitest)
npm run test:coverage    # with coverage report

# Backend (Vitest, node environment)
cd server && npm test

# End-to-end (Playwright)
npm run test:e2e

# Performance benchmarks
npx vitest bench
```

**Coverage gates** (enforced in `vitest.config.ts`):
- `src/features/filters/ast/**` — 100% branches
- `src/core/offline/queue/**` — 100% branches
- `src/core/offline/sync/diff.ts` — 100% branches

---

## Environment Variables

See `.env.example` for all variables. Critical ones:

| Variable | Required in prod? | Default (dev) | Notes |
|---|---|---|---|
| `JWT_SECRET` | **Yes** | `dev-secret-change-in-prod` | Server crashes on startup if missing in production |
| `PORT` | No | `3001` | Express server port |
| `NODE_ENV` | Yes | `development` | Controls secure cookie flag and CORS |
| `ALLOWED_ORIGINS` | Yes in prod | all localhost | Comma-separated list |

---

## Data Flow

```
Server (Express)
  └── InMemoryStore (tenant-keyed)
        └── PatientRepository / PresetService
              └── REST routes (all require authMiddleware)

Browser
  ├── Bootstrap: NDJSON stream → SQLite WASM (PatientRepository)
  ├── Live updates: WebSocket → StreamWorker (dedup/batch) → QueryClient cache
  ├── Reads: SQLite → usePatients (TanStack Query, staleTime=Infinity)
  ├── Writes: server PATCH → SQLite upsert → QueryClient invalidate
  └── Offline: SQLite reads + QueueRepository → sync on reconnect
```

---

## Caveats (Mock Server)

- All data is **in-memory** — restarting the server resets to seeded data.
- Passwords are hardcoded in `server/src/modules/auth/auth.routes.ts` (demo only).
- 50,000 patients are seeded per tenant at startup — this takes ~2–3 seconds.
- There is no real database; a production deployment would replace `InMemoryStore` with a real ORM/DB adapter.

---

## Adding a New Feature

1. **Backend:** Create a module under `server/src/modules/<name>/` with `entity.ts`, `service.ts`, `routes.ts`. Register the router in `server/src/index.ts`.
2. **Frontend:** Add a feature directory under `src/features/<name>/`. Use `apiFetch` for HTTP calls. Add query keys to `src/core/api/queryKeys.ts`.
3. **Permissions:** Add new capabilities to `src/core/permissions/schema.ts` and the demo user list in `server/src/modules/auth/auth.routes.ts`.
4. **Tests:** Unit-test the service in `*.test.ts`. Add coverage to the appropriate coverage threshold in `vitest.config.ts` if the module is critical path.
