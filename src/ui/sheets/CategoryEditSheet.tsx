import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { Category } from '../../db/schema';
import { fmtDuration } from '../format';
import { PALETTE } from '../theme';
import type { Theme } from '../theme';

export interface CategoryDraft {
  id: string | null;
  name: string;
  color: string;
  parentId: string | null;
  archived: boolean;
}

/**
 * Archive is the low-stakes default. Delete is a two-path decision and the
 * safe path (move the entries) is listed first — deleting a category with
 * history erases that time from every past day.
 */
export function CategoryEditSheet(props: {
  draft: CategoryDraft;
  /** Only categories that may legally become this one's parent. */
  eligibleParents: Category[];
  /** Empty when this category has sub-categories of its own. */
  lockedToTopLevel: boolean;
  usage: { entryCount: number; totalMs: number };
  reassignTarget: Category | null;
  theme: Theme;
  onChange: (draft: CategoryDraft) => void;
  onSave: () => void;
  onToggleArchive: () => void;
  onReassignAndDelete: () => void;
  onDeleteWithEntries: () => void;
}) {
  const { draft, theme, usage } = props;
  const [confirming, setConfirming] = useState(false);
  const hasEntries = usage.entryCount > 0;
  const totalLabel = fmtDuration(usage.totalMs / 60_000);

  return (
    <ScrollView style={{ maxHeight: 560 }} keyboardShouldPersistTaps="handled">
      <Text style={[styles.title, { color: theme.text }]}>
        {draft.id ? 'Edit category' : 'New category'}
      </Text>

      <TextInput
        value={draft.name}
        onChangeText={(name) => props.onChange({ ...draft, name })}
        placeholder="Category name"
        placeholderTextColor={theme.text3}
        style={[styles.input, { backgroundColor: theme.surface2, borderColor: theme.line, color: theme.text }]}
      />

      <Text style={[styles.eyebrow, { color: theme.text3 }]}>Color</Text>
      <View style={styles.swatches}>
        {PALETTE.map((color) => {
          const on = draft.color === color;
          return (
            <Pressable
              key={color}
              onPress={() => props.onChange({ ...draft, color })}
              style={[
                styles.swatch,
                { backgroundColor: color },
                on && { borderWidth: 2.5, borderColor: theme.text, transform: [{ scale: 0.94 }] },
              ]}
            />
          );
        })}
      </View>

      <View style={styles.nestHead}>
        <Text style={[styles.eyebrow, { color: theme.text3, marginTop: 0, marginBottom: 0 }]}>Nest under</Text>
        {props.lockedToTopLevel && (
          <Text style={[styles.nestHint, { color: theme.text3 }]}>
            stays top level — it has sub-categories
          </Text>
        )}
      </View>
      <View style={styles.chips}>
        {[{ id: null, name: 'Top level' } as { id: string | null; name: string }, ...props.eligibleParents].map(
          (p) => {
            const on = draft.parentId === p.id;
            return (
              <Pressable
                key={p.id ?? 'top'}
                onPress={() => props.onChange({ ...draft, parentId: p.id })}
                style={[styles.chip, { backgroundColor: on ? theme.text : theme.surface2 }]}
              >
                <Text style={[styles.chipLabel, { color: on ? theme.bg : theme.text2 }]}>{p.name}</Text>
              </Pressable>
            );
          }
        )}
      </View>

      {confirming ? (
        <View style={[styles.confirm, { backgroundColor: 'rgba(224,86,86,0.10)', borderColor: 'rgba(224,86,86,0.30)' }]}>
          <Text style={[styles.confirmTitle, { color: theme.text }]}>
            {hasEntries
              ? 'Delete ' + draft.name + ' and ' + usage.entryCount + (usage.entryCount === 1 ? ' entry?' : ' entries?')
              : 'Delete ' + draft.name + '?'}
          </Text>
          <Text style={[styles.confirmBody, { color: theme.text2 }]}>
            {hasEntries
              ? totalLabel +
                ' is logged under ' +
                draft.name +
                '. Deleting the category deletes that time too — it will not show up in any past day or in Insights again. Move the entries instead if you only want the name gone.'
              : 'Nothing is tracked under it, so this removes the category cleanly.'}
          </Text>
          {hasEntries && props.reassignTarget && (
            <Pressable
              onPress={props.onReassignAndDelete}
              style={[styles.confirmSafe, { backgroundColor: theme.surface2 }]}
            >
              <Text style={[styles.confirmSafeLabel, { color: theme.text }]}>
                Move {usage.entryCount} {usage.entryCount === 1 ? 'entry' : 'entries'} to{' '}
                {props.reassignTarget.name}
              </Text>
            </Pressable>
          )}
          <Pressable
            onPress={props.onDeleteWithEntries}
            style={[styles.confirmDanger, { backgroundColor: theme.destructive }]}
          >
            <Text style={styles.confirmDangerLabel}>
              {hasEntries ? 'Delete category and its time' : 'Delete'}
            </Text>
          </Pressable>
          <Pressable onPress={() => setConfirming(false)} style={styles.ghost}>
            <Text style={[styles.ghostLabel, { color: theme.text3 }]}>Cancel</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <View style={styles.actions}>
            <Pressable onPress={props.onToggleArchive} style={[styles.secondary, { backgroundColor: theme.surface2 }]}>
              <Text style={[styles.secondaryLabel, { color: theme.text }]}>
                {draft.archived ? 'Restore' : 'Archive'}
              </Text>
            </Pressable>
            <Pressable onPress={props.onSave} style={[styles.primary, { backgroundColor: theme.text }]}>
              <Text style={[styles.primaryLabel, { color: theme.bg }]}>Save</Text>
            </Pressable>
          </View>
          {draft.id && (
            <Pressable
              onPress={() => setConfirming(true)}
              style={[styles.deleteBtn, { backgroundColor: 'rgba(224,86,86,0.12)' }]}
            >
              <Text style={[styles.deleteLabel, { color: theme.destructive }]}>Delete category</Text>
            </Pressable>
          )}
          <Text style={[styles.footnote, { color: theme.text3 }]}>
            {hasEntries
              ? 'Archive keeps ' + totalLabel + ' of history intact and just hides the name from pickers.'
              : 'Nothing tracked under this yet — safe to delete.'}
          </Text>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 17, fontWeight: '700', letterSpacing: -0.34 },
  input: { marginTop: 14, padding: 14, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, fontSize: 14, fontWeight: '600' },
  eyebrow: { marginTop: 18, marginBottom: 10, fontSize: 11, fontWeight: '500', letterSpacing: 0.66, textTransform: 'uppercase' },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  swatch: { width: '11.5%', aspectRatio: 1, borderRadius: 11 },
  nestHead: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 18, marginBottom: 10 },
  nestHint: { flex: 1, fontSize: 11, lineHeight: 15 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: { paddingVertical: 9, paddingHorizontal: 13, borderRadius: 12 },
  chipLabel: { fontSize: 12.5, fontWeight: '600' },

  actions: { flexDirection: 'row', gap: 8, marginTop: 20 },
  secondary: { flex: 1, height: 48, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  secondaryLabel: { fontSize: 13, fontWeight: '600' },
  primary: { flex: 1, height: 48, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  primaryLabel: { fontSize: 14, fontWeight: '700' },
  deleteBtn: { marginTop: 8, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  deleteLabel: { fontSize: 13, fontWeight: '600' },
  footnote: { marginTop: 12, fontSize: 11, lineHeight: 16, textAlign: 'center' },

  confirm: { marginTop: 20, padding: 16, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth },
  confirmTitle: { fontSize: 14, fontWeight: '700', lineHeight: 18 },
  confirmBody: { marginTop: 6, fontSize: 12.5, lineHeight: 18 },
  confirmSafe: { marginTop: 14, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  confirmSafeLabel: { fontSize: 13, fontWeight: '600', textAlign: 'center' },
  confirmDanger: { marginTop: 8, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  confirmDangerLabel: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },
  ghost: { marginTop: 4, height: 40, alignItems: 'center', justifyContent: 'center' },
  ghostLabel: { fontSize: 12.5, fontWeight: '600' },
});
