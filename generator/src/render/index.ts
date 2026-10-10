/** Renders every figure in both themes and both frames. Input: Readouts only. */

import { SYSTEMS } from '../content.ts';
import { assertPublic, SYSTEM_LABELS, type Readouts } from '../model.ts';
import { coverAlt, coverReadouts, drawCover } from './figures/cover.ts';
import { drawSpecs, specsAlt } from './figures/specs.ts';
import { drawSystem, systemAlt, systemReadouts } from './figures/system.ts';
import { drawTerms, termsAlt } from './figures/terms.ts';
import type { Fonts } from './fonts.ts';
import { box, type Box } from './layout.ts';
import { Drawing } from './svg.ts';
import { BLACK_PAGE, DARK, FRAME_WIDTH, LIGHT, PAPER, type Coloring, type Frame } from './theme.ts';

export interface Figure {
  readonly id: string;
  readonly title: string;
  readonly alt: string;
  /** Link printed under the figure in the README, if any. */
  readonly link: { readonly text: string; readonly href: string } | null;
  /** Always drawn on the black page, whatever the reader's theme. */
  readonly blackPage: boolean;
  draw(d: Drawing, b: Box): number;
}

export function figures(r: Readouts): Figure[] {
  const out: Figure[] = [
    { id: 'cover', title: 'Isaac Riehm, owner’s manual', alt: coverAlt(r.profile), link: null, blackPage: false, draw: (d, b) => drawCover(d, b, r.profile) },
  ];
  for (const label of SYSTEM_LABELS) {
    const sys = r.systems[label];
    if (!sys) continue;
    const copy = SYSTEMS[label];
    out.push({
      id: `fig-${label}`,
      title: `Fig. ${copy.fig}, ${copy.title}`,
      alt: systemAlt(copy, sys),
      link: copy.link,
      blackPage: false,
      draw: (d, b) => drawSystem(d, b, copy, sys),
    });
  }
  out.push(
    { id: 'specs', title: 'Specifications', alt: specsAlt(), link: null, blackPage: false, draw: drawSpecs },
    { id: 'terms', title: 'Operating conditions', alt: termsAlt(), link: null, blackPage: true, draw: drawTerms },
  );
  return out;
}

export type Variant = 'light' | 'dark' | 'narrow';
export const VARIANTS: ReadonlyArray<Variant> = ['light', 'dark', 'narrow'];

/**
 * - light / dark: the wide figure with a fixed palette, transparent, for GitHub's
 *   `(prefers-color-scheme)` sources (which GitHub resolves against its own theme).
 * - narrow: one phone figure that switches palette in its own CSS. Its base is
 *   the light palette on paper, so a renderer that ignores media queries inside
 *   SVG images (Safari before 27) still shows dark ink on white, never ink on black.
 * The black page stays black wherever the page around it is light.
 */
function coloring(fig: Figure, v: Variant): { frame: Frame; onPage: boolean; coloring: Coloring } {
  if (fig.blackPage) {
    if (v === 'light') return { frame: 'wide', onPage: true, coloring: { base: DARK, backdrop: BLACK_PAGE, darkOverride: false } };
    if (v === 'dark') return { frame: 'wide', onPage: false, coloring: { base: DARK, backdrop: null, darkOverride: false } };
    return { frame: 'narrow', onPage: true, coloring: { base: DARK, backdrop: BLACK_PAGE, darkOverride: true } };
  }
  if (v === 'light') return { frame: 'wide', onPage: false, coloring: { base: LIGHT, backdrop: null, darkOverride: false } };
  if (v === 'dark') return { frame: 'wide', onPage: false, coloring: { base: DARK, backdrop: null, darkOverride: false } };
  return { frame: 'narrow', onPage: false, coloring: { base: LIGHT, backdrop: PAPER, darkOverride: true } };
}

export function fileName(id: string, v: Variant): string {
  return `${id}-${v}.svg`;
}

/** Every readout sublabel on the page must be distinct. */
export function assertDistinctDetails(r: Readouts): void {
  const details = [
    ...coverReadouts(r.profile),
    ...SYSTEM_LABELS.flatMap((l) => (r.systems[l] ? systemReadouts(r.systems[l]) : [])),
  ].map((x) => x.detail);
  const dup = details.find((d, i) => details.indexOf(d) !== i);
  if (dup) throw new Error(`Readout sublabel repeats on the page: "${dup}"`);
}

export async function renderAll(r: Readouts, fonts: Fonts): Promise<Map<string, string>> {
  assertPublic(r);
  assertDistinctDetails(r);
  const files = new Map<string, string>();
  for (const fig of figures(r)) {
    for (const v of VARIANTS) {
      const c = coloring(fig, v);
      const d = new Drawing(fonts, FRAME_WIDTH[c.frame]);
      const height = fig.draw(d, box(c.frame, c.onPage));
      files.set(fileName(fig.id, v), await d.render(height, fig.title, fig.alt, c.coloring));
    }
  }
  return files;
}
