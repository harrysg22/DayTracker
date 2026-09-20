# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm start              # expo start (dev server, pick platform from the menu)
npm run ios            # expo run:ios
npm run android        # expo run:android
npm run web             # expo start --web

npm test                # run all jest tests
npx jest src/db/__tests__/dataLayer.test.ts   # single test file
npx jest -t "crear y parar un timer"          # single test by name

npm run db:generate     # drizzle-kit generate — writes a new migration from src/db/schema.ts
npm run db:seed         # tsx scripts/seed.ts — populates .dev-data/daytracker-seed.db
```

There is no separate lint/typecheck script; use `npx tsc --noEmit` if you need to check types.

`jest.config.js` runs in a plain Node environment (`testEnvironment: "node"`) and
only matches `src/**/__tests__/**/*.test.ts` — i.e. the four data-layer suites
(`dataLayer`, `events`, `todos`, `calendarSync`). There is no RN/component test
setup, so `jest-expo` (a devDependency) is not the active preset. `db:seed`
shells out to `tsx`, which is not declared in `package.json` — it currently
resolves globally.

## Architecture

Expo 57 / React Native 0.86 / React 19 app, TypeScript strict. Two halves: a
DB-agnostic data layer (`src/db`) and a UI layer (`src/ui` + `App.tsx`) that
never touches SQL directly.

The npm package is still named `ledger` (an earlier name for the project). The
runtime entry point is `index.tsx`, which wraps `App` in a `SafeAreaProvider`
and calls `registerRootComponent` — `App.tsx` itself is not the root.

### Data layer (`src/db`)

- **`schema.ts`** — Drizzle schema, five tables: `categories`, `entries`,
  `dailyRollups`, `todos`, `events`. Everything is soft-deleted (`deletedAtMs`),
  never hard-deleted. `entries` records what *happened* (an absolute epoch
  instant, no overlaps allowed); `events` records an *intention* (wall-clock
  `localDate` + `startMinute`, survives DST/timezone changes, overlaps freely
  allowed) — don't conflate the two. `PlanEvent` is the exported type name for
  an `events` row (not `Event` — collides with the DOM/RN global). `events`
  also carries `calendarEventId` / `calendarSyncedMs` for the system-calendar
  sync (see `calendarSync.ts` below); a partial unique index keeps them
  indexed only when non-null.
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
- **`todos.ts`** (`createTodoLayer`) / **`events.ts`** (`createEventLayer`) —
  same shape as `categories.ts`: own CRUD layer, `deps`-injected clock/ids,
  soft delete. "Overdue" is a query (`dueDate < today AND done = 0`), not a
  job that rewrites dates; completing an overdue todo pulls its `dueDate` up
  to today via `toggleDone`. `events` has no overlap validation (unlike
  `entries`) and clamps `startMinute` (0..1425) / `durationMinutes` (15..720).
  Both expose `clearCategory(categoryId)` so deleting a category detaches
  todos/events instead of cascading — call it before
  `categoryLayer.deleteCategory`, or the `foreign_keys` PRAGMA rejects the
  delete.
- **`dateUtils.ts`** — all local-date/time math is done by hand on the epoch
  using `tzOffsetMin` captured per entry (same sign convention as
  `Date.prototype.getTimezoneOffset()`), specifically so it never depends on
  the *current* device timezone. An entry made in one timezone still displays
  its original local time if the device's timezone later changes.
- **`errors.ts`** — typed error classes (`OverlapError`,
  `ActiveTimerExistsError`, `NoActiveTimerError`, `SplitOutOfRangeError`,
  `CalendarPermissionError`, `NoWritableCalendarError`, …). The UI layer's
  `run()` helper in `App.tsx` is the single place that catches these and turns
  them into toast messages.
- **`ids.ts`** — IDs are client-generated UUIDs (`expo-crypto`), never
  autoincrement, to leave room for future multi-device sync.
- **`csv.ts`** — pure CSV formatting (`buildCsv`); no filesystem access.
- **`io.ts`** — CSV export, and backup/restore via SQLite `VACUUM INTO` (the
  only safe way to snapshot a WAL-mode DB) plus `expo-file-system` /
  `expo-sharing`. Restoring closes and replaces the DB file; the app must be
  reloaded afterward.
- **`seedData.ts`** — deterministic fake-data generator (mulberry32 PRNG) used
  by `scripts/seed.ts` (`npm run db:seed`) to populate a dev SQLite file with
  realistic entries, without waiting on real usage.
- **`index.ts`** — barrel export and the app-wide `dataLayer` / `todoLayer` /
  `eventLayer` singletons (each a lazy `Proxy`, rebuilt on `onDbReopen`, e.g.
  after `restoreBackup`).
- **Migrations** — edit `schema.ts`, run `npm run db:generate`, which drops a
  new `.sql` file into `src/db/migrations/`. `migrations.js` wires those files
  into the Drizzle Expo migrator; a Babel plugin (`inline-import`) is what
  makes `import sql from './0000_init.sql'` work at all.
- **`calendarSync.ts`** (`createCalendarSync(db, deps)`) — two-way sync of
  *name + time only* between `events` and one system calendar, via a
  `CalendarBridge` injected through `deps.bridge` (real impl:
  `src/calendar/bridge.ts`, over `expo-calendar`; tests inject an in-memory
  fake). It's a manual reconcile (no push notifications/webhooks): dirty
  detection is `updatedAtMs`/`lastModifiedMs` vs `calendarSyncedMs`, last
  writer wins on conflict. All-day, recurring, and multi-day (>720min) remote
  events are skipped, not imported. `expo-calendar` only touches the device's
  *local* calendar store (EventKit on iOS) — iOS itself syncs that with Google
  in the background, so this needs no network access and works offline.

### Calendar bridge (`src/calendar/bridge.ts`)

The sole point of contact with `expo-calendar`. It's a native module that
can't load under Jest/Node, so it's `require`d lazily (same pattern as
`expo-crypto` in `ids.ts`) and `isSupported()` probes for the native module
via `requireOptionalNativeModule` rather than importing `expo-calendar`
directly, so it returns `false` cleanly instead of throwing when the pod isn't
compiled in (e.g. Expo Go). Exposes a small `CalendarBridge` interface
(list/create/update/delete on the device's writable calendars) that
`calendarSync.ts` depends on — never import `expo-calendar` outside this file.

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
  resyncs on app foreground rather than accumulating drift. `categoryLayer`
  is exported as a lazy `Proxy` so it's safe to import at module scope
  without touching the DB before `ensureDbReady()` resolves.
- **`screens/`** — top-level tab screens: `DayScreen`, `TodoScreen`
  (Overdue/Today/Tomorrow/<day> buckets, inline add, `▸` to start a timer from
  a todo), `CalendarScreen` (Day/Week/Month picker over `events`),
  `InsightsScreen`, `CategoriesScreen` — rendered by `App.tsx` based on the
  active tab (`TabKey` in `TabBar.tsx`: `day` | `todo` | `week` | `insights` |
  `categories`).
- **`sheets/`** — modal editors (`EntryEditSheet`, `CategoryEditSheet`,
  `CategoryPickerSheet`, `LongTimerSheet`, `MonthJumpSheet`, `TodoSheet`,
  `EventSheet`, `CalendarSyncSheet`), shown via the shared `Sheet` component
  and a single `sheet` state enum in `App.tsx`.
- **`components/`** — small shared UI (`Sheet`, `TabBar`, `TimerBar`, `Toast`,
  `TimeWheelSheet`). `TabBar` draws 5 custom glyphs from the app's own icon
  vocabulary rather than an icon library — keep that pattern for any new tab.
  `TimeWheelSheet` wraps the native `DateTimePicker` spinner as a bottom sheet
  for picking a time-of-day (used by `EntryEditSheet`, `EventSheet`,
  `CalendarScreen`).
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
- `code_todo_calendar/` at the repo root is a leftover hand-off scaffold (with
  `.PASTE.*` fragments and an `INSTALL.md`) for the todo/calendar feature —
  its contents have already been copied into `src/` and `App.tsx`. Treat it as
  stale reference, not a source to import from or keep in sync.
- Sheets commit on close, not on a separate "Save": a field's draft value is
  applied when the sheet is dismissed (scrim tap or a "Done" button), and
  there is no Cancel affordance anywhere in the app. Follow this for any new
  sheet/field rather than adding Save/Cancel buttons.
