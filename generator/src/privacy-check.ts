/**
 * Build-time privacy gate. Run after rendering and before committing.
 *
 * 1. Fetches the names of every private repository the account owns or can
 *    read, plus the org's, and asserts none appears in any committable file.
 * 2. Asserts no term from PROFILE_DENYLIST (client and contact names; a secret,
 *    because the list itself is identifying) appears in dist/ or README.md.
 * 3. Asserts every data: URI in dist/ is an embedded font and nothing else.
 *
 * Output never prints a matched name: CI logs on a public repo are public.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseOwnerTokens } from './config.ts';
import { createGitHubPool, GitHubAccessError, type GitHub } from './github.ts';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

function env(key: string): string {
  const v = process.env[key]?.trim();
  if (!v) throw new Error(`Missing environment variable ${key}`);
  return v;
}

/**
 * Names come from each owner's own token (fine-grained tokens have one owner).
 * An org whose private names can't be listed fails the check: names the gate
 * cannot see are not names it has cleared.
 */
async function privateRepoNames(): Promise<string[]> {
  const pool = createGitHubPool(env('GITHUB_TOKEN'), parseOwnerTokens(process.env.PROFILE_ORG_TOKENS));
  const orgs = (process.env.PROFILE_ORGS ?? 'DevPlusLLC').split(',').map((s) => s.trim()).filter(Boolean);
  const names = new Set<string>();
  const pages = async (gh: GitHub, path: string) => {
    for (let page = 1; ; page++) {
      const repos = await gh.get<Array<{ name: string; full_name: string; private: boolean }>>(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
      for (const r of repos) if (r.private) names.add(r.name).add(r.full_name);
      if (repos.length < 100) break;
    }
  };
  await pages(pool.user, '/user/repos?visibility=private&affiliation=owner,collaborator,organization_member');
  for (const [i, org] of orgs.entries()) {
    try {
      await pages(pool.forOwner(org), `/orgs/${encodeURIComponent(org)}/repos?type=private`);
    } catch (err) {
      if (!(err instanceof GitHubAccessError)) throw err;
      throw new Error(`Cannot list private repositories for organization #${i + 1}; set its token in PROFILE_ORG_TOKENS`);
    }
  }
  return [...names];
}

/** Files that would be committed: tracked plus untracked-not-ignored, minus tracked files deleted from disk. */
function committableFiles(): string[] {
  const out = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: ROOT, encoding: 'utf8' });
  return [...new Set(out.split('\0').filter(Boolean))].filter((f) => existsSync(ROOT + f));
}

/** Text with embedded font payloads removed (random base64 can contain any short word), plus a tag-stripped copy so words split across elements or wrapped lines still match. */
function searchable(raw: string): string {
  const noFonts = raw.replace(/data:font\/woff2;base64,[A-Za-z0-9+/=]+/g, 'data:font/woff2;base64,');
  const textOnly = noFonts.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  return `${noFonts}\n${textOnly}`;
}

/**
 * Bare repository names that are plain software vocabulary ("core", "backend")
 * identify nobody and occur in ordinary copy ("cairn-core", "Backend: NestJS").
 * They are exempt as bare words only; their owner/name form is still checked,
 * and every exemption actually applied is printed.
 */
const GENERIC_NAMES = new Set(['api', 'app', 'backend', 'client', 'core', 'docs', 'frontend', 'server', 'web', 'website']);

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Whole-token match. Repo names: case-insensitive. Denylist: case-insensitive unless the term is a single capitalized word (e.g. a first name that is also an English word). */
function matcher(term: string, caseSensitive: boolean): RegExp {
  const body = escapeRe(term).replace(/\s+/g, '\\s+');
  return new RegExp(`(?<![A-Za-z0-9])${body}(?![A-Za-z0-9])`, caseSensitive ? '' : 'i');
}

async function main(): Promise<void> {
  const failures: string[] = [];

  const files = committableFiles();
  const allNames = await privateRepoNames();
  const exempt = allNames.filter((n) => GENERIC_NAMES.has(n.toLowerCase()));
  const repoNames = allNames.filter((n) => !GENERIC_NAMES.has(n.toLowerCase()));
  const repoRes = repoNames.map((n) => matcher(n, false));
  for (const f of files) {
    const text = searchable(readFileSync(ROOT + f, 'utf8'));
    repoRes.forEach((re, i) => {
      if (re.test(text)) failures.push(`${f}: contains private repository name #${i + 1}`);
    });
  }
  console.log(`[1] private repository names: ${repoNames.length} checked against ${files.length} committable files`);
  if (exempt.length) console.log(`    exempt as generic vocabulary (bare name only): ${exempt.join(', ')}`);

  const deny = env('PROFILE_DENYLIST').split(',').map((s) => s.trim()).filter(Boolean);
  const published = files.filter((f) => f === 'README.md' || f.startsWith('dist/'));
  for (const f of published) {
    const text = searchable(readFileSync(ROOT + f, 'utf8'));
    deny.forEach((term, i) => {
      if (matcher(term, /^[A-Z][a-z]+$/.test(term)).test(text)) failures.push(`${f}: contains denylisted term #${i + 1}`);
    });
  }
  console.log(`[2] denylisted terms: ${deny.length} checked against ${published.length} published files (dist/, README.md)`);

  let dataUris = 0;
  for (const f of published.filter((p) => p.endsWith('.svg'))) {
    for (const m of readFileSync(ROOT + f, 'utf8').matchAll(/data:([^;,"')]+)/g)) {
      dataUris++;
      if (m[1] !== 'font/woff2') failures.push(`${f}: unexpected data URI type`);
    }
    if (/(?:href|src)="(?!data:)|url\((?!data:)/.test(readFileSync(ROOT + f, 'utf8'))) failures.push(`${f}: external reference`);
  }
  console.log(`[3] self-contained SVGs: ${dataUris} data URIs, all must be font/woff2; no external references`);

  if (failures.length) {
    console.error(`\nPRIVACY CHECK FAILED (${failures.length})`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log('\nPRIVACY CHECK PASSED');
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : 'privacy check failed');
  process.exit(1);
});
