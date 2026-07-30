import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Theme } from '../theme';

export type TabKey = 'day' | 'insights' | 'categories';

/**
 * Icons are drawn from the app's own vocabulary rather than a generic icon set:
 * Day = stacked time blocks, Insights = a trio of bars, Categories = colour dots.
 * Swap in your icon library if you add one, but keep these three metaphors.
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
            <Text style={[styles.label, { color }]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', paddingHorizontal: 16, paddingTop: 2, borderTopWidth: StyleSheet.hairlineWidth },
  tab: { flex: 1, alignItems: 'center', paddingTop: 11, gap: 7 },
  glyph: { width: 22, height: 22 },
  glyphRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 2 },
  label: { fontSize: 10.5, fontWeight: '600' },
});
