import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { Category, Entry } from '../../db/schema';
import { fmt12, fmtDuration, minutesIntoLocalDay } from '../format';
import { GEO, MONO, inkOn } from '../theme';
import type { Theme } from '../theme';

/**
 * Duration is shown as computed, never editable — it is always end − start.
 * Steppers move in 5-minute jumps; the calendar's long-press drag is the
 * coarse alternative, not the primary path.
 */
export function EntryEditSheet(props: {
  entry: Entry;
  categories: Category[];
  nowMs: number;
  theme: Theme;
  onChangeCategory: (categoryId: string) => void;
  onNudge: (edge: 'start' | 'end', deltaMinutes: number) => void;
  onChangeNote: (note: string | null) => void;
  onSplit: () => void;
  onDelete: () => void;
  onDone: () => void;
}) {
  const { entry, theme } = props;
  const [note, setNote] = useState(entry.note ?? '');
  const category = props.categories.find((c) => c.id === entry.categoryId);
  const live = entry.endedAtMs === null;

  const startMin = minutesIntoLocalDay(entry.startedAtMs, entry.tzOffsetMin, entry.localDate);
  const endMin = minutesIntoLocalDay(entry.endedAtMs ?? props.nowMs, entry.tzOffsetMin, entry.localDate);

  return (
    <View>
      <View style={styles.head}>
        <View style={[styles.headDot, { backgroundColor: category?.color ?? theme.text3 }]} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: theme.text }]}>{category?.name ?? 'Entry'}</Text>
          <Text style={[styles.range, { color: theme.text2 }]}>
            {fmt12(startMin)} – {live ? 'running' : fmt12(endMin)}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[styles.duration, { color: theme.text }]}>{fmtDuration(endMin - startMin)}</Text>
          <Text style={[styles.computed, { color: theme.text3 }]}>computed</Text>
        </View>
      </View>

      <ScrollView style={{ maxHeight: 460 }} keyboardShouldPersistTaps="handled">
        <Text style={[styles.eyebrow, { color: theme.text3 }]}>Category</Text>
        <View style={styles.chips}>
          {props.categories
            .filter((c) => c.archived === 0)
            .map((c) => {
              const on = c.id === entry.categoryId;
              return (
                <Pressable
                  key={c.id}
                  onPress={() => props.onChangeCategory(c.id)}
                  style={[styles.chip, { backgroundColor: on ? c.color : theme.surface2 }]}
                >
                  <View style={[styles.chipDot, { backgroundColor: on ? inkOn(c.color) : c.color }]} />
                  <Text style={[styles.chipLabel, { color: on ? inkOn(c.color) : theme.text2 }]}>{c.name}</Text>
                </Pressable>
              );
            })}
        </View>

        <Text style={[styles.eyebrow, { color: theme.text3 }]}>Time</Text>
        {([
          { label: 'Starts', edge: 'start' as const, value: fmt12(startMin) },
          { label: 'Ends', edge: 'end' as const, value: live ? 'running' : fmt12(endMin) },
        ]).map((s) => (
          <View key={s.edge} style={[styles.stepperRow, { backgroundColor: theme.surface2 }]}>
            <Text style={[styles.stepperLabel, { color: theme.text2 }]}>{s.label}</Text>
            <Pressable
              onPress={() => props.onNudge(s.edge, -GEO.stepMinutes)}
              style={[styles.stepperBtn, { backgroundColor: theme.surface }]}
            >
              <Text style={[styles.stepperSign, { color: theme.text }]}>−</Text>
            </Pressable>
            <Text style={[styles.stepperValue, { color: theme.text }]}>{s.value}</Text>
            <Pressable
              onPress={() => props.onNudge(s.edge, GEO.stepMinutes)}
              style={[styles.stepperBtn, { backgroundColor: theme.surface }]}
            >
              <Text style={[styles.stepperSign, { color: theme.text }]}>+</Text>
            </Pressable>
          </View>
        ))}
        <Text style={[styles.hint, { color: theme.text3 }]}>
          5-minute steps · hold a block in the calendar to drag its edges instead.
        </Text>

        <Text style={[styles.eyebrow, { color: theme.text3 }]}>Note</Text>
        <TextInput
          value={note}
          onChangeText={setNote}
          onEndEditing={() => props.onChangeNote(note.trim() || null)}
          placeholder="optional — what was this?"
          placeholderTextColor={theme.text3}
          style={[styles.input, { backgroundColor: theme.surface2, borderColor: theme.line, color: theme.text }]}
        />

        <View style={styles.actions}>
          <Pressable onPress={props.onSplit} style={[styles.secondary, { backgroundColor: theme.surface2 }]}>
            <Text style={[styles.secondaryLabel, { color: theme.text }]}>Split in two</Text>
          </Pressable>
          <Pressable onPress={props.onDelete} style={[styles.secondary, { backgroundColor: 'rgba(224,86,86,0.14)' }]}>
            <Text style={[styles.secondaryLabel, { color: theme.destructive }]}>Delete</Text>
          </Pressable>
        </View>
        <Pressable onPress={props.onDone} style={[styles.primary, { backgroundColor: theme.text }]}>
          <Text style={[styles.primaryLabel, { color: theme.bg }]}>Done</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headDot: { width: 14, height: 14, borderRadius: 5 },
  title: { fontSize: 17, fontWeight: '700', letterSpacing: -0.34 },
  range: { marginTop: 3, fontSize: 12, fontWeight: '500', fontFamily: MONO, fontVariant: ['tabular-nums'] },
  duration: { fontSize: 19, fontWeight: '600', fontFamily: MONO, fontVariant: ['tabular-nums'] },
  computed: { marginTop: 3, fontSize: 9.5, fontWeight: '500', letterSpacing: 0.57, textTransform: 'uppercase' },

  eyebrow: { marginTop: 18, marginBottom: 10, fontSize: 11, fontWeight: '500', letterSpacing: 0.66, textTransform: 'uppercase' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 9, paddingHorizontal: 12, borderRadius: 12 },
  chipDot: { width: 9, height: 9, borderRadius: 3 },
  chipLabel: { fontSize: 12.5, fontWeight: '600' },

  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 16, marginBottom: 8 },
  stepperLabel: { flex: 1, fontSize: 12.5, fontWeight: '600' },
  stepperBtn: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  stepperSign: { fontSize: 16, fontWeight: '600' },
  stepperValue: { minWidth: 86, textAlign: 'center', fontSize: 15, fontWeight: '600', fontFamily: MONO, fontVariant: ['tabular-nums'] },
  hint: { marginHorizontal: 2, fontSize: 11, lineHeight: 15 },

  input: { paddingVertical: 13, paddingHorizontal: 14, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, fontSize: 13.5, fontWeight: '500' },
  actions: { flexDirection: 'row', gap: 8, marginTop: 18 },
  secondary: { flex: 1, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  secondaryLabel: { fontSize: 13, fontWeight: '600' },
  primary: { marginTop: 8, height: 48, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  primaryLabel: { fontSize: 14, fontWeight: '700' },
});
