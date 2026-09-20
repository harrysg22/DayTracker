/**
 * Único punto de contacto con `expo-calendar` (API "Calendar Next" de SDK 57).
 *
 * `expo-calendar` es un módulo nativo: no puede cargarse en Jest/Node, así que
 * el `require` es perezoso (igual que `expo-crypto` en `src/db/ids.ts`). El
 * motor de sync (`src/db/calendarSync.ts`) recibe un `CalendarBridge` inyectado
 * y en los tests se le pasa uno falso en memoria.
 *
 * EventKit (el calendario local de iOS) NO necesita internet. iOS es quien
 * sincroniza ese calendario con Google en segundo plano. Estas llamadas solo
 * tocan el almacén local del dispositivo.
 *
 * Docs: https://docs.expo.dev/versions/v57.0.0/sdk/calendar/
 */

import type * as CalendarNS from 'expo-calendar';

/** Un evento del calendario del sistema, reducido a lo que la app entiende. */
export interface BridgeEvent {
  id: string;
  title: string;
  startMs: number;
  endMs: number;
  allDay: boolean;
  /** Recurrente o instancia modificada de una serie — la app los ignora. */
  isRecurring: boolean;
  lastModifiedMs: number | null;
}

export interface WritableCalendar {
  id: string;
  title: string;
  sourceName: string;
  sourceType: string;
}

export interface CreateInput {
  title: string;
  startMs: number;
  endMs: number;
  /** Zona IANA del dispositivo, p. ej. 'America/Bogota'. */
  timeZone: string;
}

export interface CalendarBridge {
  isSupported(): boolean;
  hasPermission(): Promise<boolean>;
  requestPermission(): Promise<boolean>;
  listWritableCalendars(): Promise<WritableCalendar[]>;
  listEvents(calendarId: string, startMs: number, endMs: number): Promise<BridgeEvent[]>;
  getEvent(id: string): Promise<BridgeEvent | null>;
  createEvent(calendarId: string, input: CreateInput): Promise<BridgeEvent>;
  updateEvent(id: string, patch: { title: string; startMs: number; endMs: number }): Promise<void>;
  deleteEvent(id: string): Promise<void>;
}

let _cal: typeof CalendarNS | null = null;
function cal(): typeof CalendarNS {
  if (!_cal) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    _cal = require('expo-calendar') as typeof CalendarNS;
  }
  return _cal;
}

function toMs(d: string | Date | undefined | null): number {
  if (d == null) return 0;
  return d instanceof Date ? d.getTime() : new Date(d).getTime();
}

function toBridgeEvent(ev: CalendarNS.ExpoCalendarEvent): BridgeEvent {
  return {
    id: ev.id,
    title: ev.title ?? '',
    startMs: toMs(ev.startDate),
    endMs: toMs(ev.endDate),
    allDay: ev.allDay === true,
    isRecurring: ev.recurrenceRule != null || ev.isDetached === true,
    lastModifiedMs: ev.lastModifiedDate ? toMs(ev.lastModifiedDate) : null,
  };
}

/** El bridge real, sobre `expo-calendar`. En tests se sustituye por un doble. */
export const nativeCalendarBridge: CalendarBridge = {
  isSupported() {
    try {
      const { Platform } = require('react-native');
      if (Platform.OS !== 'ios' && Platform.OS !== 'android') return false;
      // Comprobar la presencia del módulo NATIVO sin cargar el JS de
      // `expo-calendar` (que lanza al evaluarse si el pod no está compilado).
      // `requireOptionalNativeModule` devuelve null en vez de lanzar.
      const { requireOptionalNativeModule } = require('expo-modules-core');
      return requireOptionalNativeModule('CalendarNext') != null;
    } catch {
      return false;
    }
  },

  async hasPermission() {
    const res = await cal().getCalendarPermissions();
    return res.granted === true;
  },

  async requestPermission() {
    const res = await cal().requestCalendarPermissions();
    return res.granted === true;
  },

  async listWritableCalendars() {
    const cals = await cal().getCalendars(cal().EntityTypes.EVENT);
    return cals
      .filter((c) => c.allowsModifications)
      .map((c) => ({
        id: c.id,
        title: c.title,
        sourceName: c.source?.name ?? '',
        sourceType: String(c.source?.type ?? c.type ?? ''),
      }));
  },

  async listEvents(calendarId, startMs, endMs) {
    const events = await cal().listEvents([calendarId], new Date(startMs), new Date(endMs));
    return events.map(toBridgeEvent);
  },

  async getEvent(id) {
    try {
      const ev = await cal().ExpoCalendarEvent.get(id);
      return toBridgeEvent(ev);
    } catch {
      return null;
    }
  },

  async createEvent(calendarId, input) {
    const calendar = await cal().ExpoCalendar.get(calendarId);
    const ev = await calendar.createEvent({
      title: input.title,
      startDate: new Date(input.startMs),
      endDate: new Date(input.endMs),
      timeZone: input.timeZone,
      allDay: false,
    });
    return toBridgeEvent(ev);
  },

  async updateEvent(id, patch) {
    const ev = await cal().ExpoCalendarEvent.get(id);
    await ev.update({
      title: patch.title,
      startDate: new Date(patch.startMs),
      endDate: new Date(patch.endMs),
    });
  },

  async deleteEvent(id) {
    const ev = await cal().ExpoCalendarEvent.get(id);
    await ev.delete();
  },
};

/** Zona horaria IANA del dispositivo, para etiquetar los eventos que subimos. */
export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}
