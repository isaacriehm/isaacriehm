/**
 * Exploded view of one system: stacked layers with numbered callouts and a
 * legend, the path work takes through it, and stamped readouts.
 */

import type { Part, SystemCopy } from '../../content.ts';
import type { SystemReadout } from '../../model.ts';
import { int, monthName, monthYear } from '../format.ts';
import { metaStyle, readoutBlock, sectionHead, type Box, type Readout } from '../layout.ts';
import { r2, type Drawing, type TextStyle } from '../svg.ts';

// ── readouts ────────────────────────────────────────────────────────────────

/** "since April 2026" while work is current; otherwise "October to December 2025". */
function span(r: SystemReadout): string {
  const recent = Date.parse(r.stamp.date) - Date.parse(r.lastCommit) <= 31 * 86_400_000;
  if (recent) return `since ${monthYear(r.firstCommit)}`;
  if (r.firstCommit.slice(0, 7) === r.lastCommit.slice(0, 7)) return `in ${monthYear(r.lastCommit)}`;
  const sameYear = r.firstCommit.slice(0, 4) === r.lastCommit.slice(0, 4);
  return `${sameYear ? monthName(r.firstCommit) : monthYear(r.firstCommit)} to ${monthYear(r.lastCommit)}`;
}

/** Three readouts per system, chosen from what is true and non-zero. */
export function systemReadouts(r: SystemReadout): Readout[] {
  const out: Readout[] = [];
  if (r.testFiles > 0) out.push({ label: 'Test files', value: int(r.testFiles), detail: 'unit, integration and end-to-end' });
  out.push({ label: r.publicFacts ? 'Commits on main' : 'Commits', value: int(r.commits), detail: span(r) });
  if (r.migrations > 0) out.push({ label: 'Schema migrations', value: int(r.migrations), detail: 'versioned SQL' });
  if (r.publicFacts?.latestRelease) {
    const { latestRelease, releasedOn } = r.publicFacts;
    out.push({ label: 'Latest release', value: latestRelease, detail: releasedOn ? `published ${monthYear(releasedOn)}` : 'tagged release' });
  }
  const tsDetail = r.publicFacts ? 'across five packages' : r.testFiles > 0 ? 'source files' : 'in the application';
  out.push({ label: 'TypeScript files', value: int(r.sourceFiles), detail: tsDetail });
  return out.slice(0, 3);
}

export function systemAlt(c: SystemCopy, r: SystemReadout): string {
  const parts = c.parts.map((p, i) => `${i + 1}, ${p.name}: ${p.detail}`).join(' ');
  const flow = c.flow.join(', then ');
  const nums = systemReadouts(r)
    .map((x) => `${x.label}: ${x.value}${x.unit ? ' ' + x.unit : ''} (${x.detail}).`)
    .join(' ');
  return `Figure ${c.fig}, ${c.title}, ${c.kind.toLowerCase()}, exploded view. ${parts} ${c.flowLabel}: ${flow}. ${c.note ?? ''} ${nums} Computed ${r.stamp.date} at commit ${r.stamp.sha}.`
    .replace(/\s+/g, ' ')
    .trim();
}

// ── drawing ─────────────────────────────────────────────────────────────────

interface PlateGeom {
  readonly a: number; // half width
  readonly b: number; // half height of the top face
  readonly t: number; // thickness
}

function plate(d: Drawing, cx: number, cy: number, g: PlateGeom): void {
  const pts = (ps: ReadonlyArray<[number, number]>) => `points="${ps.map(([x, y]) => `${r2(x)},${r2(y)}`).join(' ')}"`;
  const edge = { stroke: 'ink', strokeWidth: 1, style: 'stroke-linejoin:round' } as const;
  const k = 0.6;
  d.shape('polygon', pts([[cx - g.a, cy], [cx, cy + g.b], [cx, cy + g.b + g.t], [cx - g.a, cy + g.t]]), { fill: 'plateSide', ...edge });
  d.shape('polygon', pts([[cx, cy + g.b], [cx + g.a, cy], [cx + g.a, cy + g.t], [cx, cy + g.b + g.t]]), { fill: 'plateSide', ...edge });
  d.shape('polygon', pts([[cx - g.a, cy], [cx, cy - g.b], [cx + g.a, cy], [cx, cy + g.b]]), { fill: 'plateTop', ...edge });
  d.shape('polygon', pts([[cx - g.a * k, cy], [cx, cy - g.b * k], [cx + g.a * k, cy], [cx, cy + g.b * k]]), { fill: 'none', stroke: 'rule', strokeWidth: 1 });
}

