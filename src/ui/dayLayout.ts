import type { Entry } from '../db/schema';
import { GEO } from './theme';
import { minutesIntoLocalDay } from './format';

/**
 * The day view's geometry engine — pure, no React, no DB. Unit-test this.
 *
 * Blocks are positioned from REAL MINUTES, never snapped to grid slots, so
 * a 7-minute entry looks like 7 minutes. Two transforms sit on top:
 *
 *  1. Empty-gap collapse — any untracked run of >= 180 min becomes a 38 px
 *     band, EXCEPT the one containing "now". Boundaries snap outward to whole
 *     hours so hour rules stay honest.
 *  2. Short-entry clustering — 3+ consecutive sub-20 px blocks with < 8 min
 *     between them merge into one neutral row, so a busy afternoon does not
 *     become unreadable colour slivers.
 *
 * Because of collapsing, minute -> y is NOT linear. Always go through
 * layout.yOf(minute); never multiply by hourHeight yourself.
 */

export interface PositionedBlock {
  kind: 'block';
  entry: Entry;
  startMin: number;
  endMin: number;
  /** True when this is the running timer (endedAtMs === null). */
  live: boolean;
  top: number;
  /** Height after the min-height floor and the gutter. */
  height: number;
  /** Which text tier fits. See the ladder in the design README. */
  tier: 'full' | 'fullNote' | 'line' | 'nameOnly';
}

export interface ClusterBlock {
  kind: 'cluster';
  entries: Entry[];
  startMin: number;
  endMin: number;
  totalMinutes: number;
  top: number;
  height: number;
}

export interface CollapsedBand {
  startMin: number;
  endMin: number;
  minutes: number;
  top: number;
  height: number;
  /** Stable key to remember "user expanded this one". */
  key: number;
}

export interface HourRule {
  hour: number;
  top: number;
}

export interface DayLayout {
  totalHeight: number;
  blocks: (PositionedBlock | ClusterBlock)[];
  bands: CollapsedBand[];
  rules: HourRule[];
  /** Minute -> y. Accounts for collapsed bands. */
  yOf: (minute: number) => number;
  trackedMinutes: number;
}

interface Span {
  entry: Entry;
  startMin: number;
  endMin: number;
  live: boolean;
}

export interface LayoutOptions {
  localDate: string;
  entries: Entry[];
  /** Epoch ms; only used to grow the running entry and to protect its band. */
  nowMs: number;
  /** Minutes past local midnight for the now-line, or null on other days. */
  nowMinute: number | null;
  /** Gap keys the user has tapped open. */
  expandedGapKeys?: Set<number>;
  hourHeight?: number;
  collapseGaps?: boolean;
}

