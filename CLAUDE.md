# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm start              # expo start (dev server, pick platform from the menu)
npm run ios            # expo start --ios
npm run android        # expo start --android
npm run web             # expo start --web

npm test                # run all jest tests
npx jest src/db/__tests__/dataLayer.test.ts   # single test file
npx jest -t "crear y parar un timer"          # single test by name

npm run db:generate     # drizzle-kit generate — writes a new migration from src/db/schema.ts
npm run db:seed         # tsx scripts/seed.ts — populates .dev-data/ledger-seed.db
```

There is no separate lint/typecheck script; use `npx tsc --noEmit` if you need to check types.

## Architecture

Expo 57 / React Native 0.86 / React 19 app, TypeScript strict. Two halves: a
DB-agnostic data layer (`src/db`) and a UI layer (`src/ui` + `App.tsx`) that
never touches SQL directly.

### Data layer (`src/db`)

- **`schema.ts`** — Drizzle schema, three tables: `categories`, `entries`,
  `dailyRollups`. Everything is soft-deleted (`deletedAtMs`), never hard-deleted.
- **`client.ts`** — the app-runtime singleton: opens `expo-sqlite`, and
  `ensureDbReady()` sets WAL + `foreign_keys` PRAGMAs and runs migrations. It
  memoizes its promise, so it's safe to call repeatedly, but every screen must
  await it once before touching `db`.
- **`testClient.ts`** — `createTestDb()` is the parallel path for Jest: same
  migrations folder, but driven by `better-sqlite3` over plain Node instead of
  `expo-sqlite`. Data-layer functions are written against a shared
  `BaseSQLiteDatabase` type so the same code runs under both.
- **`dataLayer.ts`** (`createDataLayer(db, deps)`) — all entry/timer
  reads and writes go through here. Key invariants it enforces, not the UI:
  - Only one running timer can exist at a time — backed by a DB unique index
    (`idx_one_active` on `endedAtMs IS NULL`), not app-level checking.
  - Overlapping entries are rejected (`OverlapError`), never silently
    trimmed — the UI decides how to resolve an overlap.
  - `dailyRollups` is a cache of *closed* entries only, recalculated via
    `recalcRollup()` after any write that touches a day. The in-progress
    (today) day is always computed live from `entries`, never from the rollup.
  - `deps` (`now`, `getTzOffsetMin`, `genId`) are injected so tests can use a
    fake clock and deterministic IDs instead of real time / `expo-crypto`.
- **`categories.ts`** (`createCategoryLayer`) — category CRUD, kept separate
  from `dataLayer.ts`. Enforces exactly one level of nesting, and requires the
  caller to explicitly choose `reassign` vs `cascade` when deleting a category
  with entries — there is no default/implicit behavior.
- **`dateUtils.ts`** — all local-date/time math is done by hand on the epoch
  using `tzOffsetMin` captured per entry (same sign convention as
  `Date.prototype.getTimezoneOffset()`), specifically so it never depends on
  the *current* device timezone. An entry made in one timezone still displays
  its original local time if the device's timezone later changes.
- **`errors.ts`** — typed error classes (`OverlapError`,
  `ActiveTimerExistsError`, `NoActiveTimerError`, `SplitOutOfRangeError`, …).
  The UI layer's `run()` helper in `App.tsx` is the single place that catches
  these and turns them into toast messages.
- **`ids.ts`** — IDs are client-generated UUIDs (`expo-crypto`), never
  autoincrement, to leave room for future multi-device sync.
- **`io.ts`** — CSV export, and backup/restore via SQLite `VACUUM INTO` (the
  only safe way to snapshot a WAL-mode DB) plus `expo-file-system` /
  `expo-sharing`. Restoring closes and replaces the DB file; the app must be
  reloaded afterward.
- **`index.ts`** — barrel export and the app-wide `dataLayer` singleton.
- **Migrations** — edit `schema.ts`, run `npm run db:generate`, which drops a
  new `.sql` file into `src/db/migrations/`. `migrations.js` wires those files
  into the Drizzle Expo migrator; a Babel plugin (`inline-import`) is what
  makes `import sql from './0000_init.sql'` work at all.

### UI layer (`src/ui`, `App.tsx`)

- **`App.tsx`** owns essentially all state (current tab, selected day, which
  sheet is open, prefs, etc.) and is the only place that calls into
  `dataLayer` / `categoryLayer`. All writes go through its `run()` helper,
  which invalidates the read hooks on success and turns known errors
  (`OverlapError`, etc.) into a `Toast` message on failure.
- **`hooks.ts`** — there's no query-cache library. `useRevision()` holds a
  counter that's bumped after every successful write; `useCategories`,
  `useDay`, `useRange`, `useActiveTimer` all refetch whenever that counter (or
  their own args) change. `useNow()` drives the live timer display and
  resyncs on app foreground rather than accumulating drift.
- **`screens/`** — top-level tab screens (`DayScreen`, `InsightsScreen`,
  `CategoriesScreen`), rendered by `App.tsx` based on the active tab.
- **`sheets/`** — modal editors (`EntryEditSheet`, `CategoryEditSheet`,
  `CategoryPickerSheet`, `LongTimerSheet`, `MonthJumpSheet`), shown via the
  shared `Sheet` component and a single `sheet` state enum in `App.tsx`.
- **`components/`** — small shared UI (`Sheet`, `TabBar`, `TimerBar`, `Toast`).
- **`dayLayout.ts`, `format.ts`, `insights.ts`, `prefs.ts`, `theme.ts`** — pure
  helpers: day-timeline layout/collision math, time formatting and
  minute-snapping, insights aggregation over a date range, persisted user
  prefs, and light/dark theme tokens.

### Conventions worth knowing

- Comments inside `src/db` are largely written in Spanish; UI-facing strings
  and comments in `src/ui`/`App.tsx` are in English. Match whichever file
  you're editing.
- No SQL or Drizzle queries belong in `src/ui` or `App.tsx` — add a method to
  `dataLayer`/`categoryLayer` instead, even for a one-off read.
- Data-layer tests (`src/db/__tests__`) inject a fake `DataLayerDeps` (fixed
  `now()`, real `crypto.randomUUID` for IDs) against an in-memory
  `createTestDb()` — follow that pattern for new data-layer tests rather than
  mocking Drizzle.
