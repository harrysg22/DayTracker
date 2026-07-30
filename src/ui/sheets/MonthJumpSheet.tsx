import { Pressable, StyleSheet, Text, View } from 'react-native';
import { DOW, localMidnightMs, shiftLocalDate } from '../format';
import { MONO } from '../theme';
import type { Theme } from '../theme';

export function MonthJumpSheet(props: {
  /** Any date inside the month to show. */
  anchorDate: string;
  selectedDate: string;
  today: string;
  /** Local dates that have at least one entry. */
  datesWithData: Set<string>;
  theme: Theme;
  onPick: (localDate: string) => void;
  onToday: () => void;
}) {
  const { theme } = props;
  const anchor = new Date(localMidnightMs(props.anchorDate));
  const year = anchor.getUTCFullYear();
  const month = anchor.getUTCMonth();
  const firstOfMonth = new Date(Date.UTC(year, month, 1));
  const lead = (firstOfMonth.getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const pad = (n: number) => (n < 10 ? '0' + n : '' + n);

  return (
    <View>
      <Text style={[styles.title, { color: theme.text }]}>Jump to a day</Text>
      <View style={styles.grid}>
        {DOW.map((d) => (
          <View key={d} style={styles.cell}>
            <Text style={[styles.dow, { color: theme.text3 }]}>{d[0]}</Text>
          </View>
        ))}
        {Array.from({ length: lead }).map((_, i) => (
          <View key={'lead' + i} style={styles.cell} />
        ))}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const date = year + '-' + pad(month + 1) + '-' + pad(i + 1);
          const selected = date === props.selectedDate;
          const future = date > props.today;
          return (
            <Pressable key={date} onPress={() => props.onPick(date)} style={styles.cell}>
              <View style={[styles.day, selected && { backgroundColor: theme.text }]}>
                <Text
                  style={[
                    styles.dayNum,
                    { color: selected ? theme.bg : future ? theme.text3 : theme.text },
                  ]}
                >
                  {i + 1}
                </Text>
                <View
                  style={[
                    styles.dayDot,
                    {
                      backgroundColor: props.datesWithData.has(date)
                        ? selected
                          ? theme.bg
                          : theme.text3
                        : 'transparent',
                    },
                  ]}
                />
              </View>
            </Pressable>
          );
        })}
      </View>
      <Pressable onPress={props.onToday} style={[styles.primary, { backgroundColor: theme.text }]}>
        <Text style={[styles.primaryLabel, { color: theme.bg }]}>Today</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 17, fontWeight: '700', letterSpacing: -0.34 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 16 },
  cell: { width: '14.28%', alignItems: 'center', paddingVertical: 3 },
  dow: { fontSize: 10, fontWeight: '600' },
  day: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 3 },
  dayNum: { fontSize: 13, fontWeight: '600', fontFamily: MONO, fontVariant: ['tabular-nums'] },
  dayDot: { width: 4, height: 4, borderRadius: 2 },
  primary: { marginTop: 16, height: 48, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  primaryLabel: { fontSize: 14, fontWeight: '700' },
});
