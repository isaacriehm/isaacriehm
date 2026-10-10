/**
 * Local review only: rasterize every SVG in dist/ the way GitHub shows it, as
 * an <img> at the README column width (830px) or a phone's (343px inside a
 * 375px viewport), at 2x, on a 16px margin of the GitHub page color. Reduced motion is forced so the capture shows the
 * settled state (headless capture does not advance animations inside <img>);
 * MOTION=1 disables that to inspect a frame of the animation.
 *
 *   npm run rasterize    → review/png/*.png
 */

import { execFile } from 'node:child_process';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

interface Shot {
  readonly svg: string;
  readonly name: string;
  /** GitHub page behind the image. */
  readonly page: string;
  /**
   * The `color-scheme` set on the page, as GitHub's Primer CSS does from the
   * viewer's GitHub theme. Chrome resolves an SVG image's internal
   * prefers-color-scheme from it, so this is what the narrow file switches on.
   */
  readonly scheme: 'light' | 'dark';
}

/**
 * Wide files are shot on the page they're served to. The narrow file is shot
 * three ways: light, dark, and "fallback" (a renderer that ignores media
 * queries inside SVG images, on GitHub's dark page: Safari before 27).
 */
function shotsFor(svg: string): Shot[] {
  const base = svg.replace(/\.svg$/, '');
  if (svg.endsWith('-narrow.svg')) {
    return [
      { svg, name: `${base}-light`, page: '#FFFFFF', scheme: 'light' },
      { svg, name: `${base}-dark`, page: '#0D1117', scheme: 'dark' },
      // What a renderer that ignores the SVG's media query shows on a dark page.
      { svg, name: `${base}-fallback`, page: '#0D1117', scheme: 'light' },
    ];
  }
  const dark = svg.endsWith('-dark.svg');
  return [{ svg, name: base, page: dark ? '#0D1117' : '#FFFFFF', scheme: dark ? 'dark' : 'light' }];
}

async function shoot(s: Shot): Promise<string> {
  const text = await readFile(`${ROOT}dist/${s.svg}`, 'utf8');
  const m = /viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/.exec(text);
  if (!m) throw new Error(`${s.svg}: no viewBox`);
  const [vw, vh] = [Number(m[1]), Number(m[2])];
  const narrow = s.svg.endsWith('-narrow.svg');
  const imgW = narrow ? 343 : 830;
  const gutter = 16;
  const winW = imgW + gutter * 2;
  const winH = Math.ceil((imgW * vh) / vw) + gutter * 2;
  const html = `${ROOT}review/html/${s.name}.html`;
  await writeFile(
    html,
    `<!doctype html><meta charset="utf-8"><style>html{color-scheme:${s.scheme}}html,body{margin:0;background:${s.page}}body{padding:${gutter}px}img{display:block;width:${imgW}px}</style><img src="${pathToFileURL(`${ROOT}dist/${s.svg}`).href}">`,
  );
  const out = `${ROOT}review/png/${s.name}.png`;
  await run(CHROME, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--allow-file-access-from-files',
    '--force-device-scale-factor=2', ...(process.env.MOTION ? [] : ['--force-prefers-reduced-motion']),
    `--window-size=${winW},${winH}`, '--virtual-time-budget=4000',
    `--screenshot=${out}`, pathToFileURL(html).href,
  ]);
  return out;
}

async function main(): Promise<void> {
  await mkdir(`${ROOT}review/html`, { recursive: true });
  await mkdir(`${ROOT}review/png`, { recursive: true });
  const shots = (await readdir(`${ROOT}dist`)).filter((f) => f.endsWith('.svg')).sort().flatMap(shotsFor);
  for (let i = 0; i < shots.length; i += 4) {
    for (const out of await Promise.all(shots.slice(i, i + 4).map(shoot))) console.log(out.replace(ROOT, ''));
  }
}

await main();
