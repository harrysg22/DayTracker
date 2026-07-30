import { computeLocalDate, formatLocalTime } from "./dateUtils";
import type { Category, Entry } from "./schema";

function escapeCsvField(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

const CSV_HEADER = [
  "id",
  "category",
  "started_at_local",
  "ended_at_local",
  "duration_ms",
  "local_date",
  "note",
];

/**
 * CSV legible pensado para abrir en una hoja de cálculo: usa la hora
 * local original de cada entry (vía su propio tz_offset_min), no la
 * reinterpretada con el huso horario actual del dispositivo.
 */
export function buildCsv(
  entries: Entry[],
  categoriesById: Map<string, Category>,
  nowMs: number = Date.now()
): string {
  const lines = entries.map((e) => {
    const category = categoriesById.get(e.categoryId);
    const startedLocal = `${e.localDate} ${formatLocalTime(e.startedAtMs, e.tzOffsetMin)}`;
    const endedLocal =
      e.endedAtMs != null
        ? `${computeLocalDate(e.endedAtMs, e.tzOffsetMin)} ${formatLocalTime(e.endedAtMs, e.tzOffsetMin)}`
        : "";
    const durationMs = (e.endedAtMs ?? nowMs) - e.startedAtMs;

    return [
      e.id,
      category?.name ?? e.categoryId,
      startedLocal,
      endedLocal,
      String(durationMs),
      e.localDate,
      e.note ?? "",
    ]
      .map(escapeCsvField)
      .join(",");
  });

  return [CSV_HEADER.join(","), ...lines].join("\n");
}
