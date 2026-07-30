import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Category, Entry } from '../../db/schema';
import { buildDayLayout } from '../dayLayout';
import type { ClusterBlock, PositionedBlock } from '../dayLayout';
import {
  DOW,
  MONTHS,
  dayOfWeekMon0,
  fmt12,
  fmtDuration,
  fmtHour,
  fmtShortDate,
  localMidnightMs,
  minutesIntoLocalDay,
} from '../format';
import { GEO, MONO, RADIUS, inkOn } from '../theme';
import type { Theme } from '../theme';

export function DayScreen(props: {
  localDate: string;
  today: string;
  entries: Entry[];
  categoriesById: Record<string, Category>;
  nowMs: number;
  tzOffsetMin: number;
  theme: Theme;
  longTimerNotice: { name: string; elapsedMinutes: number; startedMinute: number; thresholdHours: number } | null;
  onOpenLongTimer: () => void;
  onChangeDay: (localDate: string) => void;
  onOpenDatePicker: () => void;
  onAddEntry: () => void;
  onOpenEntry: (entry: Entry) => void;
  onLongPressEntry: (entry: Entry) => void;
  draggingEntryId: string | null;
  onDragEdge: (entry: Entry, edge: 'start' | 'end', deltaMinutes: number) => void;
}) {
  const { localDate, today, entries, categoriesById, theme } = props;
  const isToday = localDate === today;
  const isFuture = localDate > today;
  const scrollRef = useRef<ScrollView | null>(null);
  const [expandedGaps, setExpandedGaps] = useState<Set<number>>(new Set());

  useEffect(() => setExpandedGaps(new Set()), [localDate]);

  const nowMinute = isToday
    ? (props.nowMs - localMidnightMs(localDate) - props.tzOffsetMin * 60_000) / 60_000
    : null;

  const layout = useMemo(
    () =>
      buildDayLayout({
        localDate,
        entries,
        nowMs: props.nowMs,
        nowMinute,
        expandedGapKeys: expandedGaps,
      }),
    // nowMs intentionally excluded from deps at 1 s granularity except when a
    // timer is running — otherwise the whole day relayouts every second.
    [localDate, entries, expandedGaps, entries.some((e) => e.endedAtMs === null) ? props.nowMs : 0, nowMinute === null]
  );

  // Auto-scroll so the now-line sits ~250 px down, on open and on day change.
  useEffect(() => {
    if (nowMinute === null) return;
    const y = Math.max(0, layout.yOf(nowMinute) - 250);
    const t = setTimeout(() => scrollRef.current?.scrollTo({ y, animated: false }), 60);
    return () => clearTimeout(t);
  }, [localDate, nowMinute === null]);

  const title = isToday
    ? 'Today'
    : localDate === shift(today, -1)
    ? 'Yesterday'
    : localDate === shift(today, 1)
    ? 'Tomorrow'
    : DOW[dayOfWeekMon0(localDate)] + ', ' + monthDay(localDate);

  const subtitle =
    (title.length <= 9 ? fmtShortDate(localDate) + ' · ' : '') +
    (isFuture ? 'not editable yet' : fmtDuration(layout.trackedMinutes) + ' tracked');

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <HeaderButton theme={theme} label="‹" onPress={() => props.onChangeDay(shift(localDate, -1))} />
        <Pressable style={styles.titleWrap} onPress={props.onOpenDatePicker}>
          <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
          <Text style={[styles.subtitle, { color: theme.text2 }]}>{subtitle}</Text>
        </Pressable>
        <HeaderButton theme={theme} label="›" onPress={() => props.onChangeDay(shift(localDate, 1))} />
        <HeaderButton theme={theme} label="+" onPress={props.onAddEntry} />
      </View>

      {props.longTimerNotice && (
        <Pressable
          onPress={props.onOpenLongTimer}
          style={[styles.banner, { backgroundColor: theme.warnBg, borderColor: 'rgba(228,169,61,0.32)' }]}
        >
          <View style={[styles.bannerDot, { backgroundColor: theme.warn }]} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.bannerTitle, { color: theme.warn }]}>
              {props.longTimerNotice.name} has been running{' '}
              {fmtDuration(props.longTimerNotice.elapsedMinutes)}
            </Text>
            <Text style={[styles.bannerSub, { color: theme.text2 }]}>
              started {fmt12(props.longTimerNotice.startedMinute)} · over your{' '}
              {props.longTimerNotice.thresholdHours}h limit
            </Text>
          </View>
          <Text style={[styles.bannerAction, { color: theme.warn }]}>Review</Text>
        </Pressable>
      )}

      {entries.length === 0 ? (
        <View style={styles.empty}>
          <View style={[styles.emptyMark, { borderColor: theme.line }]} />
          <Text style={[styles.emptyTitle, { color: theme.text2 }]}>
            {isFuture ? 'Nothing here yet' : 'No entries this day'}
          </Text>
          <Text style={[styles.emptySub, { color: theme.text3 }]}>
            {isFuture
              ? 'You can only track time as it happens — or fix the past.'
              : 'Tap Start to track now, or + to add a block by hand.'}
          </Text>
        </View>
      ) : (
        <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24 }}>
          <View style={{ height: layout.totalHeight, marginRight: 6 }}>
            {layout.rules.map((r) => (
              <View key={'r' + r.hour} style={[styles.rule, { top: r.top }]}>
                <Text style={[styles.ruleLabel, { color: theme.text3 }]}>{fmtHour(r.hour)}</Text>
                <View style={[styles.ruleLine, { backgroundColor: theme.grid }]} />
              </View>
            ))}

            {layout.bands.map((b) => (
              <Pressable
                key={'b' + b.key}
                onPress={() => setExpandedGaps((prev) => new Set(prev).add(b.key))}
                style={[styles.band, { top: b.top, height: b.height }]}
              >
                <View style={[styles.bandLine, { backgroundColor: theme.grid }]} />
                <Text style={[styles.bandLabel, { color: theme.text3 }]}>
                  {fmtDuration(b.minutes)} · no activity
                </Text>
                <View style={[styles.bandLine, { backgroundColor: theme.grid }]} />
              </Pressable>
            ))}

            {layout.blocks.map((block) =>
              block.kind === 'cluster' ? (
                <ClusterRow
                  key={'c' + block.entries[0].id}
                  block={block}
                  categoriesById={categoriesById}
                  theme={theme}
                  onPress={() => props.onOpenEntry(block.entries[0])}
                />
              ) : (
                <BlockRow
                  key={block.entry.id}
                  block={block}
                  category={categoriesById[block.entry.categoryId]}
                  theme={theme}
                  dragging={props.draggingEntryId === block.entry.id}
                  onPress={() => props.onOpenEntry(block.entry)}
                  onLongPress={() => props.onLongPressEntry(block.entry)}
                />
              )
            )}

            {nowMinute !== null && (
              <View style={[styles.now, { top: layout.yOf(nowMinute) }]} pointerEvents="none">
                <Text style={[styles.nowLabel, { color: theme.nowLine }]}>{fmt12(nowMinute)}</Text>
                <View style={[styles.nowDot, { backgroundColor: theme.nowLine }]} />
                <View style={[styles.nowLine, { backgroundColor: theme.nowLine }]} />
              </View>
            )}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

