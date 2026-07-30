import type { Entry } from "./schema";

export class NotFoundError extends Error {
  constructor(entity: string, id: string) {
    super(`${entity} ${id} no existe (o fue borrada)`);
    this.name = "NotFoundError";
  }
}

export class ActiveTimerExistsError extends Error {
  constructor(public readonly active: Entry) {
    super(`Ya hay un timer activo (entry ${active.id}). Detenlo antes de iniciar otro.`);
    this.name = "ActiveTimerExistsError";
  }
}

export class NoActiveTimerError extends Error {
  constructor() {
    super("No hay ningún timer activo.");
    this.name = "NoActiveTimerError";
  }
}

/**
 * Se lanza cuando un rango [startedAtMs, endedAtMs) se solapa con una
 * entry existente. La UI decide si recorta o rechaza — la capa de datos
 * nunca corrige silenciosamente.
 */
export class OverlapError extends Error {
  constructor(public readonly conflicting: Entry) {
    super(
      `El rango se solapa con la entry ${conflicting.id} ` +
        `(${conflicting.startedAtMs} - ${conflicting.endedAtMs ?? "en curso"})`
    );
    this.name = "OverlapError";
  }
}

export class InvalidRangeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidRangeError";
  }
}

export class SplitOutOfRangeError extends Error {
  constructor(atMs: number, startedAtMs: number, effectiveEndMs: number) {
    super(
      `El punto de corte ${atMs} debe estar estrictamente entre ` +
        `${startedAtMs} y ${effectiveEndMs}`
    );
    this.name = "SplitOutOfRangeError";
  }
}
