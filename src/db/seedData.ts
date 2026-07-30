import type { DataLayer } from "./dataLayer";
import { currentDeviceTzOffsetMin, localMsFromUtc, utcMsFromLocal } from "./dateUtils";
import type { Category } from "./schema";

const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_DAY_MS = 24 * ONE_HOUR_MS;

function hoursToMs(h: number): number {
  return Math.round(h * ONE_HOUR_MS);
}
function minutesToMs(m: number): number {
  return Math.round(m * 60 * 1000);
}

/** PRNG determinista (mulberry32): misma semilla => mismos datos falsos. */
function mulberry32(seed: number) {
  let a = seed;
  return function rng(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const AWAKE_CATEGORIES: Array<{ name: string; weight: number }> = [
  { name: "Trabajo", weight: 0.35 },
  { name: "Ocio", weight: 0.25 },
  { name: "Estudio", weight: 0.15 },
  { name: "Lectura", weight: 0.15 },
  { name: "Ejercicio", weight: 0.1 },
];

export const SEED_CATEGORIES: Array<{ name: string; color: string }> = [
  { name: "Trabajo", color: "#4C6EF5" },
  { name: "Estudio", color: "#7048E8" },
  { name: "Ejercicio", color: "#12B886" },
  { name: "Ocio", color: "#FA5252" },
  { name: "Lectura", color: "#F59F00" },
  { name: "Sueño", color: "#495057" },
];

function pickAwakeCategory(rng: () => number): string {
  const r = rng();
  let acc = 0;
  for (const c of AWAKE_CATEGORIES) {
    acc += c.weight;
    if (r <= acc) return c.name;
  }
  return AWAKE_CATEGORIES[AWAKE_CATEGORIES.length - 1].name;
}

/** Medianoche local (en el dominio "local ms" de dateUtils) del día de `reference`. */
function localMidnightLocalMs(reference: Date, tzOffsetMin: number): number {
  const refLocalMs = localMsFromUtc(reference.getTime(), tzOffsetMin);
  const d = new Date(refLocalMs);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0);
}

interface GeneratedBlock {
  categoryName: string;
  startedAtMs: number;
  endedAtMs: number | null;
}

/**
 * Genera una única línea de tiempo continua (no día a día independiente):
 * el cursor avanza monótonamente, así que por construcción nunca hay
 * solapamientos y el timer de sueño de una noche cruza limpiamente la
 * medianoche hacia el día siguiente.
 */
function generateBlocks(
  days: number,
  endDayStartLocalMs: number,
  tzOffsetMin: number,
  rng: () => number,
  includeActiveTimer: boolean
): GeneratedBlock[] {
  const blocks: GeneratedBlock[] = [];
  const startDayStartLocalMs = endDayStartLocalMs - (days - 1) * ONE_DAY_MS;

  let cursorLocalMs = startDayStartLocalMs + hoursToMs(6 + rng() * 2); // primer despertar 06:00-08:00

  for (let dayIndex = 0; dayIndex < days; dayIndex++) {
    const dayStartLocalMs = startDayStartLocalMs + dayIndex * ONE_DAY_MS;
    let t = Math.max(cursorLocalMs, dayStartLocalMs);
    const bedTimeLocalMs = dayStartLocalMs + hoursToMs(22 + rng() * 2); // acostarse 22:00-24:00

    while (t < bedTimeLocalMs) {
      t += minutesToMs(5 + rng() * 40); // hueco sin trackear entre bloques
      if (t >= bedTimeLocalMs) break;

      const durationMin = 20 + rng() * 100;
      const blockEndLocalMs = Math.min(t + minutesToMs(durationMin), bedTimeLocalMs);

      blocks.push({
        categoryName: pickAwakeCategory(rng),
        startedAtMs: utcMsFromLocal(t, tzOffsetMin),
        endedAtMs: utcMsFromLocal(blockEndLocalMs, tzOffsetMin),
      });
      t = blockEndLocalMs;
    }

    const sleepHours = 6.5 + rng() * 2; // 6.5-8.5h, cruza medianoche
    const sleepEndLocalMs = bedTimeLocalMs + hoursToMs(sleepHours);
    const isLastDay = dayIndex === days - 1;

    if (isLastDay && includeActiveTimer) {
      // Deja el timer de la última noche corriendo: útil para desarrollar
      // la UI del timer activo sin esperar a acumular datos reales.
      blocks.push({
        categoryName: "Sueño",
        startedAtMs: utcMsFromLocal(bedTimeLocalMs, tzOffsetMin),
        endedAtMs: null,
      });
    } else {
      blocks.push({
        categoryName: "Sueño",
        startedAtMs: utcMsFromLocal(bedTimeLocalMs, tzOffsetMin),
        endedAtMs: utcMsFromLocal(sleepEndLocalMs, tzOffsetMin),
      });
    }

    cursorLocalMs = sleepEndLocalMs;
  }

  return blocks;
}

export interface SeedOptions {
  /** Cuántos días hacia atrás generar, terminando en `endDate`. Default 60. */
  days?: number;
  /** Día final (inclusive) de la línea de tiempo. Default: ahora. */
  endDate?: Date;
  /** Offset a usar para todas las entries generadas. Default: el del host. */
  tzOffsetMin?: number;
  /** Semilla del PRNG: misma semilla => mismos datos. */
  seed?: number;
  /** Deja el último bloque (Sueño) como timer activo (ended_at_ms = NULL). */
  includeActiveTimer?: boolean;
}

export interface SeedResult {
  categories: Category[];
  entryCount: number;
}

/**
 * Puebla categorías + ~60 días de entries realistas a través de la capa
 * de datos (createCategory/createEntry), respetando todas sus validaciones
 * (no-solapamiento, etc.) en vez de insertar filas crudas.
 */
export async function seedFakeData(
  dataLayer: DataLayer,
  opts: SeedOptions = {}
): Promise<SeedResult> {
  const days = opts.days ?? 60;
  const tzOffsetMin = opts.tzOffsetMin ?? currentDeviceTzOffsetMin();
  const rng = mulberry32(opts.seed ?? 20260729);
  const includeActiveTimer = opts.includeActiveTimer ?? true;
  const endDate = opts.endDate ?? new Date();

  const endDayStartLocalMs = localMidnightLocalMs(endDate, tzOffsetMin);

  const categoriesByName = new Map<string, Category>();
  for (let i = 0; i < SEED_CATEGORIES.length; i++) {
    const def = SEED_CATEGORIES[i];
    const row = await dataLayer.createCategory({
      name: def.name,
      color: def.color,
      sortOrder: i,
    });
    categoriesByName.set(def.name, row);
  }

  const blocks = generateBlocks(days, endDayStartLocalMs, tzOffsetMin, rng, includeActiveTimer);

  let entryCount = 0;
  for (const block of blocks) {
    const category = categoriesByName.get(block.categoryName);
    if (!category) continue;
    await dataLayer.createEntry({
      categoryId: category.id,
      startedAtMs: block.startedAtMs,
      endedAtMs: block.endedAtMs,
      tzOffsetMin,
    });
    entryCount++;
  }

  return { categories: Array.from(categoriesByName.values()), entryCount };
}
