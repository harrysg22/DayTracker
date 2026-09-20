import type { AnyDb, DataLayerDeps } from './dataLayer';
import { defaultDeps } from './dataLayer';
import { computeLocalDate, localMidnightMs, localMsFromUtc, shiftLocalDate } from './dateUtils';
import { CalendarPermissionError, NoWritableCalendarError } from './errors';
import { createEventLayer } from './events';
import type { BridgeEvent, CalendarBridge } from '../calendar/bridge';
import { deviceTimeZone, nativeCalendarBridge } from '../calendar/bridge';

/**
 * Sincronización bidireccional entre la tabla `events` y un calendario del
 * sistema (vía `expo-calendar` / EventKit). SOLO se sincroniza nombre + horario;
 * nada de notas, categorías ni recurrencia.
 *
 * No hace red: `expo-calendar` toca el calendario LOCAL de iOS y es iOS quien lo
 * sincroniza con Google en segundo plano. Pulsar "Sincronizar" sin internet
 * reconcilia app ↔ calendario local igual, sin error.
 *
 * "Sucio" (cambiado localmente desde la última sync) ≡
 * `updatedAtMs > calendarSyncedMs` (o `calendarSyncedMs` es NULL).
 * "Remoto cambiado" ≡ `lastModifiedMs > calendarSyncedMs`.
 * Conflicto (ambos): gana el timestamp más nuevo.
 */

export const SYNC_WINDOW_DAYS = 90;

/** Los eventos importados se recortan a estos límites (los de `events.ts`). */
const MAX_IMPORT_DURATION = 720;

export interface CalendarSyncDeps extends DataLayerDeps {
  bridge: CalendarBridge;
  /** Zona IANA con la que se etiquetan los eventos que subimos. */
  timeZone: () => string;
}

export const defaultCalendarSyncDeps: CalendarSyncDeps = {
  ...defaultDeps,
  bridge: nativeCalendarBridge,
  timeZone: deviceTimeZone,
};

export interface CalendarSyncResult {
  pushed: number;
  pulled: number;
  updatedRemote: number;
  updatedLocal: number;
  deletedRemote: number;
  deletedLocal: number;
  /** Eventos remotos ignorados: todo el día, recurrentes o multi-día. */
  skipped: number;
}

interface EventPatch {
  title: string;
  localDate: string;
  startMinute: number;
  durationMinutes: number;
}

/** Traduce un evento del sistema a campos de `events`, o `null` si no encaja. */
function remoteToPatch(r: BridgeEvent, tzOffsetMin: number): EventPatch | null {
  if (r.allDay || r.isRecurring) return null;
  const durationMinutes = Math.round((r.endMs - r.startMs) / 60_000);
  if (durationMinutes < 1 || durationMinutes > MAX_IMPORT_DURATION) return null;
  const localDate = computeLocalDate(r.startMs, tzOffsetMin);
  const startMinute = Math.round(
    (localMsFromUtc(r.startMs, tzOffsetMin) - localMidnightMs(localDate)) / 60_000
  );
  if (startMinute < 0 || startMinute > 1439) return null;
  return { title: r.title || '(untitled)', localDate, startMinute, durationMinutes };
}

