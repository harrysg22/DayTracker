import { Directory, File, Paths } from 'expo-file-system';

/**
 * UI preferences. Deliberately NOT in SQLite: they are not user data, they
 * do not need migrations, and a corrupt prefs file must never block the app
 * from opening. Uses expo-file-system, already a dependency.
 *
 * expo-file-system's API changed in SDK 54+ — see
 * https://docs.expo.dev/versions/v57.0.0/sdk/filesystem/ before editing.
 */
export interface Prefs {
  theme: 'dark' | 'light';
  thresholdHours: number;
  dashRange: 'day' | 'week' | 'month';
}

export const DEFAULT_PREFS: Prefs = { theme: 'dark', thresholdHours: 7, dashRange: 'week' };

const FILE = new File(Paths.document, 'prefs.json');

export async function loadPrefs(): Promise<Prefs> {
  try {
    if (!FILE.exists) return DEFAULT_PREFS;
    const parsed = JSON.parse(await FILE.text());
    return { ...DEFAULT_PREFS, ...parsed };
  } catch {
    // A broken prefs file is not worth an error screen.
    return DEFAULT_PREFS;
  }
}

export async function savePrefs(prefs: Prefs): Promise<void> {
  try {
    FILE.write(JSON.stringify(prefs));
  } catch {
    // Preferences are a nicety; failing to persist them is not fatal.
  }
}
