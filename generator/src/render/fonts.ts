/**
 * Libre Franklin (OFL) metrics and embedding.
 *
 * Layout needs real advance widths to wrap and align text, so text is measured
 * with HarfBuzz using the same font files that get embedded. Each SVG embeds a
 * WOFF2 subset of only the glyphs it uses: SVGs shown through <img> can't load
 * external fonts, and GitHub's proxy blocks external references anyway.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import * as hb from 'harfbuzzjs';
import subsetFont from 'subset-font';

export const WEIGHTS = [400, 500, 600] as const;
export type Weight = (typeof WEIGHTS)[number];

const FILES: Record<Weight, string> = {
  400: 'LibreFranklin-Regular.ttf',
  500: 'LibreFranklin-Medium.ttf',
  600: 'LibreFranklin-SemiBold.ttf',
};

/** Family name used inside the SVGs. Deliberately not "Libre Franklin", so a
 *  missing embed shows up as a visible fallback instead of silently using a
 *  locally installed copy. */
export const FAMILY = 'LF-Embed';

/** Tabular figures everywhere, per the identity. */
const FEATURES = ['kern', 'tnum'];

export interface Fonts {
  /** Advance width in user units of `text` at `size`, with tracking in em. */
  measure(text: string, weight: Weight, size: number, tracking?: number): number;
  /** WOFF2 subset as base64 for the given characters. */
  embed(weight: Weight, chars: string): Promise<string>;
}

export async function loadFonts(dir = fileURLToPath(new URL('../../fonts/', import.meta.url))): Promise<Fonts> {
  const buffers = {} as Record<Weight, Buffer>;
  const shapers = {} as Record<Weight, { font: hb.Font; upem: number }>;
  for (const w of WEIGHTS) {
    const buf = await readFile(dir + FILES[w]);
    buffers[w] = buf;
    const face = new hb.Face(new hb.Blob(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)));
    shapers[w] = { font: new hb.Font(face), upem: face.upem };
  }
  const features = FEATURES.map((f) => new hb.Feature(f));
  const cache = new Map<string, number>();

  return {
    measure(text, weight, size, tracking = 0) {
      const key = `${weight}|${text}`;
      let units = cache.get(key);
      if (units === undefined) {
        const { font } = shapers[weight];
        const b = new hb.Buffer();
        b.addText(text);
        b.guessSegmentProperties();
        hb.shape(font, b, features);
        units = b.getGlyphPositions().reduce((s, p) => s + p.xAdvance, 0);
        cache.set(key, units);
      }
      const chars = [...text].length;
      return (units / shapers[weight].upem) * size + tracking * size * Math.max(0, chars - 1);
    },

    async embed(weight, chars) {
      const out = await subsetFont(buffers[weight], chars, {
        targetFormat: 'woff2',
        keepFeatures: FEATURES,
        noHinting: true,
      });
      return out.toString('base64');
    },
  };
}

/** Greedy word wrap to `maxWidth`. */
export function wrap(fonts: Fonts, text: string, weight: Weight, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && fonts.measure(candidate, weight, size) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Wrap to the fewest lines that fit `maxWidth`, then even the lines out by
 * finding the narrowest width that keeps that line count. Throws if copy of
 * three or more words would still leave a word alone on a line: that is a
 * copy or layout problem to fix at the source, not something to ship.
 */
export function wrapBalanced(fonts: Fonts, text: string, weight: Weight, size: number, maxWidth: number): string[] {
  const greedy = wrap(fonts, text, weight, size, maxWidth);
  if (greedy.length <= 1) return greedy;
  let lo = 0;
  let hi = maxWidth;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (wrap(fonts, text, weight, size, mid).length === greedy.length) hi = mid;
    else lo = mid;
  }
  const lines = wrap(fonts, text, weight, size, hi);
  const words = text.split(/\s+/).filter(Boolean).length;
  if (words >= 3 && lines.some((l) => !l.includes(' '))) {
    throw new Error(`Wrap leaves a single word on a line at width ${Math.round(maxWidth)}: "${text}"`);
  }
  return lines;
}
