import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { WritableCalendar } from '../../calendar/bridge';
import { MONO, RADIUS } from '../theme';
import type { Theme } from '../theme';

/**
 * Conectar y disparar la sincronización con Google Calendar a través del
 * calendario del sistema. Solo se sincroniza nombre + horario. Sin botón Save:
 * elegir un calendario ya lo guarda.
 */
export function CalendarSyncSheet(props: {
  theme: Theme;
  supported: boolean;
  permission: 'unknown' | 'granted' | 'denied';
  loading: boolean;
  calendars: WritableCalendar[];
  selectedId: string | null;
  lastSyncMs: number | null;
  busy: boolean;
  onRequestPermission: () => void;
  onSelectCalendar: (id: string) => void;
  onSyncNow: () => void;
  onDone: () => void;
}) {
  const { theme } = props;

  const body = () => {
    if (!props.supported) {
      return <Text style={[styles.note, { color: theme.text2 }]}>Calendar sync is only available on iOS.</Text>;
    }
    if (props.permission === 'denied') {
      return (
        <>
          <Text style={[styles.note, { color: theme.text2 }]}>
            Calendar access is off. Turn it on in iOS Settings → Apps → Ledger → Calendar, then tap
            Try again.
          </Text>
          <Pressable onPress={props.onRequestPermission} style={[styles.primary, { backgroundColor: theme.text }]}>
            <Text style={[styles.primaryLabel, { color: theme.bg }]}>Try again</Text>
          </Pressable>
        </>
      );
    }
    if (props.permission === 'unknown') {
      return (
        <>
          <Text style={[styles.note, { color: theme.text2 }]}>
            Ledger writes to your device calendar; iOS syncs that with Google in the background. Your
            other data stays offline on this device.
          </Text>
          <Pressable onPress={props.onRequestPermission} style={[styles.primary, { backgroundColor: theme.text }]}>
            <Text style={[styles.primaryLabel, { color: theme.bg }]}>Connect calendar access</Text>
          </Pressable>
        </>
      );
    }
    // permission === 'granted'
    if (props.loading) {
      return <ActivityIndicator color={theme.text2} style={{ marginVertical: 20 }} />;
    }
    if (props.calendars.length === 0) {
      return (
        <Text style={[styles.note, { color: theme.text2 }]}>
          No writable calendar found. Add your Google account in iOS Settings → Apps → Calendar →
          Accounts, with Calendars turned on, then reopen this.
        </Text>
      );
    }
    return (
      <>
        <Text style={[styles.kicker, { color: theme.text3 }]}>CALENDAR</Text>
        <ScrollView style={{ maxHeight: 210 }} keyboardShouldPersistTaps="handled">
          {props.calendars.map((c) => {
            const on = c.id === props.selectedId;
            return (
              <Pressable
                key={c.id}
                onPress={() => props.onSelectCalendar(c.id)}
                style={[styles.calRow, { borderBottomColor: theme.line }]}
              >
                <View style={[styles.radio, { borderColor: on ? theme.text : theme.text3 }]}>
                  {on && <View style={[styles.radioDot, { backgroundColor: theme.text }]} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.calTitle, { color: theme.text }]}>{c.title}</Text>
                  {!!c.sourceName && (
                    <Text style={[styles.calSource, { color: theme.text3 }]}>{c.sourceName}</Text>
                  )}
                </View>
              </Pressable>
            );
          })}
        </ScrollView>

        <Pressable
          onPress={props.onSyncNow}
          disabled={!props.selectedId || props.busy}
          style={[
            styles.primary,
            { backgroundColor: props.selectedId && !props.busy ? theme.text : theme.surface2 },
          ]}
        >
          {props.busy ? (
            <ActivityIndicator color={theme.text2} />
          ) : (
            <Text
              style={[styles.primaryLabel, { color: props.selectedId ? theme.bg : theme.text3 }]}
            >
              Sync now
            </Text>
          )}
        </Pressable>
        <Text style={[styles.last, { color: theme.text3 }]}>
          {props.lastSyncMs ? 'Last synced ' + fmtWhen(props.lastSyncMs) : 'Never synced'}
        </Text>
      </>
    );
  };

  return (
    <View>
      <Text style={[styles.title, { color: theme.text }]}>Google Calendar</Text>
      <Text style={[styles.sub, { color: theme.text3 }]}>Two-way · event name and time only</Text>
      {body()}
      <Pressable onPress={props.onDone} style={[styles.done, { backgroundColor: theme.surface2 }]}>
        <Text style={[styles.doneLabel, { color: theme.text }]}>Done</Text>
      </Pressable>
    </View>
  );
}

function fmtWhen(ms: number): string {
  const d = new Date(ms);
  const p2 = (n: number) => (n < 10 ? '0' + n : '' + n);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[d.getMonth()]} ${d.getDate()}, ${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

const styles = StyleSheet.create({
  title: { fontSize: 17, fontWeight: '700', letterSpacing: -0.3 },
  sub: { marginTop: 3, fontSize: 12, fontWeight: '500' },
  note: { marginTop: 14, fontSize: 13, lineHeight: 19 },
  kicker: { marginTop: 18, marginBottom: 4, fontSize: 11, fontWeight: '500', letterSpacing: 0.66, textTransform: 'uppercase' },

  calRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  calTitle: { fontSize: 13.5, fontWeight: '600' },
  calSource: { marginTop: 2, fontSize: 11, fontWeight: '500', fontFamily: MONO },

  primary: { marginTop: 16, height: 48, borderRadius: RADIUS.control, alignItems: 'center', justifyContent: 'center' },
  primaryLabel: { fontSize: 14, fontWeight: '700' },
  last: { marginTop: 10, fontSize: 11.5, fontWeight: '500', fontFamily: MONO, textAlign: 'center' },

  done: { marginTop: 12, height: 44, borderRadius: RADIUS.control, alignItems: 'center', justifyContent: 'center' },
  doneLabel: { fontSize: 13.5, fontWeight: '700' },
});
