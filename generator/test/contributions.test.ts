/**
 * The cover's contribution count matches GitHub's own header, and the private
 * share is published only when the API's view agrees with it within 1%.
 */

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { collectContributions, parseCalendar } from '../src/collect/contributions.ts';
import { createGitHubPool, type GitHub } from '../src/github.ts';
import type { Readouts } from '../src/model.ts';
import { loadFonts } from '../src/render/fonts.ts';
import { renderAll } from '../src/render/index.ts';
import { calendarHtml, days } from './helpers.ts';

function apiReturning(total: number, restricted: number, seen: Array<Record<string, unknown>> = []): GitHub {
  return {
    async graphql<T>(_q: string, vars?: Record<string, unknown>): Promise<T> {
      seen.push(vars ?? {});
      return { user: { contributionsCollection: { restrictedContributionsCount: restricted, contributionCalendar: { totalContributions: total } } } } as T;
    },
    async get<T>(): Promise<T> {
      throw new Error('unused');
    },
  };
}

describe('public contribution calendar', () => {
  it('reads the heading, the per-day sum and the date range', () => {
    const cal = parseCalendar(calendarHtml(days(11_792)));
    assert.deepEqual(cal, { total: 11_792, daySum: 11_792, from: '2025-10-05', to: '2026-10-05' });
  });

  it('refuses a page without the heading rather than guessing', () => {
    assert.throws(() => parseCalendar('<html><h2 id="js-contribution-activity-description">Activity</h2></html>'));
  });
});

describe('private share gating', () => {
  const cal = parseCalendar(calendarHtml(days(11_792)));

  it('publishes the share when the API agrees within 1% (the gh OAuth case)', async () => {
    const seen: Array<Record<string, unknown>> = [];
    const logs: string[] = [];
    const c = await collectContributions(apiReturning(11_793, 11_147, seen), 'isaacriehm', cal, (l) => logs.push(l));
    assert.deepEqual(c, { total: 11_792, privateCount: 11_147 });
    // Same window as the public calendar.
    assert.deepEqual(seen[0], { login: 'isaacriehm', from: '2025-10-05T00:00:00Z', to: '2026-10-05T23:59:59Z' });
    assert.match(logs.at(-1)!, /private share published/);
  });

  it('withholds the share when the API sees only part of the calendar (the fine-grained token case)', async () => {
    const logs: string[] = [];
    const c = await collectContributions(apiReturning(1_244, 597, []), 'isaacriehm', cal, (l) => logs.push(l));
    assert.deepEqual(c, { total: 11_792, privateCount: null });
    assert.match(logs.at(-1)!, /private share dropped/);
  });

  it('the total is always the public heading, even when the day cells disagree', async () => {
    const odd = parseCalendar(calendarHtml(days(11_790), { heading: 11_792 }));
    const logs: string[] = [];
    const c = await collectContributions(apiReturning(11_792, 11_000, []), 'isaacriehm', odd, (l) => logs.push(l));
    assert.equal(c.total, 11_792);
    assert.match(logs[0]!, /day cells sum to 11790; using the heading/);
  });

  it('the contributions query uses its own token when one is configured', async () => {
    const tokens: string[] = [];
    const fake = (async (_url: string, init: RequestInit) => {
      tokens.push(String((init.headers as Record<string, string>).authorization));
      return new Response(JSON.stringify({ data: { user: { contributionsCollection: { restrictedContributionsCount: 1, contributionCalendar: { totalContributions: 11_792 } } } } }));
    }) as unknown as typeof fetch;
    const pool = createGitHubPool('user-token', new Map(), fake, 'workflow-token');
    await collectContributions(pool.contributions, 'isaacriehm', cal, () => {});
    assert.deepEqual(tokens, ['Bearer workflow-token']);
  });
});

describe('cover without a trusted share', () => {
  it('shows the public total with "in the last year" and no percentage', async () => {
    const fixture = JSON.parse(await readFile(new URL('./fixtures/readouts.json', import.meta.url), 'utf8')) as Readouts;
    const r = { ...fixture, profile: { ...fixture.profile, contributions12mo: 11_792, privateContributions12mo: null } };
    const files = await renderAll(r, await loadFonts());
    for (const v of ['light', 'dark', 'narrow']) {
      const svg = files.get(`cover-${v}.svg`)!;
      const text = [...svg.matchAll(/<tspan[^>]*>([^<]*)<\/tspan>/g)].map((m) => m[1]).join(' | ');
      assert.ok(text.includes('11,792'), v);
      assert.ok(text.includes('in the last year'), v);
      assert.ok(!/\d+%/.test(text), `${v}: no percentage`);
    }
  });
});
