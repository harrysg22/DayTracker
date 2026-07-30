import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createDataLayer, type DataLayerDeps } from "../dataLayer";
import { computeLocalDate, formatLocalTime } from "../dateUtils";
import {
  ActiveTimerExistsError,
  NoActiveTimerError,
  NotFoundError,
  OverlapError,
  SplitOutOfRangeError,
} from "../errors";
import { createTestDb } from "../testClient";

function makeDeps(startMs = 1_700_000_000_000, tzOffsetMin = 0) {
  let current = startMs;
  const deps: DataLayerDeps = {
    now: () => current,
    getTzOffsetMin: () => tzOffsetMin,
    genId: () => crypto.randomUUID(),
  };
  return Object.assign(deps, {
    advance: (ms: number) => {
      current += ms;
    },
  });
}

describe("dataLayer", () => {
  let ctx: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    ctx = createTestDb();
  });

  afterEach(() => {
    ctx.sqlite.close();
  });

  test("crear y parar un timer", async () => {
    const deps = makeDeps();
    const dl = createDataLayer(ctx.db as any, deps);

    expect(await dl.getActiveTimer()).toBeNull();

    const cat = await dl.createCategory({ name: "Trabajo", color: "#000" });
    const started = await dl.startTimer(cat.id);
    expect(started.endedAtMs).toBeNull();
    expect((await dl.getActiveTimer())?.id).toBe(started.id);

    deps.advance(60_000);
    const stopped = await dl.stopTimer();
    expect(stopped.endedAtMs).toBe(deps.now());
    expect(await dl.getActiveTimer()).toBeNull();
  });

  test("startTimer lanza si ya hay uno activo", async () => {
    const deps = makeDeps();
    const dl = createDataLayer(ctx.db as any, deps);
    const cat = await dl.createCategory({ name: "Trabajo", color: "#000" });
    await dl.startTimer(cat.id);
    await expect(dl.startTimer(cat.id)).rejects.toThrow(ActiveTimerExistsError);
  });

  test("stopTimer lanza si no hay timer activo", async () => {
    const deps = makeDeps();
    const dl = createDataLayer(ctx.db as any, deps);
    await expect(dl.stopTimer()).rejects.toThrow(NoActiveTimerError);
  });

  test("el timer activo sobrevive a un reinicio simulado de la app", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "daytracker-"));
    const tmpFile = path.join(tmpDir, "test.db");

    // "Sesión 1": arranca un timer y la app se cierra sin detenerlo.
    const conn1 = createTestDb(tmpFile);
    const dl1 = createDataLayer(conn1.db as any, makeDeps());
    const cat = await dl1.createCategory({ name: "Trabajo", color: "#000" });
    const started = await dl1.startTimer(cat.id);
    conn1.sqlite.close(); // simula que el SO mata la app

    // "Sesión 2": conexión y capa de datos nuevas, sin ningún estado en
    // memoria compartido con la sesión 1 — todo se lee de disco.
    const conn2 = createTestDb(tmpFile);
    const dl2 = createDataLayer(conn2.db as any, makeDeps());
    const active = await dl2.getActiveTimer();

    expect(active).not.toBeNull();
    expect(active?.id).toBe(started.id);
    expect(active?.startedAtMs).toBe(started.startedAtMs);
    expect(active?.endedAtMs).toBeNull();

    conn2.sqlite.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test("no-solapamiento: createEntry rechaza rangos que chocan", async () => {
    const dl = createDataLayer(ctx.db as any, makeDeps());
    const cat = await dl.createCategory({ name: "Trabajo", color: "#000" });
    const base = 1_700_000_000_000;

    await dl.createEntry({ categoryId: cat.id, startedAtMs: base, endedAtMs: base + 3_600_000 });

    await expect(
      dl.createEntry({
        categoryId: cat.id,
        startedAtMs: base + 1_800_000,
        endedAtMs: base + 5_000_000,
      })
    ).rejects.toThrow(OverlapError);

    // Adyacente (empieza justo cuando termina la anterior) sí se permite.
    await expect(
      dl.createEntry({
        categoryId: cat.id,
        startedAtMs: base + 3_600_000,
        endedAtMs: base + 7_200_000,
      })
    ).resolves.toBeDefined();
  });

  test("no-solapamiento: updateEntry rechaza mover una entry sobre otra", async () => {
    const dl = createDataLayer(ctx.db as any, makeDeps());
    const cat = await dl.createCategory({ name: "Trabajo", color: "#000" });
    const base = 1_700_000_000_000;

    await dl.createEntry({ categoryId: cat.id, startedAtMs: base, endedAtMs: base + 3_600_000 });
    const b = await dl.createEntry({
      categoryId: cat.id,
      startedAtMs: base + 3_600_000,
      endedAtMs: base + 7_200_000,
    });

    await expect(dl.updateEntry(b.id, { startedAtMs: base + 1_000_000 })).rejects.toThrow(
      OverlapError
    );

    const moved = await dl.updateEntry(b.id, {
      startedAtMs: base + 3_660_000,
      endedAtMs: base + 7_260_000,
    });
    expect(moved.startedAtMs).toBe(base + 3_660_000);
  });

  test("split parte una entry cerrada en dos, conservando categoría/nota", async () => {
    const dl = createDataLayer(ctx.db as any, makeDeps());
    const cat = await dl.createCategory({ name: "Trabajo", color: "#000" });
    const base = 1_700_000_000_000;
    const entry = await dl.createEntry({
      categoryId: cat.id,
      startedAtMs: base,
      endedAtMs: base + 7_200_000,
      note: "nota",
    });

    const [first, second] = await dl.splitEntry(entry.id, base + 3_600_000);

    expect(first.startedAtMs).toBe(base);
    expect(first.endedAtMs).toBe(base + 3_600_000);
    expect(second.startedAtMs).toBe(base + 3_600_000);
    expect(second.endedAtMs).toBe(base + 7_200_000);
    expect(second.id).not.toBe(first.id);
    expect(second.categoryId).toBe(cat.id);
    expect(second.note).toBe("nota");

    const day = await dl.getDay(entry.localDate);
    expect(day.map((e) => e.id).sort()).toEqual([first.id, second.id].sort());
  });

  test("split fuera de rango lanza error", async () => {
    const dl = createDataLayer(ctx.db as any, makeDeps());
    const cat = await dl.createCategory({ name: "Trabajo", color: "#000" });
    const base = 1_700_000_000_000;
    const entry = await dl.createEntry({
      categoryId: cat.id,
      startedAtMs: base,
      endedAtMs: base + 3_600_000,
    });

    await expect(dl.splitEntry(entry.id, base)).rejects.toThrow(SplitOutOfRangeError);
    await expect(dl.splitEntry(entry.id, base + 3_600_000)).rejects.toThrow(SplitOutOfRangeError);
    await expect(dl.splitEntry(entry.id, base - 1_000)).rejects.toThrow(SplitOutOfRangeError);
  });

  test("split de un timer activo deja la segunda mitad corriendo", async () => {
    const deps = makeDeps();
    const dl = createDataLayer(ctx.db as any, deps);
    const cat = await dl.createCategory({ name: "Trabajo", color: "#000" });
    const started = await dl.startTimer(cat.id);
    deps.advance(3_600_000);

    const cutMs = deps.now() - 1_800_000;
    const [first, second] = await dl.splitEntry(started.id, cutMs);

    expect(first.endedAtMs).toBe(cutMs);
    expect(second.endedAtMs).toBeNull();
    expect((await dl.getActiveTimer())?.id).toBe(second.id);
  });

  test("soft delete: no borra la fila, la excluye de lecturas y recalcula el rollup", async () => {
    const dl = createDataLayer(ctx.db as any, makeDeps());
    const cat = await dl.createCategory({ name: "Trabajo", color: "#000" });
    const base = 1_700_000_000_000;

    const a = await dl.createEntry({ categoryId: cat.id, startedAtMs: base, endedAtMs: base + 3_600_000 });
    const b = await dl.createEntry({
      categoryId: cat.id,
      startedAtMs: base + 4_000_000,
      endedAtMs: base + 5_000_000,
    });

    let rollups = await dl.getRollupRange(a.localDate, a.localDate);
    expect(rollups.find((r) => r.categoryId === cat.id)?.totalMs).toBe(3_600_000 + 1_000_000);

    await dl.deleteEntry(a.id);

    const rawRow = ctx.sqlite
      .prepare("select deleted_at_ms from entries where id = ?")
      .get(a.id) as { deleted_at_ms: number | null };
    expect(rawRow.deleted_at_ms).not.toBeNull();

    const day = await dl.getDay(a.localDate);
    expect(day.map((e) => e.id)).toEqual([b.id]);

    rollups = await dl.getRollupRange(a.localDate, a.localDate);
    expect(rollups.find((r) => r.categoryId === cat.id)?.totalMs).toBe(1_000_000);

    await expect(dl.deleteEntry(a.id)).rejects.toThrow(NotFoundError);
  });

  test("borrar el timer activo lo cierra para no violar idx_one_active", async () => {
    const deps = makeDeps();
    const dl = createDataLayer(ctx.db as any, deps);
    const cat = await dl.createCategory({ name: "Trabajo", color: "#000" });
    const started = await dl.startTimer(cat.id);
    deps.advance(60_000);

    await dl.deleteEntry(started.id);
    expect(await dl.getActiveTimer()).toBeNull();

    const next = await dl.startTimer(cat.id);
    expect(next.endedAtMs).toBeNull();
  });

  test("rollup correcto: suma por categoría solo entries cerradas del día", async () => {
    const dl = createDataLayer(ctx.db as any, makeDeps());
    const trabajo = await dl.createCategory({ name: "Trabajo", color: "#000" });
    const ocio = await dl.createCategory({ name: "Ocio", color: "#111" });
    const base = 1_700_000_000_000;

    await dl.createEntry({ categoryId: trabajo.id, startedAtMs: base, endedAtMs: base + 3_600_000 });
    await dl.createEntry({
      categoryId: trabajo.id,
      startedAtMs: base + 4_000_000,
      endedAtMs: base + 5_800_000,
    });
    await dl.createEntry({
      categoryId: ocio.id,
      startedAtMs: base + 6_000_000,
      endedAtMs: base + 6_900_000,
    });

    const localDate = computeLocalDate(base, 0);
    const rollups = await dl.getRollupRange(localDate, localDate);
    const byCategory = new Map(rollups.map((r) => [r.categoryId, r.totalMs]));

    expect(byCategory.get(trabajo.id)).toBe(3_600_000 + 1_800_000);
    expect(byCategory.get(ocio.id)).toBe(900_000);
  });

  test("una entry en curso no cuenta en el rollup hasta que se cierra", async () => {
    const deps = makeDeps();
    const dl = createDataLayer(ctx.db as any, deps);
    const cat = await dl.createCategory({ name: "Trabajo", color: "#000" });
    const started = await dl.startTimer(cat.id);

    let rollups = await dl.getRollupRange(started.localDate, started.localDate);
    expect(rollups).toHaveLength(0);

    deps.advance(1_800_000);
    await dl.stopTimer();

    rollups = await dl.getRollupRange(started.localDate, started.localDate);
    expect(rollups.find((r) => r.categoryId === cat.id)?.totalMs).toBe(1_800_000);
  });

  test("entrada que cruza medianoche: local_date es el día de inicio y aparece completa en getDay", async () => {
    const dl = createDataLayer(ctx.db as any, makeDeps());
    const cat = await dl.createCategory({ name: "Sueño", color: "#000" });

    // 23:30 del 2023-11-14 hasta 07:00 del 2023-11-15 (offset 0 = UTC).
    const startedAtMs = Date.UTC(2023, 10, 14, 23, 30, 0);
    const endedAtMs = Date.UTC(2023, 10, 15, 7, 0, 0);

    const entry = await dl.createEntry({ categoryId: cat.id, startedAtMs, endedAtMs, tzOffsetMin: 0 });
    expect(entry.localDate).toBe("2023-11-14");

    const day14 = await dl.getDay("2023-11-14");
    expect(day14.map((e) => e.id)).toEqual([entry.id]);

    const day15 = await dl.getDay("2023-11-15");
    expect(day15).toEqual([]);

    const rollups = await dl.getRollupRange("2023-11-14", "2023-11-14");
    expect(rollups.find((r) => r.categoryId === cat.id)?.totalMs).toBe(endedAtMs - startedAtMs);
  });

  test("entrada creada en un offset y leída en otro conserva su hora local original", async () => {
    const dl = createDataLayer(ctx.db as any, makeDeps());
    const cat = await dl.createCategory({ name: "Trabajo", color: "#000" });

    // Creada con tz_offset_min = 300 (UTC-5): 09:00 local == 14:00 UTC.
    const startedAtMs = Date.UTC(2024, 2, 10, 14, 0, 0);
    const entry = await dl.createEntry({
      categoryId: cat.id,
      startedAtMs,
      endedAtMs: startedAtMs + 3_600_000,
      tzOffsetMin: 300,
    });
    expect(entry.localDate).toBe("2024-03-10");

    // El dispositivo "viaja" a offset 0 y relee la misma entry: su
    // tz_offset_min/local_date guardados no se recalculan con el offset
    // actual del dispositivo lector.
    const readBack = await dl.getDay("2024-03-10");
    expect(readBack).toHaveLength(1);
    expect(readBack[0].tzOffsetMin).toBe(300);
    expect(formatLocalTime(readBack[0].startedAtMs, readBack[0].tzOffsetMin)).toBe("09:00");
  });
});
