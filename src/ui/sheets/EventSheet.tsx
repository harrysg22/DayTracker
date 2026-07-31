import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { Category, PlanEvent } from '../../db/schema';
import { fmt12, fmtDuration } from '../format';
import { MONO, RADIUS } from '../theme';
import type { Theme } from '../theme';

/**
 * Editar un evento planeado. Los ± mueven en pasos de 15 minutos y escriben
 * directo — no hay "guardar": el sheet es la edición.
 */
export function EventSheet(props: {
  event: PlanEvent;
  categories: Category[];
  theme: Theme;
  canStartTimer: boolean;
  onChangeTitle: (title: string) => void;
  onNudge: (field: 'start' | 'duration', deltaMinutes: number) => void;
  onChangeCategory: (categoryId: string | null) => void;
  onStartTimer: () => void;
  onDelete: () => void;
  onDone: () => void;
}) {
  const { theme, event } = props;
  const [title, setTitle] = useState(event.title);
  useEffect(() => setTitle(event.title), [event.id, event.title]);

  const commitTitle = () => {
    const value = title.trim();
    if (value && value !== event.title) props.onChangeTitle(value);
    else if (!value) setTitle(event.title);
  };

  const category = event.categoryId ? props.categories.find((c) => c.id === event.categoryId) : null;

  const steppers = [
    { key: 'start' as const, label: 'Starts', value: fmt12(event.startMinute) },
    { key: 'duration' as const, label: 'Lasts', value: fmtDuration(event.durationMinutes) },
  ];

  return (
    <View>
      <TextInput
        value={title}
        onChangeText={setTitle}
        onEndEditing={commitTitle}
        onBlur={commitTitle}
        returnKeyType="done"
        style={[styles.input, { backgroundColor: theme.surface2, color: theme.text }]}
      />

      <View style={{ marginTop: 12, gap: 7 }}>
        {steppers.map((s) => (
          <View key={s.key} style={styles.stepperRow}>
            <Text style={[styles.stepperLabel, { color: theme.text2 }]}>{s.label}</Text>
            <Pressable
              onPress={() => props.onNudge(s.key, -15)}
              hitSlop={4}
              style={[styles.stepperBtn, { backgroundColor: theme.surface2 }]}
            >
              <Text style={[styles.stepperSign, { color: theme.text }]}>−</Text>
            </Pressable>
            <Text style={[styles.stepperValue, { color: theme.text }]}>{s.value}</Text>
            <Pressable
              onPress={() => props.onNudge(s.key, 15)}
              hitSlop={4}
              style={[styles.stepperBtn, { backgroundColor: theme.surface2 }]}
            >
              <Text style={[styles.stepperSign, { color: theme.text }]}>+</Text>
            </Pressable>
          </View>
        ))}
      </View>

      <Text style={[styles.kicker, { color: theme.text3 }]}>CATEGORY</Text>
      <ScrollView style={{ maxHeight: 150 }} keyboardShouldPersistTaps="handled">
        <View style={styles.chips}>
          {props.categories
            .filter((c) => c.archived === 0)
            .map((c) => {
              const on = event.categoryId === c.id;
              return (
                <Pressable
                  key={c.id}
                  onPress={() => props.onChangeCategory(on ? null : c.id)}
                  style={[styles.chip, { backgroundColor: on ? theme.text : theme.surface2 }]}
                >
                  <View style={[styles.dot, { backgroundColor: c.color }]} />
                  <Text style={[styles.chipLabel, { color: on ? theme.bg : theme.text2 }]}>{c.name}</Text>
                </Pressable>
              );
            })}
        </View>
      </ScrollView>

      {props.canStartTimer && !!category && (
        <Pressable onPress={props.onStartTimer} style={[styles.primary, { backgroundColor: theme.text }]}>
          <View style={[styles.triangle, { borderLeftColor: theme.bg }]} />
          <Text style={[styles.primaryLabel, { color: theme.bg }]}>Start tracking {category.name}</Text>
        </Pressable>
      )}

      <View style={styles.footer}>
        <Pressable onPress={props.onDelete} style={[styles.delete, { backgroundColor: 'rgba(224,86,86,0.12)' }]}>
          <Text style={[styles.deleteLabel, { color: theme.destructive }]}>Delete</Text>
        </Pressable>
        <Pressable onPress={props.onDone} style={[styles.done, { backgroundColor: theme.surface2 }]}>
          <Text style={[styles.doneLabel, { color: theme.text }]}>Done</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  input: { borderRadius: 14, paddingHorizontal: 15, paddingVertical: 14, fontSize: 15, fontWeight: '600' },
  kicker: { marginTop: 16, marginBottom: 8, fontSize: 11, fontWeight: '500', letterSpacing: 0.66, textTransform: 'uppercase' },

  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepperLabel: { flex: 1, fontSize: 12.5, fontWeight: '600' },
  stepperBtn: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  stepperSign: { fontSize: 16, fontWeight: '600' },
  stepperValue: { minWidth: 86, textAlign: 'center', fontSize: 15, fontWeight: '600', fontFamily: MONO, fontVariant: ['tabular-nums'] },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 9, borderRadius: RADIUS.chip },
  dot: { width: 8, height: 8, borderRadius: 2.5 },
  chipLabel: { fontSize: 12.5, fontWeight: '600' },

  primary: { marginTop: 16, height: 48, borderRadius: RADIUS.control, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  primaryLabel: { fontSize: 14, fontWeight: '700' },
  triangle: {
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderTopWidth: 5,
    borderBottomWidth: 5,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
  },

  footer: { marginTop: 8, flexDirection: 'row', gap: 8 },
  delete: { paddingHorizontal: 18, height: 44, borderRadius: RADIUS.control, alignItems: 'center', justifyContent: 'center' },
  deleteLabel: { fontSize: 13, fontWeight: '600' },
  done: { flex: 1, height: 44, borderRadius: RADIUS.control, alignItems: 'center', justifyContent: 'center' },
  doneLabel: { fontSize: 13.5, fontWeight: '700' },
});
