/** A synthetic page in the shape of github.com/users/<login>/contributions. */
export function calendarHtml(dayCounts: ReadonlyArray<number>, opts: { heading?: number; from?: string } = {}): string {
  const start = Date.parse(`${opts.from ?? '2025-10-05'}T00:00:00Z`);
  const total = dayCounts.reduce((a, b) => a + b, 0);
  const cells = dayCounts.map((n, i) => {
    const date = new Date(start + i * 86_400_000).toISOString().slice(0, 10);
    const tip = n === 0 ? `No contributions on ${date}.` : `${n.toLocaleString('en-US')} contribution${n === 1 ? '' : 's'} on ${date}.`;
    return `<td data-date="${date}" id="c${i}" class="ContributionCalendar-day"></td>\n<tool-tip for="c${i}" popover="manual" class="sr-only">${tip}</tool-tip>`;
  });
  return `<html><body>
<h2 tabindex="-1" id="js-contribution-activity-description" class="f4 text-normal mb-2">
      ${(opts.heading ?? total).toLocaleString('en-US')} contributions
        in the last year
</h2>
<table>${cells.join('\n')}</table></body></html>`;
}

/** 366 days whose counts sum to `total`. */
export function days(total: number): number[] {
  const out = new Array<number>(366).fill(0);
  for (let i = 0; i < total; i++) out[i % 366]!++;
  return out;
}
