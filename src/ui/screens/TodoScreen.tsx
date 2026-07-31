import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { Category, Todo } from '../../db/schema';
import { localMidnightMs, shiftLocalDate, fmtShortDate, dayOfWeekMon0 } from '../format';
import { MONO, RADIUS, inkOn } from '../theme';
import type { Theme } from '../theme';

const DOW_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/**
 * To-Do. Tres días y nada más: hoy, mañana y pasado mañana. Cualquier cosa más
 * lejana es un plan, no una tarea — y las tareas sin terminar de días pasados
 * suben a "Overdue" en vez de desaparecer.
 *
 * La pantalla es presentacional: recibe filas y devuelve intenciones. Toda
 * escritura la hace App.tsx a través de `todoLayer`.
 */
export function TodoScreen(props: {
  /** Todo lo relevante: vencidos + los tres días. Sin filtrar. */
  todos: Todo[];
  today: string;
  categoriesById: Record<string, Category>;
  theme: Theme;
  showDone: boolean;
  /** false mientras haya un timer corriendo: entonces no se ofrece ▸. */
  canStartTimer: boolean;
  onToggleShowDone: () => void;
  onToggleDone: (todo: Todo) => void;
  onOpenTodo: (todo: Todo) => void;
  onCreate: (text: string, dueDate: string) => void;
  onStartTimer: (todo: Todo) => void;
}) {
  const { theme, today } = props;
  // Qué sección tiene el input abierto (su dueDate), y qué se está escribiendo.
  const [addingDate, setAddingDate] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const doneCount = props.todos.filter((t) => t.done === 1).length;
  const overdue = props.todos
    .filter((t) => t.done === 0 && t.dueDate < today)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.sortOrder - b.sortOrder);

  const dates = [today, shiftLocalDate(today, 1), shiftLocalDate(today, 2)];

  const commit = (dueDate: string, keepOpen: boolean) => {
    const value = draft.trim();
    if (value) props.onCreate(value, dueDate);
    setDraft('');
    if (!keepOpen) setAddingDate(null);
  };

  const label = (categoryId: string | null): string => {
    if (!categoryId) return 'no category';
    const c = props.categoriesById[categoryId];
    if (!c) return 'no category';
    const parent = c.parentId ? props.categoriesById[c.parentId] : null;
    return parent ? parent.name + ' › ' + c.name : c.name;
  };

  const daysLate = (dueDate: string): number =>
    Math.round((localMidnightMs(today) - localMidnightMs(dueDate)) / 86_400_000);

  const renderRow = (todo: Todo, isLast: boolean) => {
    const category = todo.categoryId ? props.categoriesById[todo.categoryId] : null;
    const late = todo.dueDate < today && todo.done === 0;
    const dotColor = category?.color ?? theme.text3;
    const n = daysLate(todo.dueDate);
    const meta =
      label(todo.categoryId) + (late ? (n === 1 ? ' · from yesterday' : ` · ${n}d late`) : '');
    return (
      <View
        key={todo.id}
        style={[
          styles.row,
          !isLast && { borderBottomColor: theme.line, borderBottomWidth: StyleSheet.hairlineWidth },
        ]}
      >
        <Pressable
          onPress={() => props.onToggleDone(todo)}
          hitSlop={8}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: todo.done === 1 }}
          style={[
            styles.box,
            todo.done === 1
              ? { backgroundColor: category?.color ?? theme.text2 }
              : { borderWidth: 1.5, borderColor: dotColor },
          ]}
        >
          {todo.done === 1 && (
            <Text style={[styles.check, { color: category ? inkOn(category.color) : theme.bg }]}>✓</Text>
          )}
        </Pressable>

        <Pressable onPress={() => props.onOpenTodo(todo)} style={{ flex: 1, minWidth: 0 }}>
          <Text
            style={[
              styles.title,
              todo.done === 1
                ? { color: theme.text3, textDecorationLine: 'line-through' }
                : { color: theme.text },
            ]}
          >
            {todo.text}
          </Text>
          <View style={styles.metaRow}>
            <View style={[styles.metaDot, { backgroundColor: dotColor }]} />
            <Text numberOfLines={1} style={[styles.meta, { color: theme.text3 }]}>
              {meta}
            </Text>
          </View>
        </Pressable>

        {todo.done === 0 && !!category && props.canStartTimer && (
          <Pressable
            onPress={() => props.onStartTimer(todo)}
            hitSlop={6}
            accessibilityLabel={'Start tracking ' + category.name}
            style={[styles.play, { backgroundColor: theme.surface2 }]}
          >
            <View style={[styles.triangle, { borderLeftColor: theme.text2 }]} />
          </Pressable>
        )}
      </View>
    );
  };

  const renderSection = (
    key: string,
    title: string,
    titleColor: string,
    meta: string,
    rows: Todo[],
    dueDate: string | null
  ) => {
    const adding = dueDate !== null && addingDate === dueDate;
    return (
      <View key={key} style={{ marginBottom: 20 }}>
        <View style={styles.sectionHead}>
          <Text style={[styles.sectionTitle, { color: titleColor }]}>{title}</Text>
          <Text style={[styles.sectionMeta, { color: theme.text3 }]}>{meta}</Text>
        </View>
        <View style={[styles.card, { backgroundColor: theme.surface }]}>
          {rows.map((t, i) => renderRow(t, dueDate === null && i === rows.length - 1))}

          {adding && (
            <View style={styles.row}>
              <View style={[styles.box, { borderWidth: 1.5, borderStyle: 'dashed', borderColor: theme.text3 }]} />
              <TextInput
                autoFocus
                value={draft}
                onChangeText={setDraft}
                onSubmitEditing={() => commit(dueDate!, true)}
                onBlur={() => commit(dueDate!, false)}
                blurOnSubmit={false}
                returnKeyType="done"
                placeholder="What needs doing?"
                placeholderTextColor={theme.text3}
                style={[styles.input, { color: theme.text }]}
              />
            </View>
          )}

          {dueDate !== null && !adding && (
            <Pressable
              onPress={() => {
                setDraft('');
                setAddingDate(dueDate);
              }}
              style={styles.row}
            >
              <View style={[styles.box, { backgroundColor: theme.surface2 }]}>
                <Text style={[styles.plus, { color: theme.text2 }]}>+</Text>
              </View>
              <Text style={[styles.addLabel, { color: theme.text2 }]}>Add</Text>
            </Pressable>
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.header}>
        <Text style={[styles.screenTitle, { color: theme.text }]}>To-Do</Text>
        <Pressable
          onPress={props.onToggleShowDone}
          style={[styles.pill, { backgroundColor: props.showDone ? theme.text : theme.surface }]}
        >
          <Text style={[styles.pillLabel, { color: props.showDone ? theme.bg : theme.text2 }]}>
            {props.showDone ? 'Hide done' : doneCount > 0 ? `Show done · ${doneCount}` : 'Show done'}
          </Text>
        </Pressable>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 16 }}
        keyboardShouldPersistTaps="handled"
      >
        {overdue.length > 0 &&
          renderSection(
            'overdue',
            'Overdue',
            theme.warn,
            `${overdue.length} left undone`,
            overdue,
            null
          )}

        {dates.map((date, i) => {
          const all = props.todos.filter((t) => t.dueDate === date);
          const open = all.filter((t) => t.done === 0);
          const done = all.filter((t) => t.done === 1);
          const rows = props.showDone ? [...open, ...done] : open;
          const title = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : DOW_LONG[dayOfWeekMon0(date)];
          const meta =
            fmtShortDate(date) +
            ' · ' +
            (open.length > 0 ? `${open.length} left` : done.length > 0 ? 'all done' : 'nothing yet');
          return renderSection(date, title, theme.text, meta, rows, date);
        })}

        <Text style={[styles.footnote, { color: theme.text3 }]}>
          Three days out, on purpose — anything further is a plan, not a to-do. Unfinished items roll
          into Overdue.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 6,
    paddingBottom: 12,
  },
  screenTitle: { fontSize: 24, fontWeight: '700', letterSpacing: -0.72 },
  pill: { height: 32, paddingHorizontal: 13, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  pillLabel: { fontSize: 12, fontWeight: '600' },

  sectionHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 4, paddingBottom: 9 },
  sectionTitle: { fontSize: 15.5, fontWeight: '700', letterSpacing: -0.31 },
  sectionMeta: { fontSize: 11, fontWeight: '500', fontFamily: MONO, fontVariant: ['tabular-nums'] },

  card: { borderRadius: RADIUS.card, paddingHorizontal: 16 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 13 },
  box: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  check: { fontSize: 12, fontWeight: '700' },
  plus: { fontSize: 14, fontWeight: '600' },
  addLabel: { fontSize: 13, fontWeight: '600', paddingTop: 3 },
  title: { fontSize: 13.5, fontWeight: '600', lineHeight: 18 },
  metaRow: { marginTop: 4, flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaDot: { width: 7, height: 7, borderRadius: 2 },
  meta: { flex: 1, fontSize: 10.5, fontWeight: '500', fontFamily: MONO },
  input: { flex: 1, fontSize: 13.5, fontWeight: '600', padding: 0 },

  play: { width: 30, height: 30, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  triangle: {
    width: 0,
    height: 0,
    marginLeft: 2,
    borderLeftWidth: 7,
    borderTopWidth: 4.5,
    borderBottomWidth: 4.5,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
  },

  footnote: { marginTop: 2, marginHorizontal: 4, fontSize: 11, lineHeight: 16 },
});
