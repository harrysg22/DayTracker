import crypto from "node:crypto";
import { createTodoLayer, type CreateTodoInput } from "../todos";
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

describe("todoLayer", () => {
  let ctx: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    ctx = createTestDb();
  });

  afterEach(() => {
    ctx.sqlite.close();
  });

  const input: CreateTodoInput = { text: "Comprar leche", dueDate: "2024-03-10" };

  test("crea un to-do y lo trae de vuelta con getTodo", async () => {
    const tl = createTodoLayer(ctx.db as any, makeDeps());
    const created = await tl.create(input);
    expect(created.done).toBe(0);
    expect(created.doneAtMs).toBeNull();
    expect(await tl.getTodo(created.id)).toEqual(created);
  });

  test("getTodo lanza NotFoundError si no existe", async () => {
    const tl = createTodoLayer(ctx.db as any, makeDeps());
    await expect(tl.getTodo("no-existe")).rejects.toThrow(NotFoundError);
  });

  test("listByDateRange filtra por rango y ordena por fecha/estado/orden", async () => {
    const tl = createTodoLayer(ctx.db as any, makeDeps());
    const a = await tl.create({ text: "A", dueDate: "2024-03-09" });
    const b = await tl.create({ text: "B", dueDate: "2024-03-10" });
    await tl.create({ text: "Fuera de rango", dueDate: "2024-04-01" });

    const rows = await tl.listByDateRange("2024-03-01", "2024-03-31");
    expect(rows.map((r) => r.id)).toEqual([a.id, b.id]);
  });

  test("listOverdue trae solo lo no terminado con fecha anterior a hoy", async () => {
    const tl = createTodoLayer(ctx.db as any, makeDeps());
    const late = await tl.create({ text: "Atrasado", dueDate: "2024-03-01" });
    await tl.create({ text: "Futuro", dueDate: "2024-03-20" });
    const lateDone = await tl.create({ text: "Atrasado pero hecho", dueDate: "2024-03-01" });
    await tl.toggleDone(lateDone.id, true, "2024-03-10");

    const overdue = await tl.listOverdue("2024-03-10");
    expect(overdue.map((r) => r.id)).toEqual([late.id]);
  });

  test("toggleDone marca hecho y trae un vencido a hoy; desmarcar no toca la fecha", async () => {
    const tl = createTodoLayer(ctx.db as any, makeDeps());
    const t = await tl.create({ text: "Atrasado", dueDate: "2024-03-01" });

    await tl.toggleDone(t.id, true, "2024-03-10");
    let row = await tl.getTodo(t.id);
    expect(row.done).toBe(1);
    expect(row.doneAtMs).not.toBeNull();
    expect(row.dueDate).toBe("2024-03-10");

    await tl.toggleDone(t.id, false, "2024-03-10");
    row = await tl.getTodo(t.id);
    expect(row.done).toBe(0);
    expect(row.doneAtMs).toBeNull();
    expect(row.dueDate).toBe("2024-03-10"); // no se revierte al desmarcar
  });

  test("update: categoryId puede ponerse a null explícitamente sin perder otros campos", async () => {
    const dl = createDataLayer(ctx.db as any, makeDeps());
    const cat = await dl.createCategory({ name: "Casa", color: "#000" });
    const tl = createTodoLayer(ctx.db as any, makeDeps());
    const t = await tl.create({ ...input, categoryId: cat.id });

    const noCategory = await tl.update(t.id, { categoryId: null });
    expect(noCategory.categoryId).toBeNull();
    expect(noCategory.text).toBe(input.text);

    const renamed = await tl.update(t.id, { text: "Comprar pan" });
    expect(renamed.categoryId).toBeNull(); // no se toca si no viene en el patch
    expect(renamed.text).toBe("Comprar pan");
  });

  test("softDelete excluye de listByDateRange y una segunda llamada lanza NotFoundError", async () => {
    const tl = createTodoLayer(ctx.db as any, makeDeps());
    const t = await tl.create(input);

    await tl.softDelete(t.id);
    expect(await tl.listByDateRange("2024-01-01", "2024-12-31")).toEqual([]);
    await expect(tl.softDelete(t.id)).rejects.toThrow(NotFoundError);
  });

  test("clearCategory desvincula solo los to-dos de esa categoría, deja el resto intacto", async () => {
    const dl = createDataLayer(ctx.db as any, makeDeps());
    const cat1 = await dl.createCategory({ name: "Casa", color: "#000" });
    const cat2 = await dl.createCategory({ name: "Trabajo", color: "#111" });
    const tl = createTodoLayer(ctx.db as any, makeDeps());
    const a = await tl.create({ ...input, categoryId: cat1.id });
    const b = await tl.create({ text: "Otro", dueDate: "2024-03-11", categoryId: cat2.id });
    const deleted = await tl.create({ text: "Borrado", dueDate: "2024-03-12", categoryId: cat1.id });
    await tl.softDelete(deleted.id);

    await tl.clearCategory(cat1.id);

    expect((await tl.getTodo(a.id)).categoryId).toBeNull();
    expect((await tl.getTodo(b.id)).categoryId).toBe(cat2.id);
  });
});
