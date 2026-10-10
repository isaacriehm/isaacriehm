/** Specifications: a spec table with hairline rules. Static content. */

import { SPECS, UPSTREAM } from '../../content.ts';
import { metaStyle, sectionHead, type Box } from '../layout.ts';
import type { Drawing, TextStyle } from '../svg.ts';

const ROWS = [...SPECS, { label: UPSTREAM.label, value: UPSTREAM.value }];

export function specsAlt(): string {
  return `Specifications. ${ROWS.map((r) => `${r.label}: ${r.value}`).join('. ')}`.replace(/\.\./g, '.');
}

export function drawSpecs(d: Drawing, b: Box): number {
  const wide = b.frame === 'wide';
  let y = sectionHead(d, b, b.padY, 'Specifications');
  const value: TextStyle = { size: b.s.body, weight: 400, fill: 'ink2' };
  const lead = wide ? 20 : 19;

  ROWS.forEach((row, i) => {
    const delay = 0.15 + i * 0.06;
    const last = i === ROWS.length - 1;
    if (i > 0) d.rule(b.x0, y + 0.5, b.x1, y + 0.5, last ? 'ink' : 'rule');
    if (wide) {
      const vx = b.x0 + 160;
      const label: TextStyle = { size: b.s.body, weight: 600, fill: 'ink', tracking: -0.01 };
      d.open({ cls: 'rise', delay });
      d.text(b.x0, y + 25, row.label, label);
      const end = d.paragraph(vx, y + 25, row.value, value, b.x1 - vx, lead);
      d.close();
      y = end + 15;
    } else {
      d.open({ cls: 'rise', delay });
      d.text(b.x0, y + 21, row.label, metaStyle(b, 'ink'));
      const end = d.paragraph(b.x0, y + 42, row.value, value, b.x1 - b.x0, lead);
      d.close();
      y = end + 14;
    }
  });
  d.rule(b.x0, y + 0.5, b.x1, y + 0.5, 'rule');
  return y + b.padY;
}
