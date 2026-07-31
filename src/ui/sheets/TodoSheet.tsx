import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { Category, Todo } from '../../db/schema';
import { DOW, shiftLocalDate, localMidnightMs } from '../format';
import { RADIUS } from '../theme';
import type { Theme } from '../theme';

/**
 * Editar un to-do. Va dentro de <Sheet>, igual que EntryEditSheet: el Sheet
 * pone el fondo, las esquinas, el scrim y la animación.
 *
 * El texto se guarda al terminar de editar (onEndEditing / blur), no en cada
 * tecla: una escritura por letra en SQLite no aporta nada.
 */
export function TodoSheet(props: {
  todo: Todo;
  categories: Category[];
  today: string;
  theme: Theme;
  canStartTimer: boolean;
  onChangeText: (text: string) => void;
  onChangeCategory: (categoryId: string | null) => void;
  onChangeDueDate: (dueDate: string) => void;
  onStartTimer: () => void;
  onDelete: () => void;
  onDone: () => void;
}) {
  const { theme, todo, today } = props;
  const [text, setText] = useState(todo.text);
  useEffect(() => setText(todo.text), [todo.id, todo.text]);

  const commitText = () => {
    const value = text.trim();
    if (value && value !== todo.text) props.onChangeText(value);
    else if (!value) setText(todo.text);
  };

  const dates = [today, shiftLocalDate(today, 1), shiftLocalDate(today, 2)];
  const dayLabel = (date: string, i: number) =>
    i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : DOW[(new Date(localMidnightMs(date)).getUTCDay() + 6) % 7];

  const category = todo.categoryId ? props.categories.find((c) => c.id === todo.categoryId) : null;

  return (
    <View>
      <TextInput
        value={text}
        onChangeText={setText}
        onEndEditing={commitText}
        onBlur={commitText}
        returnKeyType="done"
        style={[styles.input, { backgroundColor: theme.surface2, color: theme.text }]}
      />

      <Text style={[styles.kicker, { color: theme.text3 }]}>CATEGORY</Text>
      <ScrollView style={{ maxHeight: 150 }} keyboardShouldPersistTaps="handled">
        <View style={styles.chips}>
          {props.categories
            .filter((c) => c.archived === 0)
            .map((c) => {
              const on = todo.categoryId === c.id;
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

      <Text style={[styles.kicker, { color: theme.text3 }]}>WHEN</Text>
      <View style={[styles.segment, { backgroundColor: theme.surface2 }]}>
        {dates.map((date, i) => {
          const on = todo.dueDate === date;
          return (
            <Pressable
              key={date}
              onPress={() => props.onChangeDueDate(date)}
              style={[styles.segmentItem, on && { backgroundColor: theme.text }]}
            >
              <Text style={[styles.segmentLabel, { color: on ? theme.bg : theme.text2 }]}>
                {dayLabel(date, i)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {props.canStartTimer && !!category && todo.done === 0 && (
        <Pressable onPress={props.onStartTimer} style={[styles.primary, { backgroundColor: theme.text }]}>
          <View style={[styles.triangle, { borderLeftColor: theme.bg }]} />
          <Text style={[styles.primaryLabel, { color: theme.bg }]}>
            Start tracking {category.name}
          </Text>
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
  kicker: { marginTop: 18, marginBottom: 8, fontSize: 11, fontWeight: '500', letterSpacing: 0.66, textTransform: 'uppercase' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 9, borderRadius: RADIUS.chip },
  dot: { width: 8, height: 8, borderRadius: 2.5 },
  chipLabel: { fontSize: 12.5, fontWeight: '600' },

  segment: { flexDirection: 'row', gap: 3, padding: 3, borderRadius: RADIUS.chip },
  segmentItem: { flex: 1, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  segmentLabel: { fontSize: 12.5, fontWeight: '600' },

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