export function buildDayLayout(opts: LayoutOptions): DayLayout {
  const hourHeight = opts.hourHeight ?? GEO.hourHeight;
  const collapse = opts.collapseGaps !== false;
  const expanded = opts.expandedGapKeys ?? new Set<number>();

  const spans: Span[] = opts.entries
    .map((entry) => {
      const startMin = minutesIntoLocalDay(entry.startedAtMs, entry.tzOffsetMin, opts.localDate);
      const live = entry.endedAtMs === null;
      const endRaw = entry.endedAtMs ?? opts.nowMs;
      const endMin = minutesIntoLocalDay(endRaw, entry.tzOffsetMin, opts.localDate);
      return {
        entry,
        startMin: Math.max(0, startMin),
        endMin: Math.min(1440, Math.max(startMin, endMin)),
        live,
      };
    })
    .sort((a, b) => a.startMin - b.startMin);

  // --- 1. find collapsible gaps
  const bandsRaw: { startMin: number; endMin: number; key: number }[] = [];
  let cursor = 0;
  for (const s of spans) {
    if (s.startMin - cursor >= 1) bandsRaw.push({ startMin: cursor, endMin: s.startMin, key: cursor });
    cursor = Math.max(cursor, s.endMin);
  }
  if (1440 - cursor >= 1) bandsRaw.push({ startMin: cursor, endMin: 1440, key: cursor });

  const collapsible = bandsRaw.filter((g) => {
    if (!collapse) return false;
    if (g.endMin - g.startMin < GEO.gapCollapseMinutes) return false;
    if (expanded.has(g.key)) return false;
    // never collapse the band that contains the now-line
    if (opts.nowMinute !== null && opts.nowMinute > g.startMin && opts.nowMinute < g.endMin) return false;
    return true;
  }).map((g) => ({
    // snap outward to whole hours so hour rules stay truthful
    startMin: Math.ceil(g.startMin / 60) * 60,
    endMin: Math.floor(g.endMin / 60) * 60,
    key: g.key,
  })).filter((g) => g.endMin - g.startMin >= 120);

  // --- 2. build the vertical track as alternating ruler / band segments
  type Segment = { type: 'ruler' | 'band'; startMin: number; endMin: number; top: number; height: number; key?: number };
  const segments: Segment[] = [];
  let at = 0;
  let y = 0;
  for (const g of collapsible) {
    if (g.startMin > at) {
      const h = ((g.startMin - at) / 60) * hourHeight;
      segments.push({ type: 'ruler', startMin: at, endMin: g.startMin, top: y, height: h });
      y += h;
    }
    segments.push({ type: 'band', startMin: g.startMin, endMin: g.endMin, top: y, height: GEO.collapsedBandHeight, key: g.key });
    y += GEO.collapsedBandHeight;
    at = g.endMin;
  }
  if (at < 1440) {
    const h = ((1440 - at) / 60) * hourHeight;
    segments.push({ type: 'ruler', startMin: at, endMin: 1440, top: y, height: h });
    y += h;
  }
  const totalHeight = y + 24;

  const yOf = (minute: number): number => {
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      if (minute <= seg.endMin || i === segments.length - 1) {
        const t = Math.min(1, Math.max(0, (minute - seg.startMin) / (seg.endMin - seg.startMin)));
        return seg.type === 'ruler'
          ? seg.top + Math.max(0, minute - seg.startMin) / 60 * hourHeight
          : seg.top + t * GEO.collapsedBandHeight;
      }
    }
    return y;
  };

  // --- 3. hour rules, only inside uncollapsed segments
  const rules: HourRule[] = [];
  for (const seg of segments) {
    if (seg.type !== 'ruler') continue;
    for (let h = Math.ceil(seg.startMin / 60); h <= Math.floor(seg.endMin / 60); h++) {
      if (h >= 24) continue;
      rules.push({ hour: h, top: yOf(h * 60) });
    }
  }

  // --- 4. blocks, with clustering of tiny consecutive runs
  const measured = spans.map((s) => {
    const top = yOf(s.startMin);
    const rawHeight = yOf(s.endMin) - top;
    return { span: s, top, rawHeight };
  });

  const blocks: (PositionedBlock | ClusterBlock)[] = [];
  let i = 0;
  while (i < measured.length) {
    const m = measured[i];
    if (m.rawHeight < GEO.clusterMaxHeight) {
      let j = i;
      while (
        j + 1 < measured.length &&
        measured[j + 1].rawHeight < GEO.clusterMaxHeight &&
        measured[j + 1].span.startMin - measured[j].span.endMin < GEO.clusterMaxSpacingMinutes
      ) j++;
      if (j - i + 1 >= GEO.clusterMinCount) {
        const group = measured.slice(i, j + 1);
        const last = group[group.length - 1];
        blocks.push({
          kind: 'cluster',
          entries: group.map((g) => g.span.entry),
          startMin: group[0].span.startMin,
          endMin: last.span.endMin,
          totalMinutes: group.reduce((acc, g) => acc + (g.span.endMin - g.span.startMin), 0),
          top: group[0].top,
          height: Math.max(26, last.top + Math.max(GEO.minBlockHeight, last.rawHeight) - group[0].top),
        });
        i = j + 1;
        continue;
      }
    }
    const height = Math.max(GEO.minBlockHeight, m.rawHeight) - GEO.gutter;
    const hasNote = !!m.span.entry.note;
    blocks.push({
      kind: 'block',
      entry: m.span.entry,
      startMin: m.span.startMin,
      endMin: m.span.endMin,
      live: m.span.live,
      top: m.top,
      height,
      tier: height >= 74 && hasNote ? 'fullNote' : height >= 46 ? 'full' : height >= 30 ? 'line' : 'nameOnly',
    });
    i++;
  }

  const bands: CollapsedBand[] = segments
    .filter((s): s is Segment & { key: number } => s.type === 'band')
    .map((s) => ({
      startMin: s.startMin,
      endMin: s.endMin,
      minutes: s.endMin - s.startMin,
      top: s.top,
      height: s.height,
      key: s.key,
    }));

  const trackedMinutes = spans.reduce((acc, s) => acc + (s.endMin - s.startMin), 0);

  return { totalHeight, blocks, bands, rules, yOf, trackedMinutes };
}
