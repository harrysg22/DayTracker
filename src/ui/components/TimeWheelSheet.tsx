import { useEffect, useState } from 'react';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { dateFromMinutes, minutesFromDate } from '../format';
import { RADIUS } from '../theme';
import type { Theme } from '../theme';
import { Sheet } from './Sheet';

/**
 * The native iOS spinner (`UIDatePicker`) for setting a time-of-day value,
 * shown as a bottom sheet. Scrolling only updates a local draft; the value
 * commits to the caller on "Done" or on scrim-dismiss — same commit-on-close
 * pattern as the title field in EventSheet/EntryEditSheet, no separate
 * Cancel affordance anywhere in this app.
 */
export function TimeWheelSheet(props: {
  visible: boolean;
  label: string;
  minutes: number;
  themeVariant: 'light' | 'dark';
  theme: Theme;
  onClose: () => void;
  onCommit: (minutes: number) => void;
}) {
  const { theme } = props;
  const [draft, setDraft] = useState(props.minutes);

  useEffect(() => {
    if (props.visible) setDraft(props.minutes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.visible]);

  const commitAndClose = () => {
    props.onCommit(draft);
    props.onClose();
  };

  return (
    <Sheet visible={props.visible} onClose={commitAndClose} theme={theme}>
      <Text style={[styles.label, { color: theme.text2 }]}>{props.label}</Text>
      {props.visible && (
        <DateTimePicker
          mode="time"
          display="spinner"
          minuteInterval={5}
          themeVariant={props.themeVariant}
          value={dateFromMinutes(draft)}
          onValueChange={(_, date) => setDraft(minutesFromDate(date))}
          style={styles.picker}
        />
      )}
      <Pressable onPress={commitAndClose} style={[styles.done, { backgroundColor: theme.text }]}>
        <Text style={[styles.doneLabel, { color: theme.bg }]}>Done</Text>
      </Pressable>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0.66,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  picker: { alignSelf: 'center' },
  done: { marginTop: 10, height: 48, borderRadius: RADIUS.control, alignItems: 'center', justifyContent: 'center' },
  doneLabel: { fontSize: 14, fontWeight: '700' },
});