function HeaderButton({ theme, label, onPress }: { theme: Theme; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.headerBtn, { backgroundColor: theme.surface }]} hitSlop={6}>
      <Text style={[styles.headerBtnLabel, { color: theme.text2 }]}>{label}</Text>
    </Pressable>
  );
}

function BlockRow(props: {
  block: PositionedBlock;
  category?: Category;
  theme: Theme;
  dragging: boolean;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const { block, category, theme } = props;
  const fill = category?.color ?? theme.surface2;
  const ink = inkOn(fill);
  const tiny = block.tier === 'nameOnly';

  return (
    <Pressable
      onPress={props.onPress}
      onLongPress={props.onLongPress}
      delayLongPress={GEO.longPressMs}
      style={[
        styles.block,
        {
          top: block.top,
          height: block.height,
          backgroundColor: fill,
          borderRadius: tiny ? RADIUS.tiny : RADIUS.block,
          paddingVertical: tiny ? 0 : 6,
          paddingHorizontal: tiny ? 8 : 9,
          alignItems: block.tier === 'full' || block.tier === 'fullNote' ? 'flex-start' : 'center',
        },
        block.live && { borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.5)' },
        props.dragging && { borderWidth: 2, borderColor: theme.text, zIndex: 6 },
      ]}
    >
      {block.tier === 'full' || block.tier === 'fullNote' ? (
        <>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={[styles.blockName, { color: ink }]}>
              {category?.name ?? '—'}
            </Text>
            <Text numberOfLines={1} style={[styles.blockRange, { color: ink }]}>
              {fmt12(block.startMin)} – {block.live ? 'now' : fmt12(block.endMin)}
            </Text>
            {block.tier === 'fullNote' && (
              <Text numberOfLines={1} style={[styles.blockNote, { color: ink }]}>
                {block.entry.note}
              </Text>
            )}
          </View>
          <Text style={[styles.blockDuration, { color: ink }]}>
            {fmtDuration(block.endMin - block.startMin)}
          </Text>
        </>
      ) : block.tier === 'line' ? (
        <>
          <Text numberOfLines={1} style={[styles.blockNameLine, { color: ink, flex: 1 }]}>
            {category?.name ?? '—'}
          </Text>
          <Text style={[styles.blockDurationLine, { color: ink }]}>
            {fmtDuration(block.endMin - block.startMin)}
          </Text>
        </>
      ) : (
        <Text numberOfLines={1} style={[styles.blockNameTiny, { color: ink }]}>
          {category?.name ?? '—'}
        </Text>
      )}
    </Pressable>
  );
}

function ClusterRow(props: {
  block: ClusterBlock;
  categoriesById: Record<string, Category>;
  theme: Theme;
  onPress: () => void;
}) {
  const { block, theme } = props;
  return (
    <Pressable
      onPress={props.onPress}
      style={[
        styles.cluster,
        { top: block.top, height: block.height, backgroundColor: theme.surface2, borderColor: theme.line },
      ]}
    >
      <View style={styles.clusterDots}>
        {block.entries.slice(0, 6).map((e) => (
          <View
            key={e.id}
            style={{
              width: 6,
              height: 6,
              borderRadius: 2,
              backgroundColor: props.categoriesById[e.categoryId]?.color ?? theme.text3,
            }}
          />
        ))}
      </View>
      <Text numberOfLines={1} style={[styles.clusterLabel, { color: theme.text2 }]}>
        {block.entries.length} short entries
      </Text>
      <Text style={[styles.clusterDuration, { color: theme.text3 }]}>
        {fmtDuration(block.totalMinutes)}
      </Text>
    </Pressable>
  );
}

function shift(localDate: string, days: number): string {
  const d = new Date(localMidnightMs(localDate) + days * 86_400_000);
  const p = (n: number) => (n < 10 ? '0' + n : '' + n);
  return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate());
}

