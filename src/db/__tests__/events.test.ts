import crypto from "node:crypto";
import { createEventLayer, type CreateEventInput } from "../events";
import { createDataLayer, type DataLayerDeps } from "../dataLayer";
import { NotFoundError } from "../errors";
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

describe("eventLayer", () => {
  let ctx: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    ctx = createTestDb();
  });

  afterEach(() => {
    ctx.sqlite.close();
  });

  const input: CreateEventInput = {
    title: "Cena con Ana",
    localDate: "2024-03-10",
    startMinute: 19 * 60,
    durationMinutes: 60,
  };

  test("crea un evento, usando getTzOffsetMin cuando no se pasa uno explícito", async () => {
    const el = createEventLayer(ctx.db as any, makeDeps(1_700_000_000_000, 300));
    const created = await el.create(input);
    expect(created.tzOffsetMin).toBe(300);
    expect(await el.getEvent(created.id)).toEqual(created);
  });

  test("getEvent lanza NotFoundError si no existe", async () => {
    const el = createEventLayer(ctx.db as any, makeDeps());
    await expect(el.getEvent("no-existe")).rejects.toThrow(NotFoundError);
  });

  test("create recorta start/duration a los límites válidos", async () => {
    const el = createEventLayer(ctx.db as any, makeDeps());
    const tooLong = await el.create({ ...input, startMinute: -10, durationMinutes: 5000 });
    expect(tooLong.startMinute).toBe(0);
    expect(tooLong.durationMinutes).toBe(720);

    const tooShort = await el.create({ ...input, durationMinutes: 1 });
    expect(tooShort.durationMinutes).toBe(15);
  });

  test("listByDate trae solo ese día, ordenado por hora de inicio", async () => {
    const el = createEventLayer(ctx.db as any, makeDeps());
    const late = await el.create({ ...input, startMinute: 20 * 60 });
    const early = await el.create({ ...input, startMinute: 8 * 60 });
    await el.create({ ...input, localDate: "2024-03-11" });

    const rows = await el.listByDate("2024-03-10");
    expect(rows.map((r) => r.id)).toEqual([early.id, late.id]);
  });

  test("listByRange cubre varios días, ordenado por fecha y hora", async () => {
    const el = createEventLayer(ctx.db as any, makeDeps());
    const a = await el.create({ ...input, localDate: "2024-03-09" });
    const b = await el.create({ ...input, localDate: "2024-03-10" });
    await el.create({ ...input, localDate: "2024-04-01" });

    const rows = await el.listByRange("2024-03-01", "2024-03-31");
    expect(rows.map((r) => r.id)).toEqual([a.id, b.id]);
  });

  test("update: categoryId y note pueden ponerse a null explícitamente", async () => {
    const dl = createDataLayer(ctx.db as any, makeDeps());
    const cat = await dl.createCategory({ name: "Casa", color: "#000" });
    const el = createEventLayer(ctx.db as any, makeDeps());
    const e = await el.create({ ...input, categoryId: cat.id, note: "traer vino" });

    const cleared = await el.update(e.id, { categoryId: null, note: null });
    expect(cleared.categoryId).toBeNull();
    expect(cleared.note).toBeNull();

    const renamed = await el.update(e.id, { title: "Cena con Ana y Luis" });
    expect(renamed.categoryId).toBeNull(); // no se toca si no viene en el patch
    expect(renamed.title).toBe("Cena con Ana y Luis");
  });

  test("softDelete excluye de listByDate/listByRange y una segunda llamada lanza NotFoundError", async () => {
    const el = createEventLayer(ctx.db as any, makeDeps());
    const e = await el.create(input);

    await el.softDelete(e.id);
    expect(await el.listByDate(input.localDate)).toEqual([]);
    await expect(el.softDelete(e.id)).rejects.toThrow(NotFoundError);
  });

  test("clearCategory desvincula solo los eventos de esa categoría, deja el resto intacto", async () => {
    const dl = createDataLayer(ctx.db as any, makeDeps());
    const cat1 = await dl.createCategory({ name: "Casa", color: "#000" });
    const cat2 = await dl.createCategory({ name: "Trabajo", color: "#111" });
    const el = createEventLayer(ctx.db as any, makeDeps());
    const a = await el.create({ ...input, categoryId: cat1.id });
    const b = await el.create({ ...input, categoryId: cat2.id });

    await el.clearCategory(cat1.id);

    expect((await el.getEvent(a.id)).categoryId).toBeNull();
    expect((await el.getEvent(b.id)).categoryId).toBe(cat2.id);
  });

  test("startUtcMs convierte fecha local + minuto a un instante absoluto usando tzOffsetMin", async () => {
    const el = createEventLayer(ctx.db as any, makeDeps());
    const e = await el.create({ ...input, localDate: "2024-03-10", startMinute: 19 * 60, tzOffsetMin: 300 });
    const expected = Date.UTC(2024, 2, 10) + 19 * 60 * 60_000 + 300 * 60_000;
    expect(el.startUtcMs(e)).toBe(expected);
  });
});
