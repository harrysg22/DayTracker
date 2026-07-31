import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { Category, PlanEvent } from '../../db/schema';
import { DOW, MONTHS, fmt12, fmtDuration, fmtShortDate, localMidnightMs, shiftLocalDate } from '../format';
import { MONO, RADIUS } from '../theme';
import type { Theme } from '../theme';

export type CalendarMode = 'day' | 'week' | 'month';

const COLUMN_WIDTH = 118;
const COLUMN_GAP = 8;
const DOW_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** `9:30a` — la agenda es densa, el sufijo largo no cabe. */
function shortTime(minute: number): string {
  return fmt12(minute).replace(' AM', 'a').replace(' PM', 'p');
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function dateString(y: number, m: number, d: number): string {
  return `${y}-${pad2(m + 1)}-${pad2(d)}`;
}

function mondayOf(localDate: string): string {
  const dow = (new Date(localMidnightMs(localDate)).getUTCDay() + 6) % 7;
  return shiftLocalDate(localDate, -dow);
}

function monthMeta(localDate: string) {
  const d = new Date(localMidnightMs(localDate));
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();
  const lead = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return { year, month, lead, days };
}

function stepMonth(localDate: string, delta: number): string {
  const { year, month } = monthMeta(localDate);
  const day = new Date(localMidnightMs(localDate)).getUTCDate();
  const lastOfTarget = new Date(Date.UTC(year, month + delta + 1, 0)).getUTCDate();
  const target = new Date(Date.UTC(year, month + delta, Math.min(day, lastOfTarget)));
  return dateString(target.getUTCFullYear(), target.getUTCMonth(), target.getUTCDate());
}

/**
 * Calendar. Un solo selector con tres vistas sobre los mismos datos:
 *
 *   Day   — tira de la semana + agenda del día elegido.
 *   Week  — siete columnas, los eventos apilados bajo cada día.
 *   Month — rejilla del mes + la misma agenda debajo.
 *
 * Los eventos son intenciones (fecha + minuto de pared, pueden solaparse); la
 * pestaña Day de la app sigue siendo la verdad de lo que pasó. El ▸ de los
 * eventos de hoy es el puente entre lo uno y lo otro.
 */
export function CalendarScreen(props: {
  mode: CalendarMode;
  onChangeMode: (mode: CalendarMode) => void;
  /** Día seleccionado, 'YYYY-MM-DD'. Manda en las tres vistas. */
  selectedDate: string;
  onSelectDate: (localDate: string) => void;
  today: string;
  /** Eventos de un rango que cubra la semana y el mes visibles. */
  events: PlanEvent[];
  categoriesById: Record<string, Category>;
  /** Para los chips del formulario: solo activas. */
  categories: Category[];
  theme: Theme;
  canStartTimer: boolean;
  /** Minutos transcurridos hoy — atenúa lo que ya pasó. */
  nowMinute: number;
  onOpenEvent: (event: PlanEvent) => void;
  onStartTimer: (event: PlanEvent) => void;
  onCreate: (input: {
    title: string;
    localDate: string;
    startMinute: number;
    durationMinutes: number;
    categoryId: string | null;
  }) => void;
  /** Para avisar "ponle nombre primero" sin inventar un toast propio. */
  onWarn: (message: string) => void;
}) {
  const { theme, today, selectedDate } = props;
  const columnsRef = useRef<ScrollView | null>(null);

  // ── formulario ────────────────────────────────────────────────────────────
  const [title, setTitle] = useState('');
  const [draftDate, setDraftDate] = useState(selectedDate);
  const [startMinute, setStartMinute] = useState(9 * 60);
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [draftCategoryId, setDraftCategoryId] = useState<string | null>(null);

  // El formulario sigue al día elegido: elegir un día y escribir es un gesto.
  useEffect(() => setDraftDate(selectedDate), [selectedDate]);

  const weekStart = mondayOf(selectedDate);
  const weekDates = [0, 1, 2, 3, 4, 5, 6].map((i) => shiftLocalDate(weekStart, i));

  useEffect(() => {
    if (props.mode !== 'week') return;
    const index = Math.max(0, weekDates.indexOf(selectedDate));
    const x = Math.max(0, index * (COLUMN_WIDTH + COLUMN_GAP) - 8);
    const id = setTimeout(() => columnsRef.current?.scrollTo({ x, animated: false }), 0);
    return () => clearTimeout(id);
    // weekStart, no weekDates: el array se recrea en cada render y haría que el
    // scroll pelease con el dedo del usuario.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.mode, selectedDate, weekStart]);

  const byDate: Record<string, PlanEvent[]> = {};
  for (const e of props.events) {
    (byDate[e.localDate] ??= []).push(e);
  }
  for (const key of Object.keys(byDate)) byDate[key].sort((a, b) => a.startMinute - b.startMinute);

  const dayEvents = byDate[selectedDate] ?? [];
  const colorOf = (e: PlanEvent) =>
    (e.categoryId ? props.categoriesById[e.categoryId]?.color : null) ?? theme.text3;
  const labelOf = (e: PlanEvent) => {
    const c = e.categoryId ? props.categoriesById[e.categoryId] : null;
    if (!c) return 'No category';
    const parent = c.parentId ? props.categoriesById[c.parentId] : null;
    return parent ? parent.name + ' › ' + c.name : c.name;
  };

  const dots = (date: string, selected: boolean) =>
    (byDate[date] ?? []).slice(0, 3).map((e, i) => (
      <View
        key={i}
        style={{
          width: 4,
          height: 4,
          borderRadius: 2,
          backgroundColor: selected ? theme.bg : colorOf(e),
          opacity: selected ? 0.8 : 1,
        }}
      />
    ));

  const save = () => {
    const value = title.trim();
    if (!value) {
      props.onWarn('Give the event a name first');
      return;
    }
    props.onCreate({
      title: value,
      localDate: draftDate,
      startMinute,
      durationMinutes,
      categoryId: draftCategoryId,
    });
    // La hora se queda: apuntar tres cosas a la misma hora es lo normal.
    setTitle('');
    setDraftCategoryId(null);
    props.onSelectDate(draftDate);
  };

  const selectedTitle =
    selectedDate === today
      ? 'Today'
      : selectedDate === shiftLocalDate(today, 1)
      ? 'Tomorrow'
      : selectedDate === shiftLocalDate(today, -1)
      ? 'Yesterday'
      : DOW_LONG[(new Date(localMidnightMs(selectedDate)).getUTCDay() + 6) % 7];

  const activeCategories = props.categories.filter((c) => c.archived === 0);
  const month = monthMeta(selectedDate);

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Text style={[styles.screenTitle, { color: theme.text }]}>Calendar</Text>
          <View style={[styles.segment, { backgroundColor: theme.surface }]}>
            {(['day', 'week', 'month'] as CalendarMode[]).map((m) => {
              const on = props.mode === m;
              return (
                <Pressable
                  key={m}
                  onPress={() => props.onChangeMode(m)}
                  style={[styles.segmentItem, on && { backgroundColor: theme.text }]}
                >
                  <Text style={[styles.segmentLabel, { color: on ? theme.bg : theme.text2 }]}>
                    {m === 'day' ? 'Day' : m === 'week' ? 'Week' : 'Month'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {props.mode === 'day' && (
          <View style={styles.strip}>
            {weekDates.map((date, i) => {
              const on = date === selectedDate;
              const isToday = date === today;
              return (
                <Pressable
                  key={date}
                  onPress={() => props.onSelectDate(date)}
                  style={[styles.stripCell, { backgroundColor: on ? theme.text : theme.surface }]}
                >
                  <Text
                    style={[
                      styles.stripDow,
                      { color: on ? theme.bg : isToday ? theme.text : theme.text3, opacity: on ? 0.7 : 1 },
                    ]}
                  >
                    {DOW[i][0]}
                  </Text>
                  <Text
                    style={[styles.stripNum, { color: on ? theme.bg : isToday ? theme.text : theme.text2 }]}
                  >
                    {new Date(localMidnightMs(date)).getUTCDate()}
                  </Text>
                  <View style={styles.dotRow}>{dots(date, on)}</View>
                </Pressable>
              );
            })}
          </View>
        )}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 16 }}
        keyboardShouldPersistTaps="handled"
      >
        {props.mode === 'month' && (
          <View style={[styles.monthCard, { backgroundColor: theme.surface }]}>
            <View style={styles.monthHead}>
              <Pressable
                onPress={() => props.onSelectDate(stepMonth(selectedDate, -1))}
                style={[styles.monthNav, { backgroundColor: theme.surface2 }]}
              >
                <Text style={[styles.monthNavLabel, { color: theme.text2 }]}>‹</Text>
              </Pressable>
              <Text style={[styles.monthLabel, { color: theme.text }]}>
                {MONTHS[month.month]} {month.year}
              </Text>
              <Pressable
                onPress={() => props.onSelectDate(stepMonth(selectedDate, 1))}
                style={[styles.monthNav, { backgroundColor: theme.surface2 }]}
              >
                <Text style={[styles.monthNavLabel, { color: theme.text2 }]}>›</Text>
              </Pressable>
            </View>

            <View style={styles.monthGrid}>
              {DOW.map((d) => (
                <View key={d} style={styles.monthCell}>
                  <Text style={[styles.monthDow, { color: theme.text3 }]}>{d[0]}</Text>
                </View>
              ))}
              {Array.from({ length: Math.ceil((month.lead + month.days) / 7) * 7 }).map((_, i) => {
                const dayNumber = i - month.lead + 1;
                if (dayNumber < 1 || dayNumber > month.days) {
                  return <View key={`blank-${i}`} style={styles.monthCell} />;
                }
                const date = dateString(month.year, month.month, dayNumber);
                const on = date === selectedDate;
                const isToday = date === today;
                return (
                  <Pressable
                    key={date}
                    onPress={() => props.onSelectDate(date)}
                    style={[
                      styles.monthCell,
                      styles.monthCellActive,
                      on
                        ? { backgroundColor: theme.text }
                        : isToday
                        ? { backgroundColor: theme.surface2 }
                        : null,
                    ]}
                  >
                    <Text
                      style={[
                        styles.monthNum,
                        { color: on ? theme.bg : isToday ? theme.text : theme.text2 },
                      ]}
                    >
                      {dayNumber}
                    </Text>
                    <View style={styles.dotRow}>{dots(date, on)}</View>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        {props.mode === 'week' && (
          <ScrollView
            ref={columnsRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            snapToInterval={COLUMN_WIDTH + COLUMN_GAP}
            decelerationRate="fast"
            style={styles.columnsScroll}
            contentContainerStyle={{ gap: COLUMN_GAP, paddingBottom: 10 }}
          >
            {weekDates.map((date, i) => {
              const on = date === selectedDate;
              const isToday = date === today;
              const list = byDate[date] ?? [];
              return (
                <View key={date} style={{ width: COLUMN_WIDTH }}>
                  <Pressable
                    onPress={() => props.onSelectDate(date)}
                    style={[styles.columnHead, { backgroundColor: on ? theme.text : theme.surface }]}
                  >
                    <Text
                      style={[
                        styles.columnDow,
                        { color: on ? theme.bg : isToday ? theme.text : theme.text3, opacity: on ? 0.7 : 1 },
                      ]}
                    >
                      {DOW[i].toUpperCase()}
                    </Text>
                    <Text
                      style={[styles.columnNum, { color: on ? theme.bg : isToday ? theme.text : theme.text2 }]}
                    >
                      {new Date(localMidnightMs(date)).getUTCDate()}
                    </Text>
                  </Pressable>

                  <View style={{ gap: 6, marginTop: 8 }}>
                    {list.map((e) => (
                      <Pressable
                        key={e.id}
                        onPress={() => props.onOpenEvent(e)}
                        style={[
                          styles.chip,
                          { backgroundColor: theme.surface, borderLeftColor: colorOf(e) },
                        ]}
                      >
                        <Text style={[styles.chipTime, { color: theme.text3 }]}>
                          {shortTime(e.startMinute)}
                        </Text>
                        <Text style={[styles.chipTitle, { color: theme.text }]}>{e.title}</Text>
                      </Pressable>
                    ))}
                    {list.length === 0 && (
                      <Text style={[styles.columnEmpty, { color: theme.text3 }]}>—</Text>
                    )}
                    <Pressable
                      onPress={() => {
                        props.onSelectDate(date);
                        setDraftDate(date);
                      }}
                      style={[styles.columnAdd, { backgroundColor: theme.surface }]}
                    >
                      <Text style={[styles.columnAddLabel, { color: theme.text3 }]}>+</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </ScrollView>
        )}

        {props.mode !== 'week' && (
          <>
            <View style={styles.agendaHead}>
              <Text style={[styles.agendaTitle, { color: theme.text }]}>{selectedTitle}</Text>
              <Text style={[styles.agendaMeta, { color: theme.text3 }]}>
                {fmtShortDate(selectedDate)} · {dayEvents.length}{' '}
                {dayEvents.length === 1 ? 'event' : 'events'}
              </Text>
            </View>

            {dayEvents.length > 0 ? (
              <View style={[styles.card, { backgroundColor: theme.surface }]}>
                {dayEvents.map((e, i) => {
                  const past =
                    selectedDate < today ||
                    (selectedDate === today && e.startMinute + e.durationMinutes < props.nowMinute);
                  const dim = past ? 0.5 : 1;
                  return (
                    <Pressable
                      key={e.id}
                      onPress={() => props.onOpenEvent(e)}
                      style={[
                        styles.eventRow,
                        i < dayEvents.length - 1 && {
                          borderBottomColor: theme.line,
                          borderBottomWidth: StyleSheet.hairlineWidth,
                        },
                      ]}
                    >
                      <View style={{ width: 50 }}>
                        <Text style={[styles.eventStart, { color: theme.text, opacity: dim }]}>
                          {shortTime(e.startMinute)}
                        </Text>
                        <Text style={[styles.eventEnd, { color: theme.text3 }]}>
                          {shortTime(e.startMinute + e.durationMinutes)}
                        </Text>
                      </View>
                      <View style={[styles.rule, { backgroundColor: colorOf(e), opacity: dim }]} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={[styles.eventTitle, { color: theme.text, opacity: dim }]}>
                          {e.title}
                        </Text>
                        <Text numberOfLines={1} style={[styles.eventSub, { color: theme.text3 }]}>
                          {labelOf(e)} · {fmtDuration(e.durationMinutes)}
                        </Text>
                      </View>
                      {selectedDate === today && !!e.categoryId && props.canStartTimer && (
                        <Pressable
                          onPress={() => props.onStartTimer(e)}
                          hitSlop={6}
                          style={[styles.play, { backgroundColor: theme.surface2 }]}
                        >
                          <View style={[styles.triangle, { borderLeftColor: theme.text2 }]} />
                        </Pressable>
                      )}
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <View style={[styles.empty, { backgroundColor: theme.surface }]}>
                <Text style={[styles.emptyTitle, { color: theme.text2 }]}>Nothing planned</Text>
                <Text style={[styles.emptySub, { color: theme.text3 }]}>
                  Add the first event below — it lands in order by time.
                </Text>
              </View>
            )}
          </>
        )}

        {/* ── New event ───────────────────────────────────────────────────── */}
        <View style={[styles.composer, { backgroundColor: theme.surface }]}>
          <Text style={[styles.kicker, { color: theme.text3 }]}>NEW EVENT</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            onSubmitEditing={save}
            returnKeyType="done"
            placeholder="Cena con Ana"
            placeholderTextColor={theme.text3}
            style={[styles.composerInput, { backgroundColor: theme.surface2, color: theme.text }]}
          />

          <View style={[styles.dayChips, { backgroundColor: theme.surface2 }]}>
            {weekDates.map((date, i) => {
              const on = date === draftDate;
              return (
                <Pressable
                  key={date}
                  onPress={() => setDraftDate(date)}
                  style={[styles.dayChip, on && { backgroundColor: theme.text }]}
                >
                  <Text style={[styles.dayChipLabel, { color: on ? theme.bg : theme.text2 }]}>
                    {DOW[i][0]}
                    {new Date(localMidnightMs(date)).getUTCDate()}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {[
            {
              label: 'Starts',
              value: fmt12(startMinute),
              down: () => setStartMinute((v) => Math.max(0, v - 15)),
              up: () => setStartMinute((v) => Math.min(1425, v + 15)),
            },
            {
              label: 'Lasts',
              value: fmtDuration(durationMinutes),
              down: () => setDurationMinutes((v) => Math.max(15, v - 15)),
              up: () => setDurationMinutes((v) => Math.min(720, v + 15)),
            },
          ].map((s) => (
            <View key={s.label} style={styles.stepperRow}>
              <Text style={[styles.stepperLabel, { color: theme.text2 }]}>{s.label}</Text>
              <Pressable onPress={s.down} hitSlop={4} style={[styles.stepperBtn, { backgroundColor: theme.surface2 }]}>
                <Text style={[styles.stepperSign, { color: theme.text }]}>−</Text>
              </Pressable>
              <Text style={[styles.stepperValue, { color: theme.text }]}>{s.value}</Text>
              <Pressable onPress={s.up} hitSlop={4} style={[styles.stepperBtn, { backgroundColor: theme.surface2 }]}>
                <Text style={[styles.stepperSign, { color: theme.text }]}>+</Text>
              </Pressable>
            </View>
          ))}

          <View style={styles.catChips}>
            {activeCategories.map((c) => {
              const on = draftCategoryId === c.id;
              return (
                <Pressable
                  key={c.id}
                  onPress={() => setDraftCategoryId(on ? null : c.id)}
                  style={[styles.catChip, { backgroundColor: on ? theme.text : theme.surface2 }]}
                >
                  <View style={[styles.catDot, { backgroundColor: c.color }]} />
                  <Text style={[styles.catLabel, { color: on ? theme.bg : theme.text2 }]}>{c.name}</Text>
                </Pressable>
              );
            })}
          </View>

          <Pressable
            onPress={save}
            style={[
              styles.saveBtn,
              { backgroundColor: title.trim() ? theme.text : theme.surface2 },
            ]}
          >
            <Text style={[styles.saveLabel, { color: title.trim() ? theme.bg : theme.text3 }]}>
              {title.trim()
                ? `Save · ${DOW[(new Date(localMidnightMs(draftDate)).getUTCDay() + 6) % 7]} ${fmt12(startMinute)}`
                : 'Save event'}
            </Text>
          </Pressable>
        </View>

        <Text style={[styles.footnote, { color: theme.text3 }]}>
          Events are intentions; the Day tab keeps what actually happened. Tap ▸ on today’s events to
          track them for real.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingTop: 6, paddingBottom: 10 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  screenTitle: { fontSize: 24, fontWeight: '700', letterSpacing: -0.72 },
  segment: { flexDirection: 'row', gap: 3, padding: 3, borderRadius: 11 },
  segmentItem: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 9 },
  segmentLabel: { fontSize: 12, fontWeight: '600' },

  strip: { marginTop: 12, flexDirection: 'row', gap: 5 },
  stripCell: { flex: 1, minWidth: 0, paddingTop: 8, paddingBottom: 7, borderRadius: 14, alignItems: 'center', gap: 5 },
  stripDow: { fontSize: 9.5, fontWeight: '600', letterSpacing: 0.4 },
  stripNum: { fontSize: 14, fontWeight: '600', fontFamily: MONO, fontVariant: ['tabular-nums'] },
  dotRow: { flexDirection: 'row', gap: 2, height: 4, alignItems: 'center', justifyContent: 'center' },

  monthCard: { borderRadius: RADIUS.card, paddingHorizontal: 14, paddingTop: 14, paddingBottom: 10, marginBottom: 18 },
  monthHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  monthNav: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  monthNavLabel: { fontSize: 14, fontWeight: '600' },
  monthLabel: { flex: 1, textAlign: 'center', fontSize: 13.5, fontWeight: '600' },
  monthGrid: { marginTop: 12, flexDirection: 'row', flexWrap: 'wrap' },
  monthCell: { width: `${100 / 7}%`, paddingTop: 6, paddingBottom: 4, alignItems: 'center', gap: 4 },
  monthCellActive: { borderRadius: 10 },
  monthDow: { fontSize: 9.5, fontWeight: '600', letterSpacing: 0.4 },
  monthNum: { fontSize: 12.5, fontWeight: '600', fontFamily: MONO, fontVariant: ['tabular-nums'] },

  columnsScroll: { marginHorizontal: -20, paddingHorizontal: 20, marginBottom: 4 },
  columnHead: { paddingTop: 9, paddingBottom: 8, borderRadius: 14, alignItems: 'center', gap: 3 },
  columnDow: { fontSize: 9.5, fontWeight: '600', letterSpacing: 0.5 },
  columnNum: { fontSize: 15, fontWeight: '600', fontFamily: MONO, fontVariant: ['tabular-nums'] },
  chip: { paddingHorizontal: 10, paddingVertical: 9, borderRadius: 13, borderLeftWidth: 3 },
  chipTime: { fontSize: 10, fontWeight: '600', fontFamily: MONO, fontVariant: ['tabular-nums'] },
  chipTitle: { marginTop: 4, fontSize: 11.5, fontWeight: '600', lineHeight: 14 },
  columnEmpty: { paddingVertical: 14, textAlign: 'center', fontSize: 10.5 },
  columnAdd: { height: 28, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  columnAddLabel: { fontSize: 13, fontWeight: '600' },

  agendaHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 4, paddingBottom: 9 },
  agendaTitle: { fontSize: 15.5, fontWeight: '700', letterSpacing: -0.31 },
  agendaMeta: { fontSize: 11, fontWeight: '500', fontFamily: MONO, fontVariant: ['tabular-nums'] },

  card: { borderRadius: RADIUS.card, paddingHorizontal: 16 },
  eventRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 11, paddingVertical: 13 },
  eventStart: { fontSize: 12, fontWeight: '600', fontFamily: MONO, fontVariant: ['tabular-nums'] },
  eventEnd: { marginTop: 3, fontSize: 10, fontWeight: '500', fontFamily: MONO, fontVariant: ['tabular-nums'] },
  rule: { width: 3, borderRadius: 2, alignSelf: 'stretch', minHeight: 30 },
  eventTitle: { fontSize: 13.5, fontWeight: '600', lineHeight: 18 },
  eventSub: { marginTop: 3, fontSize: 10.5, fontWeight: '500', fontFamily: MONO },

  empty: { borderRadius: RADIUS.card, paddingVertical: 22, paddingHorizontal: 18, alignItems: 'center' },
  emptyTitle: { fontSize: 13, fontWeight: '600' },
  emptySub: { marginTop: 5, fontSize: 11.5, lineHeight: 16, textAlign: 'center' },

  composer: { marginTop: 20, borderRadius: RADIUS.card, padding: 16 },
  kicker: { fontSize: 11, fontWeight: '500', letterSpacing: 0.66, textTransform: 'uppercase' },
  composerInput: { marginTop: 11, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13, fontSize: 14, fontWeight: '600' },
  dayChips: { marginTop: 10, flexDirection: 'row', gap: 3, padding: 3, borderRadius: RADIUS.chip },
  dayChip: { flex: 1, minWidth: 0, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  dayChipLabel: { fontSize: 10.5, fontWeight: '600', fontFamily: MONO, fontVariant: ['tabular-nums'] },

  stepperRow: { marginTop: 7, flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepperLabel: { flex: 1, fontSize: 12.5, fontWeight: '600' },
  stepperBtn: { width: 32, height: 32, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  stepperSign: { fontSize: 16, fontWeight: '600' },
  stepperValue: { minWidth: 80, textAlign: 'center', fontSize: 14, fontWeight: '600', fontFamily: MONO, fontVariant: ['tabular-nums'] },

  catChips: { marginTop: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  catChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 9, borderRadius: RADIUS.chip },
  catDot: { width: 8, height: 8, borderRadius: 2.5 },
  catLabel: { fontSize: 12.5, fontWeight: '600' },

  saveBtn: { marginTop: 14, height: 48, borderRadius: RADIUS.control, alignItems: 'center', justifyContent: 'center' },
  saveLabel: { fontSize: 14, fontWeight: '700' },

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

  footnote: { marginTop: 14, marginHorizontal: 4, fontSize: 11, lineHeight: 16 },
});