function monthDay(localDate: string): string {
  const d = new Date(localMidnightMs(localDate));
  return MONTHS[d.getUTCMonth()] + ' ' + d.getUTCDate();
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingTop: 6, paddingBottom: 10 },
  headerBtn: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  headerBtnLabel: { fontSize: 17, fontWeight: '600', lineHeight: 20 },
  titleWrap: { flex: 1, alignItems: 'center' },
  title: { fontSize: 19, fontWeight: '700', letterSpacing: -0.38 },
  subtitle: { marginTop: 3, fontSize: 12, fontWeight: '500', fontFamily: MONO, fontVariant: ['tabular-nums'] },

  banner: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 20, marginBottom: 8, padding: 10, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth },
  bannerDot: { width: 8, height: 8, borderRadius: 4 },
  bannerTitle: { fontSize: 12.5, fontWeight: '600' },
  bannerSub: { fontSize: 11.5, fontWeight: '500', fontFamily: MONO, fontVariant: ['tabular-nums'] },
  bannerAction: { fontSize: 11, fontWeight: '600' },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 50 },
  emptyMark: { width: 44, height: 44, borderRadius: 16, borderWidth: 1.5, borderStyle: 'dashed' },
  emptyTitle: { fontSize: 15, fontWeight: '600' },
  emptySub: { fontSize: 12.5, textAlign: 'center', lineHeight: 18 },

  rule: { position: 'absolute', left: 0, right: GEO.rightInset, flexDirection: 'row', alignItems: 'center' },
  ruleLabel: { width: GEO.rulerWidth, paddingRight: 8, textAlign: 'right', fontSize: 10.5, fontWeight: '500', fontFamily: MONO, fontVariant: ['tabular-nums'], transform: [{ translateY: -5 }] },
  ruleLine: { flex: 1, height: StyleSheet.hairlineWidth },

  band: { position: 'absolute', left: GEO.rulerWidth, right: GEO.rightInset, flexDirection: 'row', alignItems: 'center', gap: 8 },
  bandLine: { flex: 1, height: StyleSheet.hairlineWidth },
  bandLabel: { fontSize: 10.5, fontWeight: '500', fontFamily: MONO, fontVariant: ['tabular-nums'] },

  block: { position: 'absolute', left: GEO.rulerWidth, right: GEO.rightInset, flexDirection: 'row', justifyContent: 'space-between', gap: 8, overflow: 'hidden' },
  blockName: { fontSize: 12.5, fontWeight: '600' },
  blockRange: { marginTop: 2, fontSize: 11, fontWeight: '500', fontFamily: MONO, fontVariant: ['tabular-nums'], opacity: 0.82 },
  blockNote: { marginTop: 3, fontSize: 11, opacity: 0.8 },
  blockDuration: { fontSize: 11, fontWeight: '600', fontFamily: MONO, fontVariant: ['tabular-nums'], opacity: 0.9 },
  blockNameLine: { fontSize: 11.5, fontWeight: '600' },
  blockDurationLine: { fontSize: 10.5, fontWeight: '500', fontFamily: MONO, fontVariant: ['tabular-nums'], opacity: 0.9 },
  blockNameTiny: { fontSize: 10, fontWeight: '600', letterSpacing: -0.1 },

  cluster: { position: 'absolute', left: GEO.rulerWidth, right: GEO.rightInset, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, borderRadius: 9, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  clusterDots: { flexDirection: 'row', gap: 3 },
  clusterLabel: { flex: 1, fontSize: 11, fontWeight: '600' },
  clusterDuration: { fontSize: 10.5, fontWeight: '500', fontFamily: MONO, fontVariant: ['tabular-nums'] },

  now: { position: 'absolute', left: 0, right: GEO.rightInset, flexDirection: 'row', alignItems: 'center', zIndex: 5 },
  nowLabel: { width: GEO.rulerWidth, paddingRight: 6, textAlign: 'right', fontSize: 10.5, fontWeight: '600', fontFamily: MONO, fontVariant: ['tabular-nums'], transform: [{ translateY: -5 }] },
  nowDot: { width: 7, height: 7, borderRadius: 3.5, transform: [{ translateX: -3 }] },
  nowLine: { flex: 1, height: 1.5 },
});
