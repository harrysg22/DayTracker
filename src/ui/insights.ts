import type { Entry } from '../db/schema';
import { shiftLocalDate, dayOfWeekMon0, localMidnightMs } from './format';

/**
 * Insights maths. The one rule that must not be broken:
 *
 *   NEVER compare 3 elapsed days of this week against a full previous week.
 *
 * We measure how much of the current period has elapsed, then measure the
 * previous period over exactly that same slice, truncating any entry that
 * straddles the cap. That is what makes "18% less than last week" true.
 */

export type RangeKind = 'day' | 'week' | 'month';

export interface PeriodTotals {
  totalMinutes: number;
  byCategory: Record<string, number>;
  days: { localDate: string; totalMinutes: number; byCategory: Record<string, number> }[];
  startDate: string;
  /** Inclusive last local date scanned. */
  endDate: string;
}

export interface Comparison {
  current: PeriodTotals;
  previous: PeriodTotals | null;
  /** null when there is not enough history to say anything honest. */
  percentDelta: number | null;
  minutesDelta: number | null;
  hasEnoughHistory: boolean;
}

/** First local date of the period containing `today`, shifted back N periods. */
export function periodStart(range: RangeKind, today: string, shift: number): string {
  if (range === 'day') return shiftLocalDate(today, -shift);
  if (range === 'week') return shiftLocalDate(today, -dayOfWeekMon0(today) - 7 * shift);
  const d = new Date(localMidnightMs(today));
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() - shift;
  const first = new Date(Date.UTC(y, m, 1));
  const pad = (n: number) => (n < 10 ? '0' + n : '' + n);
  return first.getUTCFullYear() + '-' + pad(first.getUTCMonth() + 1) + '-' + pad(first.getUTCDate());
}

/**
 * Sum entries over a period, capped at `elapsedMs` past its start.
 * Entries that straddle the cap are truncated, not dropped.
 */
export function sumPeriod(params: {
  entries: Entry[];
  startDate: string;
  /** Exclusive: local date the period ends before. */
  endDateExclusive: string;
  /** How far into the period to measure, in ms. */
  elapsedMs: number;
  /** Needed to turn a local date into an instant. */
  tzOffsetMin: number;
  nowMs: number;
}): PeriodTotals {
  const startInstant = localMidnightMs(params.startDate) + params.tzOffsetMin * 60_000;
  const capMs = startInstant + params.elapsedMs;

  const byCategory: Record<string, number> = {};
  const dayMap = new Map<string, { totalMinutes: number; byCategory: Record<string, number> }>();
  let totalMinutes = 0;

  for (let d = params.startDate; d < params.endDateExclusive; d = shiftLocalDate(d, 1)) {
    dayMap.set(d, { totalMinutes: 0, byCategory: {} });
  }

  for (const e of params.entries) {
    if (e.localDate < params.startDate || e.localDate >= params.endDateExclusive) continue;
    if (e.startedAtMs >= capMs) continue;
    const end = Math.min(e.endedAtMs ?? params.nowMs, capMs);
    const minutes = (end - e.startedAtMs) / 60_000;
    if (minutes <= 0) continue;

    byCategory[e.categoryId] = (byCategory[e.categoryId] ?? 0) + minutes;
    totalMinutes += minutes;
    const day = dayMap.get(e.localDate);
    if (day) {
      day.totalMinutes += minutes;
      day.byCategory[e.categoryId] = (day.byCategory[e.categoryId] ?? 0) + minutes;
    }
  }

  const days = [...dayMap.entries()].map(([localDate, v]) => ({ localDate, ...v }));
  return {
    totalMinutes,
    byCategory,
    days,
    startDate: params.startDate,
    endDate: days.length ? days[days.length - 1].localDate : params.startDate,
  };
}

/** Minimum minutes in the previous period before a delta is meaningful. */
export const MIN_HISTORY_MINUTES = 60;

export function compare(params: {
  range: RangeKind;
  today: string;
  entries: Entry[];
  nowMs: number;
  tzOffsetMin: number;
}): Comparison {
  const { range, today, entries, nowMs, tzOffsetMin } = params;

  const curStart = periodStart(range, today, 0);
  const curStartInstant = localMidnightMs(curStart) + tzOffsetMin * 60_000;
  const elapsedMs = nowMs - curStartInstant;

  const nextStart = range === 'day' ? shiftLocalDate(curStart, 1) : periodStart(range, today, -1);
  const current = sumPeriod({ entries, startDate: curStart, endDateExclusive: nextStart, elapsedMs, tzOffsetMin, nowMs });

  const prevStart = periodStart(range, today, 1);
  const previous = sumPeriod({ entries, startDate: prevStart, endDateExclusive: curStart, elapsedMs, tzOffsetMin, nowMs });

  const hasEnoughHistory = previous.totalMinutes >= MIN_HISTORY_MINUTES;
  return {
    current,
    previous: hasEnoughHistory ? previous : previous,
    hasEnoughHistory,
    percentDelta: hasEnoughHistory
      ? Math.round(((current.totalMinutes - previous.totalMinutes) / previous.totalMinutes) * 100)
      : null,
    minutesDelta: hasEnoughHistory ? current.totalMinutes - previous.totalMinutes : null,
  };
}

/** Per-category rows, biggest first. `deltaPercent: null` renders as "new". */
export function categoryRows(cmp: Comparison) {
  const ids = Object.keys(cmp.current.byCategory).sort(
    (a, b) => cmp.current.byCategory[b] - cmp.current.byCategory[a]
  );
  const max = ids.length ? cmp.current.byCategory[ids[0]] : 1;
  return ids.map((categoryId) => {
    const minutes = cmp.current.byCategory[categoryId];
    const prevMinutes = cmp.previous?.byCategory[categoryId] ?? 0;
    const comparable = cmp.hasEnoughHistory && prevMinutes > 20;
    return {
      categoryId,
      minutes,
      prevMinutes,
      shareOfTotal: cmp.current.totalMinutes ? minutes / cmp.current.totalMinutes : 0,
      barFraction: max ? minutes / max : 0,
      prevBarFraction: max ? prevMinutes / max : 0,
      deltaPercent: comparable ? Math.round(((minutes - prevMinutes) / prevMinutes) * 100) : null,
    };
  });
}
