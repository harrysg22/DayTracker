import crypto from "node:crypto";
import { createCalendarSync, type CalendarSyncDeps } from "../calendarSync";
import { createEventLayer } from "../events";
import { CalendarPermissionError, NoWritableCalendarError } from "../errors";
import { events } from "../schema";
import { createTestDb } from "../testClient";
import type { BridgeEvent, CalendarBridge } from "../../calendar/bridge";

// ── Doble en memoria del calendario del sistema ───────────────────────────────

interface FakeOpts {
  granted?: boolean;
  supported?: boolean;
}

function makeFakeBridge(now: () => number, opts: FakeOpts = {}) {
  const store = new Map<string, BridgeEvent>();
  let seq = 0;
  let granted = opts.granted ?? true;

  const bridge: CalendarBridge = {
    isSupported: () => opts.supported ?? true,
    hasPermission: async () => granted,
    requestPermission: async () => {
      granted = opts.granted ?? true;
      return granted;
    },
    listWritableCalendars: async () => [
      { id: "cal1", title: "me@gmail.com", sourceName: "me@gmail.com", sourceType: "caldav" },
    ],
    listEvents: async (_calId, startMs, endMs) =>
      [...store.values()]
        .filter((e) => e.startMs < endMs && e.endMs > startMs)
        .map((e) => ({ ...e })),
    getEvent: async (id) => {
      const e = store.get(id);
      return e ? { ...e } : null;
    },
    createEvent: async (_calId, input) => {
      const ev: BridgeEvent = {
        id: `g-${seq++}`,
        title: input.title,
        startMs: input.startMs,
        endMs: input.endMs,
        allDay: false,
        isRecurring: false,
        lastModifiedMs: now(),
      };
      store.set(ev.id, ev);
      return { ...ev };
    },
    updateEvent: async (id, patch) => {
      const e = store.get(id);
      if (!e) throw new Error("no such event " + id);
      store.set(id, { ...e, ...patch, lastModifiedMs: now() });
    },
    deleteEvent: async (id) => {
      store.delete(id);
    },
  };

  // Helpers de test para sembrar/leer el lado remoto directamente.
  const seed = (partial: Partial<BridgeEvent> & { startMs: number; endMs: number }) => {
    const ev: BridgeEvent = {
      id: `seed-${seq++}`,
      title: "Seeded",
      allDay: false,
      isRecurring: false,
      lastModifiedMs: now(),
      ...partial,
    };
    store.set(ev.id, ev);
    return ev;
  };

  return Object.assign(bridge, { store, seed });
}

function makeDeps(startMs = 1_700_000_000_000) {
  let current = startMs;
  const deps = {
    now: () => current,
    getTzOffsetMin: () => 0,
    genId: () => crypto.randomUUID(),
    timeZone: () => "UTC",
    advance: (ms: number) => {
      current += ms;
    },
  };
  return deps as CalendarSyncDeps & { advance: (ms: number) => void };
}

// Fecha dentro de la ventana (~6 días después del "hoy" que fija makeDeps).
const DAY = "2023-11-20";
function utc(h: number, m = 0): number {
  return Date.UTC(2023, 10, 20, h, m);
}

