import { useCallback, useEffect, useMemo, useState } from 'react';
import { StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { dataLayer, ensureDbReady, exportBackup, exportCSV, restoreBackup } from './src/db';
import { OverlapError } from './src/db/errors';
import { currentDeviceTzOffsetMin } from './src/db/dateUtils';
import type { Category, Entry } from './src/db/schema';
import { Sheet } from './src/ui/components/Sheet';
import { TabBar } from './src/ui/components/TabBar';
import type { TabKey } from './src/ui/components/TabBar';
import { TimerBar } from './src/ui/components/TimerBar';
import { Toast } from './src/ui/components/Toast';
import {
  categoryLayer,
  categoryMap,
  qualifiedName,
  todayLocalDate,
  useActiveTimer,
  useCategories,
  useDay,
  useNow,
  useRange,
  useRevision,
  useToast,
} from './src/ui/hooks';
import { localMidnightMs, minutesIntoLocalDay, snapMs } from './src/ui/format';
import { periodStart } from './src/ui/insights';
import type { RangeKind } from './src/ui/insights';
import { DEFAULT_PREFS, loadPrefs, savePrefs } from './src/ui/prefs';
import type { Prefs } from './src/ui/prefs';
import { CategoriesScreen } from './src/ui/screens/CategoriesScreen';
import { DayScreen } from './src/ui/screens/DayScreen';
import { InsightsScreen } from './src/ui/screens/InsightsScreen';
import { CategoryEditSheet } from './src/ui/sheets/CategoryEditSheet';
import type { CategoryDraft } from './src/ui/sheets/CategoryEditSheet';
import { CategoryPickerSheet } from './src/ui/sheets/CategoryPickerSheet';
import { EntryEditSheet } from './src/ui/sheets/EntryEditSheet';
import { LongTimerSheet } from './src/ui/sheets/LongTimerSheet';
import { MonthJumpSheet } from './src/ui/sheets/MonthJumpSheet';
import { PALETTE, THEMES } from './src/ui/theme';

type SheetKind = null | 'picker' | 'entry' | 'long' | 'date' | 'category';

export default function App() {
  const [dbReady, setDbReady] = useState(false);
  const [dbError, setDbError] = useState<Error | null>(null);
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);

  const [tab, setTab] = useState<TabKey>('day');
  const [localDate, setLocalDate] = useState(() => todayLocalDate());
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [editEntryId, setEditEntryId] = useState<string | null>(null);
  const [draggingEntryId, setDraggingEntryId] = useState<string | null>(null);
  const [categoryDraft, setCategoryDraft] = useState<CategoryDraft | null>(null);
  const [eligibleParents, setEligibleParents] = useState<Category[]>([]);
  const [draftUsage, setDraftUsage] = useState({ entryCount: 0, totalMs: 0 });
  const [recentUse, setRecentUse] = useState<Record<string, number>>({});

  const { revision, invalidate } = useRevision();
  const { message: toastMessage, show: showToast } = useToast();
  const nowMs = useNow();
  const today = todayLocalDate();
  const tzOffsetMin = currentDeviceTzOffsetMin();

  useEffect(() => {
    ensureDbReady()
      .then(() => setDbReady(true))
      .catch(setDbError);
    loadPrefs().then(setPrefs);
  }, []);

  const updatePrefs = useCallback((patch: Partial<Prefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      void savePrefs(next);
      return next;
    });
  }, []);

  const theme = THEMES[prefs.theme];
  const categories = useCategories(revision, dbReady);
  const byId = useMemo(() => categoryMap(categories), [categories]);
  const { entries: dayEntries } = useDay(localDate, revision, dbReady);
  const timer = useActiveTimer(revision, dbReady);

  // Insights needs the current period plus the whole previous one.
  const insightsFrom = useMemo(
    () => periodStart(prefs.dashRange, today, 1),
    [prefs.dashRange, today]
  );
  const insightsEntries = useRange(insightsFrom, today, revision, dbReady);

  useEffect(() => {
    if (!dbReady) return;
    categoryLayer
      .rankByRecentUse(14)
      .then(setRecentUse)
      .catch((err) => console.warn('rankByRecentUse failed', err));
  }, [dbReady, revision]);

  /**
   * Every write goes through here. The data layer refuses to silently correct
   * an overlap (OverlapError) — the UI is what decides, and what tells the user.
   */
  const run = useCallback(
    async (action: () => Promise<unknown>, successMessage?: string) => {
      try {
        await action();
        invalidate();
        if (successMessage) showToast(successMessage);
      } catch (err) {
        if (err instanceof OverlapError) {
          showToast('That time overlaps another entry — adjust it first', 2400);
        } else {
          showToast((err as Error).message ?? 'Something went wrong', 2600);
        }
      }
    },
    [invalidate, showToast]
  );

  const editEntry: Entry | null = useMemo(() => {
    if (!editEntryId) return null;
    return dayEntries.find((e) => e.id === editEntryId) ?? (timer?.id === editEntryId ? timer : null);
  }, [editEntryId, dayEntries, timer]);

  const timerCategory = timer ? byId[timer.categoryId] ?? null : null;
  const elapsedMinutes = timer ? (nowMs - timer.startedAtMs) / 60_000 : 0;
  const overThreshold = !!timer && elapsedMinutes > prefs.thresholdHours * 60;
  const timerStartedMinute = timer
    ? minutesIntoLocalDay(timer.startedAtMs, timer.tzOffsetMin, timer.localDate)
    : 0;
  /**
   * Best guess for when they really stopped. A real implementation should use
   * the last app foreground time or a screen-unlock signal; this proxies it
   * with "90 minutes after the start", rounded to the 5-minute grid.
   */
  const guessMinute = Math.round((timerStartedMinute + 96) / 5) * 5;

  const closeSheet = useCallback(() => {
    setSheet(null);
    setDraggingEntryId(null);
  }, []);

  const openCategorySheet = useCallback(
    async (category: Category | null) => {
      const draft: CategoryDraft = category
        ? {
            id: category.id,
            name: category.name,
            color: category.color,
            parentId: category.parentId,
            archived: category.archived === 1,
          }
        : { id: null, name: '', color: PALETTE[4], parentId: null, archived: false };
      setCategoryDraft(draft);
      const [parents, usage] = await Promise.all([
        categoryLayer.eligibleParents(category?.id ?? null),
        category ? categoryLayer.usage(category.id) : Promise.resolve({ entryCount: 0, totalMs: 0 }),
      ]);
      setEligibleParents(parents);
      setDraftUsage(usage);
      setSheet('category');
    },
    []
  );

  const reassignTarget = useMemo(
    () => categories.find((c) => c.archived === 0 && c.id !== categoryDraft?.id) ?? null,
    [categories, categoryDraft?.id]
  );

  if (dbError) {
    return (
      <View style={[styles.center, { backgroundColor: theme.bg }]}>
        <Text style={{ color: theme.text }}>Error abriendo la base de datos: {dbError.message}</Text>
      </View>
    );
  }
  if (!dbReady) {
    return (
      <View style={[styles.center, { backgroundColor: theme.bg }]}>
        <Text style={{ color: theme.text2 }}>Abriendo base de datos…</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.bg }]}>
      <StatusBar barStyle={prefs.theme === 'dark' ? 'light-content' : 'dark-content'} />

      <View style={{ flex: 1 }}>
        {tab === 'day' && (
          <DayScreen
            localDate={localDate}
            today={today}
            entries={dayEntries}
            categoriesById={byId}
            nowMs={nowMs}
            tzOffsetMin={tzOffsetMin}
            theme={theme}
            draggingEntryId={draggingEntryId}
            longTimerNotice={
              overThreshold && timerCategory
                ? {
                    name: timerCategory.name,
                    elapsedMinutes,
                    startedMinute: timerStartedMinute,
                    thresholdHours: prefs.thresholdHours,
                  }
                : null
            }
            onOpenLongTimer={() => setSheet('long')}
            onChangeDay={setLocalDate}
            onOpenDatePicker={() => setSheet('date')}
            onAddEntry={() => {
              if (localDate > today) {
                showToast('Future days are read-only');
                return;
              }
              // Today: a 30-minute block ending about now. Past days: 9:00 AM.
              const base = snapMs(
                localDate === today
                  ? nowMs - 30 * 60_000
                  : localMidnightMs(localDate) + 540 * 60_000 + tzOffsetMin * 60_000
              );
              void run(async () => {
                const created = await dataLayer.createEntry({
                  categoryId: (categories.find((c) => c.archived === 0) ?? categories[0]).id,
                  startedAtMs: base,
                  endedAtMs: base + 30 * 60_000,
                });
                setEditEntryId(created.id);
                setSheet('entry');
              });
            }}
            onOpenEntry={(entry) => {
              setEditEntryId(entry.id);
              setSheet('entry');
            }}
            onLongPressEntry={(entry) => setDraggingEntryId(entry.id)}
            onDragEdge={(entry, edge, deltaMinutes) =>
              void run(() =>
                dataLayer.updateEntry(entry.id, {
                  [edge === 'start' ? 'startedAtMs' : 'endedAtMs']: snapMs(
                    (edge === 'start' ? entry.startedAtMs : entry.endedAtMs ?? nowMs) +
                      deltaMinutes * 60_000
                  ),
                })
              )
            }
          />
        )}

        {tab === 'insights' && (
          <InsightsScreen
            range={prefs.dashRange}
            onChangeRange={(dashRange: RangeKind) => updatePrefs({ dashRange })}
            entries={insightsEntries}
            categoriesById={byId}
            today={today}
            nowMs={nowMs}
            tzOffsetMin={tzOffsetMin}
            theme={theme}
            onPressCategory={(id) => showToast(byId[id]?.name ?? '')}
          />
        )}

        {tab === 'categories' && (
          <CategoriesScreen
            categories={categories}
            recentUse={recentUse}
            theme={theme}
            isDark={prefs.theme === 'dark'}
            thresholdHours={prefs.thresholdHours}
            onChangeThreshold={(thresholdHours) => updatePrefs({ thresholdHours })}
            onToggleTheme={() => updatePrefs({ theme: prefs.theme === 'dark' ? 'light' : 'dark' })}
            onNewCategory={() => void openCategorySheet(null)}
            onOpenCategory={(c) => void openCategorySheet(c)}
            onExportCSV={() => void run(() => exportCSV(), 'CSV exported')}
            onExportBackup={() => void run(() => exportBackup(), 'Backup saved')}
            onRestoreBackup={() => void run(() => restoreBackup(), 'Backup restored')}
          />
        )}
      </View>

      <TimerBar
        timer={timer}
        category={timerCategory}
        displayName={timerCategory ? qualifiedName(timerCategory, byId) : ''}
        nowMs={nowMs}
        overThreshold={overThreshold}
        theme={theme}
        onPressBody={() => {
          if (!timer) return;
          setEditEntryId(timer.id);
          setSheet(overThreshold ? 'long' : 'entry');
        }}
        onPressStart={() => setSheet('picker')}
        onPressStop={() =>
          void run(
            () => dataLayer.stopTimer(),
            timerCategory ? 'Saved · ' + timerCategory.name : 'Timer stopped'
          )
        }
      />

      <TabBar active={tab} onChange={setTab} theme={theme} bottomInset={0} />
      <Toast message={toastMessage} theme={theme} />

      <Sheet visible={sheet === 'picker'} onClose={closeSheet} theme={theme}>
        <CategoryPickerSheet
          categories={categories}
          recentUse={recentUse}
          categoriesById={byId}
          theme={theme}
          onPick={(categoryId) => {
            closeSheet();
            void run(() => dataLayer.startTimer(categoryId), 'Started ' + (byId[categoryId]?.name ?? ''));
          }}
        />
      </Sheet>

      <Sheet visible={sheet === 'entry' && !!editEntry} onClose={closeSheet} theme={theme}>
        {editEntry && (
          <EntryEditSheet
            entry={editEntry}
            categories={categories}
            nowMs={nowMs}
            theme={theme}
            onChangeCategory={(categoryId) => void run(() => dataLayer.updateEntry(editEntry.id, { categoryId }))}
            onNudge={(edge, deltaMinutes) =>
              void run(() =>
                dataLayer.updateEntry(editEntry.id, {
                  [edge === 'start' ? 'startedAtMs' : 'endedAtMs']:
                    (edge === 'start' ? editEntry.startedAtMs : editEntry.endedAtMs ?? nowMs) +
                    deltaMinutes * 60_000,
                })
              )
            }
            onChangeNote={(note) => void run(() => dataLayer.updateEntry(editEntry.id, { note }))}
            onSplit={() => {
              const mid = snapMs((editEntry.startedAtMs + (editEntry.endedAtMs ?? nowMs)) / 2);
              closeSheet();
              void run(() => dataLayer.splitEntry(editEntry.id, mid), 'Split in two');
            }}
            onDelete={() => {
              closeSheet();
              void run(() => dataLayer.deleteEntry(editEntry.id), 'Entry deleted');
            }}
            onDone={closeSheet}
          />
        )}
      </Sheet>

      <Sheet visible={sheet === 'long' && !!timer} onClose={closeSheet} theme={theme}>
        {timer && timerCategory && (
          <LongTimerSheet
            categoryName={timerCategory.name}
            elapsedMinutes={elapsedMinutes}
            thresholdHours={prefs.thresholdHours}
            guessMinute={guessMinute}
            startedMinute={timerStartedMinute}
            theme={theme}
            onStopAtGuess={() => {
              const endedAtMs = snapMs(timer.startedAtMs + (guessMinute - timerStartedMinute) * 60_000);
              closeSheet();
              void run(() => dataLayer.stopTimer({ endedAtMs }), 'Trimmed to the proposed ending');
            }}
            onStopNow={() => {
              closeSheet();
              void run(() => dataLayer.stopTimer(), 'Timer stopped');
            }}
            onPickTime={() => {
              setEditEntryId(timer.id);
              setSheet('entry');
            }}
            onKeepRunning={() => {
              // Raise the bar past the current run so it does not nag again.
              updatePrefs({ thresholdHours: Math.min(24, Math.ceil(elapsedMinutes / 60) + 1) });
              closeSheet();
            }}
          />
        )}
      </Sheet>

      <Sheet visible={sheet === 'date'} onClose={closeSheet} theme={theme}>
        <MonthJumpSheet
          anchorDate={localDate}
          selectedDate={localDate}
          today={today}
          datesWithData={new Set(insightsEntries.map((e) => e.localDate))}
          theme={theme}
          onPick={(date) => {
            setLocalDate(date);
            setTab('day');
            closeSheet();
          }}
          onToday={() => {
            setLocalDate(today);
            closeSheet();
          }}
        />
      </Sheet>

      <Sheet visible={sheet === 'category' && !!categoryDraft} onClose={closeSheet} theme={theme}>
        {categoryDraft && (
          <CategoryEditSheet
            draft={categoryDraft}
            eligibleParents={eligibleParents}
            lockedToTopLevel={!!categoryDraft.id && eligibleParents.length === 0}
            usage={draftUsage}
            reassignTarget={reassignTarget}
            theme={theme}
            onChange={setCategoryDraft}
            onSave={() => {
              const draft = categoryDraft;
              closeSheet();
              void run(async () => {
                if (draft.id) {
                  await categoryLayer.updateCategory(draft.id, {
                    name: draft.name,
                    color: draft.color,
                    parentId: draft.parentId,
                  });
                } else if (draft.name.trim()) {
                  await dataLayer.createCategory({
                    name: draft.name.trim(),
                    color: draft.color,
                    parentId: draft.parentId,
                  });
                }
              }, 'Saved');
            }}
            onToggleArchive={() => {
              const draft = categoryDraft;
              if (!draft.id) return;
              closeSheet();
              void run(
                () => categoryLayer.setArchived(draft.id!, !draft.archived),
                draft.archived ? draft.name + ' restored' : draft.name + ' archived · history kept'
              );
            }}
            onReassignAndDelete={() => {
              const draft = categoryDraft;
              if (!draft.id || !reassignTarget) return;
              closeSheet();
              void run(
                () => categoryLayer.deleteCategory(draft.id!, { kind: 'reassign', reassignToId: reassignTarget.id }),
                'Entries moved to ' + reassignTarget.name
              );
            }}
            onDeleteWithEntries={() => {
              const draft = categoryDraft;
              if (!draft.id) return;
              closeSheet();
              void run(
                () => categoryLayer.deleteCategory(draft.id!, { kind: 'cascade' }),
                draft.name + ' deleted'
              );
            }}
          />
        )}
      </Sheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
});
