import { localMsFromUtc } from '../db/dateUtils';

const MS_MIN = 60_000;

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/** 12-hour clock from minutes past local midnight. `2:30 PM` */
export function fmt12(minutesFromMidnight: number): string {
  let m = Math.round(minutesFromMidnight) % 1440;
  if (m < 0) m += 1440;
  const h24 = Math.floor(m / 60);
  const mm = m % 60;
  const ampm = h24 < 12 ? 'AM' : 'PM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${pad2(mm)} ${ampm}`;
}

/** Hour-rule label. `11 AM` */
export function fmtHour(hour: number): string {
  const ampm = hour < 12 ? 'AM' : 'PM';
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12} ${ampm}`;
}

/** Durations are never decimal hours. `2h 15m` / `3h` / `45m` */
export function fmtDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (h && mm) return `${h}h ${mm}m`;
  if (h) return `${h}h`;
  return `${mm}m`;
}

/** Live timer readout. `0:41:07` — always recomputed, never accumulated. */
export function fmtElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 3600)}:${pad2(Math.floor(s / 60) % 60)}:${pad2(s % 60)}`;
}

/** UTC midnight of a 'YYYY-MM-DD' local date, as a local-ms value. */
export function localMidnightMs(localDate: string): number {
  const [y, m, d] = localDate.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

/**
 * Where an instant sits inside its own local day, in minutes past midnight.
 * Uses the entry's captured tzOffsetMin, so a block recorded in another
 * timezone keeps the wall-clock time it was recorded at.
 */
export function minutesIntoLocalDay(
  utcMs: number,
  tzOffsetMin: number,
  localDate: string
): number {
  return (localMsFromUtc(utcMs, tzOffsetMin) - localMidnightMs(localDate)) / MS_MIN;
}

/** Inverse: minutes past local midnight back to a UTC instant. */
export function utcMsFromLocalMinutes(
  minutes: number,
  tzOffsetMin: number,
  localDate: string
): number {
  return localMidnightMs(localDate) + minutes * MS_MIN + tzOffsetMin * MS_MIN;
}

/** Snap an instant to the 5-minute grid every edit uses. */
export function snapMs(utcMs: number, stepMinutes = 5): number {
  const step = stepMinutes * MS_MIN;
  return Math.round(utcMs / step) * step;
}

/** 'YYYY-MM-DD' shifted by N days, without touching the device timezone. */
export function shiftLocalDate(localDate: string, days: number): string {
  const d = new Date(localMidnightMs(localDate) + days * 86_400_000);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

export function dayOfWeekMon0(localDate: string): number {
  return (new Date(localMidnightMs(localDate)).getUTCDay() + 6) % 7;
}

export const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/** `Wed Jul 29` */
export function fmtShortDate(localDate: string): string {
  const d = new Date(localMidnightMs(localDate));
  return `${DOW[dayOfWeekMon0(localDate)]} ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}