/** Plates + alignment guides + leaders + discs. Returns the plate centers. */
function explodedStack(d: Drawing, parts: ReadonlyArray<Part>, cx: number, top: number, pitch: number, g: PlateGeom, discX: number, discR: number): number[] {
  const centers = parts.map((_, i) => top + g.b + i * pitch);
  const mid = (centers[0]! + centers[centers.length - 1]!) / 2;

  d.open({ cls: 'fade', delay: 0.45 });
  for (let i = 0; i < centers.length - 1; i++) {
    const c0 = centers[i]!;
    const c1 = centers[i + 1]!;
    for (const x of [cx - g.a, cx + g.a]) d.rule(x, c0 + g.t + 2, x, c1 - 2, 'ink3', 1, { dash: '2 3' });
    d.rule(cx, c0 + g.b + g.t + 2, cx, c1 - g.b - 2, 'ink3', 1, { dash: '2 3' });
  }
  d.close();

  // Bottom-up, so each plate is drawn over the one below it.
  for (let i = centers.length - 1; i >= 0; i--) {
    const c = centers[i]!;
    d.open({ cls: 'explode', style: `--c:${Math.round(mid - c)}px` });
    plate(d, cx, c, g);
    d.close();
  }

  centers.forEach((c, i) => {
    const delay = 0.6 + i * 0.06;
    d.rule(cx + g.a + 6, c + 0.5, discX - discR - 2, c + 0.5, 'ink', 1, { draw: true, delay });
    d.shape('circle', `cx="${r2(cx + g.a)}" cy="${r2(c)}" r="2"`, { fill: 'ink', cls: 'fade', delay });
    d.callout(discX, c, i + 1, discR, delay + 0.05);
  });
  return centers;
}

function legendEntry(d: Drawing, x: number, y: number, part: Part, maxW: number, title: TextStyle, body: TextStyle, lead: number, delay: number): number {
  d.open({ cls: 'rise', delay });
  d.text(x, y, part.name, title);
  const lines = d.wrap(part.detail, body, maxW);
  lines.forEach((l, i) => d.text(x, y + 19 + i * lead, l, body));
  d.close();
  return 19 + (lines.length - 1) * lead;
}

const STATION_R = 4.5;

function flowStrip(d: Drawing, b: Box, y: number, c: SystemCopy): number {
  d.text(b.x0, y + 12, c.flowLabel, { ...metaStyle(b), cls: 'fade', delay: 0.5 });
  const label: TextStyle = { size: b.s.small + (b.frame === 'wide' ? 0.5 : 1), weight: 400, fill: 'ink2' };
  const chevron = (x: number, yy: number, dir: 'right' | 'down', delay: number) => {
    const p = dir === 'right' ? `M${r2(x - 2.5)} ${yy - 4}L${r2(x + 2.5)} ${yy}L${r2(x - 2.5)} ${yy + 4}` : `M${x - 4} ${r2(yy - 2.5)}L${x} ${r2(yy + 2.5)}L${x + 4} ${r2(yy - 2.5)}`;
    d.shape('path', `d="${p}" stroke-linecap="square"`, { fill: 'none', stroke: 'signal', strokeWidth: 1.75, cls: 'fade', delay });
  };
  // Hollow stations; the line is drawn in segments between them, so nothing relies on a background color.
  const station = (x: number, yy: number, delay: number) =>
    d.shape('circle', `cx="${r2(x)}" cy="${r2(yy)}" r="${STATION_R}"`, { fill: 'none', stroke: 'ink', strokeWidth: 1.5, cls: 'fade', delay });

  if (b.frame === 'wide') {
    const n = c.flow.length;
    const sp = (b.x1 - b.x0) / n;
    const ly = y + 34.5;
    let maxLines = 1;
    c.flow.forEach((s, i) => {
      const x = b.x0 + sp * (i + 0.5);
      const delay = 0.6 + i * 0.07;
      if (i > 0) {
        d.rule(x - sp + STATION_R + 1, ly, x - STATION_R - 1, ly, 'ink', 1, { draw: true, delay: delay - 0.05 });
        chevron(x - sp / 2, ly, 'right', delay);
      }
      station(x, ly, delay);
      const lines = d.wrap(s, label, sp - 4);
      maxLines = Math.max(maxLines, lines.length);
      lines.forEach((l, j) => d.text(x, ly + 26 + j * 17, l, { ...label, anchor: 'middle', cls: 'fade', delay }));
    });
    return ly + 26 + (maxLines - 1) * 17 + 24;
  }

  const x = b.x0 + 6;
  const pitch = 38;
  const top = y + 34;
  c.flow.forEach((s, i) => {
    const yy = top + i * pitch;
    const delay = 0.6 + i * 0.07;
    if (i > 0) {
      d.rule(x, yy - pitch + STATION_R + 1, x, yy - STATION_R - 1, 'ink', 1, { draw: true, delay: delay - 0.05 });
      chevron(x, yy - pitch / 2, 'down', delay);
    }
    station(x, yy, delay);
    d.text(x + 20, yy + 4.5, s, { ...label, cls: 'fade', delay });
  });
  return top + pitch * (c.flow.length - 1) + 30;
}

