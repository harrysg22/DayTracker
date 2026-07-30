import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Category, Entry } from '../../db/schema';
import { fmt12, fmtElapsed, minutesIntoLocalDay } from '../format';
import { MONO, RADIUS } from '../theme';
import type { Theme } from '../theme';

/**
 * Lives above the tab bar on every tab. One bar, one job — it never floats
 * over content like a FAB and never competes with the screen header.
 */
export function TimerBar(props: {
  timer: Entry | null;
  category: Category | null;
  displayName: string;
  nowMs: number;
  overThreshold: boolean;
  theme: Theme;
  onPressBody: () => void;
  onPressStart: () => void;
  onPressStop: () => void;
}) {
  const { timer, category, theme, overThreshold } = props;
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!timer) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.35, duration: 1000, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 1000, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [timer, pulse]);

  if (!timer || !category) {
    return (
      <Pressable
        onPress={props.onPressStart}
        style={[styles.bar, { backgroundColor: theme.surface, borderColor: theme.line }]}
      >
        <Text style={[styles.idle, { color: theme.text2 }]}>Nothing running</Text>
        <View style={[styles.startBtn, { backgroundColor: theme.text }]}>
          <View style={[styles.play, { borderLeftColor: theme.bg }]} />
          <Text style={[styles.startLabel, { color: theme.bg }]}>Start</Text>
        </View>
      </Pressable>
    );
  }

  const startedMinute = minutesIntoLocalDay(timer.startedAtMs, timer.tzOffsetMin, timer.localDate);

  return (
    <Pressable
      onPress={props.onPressBody}
      style={[
        styles.bar,
        {
          backgroundColor: theme.surface,
          borderColor: overThreshold ? 'rgba(228,169,61,0.45)' : theme.line,
        },
        overThreshold && { shadowColor: theme.warn, shadowOpacity: 0.5, shadowRadius: 8, elevation: 4 },
      ]}
    >
      <Animated.View style={[styles.dot, { backgroundColor: category.color, opacity: pulse }]} />
      <View style={styles.meta}>
        <Text numberOfLines={1} style={[styles.name, { color: theme.text }]}>
          {props.displayName}
        </Text>
        <Text style={[styles.since, { color: theme.text2 }]}>since {fmt12(startedMinute)}</Text>
      </View>
      <Text style={[styles.elapsed, { color: theme.text }]}>
        {fmtElapsed(props.nowMs - timer.startedAtMs)}
      </Text>
      <Pressable
        onPress={props.onPressStop}
        hitSlop={8}
        accessibilityLabel="Stop timer"
        style={[styles.stopBtn, { backgroundColor: theme.text }]}
      >
        <View style={[styles.stopSquare, { backgroundColor: theme.bg }]} />
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    marginHorizontal: 14,
    marginBottom: 6,
    paddingVertical: 10,
    paddingLeft: 14,
    paddingRight: 11,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
  },
  idle: { flex: 1, fontSize: 14, fontWeight: '600' },
  startBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 40, paddingHorizontal: 18, borderRadius: 14 },
  play: { width: 0, height: 0, borderLeftWidth: 8, borderTopWidth: 5, borderBottomWidth: 5, borderTopColor: 'transparent', borderBottomColor: 'transparent' },
  startLabel: { fontSize: 13.5, fontWeight: '700' },
  dot: { width: 12, height: 12, borderRadius: 4 },
  meta: { flex: 1 },
  name: { fontSize: 13.5, fontWeight: '600' },
  since: { marginTop: 2, fontSize: 11, fontWeight: '500', fontFamily: MONO, fontVariant: ['tabular-nums'] },
  elapsed: { fontSize: 20, fontWeight: '600', fontFamily: MONO, fontVariant: ['tabular-nums'], letterSpacing: -0.4 },
  stopBtn: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  stopSquare: { width: 12, height: 12, borderRadius: 3 },
});
