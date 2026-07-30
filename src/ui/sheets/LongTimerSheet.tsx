import { Pressable, StyleSheet, Text, View } from 'react-native';
import { fmt12, fmtDuration } from '../format';
import { MONO } from '../theme';
import type { Theme } from '../theme';

/**
 * The month-2 interaction: the timer ran all night. The primary action
 * PROPOSES a plausible ending instead of asking the user to reconstruct
 * their afternoon. No option here destroys data.
 */
export function LongTimerSheet(props: {
  categoryName: string;
  elapsedMinutes: number;
  thresholdHours: number;
  /** Best guess for when they actually stopped, in minutes past local midnight. */
  guessMinute: number;
  startedMinute: number;
  theme: Theme;
  onStopAtGuess: () => void;
  onStopNow: () => void;
  onPickTime: () => void;
  onKeepRunning: () => void;
}) {
  const { theme } = props;
  const keptMinutes = props.guessMinute - props.startedMinute;

  return (
    <View>
      <View style={styles.head}>
        <View style={[styles.dot, { backgroundColor: theme.warn }]} />
        <Text style={[styles.title, { color: theme.text }]}>
          Still tracking {props.categoryName}?
        </Text>
      </View>
      <Text style={[styles.body, { color: theme.text2 }]}>
        It has been running for {fmtDuration(props.elapsedMinutes)}, past your{' '}
        {props.thresholdHours}h limit. Nothing is lost either way — pick the ending that matches reality.
      </Text>

      <View style={[styles.guessCard, { backgroundColor: theme.surface2 }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.guessLabel, { color: theme.text }]}>Last phone activity</Text>
          <Text style={[styles.guessSub, { color: theme.text3 }]}>
            Most likely when you actually stopped
          </Text>
        </View>
        <Text style={[styles.guessValue, { color: theme.text }]}>{fmt12(props.guessMinute)}</Text>
      </View>

      <Pressable onPress={props.onStopAtGuess} style={[styles.primary, { backgroundColor: theme.warn }]}>
        <Text style={styles.primaryLabel}>
          Stop at {fmt12(props.guessMinute)} · keep {fmtDuration(keptMinutes)}
        </Text>
      </Pressable>

      <View style={styles.actions}>
        <Pressable onPress={props.onStopNow} style={[styles.secondary, { backgroundColor: theme.surface2 }]}>
          <Text style={[styles.secondaryLabel, { color: theme.text }]}>Stop now</Text>
        </Pressable>
        <Pressable onPress={props.onPickTime} style={[styles.secondary, { backgroundColor: theme.surface2 }]}>
          <Text style={[styles.secondaryLabel, { color: theme.text }]}>Pick a time…</Text>
        </Pressable>
      </View>
      <Pressable onPress={props.onKeepRunning} style={styles.ghost}>
        <Text style={[styles.ghostLabel, { color: theme.text3 }]}>It's right, keep running</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  title: { flex: 1, fontSize: 18, fontWeight: '700', letterSpacing: -0.36 },
  body: { marginTop: 10, fontSize: 13.5, lineHeight: 20 },
  guessCard: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16, padding: 14, borderRadius: 18 },
  guessLabel: { fontSize: 12.5, fontWeight: '600' },
  guessSub: { marginTop: 4, fontSize: 11.5, lineHeight: 15 },
  guessValue: { fontSize: 16, fontWeight: '600', fontFamily: MONO, fontVariant: ['tabular-nums'] },
  primary: { marginTop: 14, height: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  primaryLabel: { fontSize: 14, fontWeight: '700', color: '#151312' },
  actions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  secondary: { flex: 1, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  secondaryLabel: { fontSize: 13, fontWeight: '600' },
  ghost: { marginTop: 8, height: 44, alignItems: 'center', justifyContent: 'center' },
  ghostLabel: { fontSize: 13, fontWeight: '600' },
});
