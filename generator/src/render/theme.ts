/**
 * Palette from "DevPlus Identity — The Owner's Manual". Light is paper and ink;
 * dark is the identity's black page. The signal red is the same in both.
 *
 * Figures paint with tokens (`var(--ink)`), never hex, so one drawing can be
 * emitted with a fixed palette (the wide light and dark files) or with a palette
 * that follows the viewer's color scheme (the single narrow file).
 */

export const TOKENS = ['ink', 'ink2', 'ink3', 'rule', 'plateTop', 'plateSide', 'signal', 'onSignal'] as const;
export type Token = (typeof TOKENS)[number];

export type Palette = Record<Token, string>;

export const LIGHT: Palette = {
  ink: '#111111',
  ink2: '#3D3D3B',
  ink3: '#6F6F6B',
  rule: '#D8D8D3',
  plateTop: '#FFFFFF',
  plateSide: '#F4F4F1',
  signal: '#B8301C',
  onSignal: '#FFFFFF',
};

export const DARK: Palette = {
  ink: '#FFFFFF',
  ink2: '#D8D8D3',
  ink3: '#9A9A95',
  rule: '#3D3D3B',
  plateTop: '#161616',
  plateSide: '#262625',
  signal: '#B8301C',
  onSignal: '#FFFFFF',
};

export const PAPER = '#FFFFFF';
export const BLACK_PAGE = '#111111';

/**
 * How one file is colored.
 * - `base`: palette and backdrop with no media query applied.
 * - `darkOverride`: if set, a `prefers-color-scheme: dark` block switches to the
 *   dark palette and removes the backdrop.
 * A null backdrop is transparent, so the figure sits directly on GitHub's page.
 */
export interface Coloring {
  readonly base: Palette;
  readonly backdrop: string | null;
  readonly darkOverride: boolean;
}

const vars = (p: Palette) => TOKENS.map((t) => `--${t}:${p[t]}`).join(';');

export function paletteCss(c: Coloring): string {
  let css = `svg{${vars(c.base)}}`;
  if (c.darkOverride) css += `\n@media (prefers-color-scheme:dark){svg{${vars(DARK)}}.backdrop{display:none}}`;
  return css;
}

export type Frame = 'wide' | 'narrow';

/** Canvas widths. Wide matches GitHub's README column; narrow is a 375px phone less its gutters. */
export const FRAME_WIDTH: Record<Frame, number> = { wide: 830, narrow: 360 };
export const FRAME_PAD: Record<Frame, number> = { wide: 32, narrow: 18 };
