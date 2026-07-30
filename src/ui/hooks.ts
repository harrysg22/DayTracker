import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { dataLayer } from '../db';
import { createCategoryLayer } from '../db/categories';
import { db } from '../db/client';
import { computeLocalDate, currentDeviceTzOffsetMin } from '../db/dateUtils';
import type { Category, Entry } from '../db/schema';

let _categoryLayer: ReturnType<typeof createCategoryLayer> | null = null;
/** Lazy so nothing touches the database before ensureDbReady() resolves. */
export const categoryLayer = new Proxy({} as ReturnType<typeof createCategoryLayer>, {
  get(_t, prop) {
    if (!_categoryLayer) _categoryLayer = createCategoryLayer(db as any);
    return (_categoryLayer as any)[prop];
  },
});

/**
 * A clock that ticks once a second while the app is foregrounded, and
 * resyncs immediately on resume. Elapsed time is always derived from
 * startedAtMs — never accumulated — so backgrounding cannot make it drift.
 */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let id: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      setNow(Date.now());
      id = setInterval(() => setNow(Date.now()), intervalMs);
    };
    const stop = () => {
      if (id) clearInterval(id);
      id = null;
    };
    start();
    const sub = AppState.addEventListener('change', (s) => (s === 'active' ? (stop(), start()) : stop()));
    return () => {
      stop();
      sub.remove();
    };
  }, [intervalMs]);
  return now;
}

export function todayLocalDate(): string {
  return computeLocalDate(Date.now(), currentDeviceTzOffsetMin());
}

/** Bumped after any write so every screen refetches. Keeps it honest and simple. */
export function useRevision() {
  const [revision, setRevision] = useState(0);
  return { revision, invalidate: useCallback(() => setRevision((r) => r + 1), []) };
}

export function useCategories(revision: number, enabled = true, includeArchived = true) {
  const [categories, setCategories] = useState<Category[]>([]);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    dataLayer
      .listCategories(includeArchived)
      .then((rows) => alive && setCategories(rows))
      .catch((err) => console.warn('listCategories failed', err));
    return () => {
      alive = false;
    };
  }, [revision, enabled, includeArchived]);
  return categories;
}

export function useDay(localDate: string, revision: number, enabled = true) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    setLoading(true);
    dataLayer
      .getDay(localDate)
      .then((rows) => {
        if (!alive) return;
        setEntries(rows);
        setLoading(false);
      })
      .catch((err) => {
        console.warn('getDay failed', err);
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [localDate, revision, enabled]);
  return { entries, loading };
}

export function useRange(from: string, to: string, revision: number, enabled = true) {
  const [entries, setEntries] = useState<Entry[]>([]);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    dataLayer
      .getRange(from, to)
      .then((rows) => alive && setEntries(rows))
      .catch((err) => console.warn('getRange failed', err));
    return () => {
      alive = false;
    };
  }, [from, to, revision, enabled]);
  return entries;
}

/** The running timer, read from disk — there is no in-memory timer state. */
export function useActiveTimer(revision: number, enabled = true) {
  const [timer, setTimer] = useState<Entry | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    dataLayer
      .getActiveTimer()
      .then((row) => alive && setTimer(row))
      .catch((err) => console.warn('getActiveTimer failed', err));
    return () => {
      alive = false;
    };
  }, [revision, enabled]);
  return timer;
}

/** Fire-and-forget toast queue. */
export function useToast() {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((text: string, ms = 1800) => {
    if (timer.current) clearTimeout(timer.current);
    setMessage(text);
    timer.current = setTimeout(() => setMessage(null), ms);
  }, []);
  useEffect(() => () => timer.current && clearTimeout(timer.current), []);
  return { message, show };
}

export function categoryMap(categories: Category[]): Record<string, Category> {
  const out: Record<string, Category> = {};
  for (const c of categories) out[c.id] = c;
  return out;
}

/** `Estudio › Chino` for nested categories, plain name otherwise. */
export function qualifiedName(category: Category, byId: Record<string, Category>): string {
  const parent = category.parentId ? byId[category.parentId] : null;
  return parent ? parent.name + ' › ' + category.name : category.name;
}
