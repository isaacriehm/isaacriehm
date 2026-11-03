/**
 * The privacy guarantee: repository names, paths, branch names and commit
 * messages returned by the API never leave the collectors, and the render
 * layer refuses any input that could carry them.
 */

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { collectSystems, toReadout, type RawSystem } from '../src/collect/systems.ts';
import { classifyPaths } from '../src/collect/classify.ts';
import { parseSystems } from '../src/config.ts';
import { assertReadOnlyQuery, createGitHub, type GitHub, type GitHubPool } from '../src/github.ts';
import { assertPublic, type Readouts } from '../src/model.ts';
import { loadFonts, wrapBalanced } from '../src/render/fonts.ts';
import { assertDistinctDetails, renderAll } from '../src/render/index.ts';

const SECRET_OWNER = 'SecretOwnerCo';
const SECRET_REPO = 'acme-dental-billing';
const SECRET_BRANCH = 'client-acme-demo';
const SECRET_PATH = 'src/acme-dental/claims.spec.ts';
const SECRET_MESSAGE = 'fix: Acme Dental payer mapping';
const SECRETS = [SECRET_OWNER, SECRET_REPO, SECRET_BRANCH, 'acme', 'Acme', SECRET_MESSAGE];

function assertNoSecrets(text: string): void {
  for (const s of SECRETS) assert.ok(!text.includes(s), `leaked "${s}"`);
}

