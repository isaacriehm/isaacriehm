/**
 * Operating conditions, on a black page, closing with two doors: one for
 * employers, one for business owners. Static content.
 */

import { DOORS, TERMS } from '../../content.ts';
import { sectionHead, type Box } from '../layout.ts';
import { r2, type Drawing, type TextStyle } from '../svg.ts';

export function termsAlt(): string {
  const conditions = TERMS.map((t) => `${t.name}: ${t.detail}`).join(' ');
  const doors = DOORS.map((d) => `${d.title}: ${d.dest}.`).join(' ');
  return `Operating conditions. ${conditions} ${doors}`;
}

/** The DevPlus mark: three seated blocks in the text color, the moving piece in signal. */
function mark(d: Drawing, x: number, y: number, size: number): void {
  const k = size / 64;
  const block = (bx: number, by: number, fill: 'ink' | 'signal') =>
    d.shape('rect', `x="${r2(x + bx * k)}" y="${r2(y + by * k)}" width="${r2(24 * k)}" height="${r2(24 * k)}" rx="${r2(1.5 * k)}"`, { fill });
  block(4, 12, 'ink');
  block(4, 40, 'ink');
  block(32, 40, 'ink');
  block(40, 2, 'signal');
}

function arrow(d: Drawing, x: number, y: number, len: number, delay: number): void {
  d.shape('path', `d="M${x} ${y}H${x + len}M${x + len - 6} ${y - 6}L${x + len} ${y}L${x + len - 6} ${y + 6}" stroke-linecap="square"`, {
    fill: 'none', stroke: 'signal', strokeWidth: 2, cls: 'rise', delay,
  });
}

export function drawTerms(d: Drawing, b: Box): number {
  const wide = b.frame === 'wide';
  let y = sectionHead(d, b, b.padY, 'Operating conditions');

  const name: TextStyle = { size: wide ? 16 : 15, weight: 600, fill: 'ink', tracking: -0.015 };
  const body: TextStyle = { size: b.s.body, weight: 400, fill: 'ink2' };

  TERMS.forEach((t, i) => {
    const delay = 0.15 + i * 0.08;
    if (i > 0) d.rule(b.x0, y + 0.5, b.x1, y + 0.5, 'rule');
    d.open({ cls: 'rise', delay });
    if (wide) {
      const vx = b.x0 + 220;
      d.text(b.x0, y + 27, t.name, name);
      y = d.paragraph(vx, y + 27, t.detail, body, b.x1 - vx, 20) + 16;
    } else {
      d.text(b.x0, y + 24, t.name, name);
      y = d.paragraph(b.x0, y + 45, t.detail, body, b.x1 - b.x0, 19) + 15;
    }
    d.close();
  });

  y += wide ? 26 : 18;
  d.rule(b.x0, y + 0.5, b.x1, y + 0.5, 'ink', 1, { draw: true, delay: 0.4 });

  const title: TextStyle = { size: wide ? 21 : 18, weight: 600, fill: 'ink', tracking: -0.025 };
  const dest: TextStyle = { size: wide ? 15 : 14, weight: 500, fill: 'ink2' };
  const doorH = wide ? 92 : 84;

  DOORS.forEach((door, i) => {
    const delay = 0.55 + i * 0.12;
    const colW = (b.x1 - b.x0) / 2;
    const x = wide ? b.x0 + i * colW + (i ? 24 : 0) : b.x0;
    const top = wide ? y : y + i * doorH;
    if (wide && i > 0) d.rule(b.x0 + colW + 0.5, top + 18, b.x0 + colW + 0.5, top + doorH - 8, 'rule');
    if (!wide && i > 0) d.rule(b.x0, top + 0.5, b.x1, top + 0.5, 'rule');
    arrow(d, x, top + 36, 24, delay);
    const tx = x + 38;
    const w = d.text(tx, top + 43, door.title, { ...title, cls: 'rise', delay });
    d.rule(tx, top + 52, tx + w, top + 52, 'signal', 2, { draw: true, delay: delay + 0.15 });
    let dx = tx;
    if (i === 1) {
      mark(d, tx, top + 62, 16);
      dx += 24;
    }
    d.text(dx, top + 76, door.dest, { ...dest, cls: 'fade', delay: delay + 0.1 });
  });
  y += wide ? doorH : doorH * DOORS.length;
  return y + b.padY - 8;
}