export function drawSystem(d: Drawing, b: Box, c: SystemCopy, r: SystemReadout): number {
  const wide = b.frame === 'wide';
  // The drawing convention is named once, on the first figure.
  let y = sectionHead(d, b, b.padY, c.title, { fig: c.fig, kind: c.kind, ...(c.fig === 1 ? { right: 'Exploded view' } : {}) });

  const title: TextStyle = { size: wide ? 15 : 14.5, weight: 600, fill: 'ink', tracking: -0.01 };
  const body: TextStyle = { size: b.s.body - 0.5, weight: 400, fill: 'ink2' };
  const lead = wide ? 18 : 17.5;

  if (wide) {
    const g: PlateGeom = { a: 120, b: 34, t: 8 };
    const cx = b.x0 + 8 + g.a;
    const discX = cx + g.a + 64;
    const legendX = discX + 24;
    const legendW = b.x1 - legendX;
    const heights = c.parts.map((p) => 19 + (d.wrap(p.detail, body, legendW).length - 1) * lead);
    const pitch = Math.max(g.b * 2 + g.t + 16, Math.max(...heights) + 30);
    const centers = explodedStack(d, c.parts, cx, y + 22, pitch, g, discX, 11);
    centers.forEach((cy, i) => legendEntry(d, legendX, cy + 5, c.parts[i]!, legendW, title, body, lead, 0.7 + i * 0.06));
    const last = centers[centers.length - 1]!;
    y = Math.max(last + g.b + g.t, last + 5 + heights[heights.length - 1]!) + 34;
  } else {
    const g: PlateGeom = { a: 90, b: 30, t: 7 };
    // Center the assembly (stack, leader, disc) in the frame.
    const assembly = g.a * 2 + 44 + 10;
    const cx = (b.x0 + b.x1 - assembly) / 2 + g.a;
    const centers = explodedStack(d, c.parts, cx, y + 18, g.b * 2 + g.t + 16, g, cx + g.a + 44, 10);
    y = centers[centers.length - 1]! + g.b + g.t + 30;
    const legendX = b.x0 + 28;
    c.parts.forEach((p, i) => {
      d.callout(b.x0 + 10, y - 4, i + 1, 10, 0.7 + i * 0.06);
      y += legendEntry(d, legendX, y, p, b.x1 - legendX, title, body, lead, 0.7 + i * 0.06) + 30;
    });
    y += 4;
  }

  d.rule(b.x0, y + 0.5, b.x1, y + 0.5, 'rule');
  y = flowStrip(d, b, y + 14, c);
  if (c.note) {
    y = d.paragraph(b.x0, y + 6, c.note, { size: b.s.small, weight: 400, fill: 'ink3', cls: 'fade', delay: 0.8 }, b.x1 - b.x0, 17) + 18;
  }
  y = readoutBlock(d, b, y, systemReadouts(r), r.stamp, 0.5);
  return y + b.padY;
}
