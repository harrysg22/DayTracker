/**
 * Design tokens. Two themes, same keys — nothing in the UI hardcodes a colour.
 * Values come from the design prototype and are final.
 */
export type ThemeName = 'dark' | 'light';

export interface Theme {
  bg: string;
  surface: string;
  surface2: string;
  line: string;
  grid: string;
  text: string;
  text2: string;
  text3: string;
  warn: string;
  warnBg: string;
  nowLine: string;
  up: string;
  down: string;
  destructive: string;
  scrim: string;
}

export const THEMES: Record<ThemeName, Theme> = {
  dark: {
    bg: '#0C0D10',
    surface: '#14161A',
    surface2: '#1B1E24',
    line: '#262A31',
    grid: '#1D2027',
    text: '#EDEFF2',
    text2: '#9BA2AD',
    text3: '#6A7280',
    warn: '#E4A93D',
    warnBg: 'rgba(228,169,61,0.14)',
    nowLine: '#E05656',
    up: '#E4772E',
    down: '#2FA36B',
    destructive: '#E05656',
    scrim: 'rgba(0,0,0,0.55)',
  },
  light: {
    bg: '#F6F6F3',
    surface: '#FFFFFF',
    surface2: '#F0F0EC',
    line: '#E4E4DF',
    grid: '#EBEBE6',
    text: '#15171B',
    text2: '#63697A',
    text3: '#9AA0AC',
    warn: '#B57D14',
    warnBg: 'rgba(200,140,20,0.14)',
    nowLine: '#E05656',
    up: '#E4772E',
    down: '#2FA36B',
    destructive: '#E05656',
    scrim: 'rgba(20,22,26,0.32)',
  },
};

/**
 * 14 category hues, hue-spread first so pairs stay separable under
 * deuteranopia/protanopia. Offer exactly these in the category editor.
 */
export const PALETTE = [
  '#4C6FE7', '#0FA5A0', '#E8A33D', '#E86A9A', '#8B6FE0', '#E05656', '#8FA83C',
  '#E4772E', '#3D9BD1', '#6B7A99', '#3F9E6B', '#9B6A8F', '#A9714B', '#24B3C4',
];

/** Ink that stays legible on a given fill. */
export function inkOn(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.6 ? '#111418' : '#FFFFFF';
}

/** Monospace with tabular figures — every clock, duration and delta uses it. */
export const MONO = Platform_select();
function Platform_select(): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Platform } = require('react-native');
  return Platform.OS === 'ios' ? 'Menlo' : 'monospace';
}

export const SPACE = [2, 4, 6, 8, 12, 16, 20, 26] as const;
export const RADIUS = { tiny: 6, block: 10, chip: 12, control: 15, card: 20, sheet: 28 } as const;

/** Day-view geometry. See DAY_GEOMETRY notes in dayLayout.ts. */
export const GEO = {
  hourHeight: 88,
  minBlockHeight: 22,
  gutter: 2,
  rulerWidth: 54,
  rightInset: 14,
  collapsedBandHeight: 38,
  /** Untracked runs at or above this many minutes collapse. */
  gapCollapseMinutes: 180,
  /** Raw height under which a block is a candidate for clustering. */
  clusterMaxHeight: 20,
  /** Max minutes between two tiny blocks for them to join one cluster. */
  clusterMaxSpacingMinutes: 8,
  /** Minimum tiny blocks in a row before they become a cluster. */
  clusterMinCount: 3,
  /** Every edit snaps to this. */
  stepMinutes: 5,
  longPressMs: 420,
} as const;
