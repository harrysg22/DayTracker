/**
 * tz_offset_min sigue la convención de `Date.prototype.getTimezoneOffset()`:
 * minutos que hay que RESTAR a un instante UTC para obtener la hora local
 * (offset positivo = detrás de UTC, ej. Bogotá = +300, Madrid en verano = -120).
 *
 *   localMs = utcMs - tzOffsetMin * 60_000
 *
 * Todas las conversiones se hacen a mano sobre el epoch y se leen con los
 * getters *UTC* de Date, para no depender jamás del huso horario del
 * dispositivo que ejecuta el código. Así, una entry creada con un offset
 * distinto al actual del dispositivo se sigue mostrando con su hora local
 * original en vez de reinterpretarse.
 */

const MS_PER_MINUTE = 60_000;

export function localMsFromUtc(utcMs: number, tzOffsetMin: number): number {
  return utcMs - tzOffsetMin * MS_PER_MINUTE;
}

export function utcMsFromLocal(localMs: number, tzOffsetMin: number): number {
  return localMs + tzOffsetMin * MS_PER_MINUTE;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/** Calcula 'YYYY-MM-DD' en la hora local implícita por tzOffsetMin. */
export function computeLocalDate(utcMs: number, tzOffsetMin: number): string {
  const d = new Date(localMsFromUtc(utcMs, tzOffsetMin));
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/** Offset del dispositivo en este instante, con la misma convención de arriba. */
export function currentDeviceTzOffsetMin(): number {
  return new Date().getTimezoneOffset();
}

/** Formatea un instante UTC en la hora local original de la entry (HH:mm). */
export function formatLocalTime(utcMs: number, tzOffsetMin: number): string {
  const d = new Date(localMsFromUtc(utcMs, tzOffsetMin));
  return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
}
