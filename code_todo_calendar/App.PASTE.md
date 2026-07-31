# App.tsx — los 6 cambios exactos

Tu `App.tsx` ya tiene la forma correcta (estado arriba, pantallas
presentacionales, `run()` para cada escritura). Esto se **añade**; nada se borra.

---

## 1) Imports

```tsx
// reemplaza tu import de ./src/db por este:
import {
  dataLayer,
  ensureDbReady,
  eventLayer,
  exportBackup,
  exportCSV,
  restoreBackup,
  todoLayer,
} from './src/db';
import type { Category, Entry, PlanEvent, Todo } from './src/db/schema';

// añade estos:
import { CalendarScreen } from './src/ui/screens/CalendarScreen';
import type { CalendarMode } from './src/ui/screens/CalendarScreen';
import { TodoScreen } from './src/ui/screens/TodoScreen';
import { EventSheet } from './src/ui/sheets/EventSheet';
import { TodoSheet } from './src/ui/sheets/TodoSheet';

// añade useEvents y useTodos a tu import de './src/ui/hooks'
// añade shiftLocalDate a tu import de './src/ui/format'
```

## 2) SheetKind y estado

```tsx
type SheetKind = null | 'picker' | 'entry' | 'long' | 'date' | 'category' | 'todo' | 'event';
```

Dentro de `App()`, junto a los demás `useState`:

```tsx
const [calMode, setCalMode] = useState<CalendarMode>('day');
const [calDate, setCalDate] = useState(() => todayLocalDate());
const [showDoneTodos, setShowDoneTodos] = useState(false);
const [todoId, setTodoId] = useState<string | null>(null);
const [eventId, setEventId] = useState<string | null>(null);
```

Y en el `closeSheet` que ya existe, limpia los dos ids:

```tsx
const closeSheet = useCallback(() => {
  setSheet(null);
  setDraggingEntryId(null);
  setTodoId(null);
  setEventId(null);
}, []);
```

## 3) Datos

Después de `const timer = useActiveTimer(revision, dbReady);`:

```tsx
// Medio año atrás cubre cualquier vencido; la tabla es pequeña y va indexada.
const todos = useTodos(shiftLocalDate(today, -180), shiftLocalDate(today, 2), revision, dbReady);
// ±45 días cubre la semana y el mes visibles sin recargar al navegar.
const events = useEvents(shiftLocalDate(calDate, -45), shiftLocalDate(calDate, 45), revision, dbReady);

const editTodo: Todo | null = useMemo(
  () => (todoId ? todos.find((t) => t.id === todoId) ?? null : null),
  [todoId, todos]
);
const editEvent: PlanEvent | null = useMemo(
  () => (eventId ? events.find((e) => e.id === eventId) ?? null : null),
  [eventId, events]
);

/** Minutos transcurridos hoy — la agenda atenúa lo que ya pasó. */
const nowMinute = minutesIntoLocalDay(nowMs, tzOffsetMin, today);

/**
 * El puente entre planear y registrar: arranca el timer con la categoría del
 * ítem y su texto como nota. El ítem no se modifica — terminar un timer no
 * marca la tarea, eso es decisión de producto y hoy son independientes.
 */
const startFromItem = useCallback(
  (categoryId: string, note: string) => {
    closeSheet();
    setTab('day');
    setLocalDate(today);
    void run(async () => {
      const started = await dataLayer.startTimer(categoryId);
      if (started?.id) await dataLayer.updateEntry(started.id, { note });
    }, 'Started ' + (byId[categoryId]?.name ?? '') + ' · ' + note);
  },
  [byId, closeSheet, run, today]
);
```

## 4) Las dos pantallas

Dentro del `<View style={{ flex: 1 }}>`, junto a los otros `tab === …`:

```tsx
{tab === 'todo' && (
  <TodoScreen
    todos={todos}
    today={today}
    categoriesById={byId}
    theme={theme}
    showDone={showDoneTodos}
    canStartTimer={!timer}
    onToggleShowDone={() => setShowDoneTodos((v) => !v)}
    onToggleDone={(todo) =>
      void run(() => todoLayer.toggleDone(todo.id, todo.done === 0, today))
    }
    onOpenTodo={(todo) => {
      setTodoId(todo.id);
      setSheet('todo');
    }}
    onCreate={(text, dueDate) => void run(() => todoLayer.create({ text, dueDate }))}
    onStartTimer={(todo) => todo.categoryId && startFromItem(todo.categoryId, todo.text)}
  />
)}

{tab === 'week' && (
  <CalendarScreen
    mode={calMode}
    onChangeMode={setCalMode}
    selectedDate={calDate}
    onSelectDate={setCalDate}
    today={today}
    events={events}
    categoriesById={byId}
    categories={categories}
    theme={theme}
    canStartTimer={!timer}
    nowMinute={nowMinute}
    onOpenEvent={(event) => {
      setEventId(event.id);
      setSheet('event');
    }}
    onStartTimer={(event) => event.categoryId && startFromItem(event.categoryId, event.title)}
    onCreate={(input) =>
      void run(
        () => eventLayer.create(input),
        'Saved · ' + fmtShortDate(input.localDate) + ' ' + fmt12(input.startMinute)
      )
    }
    onWarn={(message) => showToast(message)}
  />
)}
```

> `fmtShortDate` y `fmt12` vienen de `./src/ui/format` — añádelos al import si no
> los tienes ya.

## 5) Los dos sheets

Junto a los demás `<Sheet …>`, al final del árbol:

```tsx
<Sheet visible={sheet === 'todo' && !!editTodo} onClose={closeSheet} theme={theme}>
  {editTodo && (
    <TodoSheet
      todo={editTodo}
      categories={categories}
      today={today}
      theme={theme}
      canStartTimer={!timer}
      onChangeText={(text) => void run(() => todoLayer.update(editTodo.id, { text }))}
      onChangeCategory={(categoryId) => void run(() => todoLayer.update(editTodo.id, { categoryId }))}
      onChangeDueDate={(dueDate) => void run(() => todoLayer.update(editTodo.id, { dueDate }))}
      onStartTimer={() => editTodo.categoryId && startFromItem(editTodo.categoryId, editTodo.text)}
      onDelete={() => {
        closeSheet();
        void run(() => todoLayer.softDelete(editTodo.id), 'Removed');
      }}
      onDone={closeSheet}
    />
  )}
</Sheet>

<Sheet visible={sheet === 'event' && !!editEvent} onClose={closeSheet} theme={theme}>
  {editEvent && (
    <EventSheet
      event={editEvent}
      categories={categories}
      theme={theme}
      canStartTimer={!timer}
      onChangeTitle={(title) => void run(() => eventLayer.update(editEvent.id, { title }))}
      onNudge={(field, delta) =>
        void run(() =>
          eventLayer.update(
            editEvent.id,
            field === 'start'
              ? { startMinute: editEvent.startMinute + delta }
              : { durationMinutes: editEvent.durationMinutes + delta }
          )
        )
      }
      onChangeCategory={(categoryId) => void run(() => eventLayer.update(editEvent.id, { categoryId }))}
      onStartTimer={() => editEvent.categoryId && startFromItem(editEvent.categoryId, editEvent.title)}
      onDelete={() => {
        closeSheet();
        void run(() => eventLayer.softDelete(editEvent.id), 'Event removed');
      }}
      onDone={closeSheet}
    />
  )}
</Sheet>
```

## 6) Borrar una categoría no debe borrar to-dos ni eventos

En los dos handlers de borrado de categoría (`onReassignAndDelete` y
`onDeleteWithEntries`) del `CategoryEditSheet`, añade la limpieza antes del
`deleteCategory`:

```tsx
void run(async () => {
  await todoLayer.clearCategory(draft.id!);
  await eventLayer.clearCategory(draft.id!);
  await categoryLayer.deleteCategory(draft.id!, { kind: 'cascade' }); // o reassign
}, draft.name + ' deleted');
```

Sin esto, `PRAGMA foreign_keys = ON` hace fallar el borrado en cuanto una tarea
apunte a esa categoría.
