/** Cover plate: name, one line, and three live readouts. */

import { IDENTITY } from '../../content.ts';
import type { ProfileReadout } from '../../model.ts';
import { elapsed, int, monthName, percent, revision } from '../format.ts';
import { metaStyle, readoutBlock, type Box, type Readout } from '../layout.ts';
import type { Drawing } from '../svg.ts';

export function coverReadouts(p: ProfileReadout): Readout[] {
  const since = elapsed(p.minutesSinceLastCommit);
  return [
    { label: 'Last serviced', value: since.value, unit: since.unit, detail: 'since the latest commit' },
    p.privateContributions12mo === null
      ? { label: 'Contributions', value: int(p.contributions12mo), detail: 'in the last year' }
      : {
          label: 'Contributions, 12 months',
          value: int(p.contributions12mo),
          detail: `${percent(p.privateContributions12mo, p.contributions12mo)} in private repositories`,
        },
    { label: 'Commits this month', value: int(p.commitsThisMonth), detail: `${monthName(p.monthStart)}, on default branches` },
  ];
}

export function coverAlt(p: ProfileReadout): string {
  const since = elapsed(p.minutesSinceLastCommit);
  return [
    `${IDENTITY.name}, owner's manual, revision ${revision(p.stamp.date)}.`,
    IDENTITY.line,
    `Last serviced ${since.value} ${since.unit} before this page was generated.`,
    p.privateContributions12mo === null
      ? `${int(p.contributions12mo)} contributions in the last year.`
      : `${int(p.contributions12mo)} contributions in the last 12 months, ${percent(p.privateContributions12mo, p.contributions12mo)} of them in private repositories.`,
    `${int(p.commitsThisMonth)} commits in ${monthName(p.monthStart)} on default branches.`,
    `Computed ${p.stamp.date} at commit ${p.stamp.sha}.`,
  ].join(' ');
}

export function drawCover(d: Drawing, b: Box, p: ProfileReadout): number {
  const wide = b.frame === 'wide';
  let y = b.padY;

  const meta = metaStyle(b);
  d.text(b.x0, y + 11, 'Owner’s manual', { ...meta, fill: 'ink', cls: 'fade' });
  d.text(b.x1, y + 11, `Rev ${revision(p.stamp.date)}`, { ...meta, anchor: 'end', cls: 'fade' });
  y += 24;
  d.rule(b.x0, y + 0.5, b.x1, y + 0.5, 'ink', 1, { draw: true });

  y += wide ? 74 : 54;
  // Display type carries a visible left side bearing; pull it back to the rule's edge.
  d.text(b.x0 - (wide ? 3 : 2), y, IDENTITY.name, {
    size: b.s.display, weight: 600, fill: 'ink', tracking: -0.04, cls: 'rise', delay: 0.05,
  });

  y += wide ? 38 : 30;
  y = d.paragraph(b.x0, y, IDENTITY.line, { size: wide ? 20 : 16, weight: 400, fill: 'ink2', cls: 'rise', delay: 0.12 }, b.x1 - b.x0, wide ? 26 : 22);

  y += wide ? 32 : 26;
  y = readoutBlock(d, b, y, coverReadouts(p), p.stamp);
  return y + b.padY;
}
