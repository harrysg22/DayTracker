import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Category, Entry } from '../../db/schema';
import { MONTHS, dayOfWeekMon0, fmtDuration, localMidnightMs } from '../format';
import { categoryRows, compare, periodStart } from '../insights';
import type { RangeKind } from '../insights';
import { MONO, RADIUS } from '../theme';
import type { Theme } from '../theme';

/**
 * The headline answers "more or less than usual?" before any chart appears.
 * The comparison is period-aligned: three elapsed days of this week are
 * measured against the same three days of last week, never a full week.
 */
export function InsightsScreen(props: {
  range: RangeKind;
  onChangeRange: (r: RangeKind) => void;
  entries: Entry[];
  categoriesById: Record<string, Category>;
  today: string;
  nowMs: number;
  tzOffsetMin: number;
  theme: Theme;
  onPressCategory: (categoryId: string) => void;
}) {
  const { range, theme, today } = props;

  const cmp = useMemo(
    () =>
      compare({
        range,
        today,
        entries: props.entries,
        nowMs: props.nowMs,
        tzOffsetMin: props.tzOffsetMin,
      }),
    [range, today, props.entries, props.tzOffsetMin, Math.floor(props.nowMs / 60_000)]
  );
  const rows = useMemo(() => categoryRows(cmp), [cmp]);

  const totalMinutes = Math.round(cmp.current.totalMinutes);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  const periodWord = range === 'day' ? 'yesterday' : range === 'week' ? 'the same days last week' : 'the same stretch last month';
  const pct = cmp.percentDelta;
  const headline = !cmp.hasEnoughHistory
    ? 'Not enough history yet'
    : Math.abs(pct!) < 2
    ? 'About the same as ' + periodWord
    : Math.abs(pct!) + '% ' + (pct! > 0 ? 'more' : 'less') + ' than ' + periodWord;
  const headlineColor = !cmp.hasEnoughHistory ? theme.text2 : pct! > 0 ? theme.up : theme.down;
  const sub = !cmp.hasEnoughHistory
    ? 'Comparisons start once you have a full ' + range + ' behind you. Keep tracking.'
    : fmtDuration(Math.abs(cmp.minutesDelta!)) +
      ' ' +
      (pct! > 0 ? 'more' : 'less') +
      ' · ' +
      fmtDuration(cmp.previous!.totalMinutes) +
      ' by this point ' +
      (range === 'day' ? 'yesterday' : range === 'week' ? 'last week' : 'last month');

  const kicker =
    range === 'day'
      ? 'Today · tracked'
      : range === 'week'
      ? 'This week · Mon–today'
      : MONTHS[new Date(localMidnightMs(today)).getUTCMonth()] + ' · so far';

  const trendDays = cmp.current.days;
  const maxDay = Math.max(60, ...trendDays.map((d) => d.totalMinutes));
  const activeDays = trendDays.filter((d) => d.totalMinutes > 0).length;
  const avgPerDay = activeDays ? cmp.current.totalMinutes / activeDays : 0;

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.header}>
        <Text style={[styles.screenTitle, { color: theme.text }]}>Insights</Text>
        <View style={[styles.segmented, { backgroundColor: theme.surface }]}>
          {(['day', 'week', 'month'] as RangeKind[]).map((r) => {
            const active = r === range;
            return (
              <Pressable
                key={r}
                onPress={() => props.onChangeRange(r)}
                style={[styles.segment, active && { backgroundColor: theme.surface2 }]}
              >
                <Text style={[styles.segmentLabel, { color: active ? theme.text : theme.text3 }]}>
                  {r[0].toUpperCase() + r.slice(1)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 16 }}>
        <View style={[styles.card, { backgroundColor: theme.surface }]}>
          <Text style={[styles.kicker, { color: theme.text3 }]}>{kicker}</Text>
          <View style={styles.totalRow}>
            <Text style={[styles.totalHours, { color: theme.text }]}>{hours}</Text>
            <Text style={[styles.totalUnit, { color: theme.text2 }]}>h</Text>
            <Text style={[styles.totalMinutes, { color: theme.text }]}>{minutes}</Text>
            <Text style={[styles.totalUnitSmall, { color: theme.text2 }]}>m</Text>
          </View>
          <View style={[styles.divider, { borderTopColor: theme.line }]}>
            <Text style={[styles.headline, { color: headlineColor }]}>{headline}</Text>
            <Text style={[styles.headlineSub, { color: theme.text2 }]}>{sub}</Text>
          </View>
        </View>

        {range !== 'day' && (
          <View style={[styles.card, { backgroundColor: theme.surface, marginTop: 12 }]}>
            <View style={styles.cardHead}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>
                {range === 'week' ? 'Per day' : 'Across the month'}
              </Text>
              <Text style={[styles.cardMeta, { color: theme.text3 }]}>
                avg {fmtDuration(avgPerDay)}/day
              </Text>
            </View>
            <View style={styles.trend}>
              {trendDays.map((d) => {
                const ids = Object.keys(d.byCategory).sort((a, b) => d.byCategory[b] - d.byCategory[a]);
                return (
                  <View key={d.localDate} style={styles.trendCol}>
                    <View
                      style={[
                        styles.trendBar,
                        { height: Math.max(3, (d.totalMinutes / maxDay) * 96), backgroundColor: theme.surface2 },
                      ]}
                    >
                      {ids.map((id) => (
                        <View
                          key={id}
                          style={{
                            height: Math.max(1, (d.byCategory[id] / maxDay) * 96),
                            backgroundColor: props.categoriesById[id]?.color ?? theme.text3,
                          }}
                        />
                      ))}
                    </View>
                    <Text
                      style={[
                        styles.trendLabel,
                        { color: d.localDate === today ? theme.text : theme.text3 },
                      ]}
                    >
                      {range === 'month'
                        ? new Date(localMidnightMs(d.localDate)).getUTCDate() % 5 === 1
                          ? String(new Date(localMidnightMs(d.localDate)).getUTCDate())
                          : '·'
                        : ['M', 'T', 'W', 'T', 'F', 'S', 'S'][dayOfWeekMon0(d.localDate)]}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        <View style={[styles.card, { backgroundColor: theme.surface, marginTop: 12 }]}>
          <Text style={[styles.cardTitle, { color: theme.text, marginBottom: 6 }]}>By category</Text>
          {rows.length === 0 ? (
            <Text style={[styles.headlineSub, { color: theme.text3, paddingVertical: 8 }]}>
              Nothing tracked in this period.
            </Text>
          ) : (
            rows.map((row, i) => {
              const cat = props.categoriesById[row.categoryId];
              const up = row.deltaPercent !== null && row.deltaPercent > 0;
              const chipColor = row.deltaPercent === null ? theme.text3 : up ? theme.up : theme.down;
              const chipBg =
                row.deltaPercent === null ? theme.surface2 : up ? 'rgba(228,119,46,0.14)' : 'rgba(47,163,107,0.14)';
              return (
                <Pressable
                  key={row.categoryId}
                  onPress={() => props.onPressCategory(row.categoryId)}
                  style={[styles.row, i < rows.length - 1 && { borderBottomColor: theme.line, borderBottomWidth: StyleSheet.hairlineWidth }]}
                >
                  <View style={styles.rowTop}>
                    <View style={[styles.rowDot, { backgroundColor: cat?.color ?? theme.text3 }]} />
                    <Text numberOfLines={1} style={[styles.rowName, { color: theme.text }]}>
                      {cat?.name ?? 'Unknown'}
                    </Text>
                    <Text style={[styles.rowValue, { color: theme.text }]}>{fmtDuration(row.minutes)}</Text>
                    <View style={[styles.chip, { backgroundColor: chipBg }]}>
                      <Text style={[styles.chipLabel, { color: chipColor }]}>
                        {row.deltaPercent === null
                          ? 'new'
                          : (row.deltaPercent > 0 ? '+' : '') + row.deltaPercent + '%'}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.rowBottom}>
                    <View style={[styles.track, { backgroundColor: theme.surface2 }]}>
                      <View
                        style={{
                          height: 6,
                          borderRadius: 3,
                          width: (Math.max(0.03, row.barFraction) * 100) + '%',
                          backgroundColor: cat?.color ?? theme.text3,
                        }}
                      />
                    </View>
                    <Text style={[styles.rowPct, { color: theme.text3 }]}>
                      {Math.round(row.shareOfTotal * 100)}%
                    </Text>
                  </View>
                </Pressable>
              );
            })
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingTop: 6, paddingBottom: 12 },
  screenTitle: { fontSize: 24, fontWeight: '700', letterSpacing: -0.72 },
  segmented: { flexDirection: 'row', gap: 4, marginTop: 12, padding: 3, borderRadius: RADIUS.chip },
  segment: { flex: 1, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  segmentLabel: { fontSize: 12.5, fontWeight: '600' },

  card: { padding: 18, borderRadius: RADIUS.card },
  cardHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  cardTitle: { fontSize: 13, fontWeight: '600' },
  cardMeta: { fontSize: 11, fontWeight: '500', fontFamily: MONO, fontVariant: ['tabular-nums'] },
  kicker: { fontSize: 11.5, fontWeight: '500', letterSpacing: 0.7, textTransform: 'uppercase' },

  totalRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 10 },
  totalHours: { fontSize: 44, fontWeight: '600', fontFamily: MONO, fontVariant: ['tabular-nums'], letterSpacing: -1.3 },
  totalUnit: { fontSize: 17, fontWeight: '500' },
  totalMinutes: { fontSize: 30, fontWeight: '600', fontFamily: MONO, fontVariant: ['tabular-nums'], letterSpacing: -0.9, marginLeft: 4 },
  totalUnitSmall: { fontSize: 15, fontWeight: '500' },

  divider: { marginTop: 14, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth },
  headline: { fontSize: 19, fontWeight: '700', letterSpacing: -0.38, lineHeight: 24 },
  headlineSub: { marginTop: 5, fontSize: 12.5, lineHeight: 18 },

  trend: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 104, marginTop: 14 },
  trendCol: { flex: 1, alignItems: 'center', gap: 6 },
  trendBar: { width: '100%', minWidth: 3, borderRadius: 4, overflow: 'hidden', flexDirection: 'column-reverse' },
  trendLabel: { fontSize: 9.5, fontWeight: '500', fontFamily: MONO, fontVariant: ['tabular-nums'] },

  row: { paddingVertical: 11 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  rowDot: { width: 10, height: 10, borderRadius: 3 },
  rowName: { flex: 1, fontSize: 13, fontWeight: '600' },
  rowValue: { fontSize: 12.5, fontWeight: '600', fontFamily: MONO, fontVariant: ['tabular-nums'] },
  chip: { paddingVertical: 3, paddingHorizontal: 7, borderRadius: 7 },
  chipLabel: { fontSize: 10.5, fontWeight: '600', fontFamily: MONO, fontVariant: ['tabular-nums'] },
  rowBottom: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  track: { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden' },
  rowPct: { width: 34, textAlign: 'right', fontSize: 10.5, fontWeight: '500', fontFamily: MONO, fontVariant: ['tabular-nums'] },
});
