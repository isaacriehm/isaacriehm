/** Shared type scale and the recurring structures: section heads and the readout block. */

import type { Stamp } from '../model.ts';
import { stampText } from './format.ts';
import type { Drawing, TextStyle } from './svg.ts';
import { FRAME_WIDTH, type Frame, type Token } from './theme.ts';

export interface Scale {
  readonly meta: number;
  readonly caption: number;
  readonly body: number;
  readonly small: number;
  readonly stamp: number;
  readonly value: number;
  readonly display: number;
}

export const SCALE: Record<Frame, Scale> = {
  wide: { meta: 11.5, caption: 17, body: 14, small: 12.5, stamp: 11, value: 40, display: 60 },
  narrow: { meta: 10.5, caption: 16, body: 13.5, small: 12, stamp: 10.5, value: 30, display: 42 },
};

export interface Box {
  readonly frame: Frame;
  readonly width: number;
  /** Vertical padding above and below the content. */
  readonly padY: number;
  /** Left and right content edges. */
  readonly x0: number;
  readonly x1: number;
  readonly s: Scale;
}

/**
 * Transparent figures run edge to edge so their rules line up with the README
 * column. A figure on a painted page (the black page) needs inner margins.
 */
export function box(frame: Frame, onPage: boolean): Box {
  const width = FRAME_WIDTH[frame];
  const padX = onPage ? (frame === 'wide' ? 32 : 18) : 0;
  return { frame, width, padY: onPage ? (frame === 'wide' ? 32 : 18) : (frame === 'wide' ? 20 : 14), x0: padX, x1: width - padX, s: SCALE[frame] };
}

export function metaStyle(b: Box, fill: Token = 'ink3'): TextStyle {
  return { size: b.s.meta, weight: 500, fill, caps: true, tracking: 0.1 };
}

/**
 * Section head: a 1px ink rule, then a caption line. Returns the y below it.
 * `fig` renders "Fig. n" in signal before the title, per the identity.
 */
export function sectionHead(
  d: Drawing,
  b: Box,
  y: number,
  title: string,
  opts: { fig?: number; kind?: string; right?: string } = {},
): number {
  d.rule(b.x0, y + 0.5, b.x1, y + 0.5, 'ink', 1, { draw: true });
  const base = y + (b.frame === 'wide' ? 30 : 28);
  const cap: TextStyle = { size: b.s.caption, weight: 600, fill: 'ink', tracking: -0.015 };
  const runs = [
    ...(opts.fig ? [{ text: `Fig. ${opts.fig}`, style: { ...cap, fill: 'signal' as const } }, { text: ' — ', style: cap }] : []),
    { text: title, style: cap },
  ];
  if (opts.right && b.frame === 'wide') d.text(b.x1, base, opts.right, { ...metaStyle(b), anchor: 'end', cls: 'fade' });
  if (opts.kind && b.frame === 'wide') {
    d.runs(b.x0, base, [...runs, { text: ` · ${opts.kind}`, style: { ...cap, weight: 400, fill: 'ink3' } }], 'start', 'fade');
    return base + 22;
  }
  d.runs(b.x0, base, runs, 'start', 'fade');
  if (opts.kind) {
    d.text(b.x0, base + 20, opts.kind, { size: b.s.body, weight: 400, fill: 'ink3', cls: 'fade' });
    return base + 42;
  }
  return base + 22;
}

export interface Readout {
  readonly label: string;
  readonly value: string;
  readonly unit?: string;
  readonly detail: string;
}

/**
 * The readout block: an ink rule, a row of instrument readouts (columns when
 * wide, stacked rows when narrow), a hairline, and one proof stamp for the
 * whole figure at the right end of that hairline. Returns the y below.
 */
export function readoutBlock(d: Drawing, b: Box, y: number, items: ReadonlyArray<Readout>, stamp: Stamp, delay0 = 0.25): number {
  const meta = metaStyle(b);
  const value: TextStyle = { size: b.s.value, weight: 600, fill: 'ink', tracking: -0.035 };
  const unit: TextStyle = { size: b.s.body + 2, weight: 500, fill: 'ink2' };
  const detail: TextStyle = { size: b.s.small, weight: 400, fill: 'ink2' };

  d.rule(b.x0, y + 0.5, b.x1, y + 0.5, 'ink', 1, { draw: true, delay: delay0 - 0.1 });

  if (b.frame === 'wide') {
    const colW = (b.x1 - b.x0) / items.length;
    const h = 108;
    items.forEach((it, i) => {
      const x = b.x0 + i * colW + (i === 0 ? 0 : 18);
      const maxW = colW - (i === 0 ? 18 : 30);
      if (i > 0) d.rule(b.x0 + i * colW + 0.5, y + 14, b.x0 + i * colW + 0.5, y + h - 8, 'rule');
      d.open({ cls: 'rise', delay: delay0 + i * 0.12 });
      d.text(x, y + 30, it.label, meta);
      const vw = d.text(x, y + 74, it.value, value);
      if (it.unit) d.text(x + vw + 8, y + 74, it.unit, unit);
      d.text(x, y + 96, fit(d, it.detail, detail, maxW), detail);
      d.close();
    });
    y += h + 6;
  } else {
    items.forEach((it, i) => {
      if (i > 0) d.rule(b.x0, y + 0.5, b.x1, y + 0.5, 'rule');
      d.open({ cls: 'rise', delay: delay0 + i * 0.12 });
      d.text(b.x0, y + 24, it.label, meta);
      const vw = d.text(b.x0, y + 58, it.value, value);
      if (it.unit) d.text(b.x0 + vw + 7, y + 58, it.unit, unit);
      d.text(b.x0, y + 78, fit(d, it.detail, detail, b.x1 - b.x0), detail);
      d.close();
      y += 92;
    });
  }

  d.rule(b.x0, y + 0.5, b.x1, y + 0.5, 'rule');
  d.text(b.x1, y + 18, `Computed ${stampText(stamp)}`, {
    size: b.s.stamp, weight: 400, fill: 'ink3', tracking: 0.02, anchor: 'end', cls: 'fade', delay: delay0 + 0.4,
  });
  return y + 22;
}

/** Guard: a single-line string that would overflow is a layout bug, not something to clip. */
function fit(d: Drawing, text: string, s: TextStyle, maxW: number): string {
  const w = d.measure(text, s);
  if (w > maxW) throw new Error(`Text overflows its column by ${Math.ceil(w - maxW)} units: "${text}"`);
  return text;
}
