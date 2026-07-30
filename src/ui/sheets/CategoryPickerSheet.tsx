import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Category } from '../../db/schema';
import { fmtDuration } from '../format';
import { MONO } from '../theme';
import type { Theme } from '../theme';

/** Starting a timer is always two taps: open, pick. */
export function CategoryPickerSheet(props: {
  categories: Category[];
  recentUse: Record<string, number>;
  categoriesById: Record<string, Category>;
  theme: Theme;
  onPick: (categoryId: string) => void;
}) {
  const { theme } = props;
  const selectable = props.categories.filter((c) => c.archived === 0);
  const ranked = [...selectable].sort(
    (a, b) => (props.recentUse[b.id] ?? 0) - (props.recentUse[a.id] ?? 0)
  );

  return (
    <View>
      <Text style={[styles.title, { color: theme.text }]}>Track what?</Text>
      <Text style={[styles.eyebrow, { color: theme.text3 }]}>Most used</Text>
      <View style={styles.grid}>
        {ranked.slice(0, 5).map((c) => (
          <Pressable
            key={c.id}
            onPress={() => props.onPick(c.id)}
            style={[styles.tile, { backgroundColor: theme.surface2 }]}
          >
            <View style={[styles.tileDot, { backgroundColor: c.color }]} />
            <Text numberOfLines={1} style={[styles.tileName, { color: theme.text }]}>
              {c.name}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text style={[styles.eyebrow, { color: theme.text3, marginTop: 18 }]}>All categories</Text>
      <ScrollView style={{ maxHeight: 260 }}>
        {ranked.map((c, i) => (
          <Pressable
            key={c.id}
            onPress={() => props.onPick(c.id)}
            style={[
              styles.row,
              i < ranked.length - 1 && { borderBottomColor: theme.line, borderBottomWidth: StyleSheet.hairlineWidth },
            ]}
          >
            <View style={[styles.rowDot, { backgroundColor: c.color }]} />
            <Text style={[styles.rowName, { color: theme.text }]}>
              {c.parentId ? (props.categoriesById[c.parentId]?.name ?? '?') + ' › ' + c.name : c.name}
            </Text>
            <Text style={[styles.rowMeta, { color: theme.text3 }]}>
              {fmtDuration((props.recentUse[c.id] ?? 0) / 60_000)} / 14d
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 17, fontWeight: '700', letterSpacing: -0.34 },
  eyebrow: { marginTop: 14, marginBottom: 10, fontSize: 11, fontWeight: '500', letterSpacing: 0.66, textTransform: 'uppercase' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { width: '48%', flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 15, paddingHorizontal: 13, borderRadius: 16 },
  tileDot: { width: 12, height: 12, borderRadius: 4 },
  tileName: { flex: 1, fontSize: 14, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 12 },
  rowDot: { width: 10, height: 10, borderRadius: 3 },
  rowName: { flex: 1, fontSize: 14, fontWeight: '500' },
  rowMeta: { fontSize: 11, fontWeight: '500', fontFamily: MONO, fontVariant: ['tabular-nums'] },
});