/** A fake API that answers with identifying data everywhere it can. */
function leakyGitHub(isPrivate: boolean): GitHub {
  return {
    async graphql<T>(): Promise<T> {
      const commit = {
        oid: 'abcdef0123456789abcdef0123456789abcdef01',
        message: SECRET_MESSAGE,
        tree: { oid: 'tree0' },
        all: { totalCount: 42 },
        mine: { totalCount: 40 },
      };
      return {
        repository: {
          object: {
            history: {
              nodes: [
                { committedDate: '2026-10-02T18:00:00Z', message: SECRET_MESSAGE, author: { name: SECRET_OWNER } },
                { committedDate: '2026-09-01T18:00:00Z', message: SECRET_MESSAGE, author: { name: SECRET_OWNER } },
              ],
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
          name: SECRET_REPO,
          nameWithOwner: `${SECRET_OWNER}/${SECRET_REPO}`,
          isPrivate,
          stargazerCount: 3,
          releases: { nodes: [{ tagName: 'v1.2.3', publishedAt: '2026-09-15T00:00:00Z', name: SECRET_MESSAGE }] },
          defaultBranchRef: { name: SECRET_BRANCH, target: commit },
          branch: { name: SECRET_BRANCH, target: commit },
        },
      } as T;
    },
    async get<T>(): Promise<T> {
      return {
        truncated: false,
        tree: [
          { path: SECRET_PATH, type: 'blob' },
          { path: `src/${SECRET_REPO}/index.ts`, type: 'blob' },
          { path: 'db/migrations/0001_acme.sql', type: 'blob' },
          { path: 'node_modules/x/y.test.ts', type: 'blob' },
        ],
      } as T;
    },
  };
}

const NOW = new Date('2026-10-04T12:00:00Z');

const poolOf = (gh: GitHub): GitHubPool => ({ user: gh, contributions: gh, forOwner: () => gh });

describe('collection drops identifying data', () => {
  it('a private system yields only label, counts and a short SHA', async () => {
    const [r] = await collectSystems(
      poolOf(leakyGitHub(true)),
      [{ label: 'claims', owner: SECRET_OWNER, name: SECRET_REPO, branch: SECRET_BRANCH }],
      'author-id',
      NOW,
      'America/Phoenix',
    );
    const json = JSON.stringify(r);
    assertNoSecrets(json);
    assertPublic(r);
    assert.deepEqual(r, {
      label: 'claims',
      commits: 42,
      authoredCommits: 40,
      testFiles: 1,
      sourceFiles: 1,
      migrations: 1,
      firstCommit: '2026-09-01',
      lastCommit: '2026-10-02',
      activeDays: 2,
      publicFacts: null,
      stamp: { date: '2026-10-04', sha: 'abcdef0' },
    });
  });

  it('stars and release tags are kept only for public repositories', () => {
    const raw: RawSystem = {
      isPrivate: false, stars: 6, latestRelease: 'v0.33.0', latestReleaseAt: '2026-07-28T02:57:22Z',
      headOid: '702a5bf0', commits: 1, authoredCommits: 1, paths: [], commitTimes: ['2026-07-28T02:57:22Z'],
    };
    assert.deepEqual(toReadout('cairn', raw, NOW, 'UTC').publicFacts, { stars: 6, latestRelease: 'v0.33.0', releasedOn: '2026-07-28' });
    assert.equal(toReadout('cairn', { ...raw, isPrivate: true }, NOW, 'UTC').publicFacts, null);
    // A release tag that is not a version string could be a name; it is dropped.
    assert.equal(toReadout('cairn', { ...raw, latestRelease: 'acme-launch' }, NOW, 'UTC').publicFacts?.latestRelease, null);
  });

  it('errors name the label, never the repository', async () => {
    // Repository readable, configured branch missing: a config error, which must fail the run.
    const gh: GitHub = {
      graphql: async <T>() => ({ repository: { isPrivate: true, stargazerCount: 0, releases: { nodes: [] }, defaultBranchRef: null, branch: null } }) as T,
      get: async <T>() => ({}) as T,
    };
    await assert.rejects(
      collectSystems(poolOf(gh), [{ label: 'portal', owner: SECRET_OWNER, name: SECRET_REPO, branch: SECRET_BRANCH }], 'id', NOW, 'UTC', {}, () => {}),
      (e: Error) => e.message.includes('"portal"') && !e.message.includes(SECRET_REPO) && !e.message.includes(SECRET_OWNER) && !e.message.includes(SECRET_BRANCH),
    );
  });

  it('config errors do not echo allowlist entries', () => {
    assert.throws(() => parseSystems(`claims=${SECRET_OWNER}/${SECRET_REPO}@x;bogus`), (e: Error) => !e.message.includes(SECRET_REPO));
    assert.throws(() => parseSystems(`${SECRET_REPO}=a/b`), (e: Error) => !e.message.includes(SECRET_REPO));
  });
});

describe('the render layer accepts labels and numbers only', () => {
  it('assertPublic rejects free text anywhere in the readouts', async () => {
    const fixture = JSON.parse(await readFile(new URL('./fixtures/readouts.json', import.meta.url), 'utf8')) as Readouts;
    assertPublic(fixture);
    const smuggled = structuredClone(fixture) as unknown as { systems: { claims: Record<string, unknown> } };
    smuggled.systems.claims.label = SECRET_REPO;
    assert.throws(() => assertPublic(smuggled));
    const extraKey = structuredClone(fixture) as unknown as { systems: { claims: Record<string, unknown> } };
    extraKey.systems.claims.repo = SECRET_REPO;
    assert.throws(() => assertPublic(extraKey));
  });

  it('renderAll refuses tainted readouts and renders clean ones without them', async () => {
    const fonts = await loadFonts();
    const fixture = JSON.parse(await readFile(new URL('./fixtures/readouts.json', import.meta.url), 'utf8')) as Readouts;
    const tainted = structuredClone(fixture) as unknown as { profile: { stamp: { sha: string } } };
    tainted.profile.stamp.sha = SECRET_BRANCH;
    await assert.rejects(renderAll(tainted as unknown as Readouts, fonts));
    const files = await renderAll(fixture, fonts);
    assert.equal(files.size, 18);
    for (const svg of files.values()) {
      assertNoSecrets(svg);
      // Self-contained: the only URL scheme inside is an embedded font.
      const urls = [...svg.matchAll(/url\(([^)]*)\)|(?:href|src)="([^"]*)"/g)].map((m) => m[1] ?? m[2] ?? '');
      for (const u of urls) assert.ok(u.startsWith('data:font/woff2;base64,'), `external reference: ${u.slice(0, 40)}`);
    }
  });
});

describe('color and layout contracts', () => {
  it('wide figures are transparent except the black page in light mode; the narrow file switches scheme itself', async () => {
    const fixture = JSON.parse(await readFile(new URL('./fixtures/readouts.json', import.meta.url), 'utf8')) as Readouts;
    const files = await renderAll(fixture, await loadFonts());
    for (const [name, svg] of files) {
      const backdrop = /<rect class="backdrop"[^>]*fill="(#[0-9A-F]{6})"/.exec(svg)?.[1] ?? null;
      const switches = svg.includes('@media (prefers-color-scheme:dark){svg{');
      if (name === 'terms-light.svg') assert.equal(backdrop, '#111111', name);
      else if (name.endsWith('-narrow.svg')) {
        assert.ok(switches, `${name} must switch palette`);
        assert.equal(backdrop, name.startsWith('terms') ? '#111111' : '#FFFFFF', name);
      } else {
        assert.equal(backdrop, null, `${name} must be transparent`);
        assert.ok(!switches, `${name} has a fixed palette`);
      }
      // Paint goes through palette tokens only.
      assert.ok(!/(fill|stroke)="#/.test(svg.replace(/<rect class="backdrop"[^>]*>/, '')), `${name} paints a literal color`);
    }
  });

  it('README never combines prefers-color-scheme with another media condition', async () => {
    const readme = await readFile(new URL('../../README.md', import.meta.url), 'utf8');
    const medias = [...readme.matchAll(/media="([^"]*)"/g)].map((m) => m[1]!);
    assert.ok(medias.length > 0);
    for (const m of medias) if (m.includes('prefers-color-scheme')) assert.equal(m, '(prefers-color-scheme: dark)');
  });

  it('balanced wrapping refuses to strand a single word', async () => {
    const fonts = await loadFonts();
    const lines = wrapBalanced(fonts, 'Jest, Vitest, Playwright, GitHub Actions, Docker, Linux, AWS S3, Google Cloud', 400, 14, 520);
    assert.ok(lines.every((l) => l.includes(' ')));
    assert.throws(() => wrapBalanced(fonts, 'one two three', 400, 14, 40));
  });

  it('no readout sublabel repeats across the page', async () => {
    const fixture = JSON.parse(await readFile(new URL('./fixtures/readouts.json', import.meta.url), 'utf8')) as Readouts;
    assert.doesNotThrow(() => assertDistinctDetails(fixture));
    const twin = structuredClone(fixture) as unknown as { systems: { portal: { testFiles: number } } };
    twin.systems.portal.testFiles = 5; // portal would then reuse the claims "Test files" sublabel
    assert.throws(() => assertDistinctDetails(twin as unknown as Readouts));
  });
});

describe('the GitHub client is read-only', () => {
  it('refuses mutations and subscriptions, even disguised', () => {
    assert.throws(() => assertReadOnlyQuery('mutation { deleteRepository(input: {}) { clientMutationId } }'));
    assert.throws(() => assertReadOnlyQuery('# query\nmutation X { a }'));
    assert.throws(() => assertReadOnlyQuery('query { a } mutation { b }'));
    assert.throws(() => assertReadOnlyQuery('subscription { a }'));
    assert.doesNotThrow(() => assertReadOnlyQuery('query($q: String!) { search(query: "mutation") { repositoryCount } }'));
  });

  it('sends only GET requests and GraphQL queries', async () => {
    const seen: Array<{ method: string; url: string; body: string }> = [];
    const fakeFetch = (async (url: string, init: RequestInit) => {
      seen.push({ method: init.method ?? 'GET', url, body: String(init.body ?? '') });
      return new Response(JSON.stringify({ data: {} }), { status: 200 });
    }) as unknown as typeof fetch;
    const gh = createGitHub('t', fakeFetch);
    await gh.get('/repos/a/b');
    await gh.graphql('query { viewer { login } }');
    await assert.rejects(gh.graphql('mutation { x }'));
    assert.equal(seen.length, 2);
    for (const r of seen) {
      if (r.method === 'POST') {
        assert.equal(r.url, 'https://api.github.com/graphql');
        assert.match(JSON.parse(r.body).query, /^query\b/);
      } else assert.equal(r.method, 'GET');
    }
  });
});

describe('file classification', () => {
  it('counts tests, sources and migrations; skips vendored code', () => {
    assert.deepEqual(
      classifyPaths(['a.test.ts', 'b.spec.tsx', 'c.e2e-spec.ts', '__tests__/d.ts', 'e.ts', 'f.d.ts', 'g.tsx', 'migrations/1.sql', 'node_modules/h.test.ts', 'dist/i.ts']),
      { testFiles: 4, sourceFiles: 2, migrations: 1 },
    );
  });
});
