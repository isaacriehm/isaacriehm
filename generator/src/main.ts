/**
 * Entry point: collect (read-only) → render → write dist/, README.md, preview.html.
 *
 *   npm run render            live data; needs GITHUB_TOKEN and PROFILE_SYSTEMS
 *   npm run render:fixture    synthetic data from generator/test/fixtures, no network
 */

import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { collect } from './collect/index.ts';
import { loadConfig } from './config.ts';
import { createGitHubPool } from './github.ts';
import { assertPublic, type Readouts } from './model.ts';
import { loadFonts } from './render/fonts.ts';
import { figures, renderAll } from './render/index.ts';
import { preview, readme } from './render/pages.ts';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

/**
 * Last-good per-system readouts, committed with the figures. A figure whose
 * repository can't be read on a run keeps these values. Labels and numbers
 * only: it passes the same assertPublic gate as everything rendered.
 */
const LAST_GOOD = `${ROOT}dist/last-good.json`;
const FIXTURE = process.argv.includes('--fixture');

async function loadLastGood(): Promise<Readouts['systems']> {
  if (!existsSync(LAST_GOOD)) return {};
  const data = JSON.parse(await readFile(LAST_GOOD, 'utf8')) as { systems: Readouts['systems'] };
  assertPublic(data);
  return data.systems;
}

async function readouts(): Promise<Readouts> {
  if (FIXTURE) {
    const r = JSON.parse(await readFile(`${ROOT}generator/test/fixtures/readouts.json`, 'utf8')) as Readouts;
    assertPublic(r);
    return r;
  }
  const cfg = loadConfig();
  return collect(createGitHubPool(cfg.token, cfg.ownerTokens, fetch, cfg.contributionsToken), cfg, await loadLastGood());
}

async function main(): Promise<void> {
  const r = await readouts();
  const files = await renderAll(r, await loadFonts());

  const dist = `${ROOT}dist/`;
  await mkdir(dist, { recursive: true });
  for (const f of await readdir(dist)) if (f.endsWith('.svg') && !files.has(f)) await rm(dist + f);
  for (const [name, svg] of files) await writeFile(dist + name, svg);

  if (!FIXTURE) await writeFile(LAST_GOOD, JSON.stringify({ systems: r.systems }, null, 2) + '\n');

  const figs = figures(r);
  await writeFile(`${ROOT}README.md`, readme(figs));
  await writeFile(`${ROOT}preview.html`, preview(figs));

  // Labels and numbers only; safe for CI logs.
  const p = r.profile;
  console.log(`profile: last commit ${p.minutesSinceLastCommit} min ago · ${p.contributions12mo} contributions (${p.privateContributions12mo ?? 'share withheld'} private) · ${p.commitsThisMonth} commits since ${p.monthStart} · @${p.stamp.sha}`);
  for (const s of Object.values(r.systems)) {
    console.log(`${s.label}: ${s.commits} commits (${s.authoredCommits} authored) · ${s.testFiles} tests · ${s.sourceFiles} ts · ${s.migrations} migrations · @${s.stamp.sha}`);
  }
  console.log(`wrote ${files.size} SVGs, README.md, preview.html`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : 'render failed');
  process.exit(1);
});
