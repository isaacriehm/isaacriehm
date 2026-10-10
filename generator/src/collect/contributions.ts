/**
 * The 12-month contribution count, and its private share when it can be trusted.
 *
 * The total comes from GitHub's public contribution calendar, the page that
 * draws the profile header, fetched without auth. API counts depend on what
 * the querying token can see (a fine-grained token sees only part of the
 * calendar), so the API is used only for the private share, and only when its
 * own total agrees with the public total to within 1%. The cover never shows
 * a number that disagrees with GitHub's header.
 */

import type { GitHub } from '../github.ts';
import type { Log } from './profile.ts';

export interface PublicCalendar {
  /** From the heading "N contributions in the last year". */
  readonly total: number;
  /** Sum of the per-day tooltips; a cross-check on the heading. */
  readonly daySum: number;
  /** First and last calendar day, YYYY-MM-DD. */
  readonly from: string;
  readonly to: string;
}

export function parseCalendar(html: string): PublicCalendar {
  const h2 = /<h2[^>]*id="js-contribution-activity-description"[^>]*>([\s\S]*?)<\/h2>/.exec(html);
  const heading = h2 ? /([\d,]+)\s+contributions?\s+in the last year/.exec(h2[1]!.replace(/\s+/g, ' ')) : null;
  if (!heading) throw new Error('Public contribution calendar: heading not found or not in the expected format');

  let daySum = 0;
  let days = 0;
  for (const [, tip] of html.matchAll(/<tool-tip[^>]*>([^<]*)<\/tool-tip>/g)) {
    const m = /^([\d,]+) contributions? on /.exec(tip!.trim());
    if (m) daySum += Number(m[1]!.replace(/,/g, ''));
    if (m || /^No contributions on /.test(tip!.trim())) days++;
  }
  const dates = [...html.matchAll(/data-date="(\d{4}-\d{2}-\d{2})"/g)].map((m) => m[1]!).sort();
  if (days < 300 || !dates.length) throw new Error('Public contribution calendar: day cells not found');
  return { total: Number(heading[1]!.replace(/,/g, '')), daySum, from: dates[0]!, to: dates[dates.length - 1]! };
}

export async function fetchCalendar(login: string, fetchImpl: typeof fetch = fetch): Promise<PublicCalendar> {
  const res = await fetchImpl(`https://github.com/users/${encodeURIComponent(login)}/contributions`, {
    method: 'GET',
    headers: { 'user-agent': 'isaacriehm-profile-generator' }, // deliberately no auth
  });
  if (!res.ok) throw new Error(`Public contribution calendar: HTTP ${res.status}`);
  return parseCalendar(await res.text());
}

export const AGREEMENT = 0.01;

export interface Contributions {
  readonly total: number;
  /** Private contributions, or null when the API's view can't be reconciled with the public total. */
  readonly privateCount: number | null;
}

export async function collectContributions(gh: GitHub, login: string, cal: PublicCalendar, log: Log): Promise<Contributions> {
  if (cal.daySum !== cal.total) {
    log(`contributions: calendar heading says ${cal.total}, day cells sum to ${cal.daySum}; using the heading`);
  }
  const data = await gh.graphql<{
    user: { contributionsCollection: { restrictedContributionsCount: number; contributionCalendar: { totalContributions: number } } };
  }>(
    `query($login: String!, $from: DateTime!, $to: DateTime!) {
      user(login: $login) {
        contributionsCollection(from: $from, to: $to) {
          restrictedContributionsCount
          contributionCalendar { totalContributions }
        }
      }
    }`,
    { login, from: `${cal.from}T00:00:00Z`, to: `${cal.to}T23:59:59Z` },
  );
  const api = data.user.contributionsCollection;
  const apiTotal = api.contributionCalendar.totalContributions;
  const agrees = cal.total > 0 && Math.abs(apiTotal - cal.total) / cal.total <= AGREEMENT;
  log(
    `contributions: public ${cal.total}, API ${apiTotal} (restricted ${api.restrictedContributionsCount}); ` +
      (agrees ? 'private share published' : 'API disagrees by more than 1%, private share dropped'),
  );
  return { total: cal.total, privateCount: agrees ? api.restrictedContributionsCount : null };
}
