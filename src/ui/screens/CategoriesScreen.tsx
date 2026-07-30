import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import type { Category } from '../../db/schema';
import { fmtDuration } from '../format';
import { MONO, RADIUS } from '../theme';
import type { Theme } from '../theme';

export function CategoriesScreen(props: {
  categories: Category[];
  /** categoryId -> ms tracked in the last 14 days. */
  recentUse: Record<string, number>;
  theme: Theme;
  isDark: boolean;
  thresholdHours: number;
  onChangeThreshold: (hours: number) => void;
  onToggleTheme: () => void;
  onNewCategory: () => void;
  onOpenCategory: (category: Category) => void;
  onExportCSV: () => void;
  onExportBackup: () => void;
  onRestoreBackup: () => void;
}) {
  const { theme } = props;
  const active = props.categories.filter((c) => c.archived === 0);
  const archived = props.categories.filter((c) => c.archived === 1);

  const renderRow = (c: Category, isLast: boolean, dim = false) => (
    <Pressable
      key={c.id}
      onPress={() => props.onOpenCategory(c)}
      style={[
        styles.row,
        { paddingLeft: c.parentId ? 10 : 0 },
        !isLast && { borderBottomColor: theme.line, borderBottomWidth: StyleSheet.hairlineWidth },
      ]}
    >
      <View style={[styles.dot, { backgroundColor: c.color, opacity: dim ? 0.45 : 1 }]} />
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={[styles.rowName, { color: dim ? theme.text2 : theme.text }]}>
          {(c.parentId ? '↳ ' : '') + c.name}
        </Text>
        {!dim && (
          <Text style={[styles.rowSub, { color: theme.text3 }]}>
            {fmtDuration((props.recentUse[c.id] ?? 0) / 60_000)} last 14 days
          </Text>
        )}
      </View>
      <Text style={[styles.chevron, { color: theme.text3 }]}>{dim ? 'Restore' : '›'}</Text>
    </Pressable>
  );

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.header}>
        <Text style={[styles.screenTitle, { color: theme.text }]}>Categories</Text>
        <Pressable onPress={props.onNewCategory} style={[styles.newBtn, { backgroundColor: theme.surface }]}>
          <Text style={[styles.newLabel, { color: theme.text }]}>+ New</Text>
        </Pressable>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 16 }}>
        <View style={[styles.group, { backgroundColor: theme.surface }]}>
          {active.map((c, i) => renderRow(c, i === active.length - 1))}
        </View>

        {archived.length > 0 && (
          <>
            <Text style={[styles.sectionLabel, { color: theme.text3 }]}>Archived</Text>
            <View style={[styles.group, { backgroundColor: theme.surface }]}>
              {archived.map((c, i) => renderRow(c, i === archived.length - 1, true))}
            </View>
          </>
        )}

        <Text style={[styles.sectionLabel, { color: theme.text3 }]}>Settings</Text>
        <View style={[styles.group, { backgroundColor: theme.surface }]}>
          <View style={[styles.settingRow, { borderBottomColor: theme.line }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowName, { color: theme.text }]}>Long-timer warning</Text>
              <Text style={[styles.settingSub, { color: theme.text3 }]}>
                Nudge me if a timer runs past this
              </Text>
            </View>
            <View style={[styles.stepper, { backgroundColor: theme.surface2 }]}>
              <Pressable
                onPress={() => props.onChangeThreshold(Math.max(1, props.thresholdHours - 1))}
                style={styles.stepperBtn}
                hitSlop={4}
              >
                <Text style={[styles.stepperLabel, { color: theme.text2 }]}>−</Text>
              </Pressable>
              <Text style={[styles.stepperValue, { color: theme.text }]}>{props.thresholdHours}h</Text>
              <Pressable
                onPress={() => props.onChangeThreshold(Math.min(14, props.thresholdHours + 1))}
                style={styles.stepperBtn}
                hitSlop={4}
              >
                <Text style={[styles.stepperLabel, { color: theme.text2 }]}>+</Text>
              </Pressable>
            </View>
          </View>

          <View style={[styles.settingRow, { borderBottomColor: theme.line }]}>
            <Text style={[styles.rowName, { color: theme.text, flex: 1 }]}>Dark mode</Text>
            <Switch
              value={props.isDark}
              onValueChange={props.onToggleTheme}
              trackColor={{ true: theme.text, false: theme.surface2 }}
              thumbColor={theme.surface}
            />
          </View>

          {[
            { name: 'Export CSV', sub: 'One row per entry, local dates', onPress: props.onExportCSV },
            { name: 'Export backup', sub: 'Full snapshot of this device', onPress: props.onExportBackup },
            { name: 'Restore backup', sub: 'Replaces everything currently stored', onPress: props.onRestoreBackup },
          ].map((s, i, arr) => (
            <Pressable
              key={s.name}
              onPress={s.onPress}
              style={[
                styles.settingRow,
                i < arr.length - 1 ? { borderBottomColor: theme.line } : { borderBottomWidth: 0 },
              ]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowName, { color: theme.text }]}>{s.name}</Text>
                <Text style={[styles.settingSub, { color: theme.text3 }]}>{s.sub}</Text>
              </View>
              <Text style={[styles.chevron, { color: theme.text3 }]}>›</Text>
            </Pressable>
          ))}
        </View>

        <Text style={[styles.footnote, { color: theme.text3 }]}>
          Offline-first · everything stored on this device. Archiving keeps history intact.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 6, paddingBottom: 12 },
  screenTitle: { fontSize: 24, fontWeight: '700', letterSpacing: -0.72 },
  newBtn: { height: 32, paddingHorizontal: 13, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  newLabel: { fontSize: 12, fontWeight: '600' },

  group: { borderRadius: RADIUS.card, paddingHorizontal: 16 },
  sectionLabel: { marginTop: 22, marginBottom: 10, fontSize: 11.5, fontWeight: '500', letterSpacing: 0.7, textTransform: 'uppercase' },

  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13 },
  dot: { width: 14, height: 14, borderRadius: 5 },
  rowName: { fontSize: 13.5, fontWeight: '600' },
  rowSub: { marginTop: 2, fontSize: 11, fontWeight: '500', fontFamily: MONO, fontVariant: ['tabular-nums'] },
  chevron: { fontSize: 17 },

  settingRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  settingSub: { marginTop: 2, fontSize: 11.5, lineHeight: 15 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 2, padding: 3, borderRadius: 11 },
  stepperBtn: { width: 28, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  stepperLabel: { fontSize: 15, fontWeight: '600' },
  stepperValue: { minWidth: 42, textAlign: 'center', fontSize: 12.5, fontWeight: '600', fontFamily: MONO, fontVariant: ['tabular-nums'] },

  footnote: { marginTop: 14, marginHorizontal: 4, fontSize: 11, lineHeight: 16 },
});