describe("calendarSync", () => {
  let ctx: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    ctx = createTestDb();
  });
  afterEach(() => {
    ctx.sqlite.close();
  });

  function setup(opts: FakeOpts = {}) {
    const deps = makeDeps();
    const bridge = makeFakeBridge(deps.now, opts);
    deps.bridge = bridge;
    const el = createEventLayer(ctx.db as any, deps);
    const sync = createCalendarSync(ctx.db as any, deps);
    const allRows = () => ctx.db.select().from(events).all() as any[];
    return { deps, bridge, el, sync, allRows };
  }

  test("evento local nuevo se sube al calendario del sistema", async () => {
    const { bridge, el, sync, allRows } = setup();
    const local = await el.create({ title: "Gym", localDate: DAY, startMinute: 9 * 60, durationMinutes: 60 });

    const r = await sync.run("cal1");

    expect(r.pushed).toBe(1);
    expect([...bridge.store.values()]).toHaveLength(1);
    const remote = [...bridge.store.values()][0];
    expect(remote.title).toBe("Gym");
    expect(remote.startMs).toBe(utc(9));
    expect(remote.endMs).toBe(utc(10));

    const row = allRows().find((e) => e.id === local.id)!;
    expect(row.calendarEventId).toBe(remote.id);
    expect(row.calendarSyncedMs).toBeGreaterThanOrEqual(row.updatedAtMs);
  });

  test("evento remoto nuevo se importa a la app (solo nombre y hora)", async () => {
    const { bridge, sync, allRows } = setup();
    bridge.seed({ title: "Dentist", startMs: utc(14), endMs: utc(15) });

    const r = await sync.run("cal1");

    expect(r.pulled).toBe(1);
    const rows = allRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe("Dentist");
    expect(rows[0].localDate).toBe(DAY);
    expect(rows[0].startMinute).toBe(14 * 60);
    expect(rows[0].durationMinutes).toBe(60);
    expect(rows[0].categoryId).toBeNull();
    expect(rows[0].note).toBeNull();
    expect(rows[0].calendarEventId).toBeDefined();
  });

  test("segunda pasada sin cambios no hace nada", async () => {
    const { bridge, el, sync } = setup();
    await el.create({ title: "Gym", localDate: DAY, startMinute: 540, durationMinutes: 60 });
    bridge.seed({ title: "Dentist", startMs: utc(14), endMs: utc(15) });
    await sync.run("cal1");

    const r = await sync.run("cal1");
    expect(r).toMatchObject({ pushed: 0, pulled: 0, updatedRemote: 0, updatedLocal: 0, deletedRemote: 0, deletedLocal: 0 });
  });

  test("edición local gana: se sube al sistema", async () => {
    const { bridge, el, sync, deps } = setup();
    const local = await el.create({ title: "Gym", localDate: DAY, startMinute: 540, durationMinutes: 60 });
    await sync.run("cal1");
    const remoteId = [...bridge.store.keys()][0];

    deps.advance(5000);
    await el.update(local.id, { title: "Morning run" });

    const r = await sync.run("cal1");
    expect(r.updatedRemote).toBe(1);
    expect(r.updatedLocal).toBe(0);
    expect(bridge.store.get(remoteId)!.title).toBe("Morning run");
  });

  test("edición remota gana: se baja a la app", async () => {
    const { bridge, el, sync, deps, allRows } = setup();
    const local = await el.create({ title: "Gym", localDate: DAY, startMinute: 540, durationMinutes: 60 });
    await sync.run("cal1");
    const remoteId = [...bridge.store.keys()][0];

    deps.advance(5000);
    await bridge.updateEvent(remoteId, { title: "Gym (moved)", startMs: utc(10), endMs: utc(11) });

    const r = await sync.run("cal1");
    expect(r.updatedLocal).toBe(1);
    expect(r.updatedRemote).toBe(0);
    const row = allRows().find((e) => e.id === local.id)!;
    expect(row.title).toBe("Gym (moved)");
    expect(row.startMinute).toBe(10 * 60);
  });

  test("borrado local se propaga al sistema", async () => {
    const { bridge, el, sync, deps, allRows } = setup();
    const local = await el.create({ title: "Gym", localDate: DAY, startMinute: 540, durationMinutes: 60 });
    await sync.run("cal1");
    const remoteId = [...bridge.store.keys()][0];

    deps.advance(1000);
    await el.softDelete(local.id);

    const r = await sync.run("cal1");
    expect(r.deletedRemote).toBe(1);
    expect(r.pulled).toBe(0); // no se re-importa el que acabamos de borrar
    expect(bridge.store.has(remoteId)).toBe(false);
    expect(allRows()).toHaveLength(1);
    const row = allRows().find((e) => e.id === local.id)!;
    expect(row.deletedAtMs).not.toBeNull();
    expect(row.calendarEventId).toBeNull();
  });

  test("borrado remoto hace soft-delete local", async () => {
    const { bridge, el, sync, allRows } = setup();
    const local = await el.create({ title: "Gym", localDate: DAY, startMinute: 540, durationMinutes: 60 });
    await sync.run("cal1");
    const remoteId = [...bridge.store.keys()][0];

    await bridge.deleteEvent(remoteId);

    const r = await sync.run("cal1");
    expect(r.deletedLocal).toBe(1);
    const row = allRows().find((e) => e.id === local.id)!;
    expect(row.deletedAtMs).not.toBeNull();
  });

  test("recorta duración corta al importar y salta multi-día", async () => {
    const { bridge, sync, allRows } = setup();
    bridge.seed({ title: "Quick", startMs: utc(9), endMs: utc(9, 10) }); // 10 min → 15
    bridge.seed({ title: "Trip", startMs: utc(9), endMs: Date.UTC(2023, 10, 21, 9) }); // 24 h → skip

    const r = await sync.run("cal1");

    expect(r.pulled).toBe(1);
    expect(r.skipped).toBe(1);
    const rows = allRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe("Quick");
    expect(rows[0].durationMinutes).toBe(15);
  });

  test("ignora eventos de todo el día y recurrentes", async () => {
    const { bridge, sync, allRows } = setup();
    bridge.seed({ title: "Holiday", startMs: utc(0), endMs: utc(23, 59), allDay: true });
    bridge.seed({ title: "Standup", startMs: utc(9), endMs: utc(9, 30), isRecurring: true });

    const r = await sync.run("cal1");

    expect(r.pulled).toBe(0);
    expect(r.skipped).toBe(2);
    expect(allRows()).toHaveLength(0);
  });

  test("no toca eventos fuera de la ventana de ±90 días", async () => {
    const { bridge, sync, allRows } = setup();
    const farStart = Date.UTC(2024, 5, 1, 9); // ~200 días después de 'hoy'
    bridge.seed({ title: "Far", startMs: farStart, endMs: farStart + 3_600_000 });

    const r = await sync.run("cal1");

    expect(r.pulled).toBe(0);
    expect(allRows()).toHaveLength(0);
  });

  test("sin calendario elegido lanza NoWritableCalendarError", async () => {
    const { sync } = setup();
    await expect(sync.run(null)).rejects.toThrow(NoWritableCalendarError);
  });

  test("sin permiso lanza CalendarPermissionError", async () => {
    const { sync } = setup({ granted: false });
    await expect(sync.run("cal1")).rejects.toThrow(CalendarPermissionError);
  });
});