export function createCalendarSync(
  db: AnyDb,
  deps: CalendarSyncDeps = defaultCalendarSyncDeps
) {
  const el = createEventLayer(db, deps);
  const { bridge } = deps;

  async function run(calendarId: string | null | undefined): Promise<CalendarSyncResult> {
    if (!calendarId) throw new NoWritableCalendarError();
    if (!bridge.isSupported()) {
      throw new Error('Calendar sync is only available on iOS or Android.');
    }
    const granted = (await bridge.hasPermission()) || (await bridge.requestPermission());
    if (!granted) throw new CalendarPermissionError();

    const result: CalendarSyncResult = {
      pushed: 0,
      pulled: 0,
      updatedRemote: 0,
      updatedLocal: 0,
      deletedRemote: 0,
      deletedLocal: 0,
      skipped: 0,
    };

    const tz = deps.getTzOffsetMin();
    const today = computeLocalDate(deps.now(), tz);
    const from = shiftLocalDate(today, -SYNC_WINDOW_DAYS);
    const to = shiftLocalDate(today, SYNC_WINDOW_DAYS);
    const windowStartMs = localMidnightMs(from) + tz * 60_000;
    const windowEndMs = localMidnightMs(to) + 86_400_000 + tz * 60_000;

    const locals = await el.listByRange(from, to);
    const deletedLinked = await el.listDeletedWithCalendarId(from, to);
    const remotes = await bridge.listEvents(calendarId, windowStartMs, windowEndMs);
    const remoteById = new Map(remotes.map((r) => [r.id, r]));

    // Ids remotos ya resueltos: no se vuelven a importar en el paso 3.
    const handledRemote = new Set<string>();

    // 1. Propagar borrados locales al calendario del sistema.
    for (const d of deletedLinked) {
      try {
        await bridge.deleteEvent(d.calendarEventId!);
      } catch {
        // Ya no existe en el sistema: nada que hacer.
      }
      handledRemote.add(d.calendarEventId!);
      await el.unlinkCalendarEvent(d.id);
      result.deletedRemote++;
    }

    // 2. Recorrer los eventos locales vivos.
    for (const L of locals) {
      const startMs = el.startUtcMs(L);
      const endMs = startMs + L.durationMinutes * 60_000;

      // 2a. Nuevo local → crear en el sistema.
      if (!L.calendarEventId) {
        const created = await bridge.createEvent(calendarId, {
          title: L.title,
          startMs,
          endMs,
          timeZone: deps.timeZone(),
        });
        await el.setCalendarLink(L.id, {
          calendarEventId: created.id,
          calendarSyncedMs: created.lastModifiedMs ?? deps.now(),
        });
        result.pushed++;
        continue;
      }

      const R = remoteById.get(L.calendarEventId);

      // 2b. Estaba enlazado y el remoto desapareció → borrado en el sistema.
      if (!R) {
        await el.softDelete(L.id);
        await el.unlinkCalendarEvent(L.id);
        result.deletedLocal++;
        continue;
      }
      handledRemote.add(R.id);

      // 2c. Ambos existen → resolver por "gana el último que escribió".
      const synced = L.calendarSyncedMs;
      const localDirty = synced == null || L.updatedAtMs > synced;
      const remoteDirty = synced != null && R.lastModifiedMs != null && R.lastModifiedMs > synced;
      const remoteMod = R.lastModifiedMs ?? 0;

      const pushWins =
        (localDirty && !remoteDirty) || (localDirty && remoteDirty && L.updatedAtMs >= remoteMod);
      const pullWins =
        (remoteDirty && !localDirty) || (localDirty && remoteDirty && remoteMod > L.updatedAtMs);

      if (pushWins) {
        await bridge.updateEvent(L.calendarEventId, { title: L.title, startMs, endMs });
        const fresh = await bridge.getEvent(L.calendarEventId);
        await el.setCalendarLink(L.id, {
          calendarSyncedMs: fresh?.lastModifiedMs ?? deps.now(),
        });
        result.updatedRemote++;
      } else if (pullWins) {
        const patch = remoteToPatch(R, tz);
        if (!patch) {
          result.skipped++;
        } else {
          const updated = await el.update(L.id, patch);
          await el.setCalendarLink(L.id, { calendarSyncedMs: updated.updatedAtMs });
          result.updatedLocal++;
        }
      }
      // else: en sync, nada que hacer.
    }

    // 3. Eventos remotos que no tienen pareja local → importar.
    for (const R of remotes) {
      if (handledRemote.has(R.id)) continue;
      const patch = remoteToPatch(R, tz);
      if (!patch) {
        result.skipped++;
        continue;
      }
      const row = await el.create({
        title: patch.title,
        localDate: patch.localDate,
        startMinute: patch.startMinute,
        durationMinutes: patch.durationMinutes,
        tzOffsetMin: tz,
        calendarEventId: R.id,
      });
      // Nace "limpio": marca de sync = su propio updatedAtMs, no el del remoto,
      // para no re-subir el recorte de duración en la siguiente pasada.
      await el.setCalendarLink(row.id, { calendarSyncedMs: row.updatedAtMs });
      result.pulled++;
    }

    return result;
  }

  return { run };
}

export type CalendarSync = ReturnType<typeof createCalendarSync>;
