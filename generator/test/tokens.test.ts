/**
 * Per-owner token routing and graceful degradation.
 *
 * The fake API behaves like fine-grained tokens: each token reads exactly one
 * owner; anything else comes back FORBIDDEN (GraphQL) or 403 (REST).
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { collectProfile } from '../src/collect/profile.ts';
import { collectSystems } from '../src/collect/systems.ts';
import { parseOwnerTokens, type Config, type SystemSource } from '../src/config.ts';
import { createGitHubPool } from '../src/github.ts';
import type { SystemReadout } from '../src/model.ts';
import { calendarHtml, days } from './helpers.ts';

const USER = 'isaacriehm';
const ORG = 'DevPlusLLC';
const T_USER = 'tok-user';
const T_ORG = 'tok-org';
const READS: Record<string, string> = { [T_USER]: USER.toLowerCase(), [T_ORG]: ORG.toLowerCase() };
const NOW = new Date('2026-10-04T12:00:00Z');
const OID = 'abcdef0123456789abcdef0123456789abcdef01';

interface Call {
  token: string;
  owner: string;
}

function fakeApi() {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    const token = String((init.headers as Record<string, string>).authorization).replace('Bearer ', '');
    const ok = (owner: string) => READS[token] === owner.toLowerCase();
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

    if (url.startsWith('https://github.com/users/')) {
      // The public calendar is fetched without credentials.
      assert.equal((init.headers as Record<string, string>).authorization, undefined);
      return new Response(calendarHtml(days(10)), { status: 200 });
    }
    if (init.method === 'GET') {
      const owner = decodeURIComponent(url.split('/repos/')[1]!.split('/')[0]!);
      calls.push({ token, owner });
      if (!ok(owner)) return json({ message: 'Resource not accessible' }, 403);
      return json({ truncated: false, tree: [{ path: 'a.test.ts', type: 'blob' }, { path: 'b.ts', type: 'blob' }] });
    }

    const { query, variables: v } = JSON.parse(String(init.body)) as { query: string; variables: Record<string, string> };
    const forbidden = () => json({ data: null, errors: [{ type: 'FORBIDDEN' }] });

    if (query.includes('contributionsCollection')) {
      calls.push({ token, owner: USER });
      return json({ data: { user: { id: 'U1', contributionsCollection: { restrictedContributionsCount: 9, contributionCalendar: { totalContributions: 10 } } } } });
    }
    if (/user\(login: \$login\) \{ id \}/.test(query)) {
      calls.push({ token, owner: USER });
      return json({ data: { user: { id: 'U1' } } });
    }
    if (query.includes('owner: user(') || query.includes('owner: organization(')) {
      const owner = v.login!;
      calls.push({ token, owner });
      if (!ok(owner)) return forbidden();
      const node = { name: `repo-of-${owner}`, owner: { login: owner }, pushedAt: '2026-10-04T11:00:00Z' };
      return json({ data: { owner: { repositories: { nodes: [node], pageInfo: { hasNextPage: false, endCursor: null } } } } });
    }
    if (query.includes('r0: repository(')) {
      const owners = Object.keys(v).filter((k) => /^o\d+$/.test(k)).map((k) => v[k]!);
      for (const owner of owners) calls.push({ token, owner });
      if (!owners.every(ok)) return forbidden();
      const data: Record<string, unknown> = {};
      owners.forEach((owner, j) => {
        data[`r${j}`] = {
          defaultBranchRef: { target: { month: { totalCount: owner === ORG ? 7 : 3 } } },
          refs: { nodes: [{ target: { history: { nodes: [{ oid: OID, committedDate: owner === ORG ? '2026-10-04T11:30:00Z' : '2026-10-04T10:00:00Z' }] } } }] },
        };
      });
      return json({ data });
    }
    if (query.includes('object(oid:')) {
      calls.push({ token, owner: v.owner! });
      if (!ok(v.owner!)) return forbidden();
      return json({ data: { repository: { object: { history: { nodes: [{ committedDate: '2026-10-01T00:00:00Z' }], pageInfo: { hasNextPage: false, endCursor: null } } } } } });
    }
    if (query.includes('releases(')) {
      calls.push({ token, owner: v.owner! });
      if (!ok(v.owner!)) return forbidden();
      const commit = { oid: OID, tree: { oid: 'tree' }, all: { totalCount: 4 }, mine: { totalCount: 4 } };
      return json({ data: { repository: { isPrivate: true, stargazerCount: 0, releases: { nodes: [] }, defaultBranchRef: { target: commit }, branch: { target: commit } } } });
    }
    throw new Error(`fake API: unhandled query ${query.slice(0, 60)}`);
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

const SOURCES: SystemSource[] = [
  { label: 'claims', owner: ORG, name: 'private-client-repo', branch: 'main' },
  { label: 'cairn', owner: USER, name: 'cairn', branch: 'main' },
];

const cfg = (ownerTokens: Map<string, string>): Config => ({
  token: T_USER, ownerTokens, contributionsToken: null, now: NOW, login: USER, orgs: [ORG], timeZone: 'UTC', systems: SOURCES,
});

const LAST_GOOD: SystemReadout = {
  label: 'claims', commits: 2378, authoredCommits: 2356, testFiles: 776, sourceFiles: 1171, migrations: 0,
  firstCommit: '2026-04-01', lastCommit: '2026-10-03', activeDays: 150, publicFacts: null,
  stamp: { date: '2026-10-03', sha: 'a323da1' },
};

describe('PROFILE_ORG_TOKENS', () => {
  it('parses owner=token pairs, case-insensitive owners', () => {
    const m = parseOwnerTokens('DevPlusLLC=abc; Other-Org=def');
    assert.equal(m.get('devplusllc'), 'abc');
    assert.equal(m.get('other-org'), 'def');
    assert.equal(parseOwnerTokens(undefined).size, 0);
  });

  it('errors never echo a token', () => {
    assert.throws(() => parseOwnerTokens('DevPlusLLC github_pat_SECRET'), (e: Error) => !e.message.includes('SECRET'));
    assert.throws(() => parseOwnerTokens('A=github_pat_SECRET;a=x'), (e: Error) => !e.message.includes('SECRET'));
  });
});

describe('routing', () => {
  it('every call about an owner uses that owner’s token; user-level calls use the default', async () => {
    const api = fakeApi();
    const pool = createGitHubPool(T_USER, new Map([[ORG.toLowerCase(), T_ORG]]), api.fetchImpl);
    const logs: string[] = [];
    const profile = await collectProfile(pool, cfg(new Map([[ORG.toLowerCase(), T_ORG]])), NOW, (l) => logs.push(l), api.fetchImpl);
    const systems = await collectSystems(pool, SOURCES, 'U1', NOW, 'UTC', {}, (l) => logs.push(l));

    assert.ok(api.calls.length > 0);
    for (const c of api.calls) assert.equal(c.token, c.owner.toLowerCase() === ORG.toLowerCase() ? T_ORG : T_USER, `call about ${c.owner}`);
    assert.deepEqual(logs.filter((l) => !l.startsWith('contributions:')), []);
    assert.equal(profile.commitsThisMonth, 10); // 3 (user) + 7 (org)
    assert.equal(profile.minutesSinceLastCommit, 30); // the org commit is the newest
    assert.deepEqual(systems.map((s) => s.label), ['claims', 'cairn']);
  });
});

describe('fallback when an owner has no usable token', () => {
  it('the cover drops the org from the scan and the run continues', async () => {
    const api = fakeApi();
    const logs: string[] = [];
    const profile = await collectProfile(createGitHubPool(T_USER, new Map(), api.fetchImpl), cfg(new Map()), NOW, (l) => logs.push(l), api.fetchImpl);
    logs.splice(0, logs.length, ...logs.filter((l) => !l.startsWith('contributions:')));
    assert.equal(profile.commitsThisMonth, 3); // user repos only
    assert.equal(profile.minutesSinceLastCommit, 120);
    assert.equal(logs.length, 1);
    assert.match(logs[0]!, /left out of the activity scan/);
    assert.ok(!logs[0]!.includes('repo-of-'), 'log names no repository');
  });

  it('a system it cannot read keeps its last-good values, with one log line naming only the label', async () => {
    const api = fakeApi();
    const logs: string[] = [];
    const systems = await collectSystems(createGitHubPool(T_USER, new Map(), api.fetchImpl), SOURCES, 'U1', NOW, 'UTC', { claims: LAST_GOOD }, (l) => logs.push(l));
    assert.deepEqual(systems[0], LAST_GOOD);
    assert.equal(systems[1]!.label, 'cairn');
    assert.equal(logs.length, 1);
    assert.match(logs[0]!, /^system "claims": .*kept last-good values from 2026-10-03$/);
    assert.ok(!logs[0]!.includes('private-client-repo') && !logs[0]!.includes(ORG), 'log names no repository or owner');
  });

  it('with no last-good values, that figure is left out instead of failing the run', async () => {
    const api = fakeApi();
    const logs: string[] = [];
    const systems = await collectSystems(createGitHubPool(T_USER, new Map(), api.fetchImpl), SOURCES, 'U1', NOW, 'UTC', {}, (l) => logs.push(l));
    assert.deepEqual(systems.map((s) => s.label), ['cairn']);
    assert.match(logs[0]!, /figure left out/);
  });
});
