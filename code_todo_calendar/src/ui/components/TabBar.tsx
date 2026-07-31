import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Theme } from '../theme';

export type TabKey = 'day' | 'todo' | 'week' | 'insights' | 'categories';

/**
 * Icons are drawn from the app's own vocabulary rather than a generic icon set:
 * Day = stacked time blocks, To-Do = checkbox rows, Week = a calendar grid,
 * Insights = a trio of bars, Categories = colour dots.
 * Swap in your icon library if you add one, but keep these metaphors.
 */
function DayGlyph({ color, active }: { color: string; active: boolean }) {
  const bars = [
    { top: 1, height: 6, opacity: active ? 1 : 0.55 },
    { top: 9, height: 4, opacity: active ? 0.55 : 0.35 },
    { top: 15, height: 7, opacity: active ? 1 : 0.55 },
  ];
  return (
    <View style={styles.glyph}>
      {bars.map((b, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            left: 3,
            top: b.top,
            width: 16,
            height: b.height,
            borderRadius: 2,
            backgroundColor: color,
            opacity: b.opacity,
          }}
        />
      ))}
    </View>
  );
}

function TodoGlyph({ color, active }: { color: string; active: boolean }) {
  return (
    <View style={styles.glyph}>
      {[0, 1, 2].map((i) => {
        const top = 3 + i * 7;
        const filled = active && i === 0;
        return (
          <View key={i}>
            <View
              style={{
                position: 'absolute',
                left: 1,
                top,
                width: 6,
                height: 6,
                borderRadius: 2,
                borderWidth: 1.5,
                borderColor: color,
                backgroundColor: filled ? color : 'transparent',
                opacity: active ? (i === 0 ? 1 : 0.6) : 0.5,
              }}
            />
            <View
              style={{
                position: 'absolute',
                left: 11,
                top: top + 2,
                width: i === 1 ? 8 : 10,
                height: 2,
                borderRadius: 1,
                backgroundColor: color,
                opacity: active ? 0.75 : 0.45,
              }}
            />
          </View>
        );
      })}
    </View>
  );
}

function WeekGlyph({ color, active }: { color: string; active: boolean }) {
  return (
    <View style={styles.glyph}>
      <View
        style={{
          position: 'absolute',
          left: 2,
          top: 2,
          width: 18,
          height: 4,
          borderRadius: 1.5,
          backgroundColor: color,
          opacity: active ? 1 : 0.55,
        }}
      />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            left: 2 + (i % 3) * 7,
            top: i > 2 ? 15 : 9,
            width: 4,
            height: 4,
            borderRadius: 1.5,
            backgroundColor: color,
            opacity: active ? (i === 1 ? 1 : 0.5) : 0.42,
          }}
        />
      ))}
    </View>
  );
}

function InsightsGlyph({ color, active }: { color: string; active: boolean }) {
  const heights = [9, 16, 22, 13];
  return (
    <View style={[styles.glyph, styles.glyphRow]}>
      {heights.map((h, i) => (
        <View
          key={i}
          style={{
            width: 4,
            height: h,
            borderRadius: 2,
            backgroundColor: color,
            opacity: active ? (i === 2 ? 1 : 0.6) : 0.5,
          }}
        />
      ))}
    </View>
  );
}

function CategoriesGlyph({ color, active }: { color: string; active: boolean }) {
  return (
    <View style={styles.glyph}>
      {[0, 1, 2, 3].map((i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            left: i % 2 ? 12 : 2,
            top: i > 1 ? 12 : 2,
            width: 8,
            height: 8,
            borderRadius: 2.5,
            backgroundColor: color,
            opacity: active ? (i === 0 || i === 3 ? 1 : 0.55) : 0.5,
          }}
        />
      ))}
    </View>
  );
}

const TABS: { key: TabKey; label: string; Glyph: typeof DayGlyph }[] = [
  { key: 'day', label: 'Day', Glyph: DayGlyph },
  { key: 'todo', label: 'To-Do', Glyph: TodoGlyph },
  { key: 'week', label: 'Week', Glyph: WeekGlyph },
  { key: 'insights', label: 'Insights', Glyph: InsightsGlyph },
  { key: 'categories', label: 'Categories', Glyph: CategoriesGlyph },
];

export function TabBar(props: {
  active: TabKey;
  onChange: (key: TabKey) => void;
  theme: Theme;
  bottomInset: number;
}) {
  return (
    <View
      style={[
        styles.bar,
        { borderTopColor: props.theme.line, backgroundColor: props.theme.bg, paddingBottom: props.bottomInset + 6 },
      ]}
    >
      {TABS.map(({ key, label, Glyph }) => {
        const active = props.active === key;
        const color = active ? props.theme.text : props.theme.text3;
        return (
          <Pressable
            key={key}
            onPress={() => props.onChange(key)}
            style={styles.tab}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={label}
          >
            <Glyph color={color} active={active} />
            <Text numberOfLines={1} style={[styles.label, { color }]}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', paddingHorizontal: 12, paddingTop: 2, borderTopWidth: StyleSheet.hairlineWidth },
  tab: { flex: 1, minWidth: 0, alignItems: 'center', paddingTop: 11, gap: 7 },
  glyph: { width: 22, height: 22 },
  glyphRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 2 },
  // 9.5 en vez de 10.5: con cinco pestañas, "Categories" ya no cabe a 10.5.
  label: { fontSize: 9.5, fontWeight: '600' },
});
