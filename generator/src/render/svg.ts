/**
 * A small SVG builder. It records every glyph it draws so the document can
 * embed exactly that font subset, owns the shared one-shot motion CSS, and
 * paints only with palette tokens so a file can switch color scheme in CSS.
 */

import { FAMILY, WEIGHTS, wrapBalanced, type Fonts, type Weight } from './fonts.ts';
import { paletteCss, type Coloring, type Token } from './theme.ts';

export interface TextStyle {
  readonly size: number;
  readonly weight: Weight;
  readonly fill: Token;
  readonly anchor?: 'start' | 'middle' | 'end';
  /** em */
  readonly tracking?: number;
  readonly caps?: boolean;
  readonly cls?: string;
  readonly delay?: number;
}

export interface Run {
  readonly text: string;
  readonly style: TextStyle;
}

/** Paint and motion for one element; compiled into a single class and style attribute. */
export interface Paint {
  readonly fill?: Token | 'none';
  readonly stroke?: Token;
  readonly strokeWidth?: number;
  readonly cls?: string;
  readonly delay?: number;
  /** Extra inline declarations, e.g. a custom property for an animation. */
  readonly style?: string;
}

export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export const r2 = (n: number) => Math.round(n * 100) / 100;

function paintAttrs(p: Paint): string {
  const decl: string[] = [];
  if (p.fill) decl.push(`fill:${p.fill === 'none' ? 'none' : `var(--${p.fill})`}`);
  if (p.stroke) decl.push(`stroke:var(--${p.stroke})`);
  if (p.delay) decl.push(`animation-delay:${r2(p.delay)}s`);
  if (p.style) decl.push(p.style);
  const sw = p.strokeWidth !== undefined ? ` stroke-width="${p.strokeWidth}"` : '';
  const cls = p.cls ? ` class="${p.cls}"` : '';
  return `${cls}${sw}${decl.length ? ` style="${decl.join(';')}"` : ''}`;
}

/** One-shot motion: everything settles within about a second and then stops. */
const MOTION_CSS = `
@keyframes rise{from{opacity:0;transform:translateY(6px)}}
@keyframes fade{from{opacity:0}}
@keyframes draw{from{stroke-dashoffset:1}}
@keyframes explode{from{transform:translateY(var(--c,0px))}}
.rise{animation:rise .5s cubic-bezier(.2,.7,.2,1) both}
.fade{animation:fade .4s ease-out both}
.draw{stroke-dasharray:1;stroke-dashoffset:0;animation:draw .6s cubic-bezier(.4,0,.2,1) both}
.explode{animation:explode .75s cubic-bezier(.2,.8,.2,1) both}
@media (prefers-reduced-motion:reduce){*{animation:none!important}}`;

export class Drawing {
  readonly fonts: Fonts;
  readonly width: number;
  private readonly parts: string[] = [];
  private readonly glyphs = new Map<Weight, Set<string>>();

  constructor(fonts: Fonts, width: number) {
    this.fonts = fonts;
    this.width = width;
  }

  private record(text: string, weight: Weight): void {
    let set = this.glyphs.get(weight);
    if (!set) this.glyphs.set(weight, (set = new Set()));
    for (const ch of text) set.add(ch);
  }

  measure(text: string, style: Pick<TextStyle, 'size' | 'weight' | 'tracking' | 'caps'>): number {
    const t = style.caps ? text.toUpperCase() : text;
    return this.fonts.measure(t, style.weight, style.size, style.tracking ?? 0);
  }

  /** Balanced wrap; refuses to leave a single word alone on a line of multi-word copy. */
  wrap(text: string, style: Pick<TextStyle, 'size' | 'weight'>, maxWidth: number): string[] {
    return wrapBalanced(this.fonts, text, style.weight, style.size, maxWidth);
  }

  /** Draws one line of text; returns its advance width. */
  text(x: number, y: number, text: string, s: TextStyle): number {
    return this.runs(x, y, [{ text, style: s }], s.anchor, s.cls, s.delay);
  }

  /** Draws mixed-style runs on one baseline; returns the total advance width. */
  runs(x: number, y: number, runs: ReadonlyArray<Run>, anchor: TextStyle['anchor'] = 'start', cls?: string, delay?: number): number {
    let width = 0;
    const spans = runs.map(({ text, style }) => {
      const t = style.caps ? text.toUpperCase() : text;
      this.record(t, style.weight);
      width += this.fonts.measure(t, style.weight, style.size, style.tracking ?? 0);
      const ls = style.tracking ? ` letter-spacing="${r2(style.tracking * style.size)}"` : '';
      return `<tspan font-size="${style.size}" font-weight="${style.weight}"${ls}${paintAttrs({ fill: style.fill })}>${esc(t)}</tspan>`;
    });
    const a = anchor !== 'start' ? ` text-anchor="${anchor}"` : '';
    this.parts.push(`<text x="${r2(x)}" y="${r2(y)}"${a}${paintAttrs({ ...(cls ? { cls } : {}), ...(delay ? { delay } : {}) })}>${spans.join('')}</text>`);
    return width;
  }

  /** Wrapped paragraph. Returns the y of the last baseline. */
  paragraph(x: number, y: number, text: string, s: TextStyle, maxWidth: number, leading: number): number {
    const lines = this.wrap(text, s, maxWidth);
    lines.forEach((line, i) => this.text(x, y + i * leading, line, s));
    return y + (lines.length - 1) * leading;
  }

  /** Straight rule. Set `draw` to animate it drawing in. */
  rule(x1: number, y1: number, x2: number, y2: number, stroke: Token, width = 1, opts: { draw?: boolean; delay?: number; dash?: string } = {}): void {
    const dash = opts.dash ? ` stroke-dasharray="${opts.dash}"` : '';
    const len = opts.draw ? ' pathLength="1"' : '';
    const p = paintAttrs({ fill: 'none', stroke, strokeWidth: width, ...(opts.draw ? { cls: 'draw' } : {}), ...(opts.delay ? { delay: opts.delay } : {}) });
    this.parts.push(`<path d="M${r2(x1)} ${r2(y1)}L${r2(x2)} ${r2(y2)}"${dash}${len}${p}/>`);
  }

  /** Any shape element with geometry attributes and a paint. */
  shape(tag: 'path' | 'polygon' | 'circle' | 'rect', geometry: string, paint: Paint): void {
    this.parts.push(`<${tag} ${geometry}${paintAttrs(paint)}/>`);
  }

  open(paint: Paint & { transform?: string } = {}): void {
    const t = paint.transform ? ` transform="${paint.transform}"` : '';
    this.parts.push(`<g${t}${paintAttrs(paint)}>`);
  }

  close(): void {
    this.parts.push('</g>');
  }

  /** Numbered callout: a signal disc with the number reversed out. */
  callout(cx: number, cy: number, n: number, r = 11, delay?: number): void {
    const s: TextStyle = { size: r * 1.15, weight: 600, fill: 'onSignal', anchor: 'middle' };
    this.open({ cls: 'rise', ...(delay ? { delay } : {}) });
    this.shape('circle', `cx="${r2(cx)}" cy="${r2(cy)}" r="${r}"`, { fill: 'signal' });
    this.text(cx, cy + s.size * 0.36, String(n), s);
    this.close();
  }

  async render(height: number, title: string, desc: string, coloring: Coloring): Promise<string> {
    const faces: string[] = [];
    for (const w of WEIGHTS) {
      const set = this.glyphs.get(w);
      if (!set?.size) continue;
      const b64 = await this.fonts.embed(w, [...set].join(''));
      faces.push(`@font-face{font-family:${FAMILY};font-weight:${w};src:url(data:font/woff2;base64,${b64}) format('woff2')}`);
    }
    const h = Math.ceil(height);
    const css = `${faces.join('\n')}
${paletteCss(coloring)}
text{font-family:${FAMILY},sans-serif;font-feature-settings:'tnum' 1,'kern' 1}${MOTION_CSS}`;
    return [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${this.width}" height="${h}" viewBox="0 0 ${this.width} ${h}" role="img" aria-labelledby="t d">`,
      `<title id="t">${esc(title)}</title>`,
      `<desc id="d">${esc(desc)}</desc>`,
      `<style>${css}</style>`,
      ...(coloring.backdrop ? [`<rect class="backdrop" width="${this.width}" height="${h}" fill="${coloring.backdrop}"/>`] : []),
      ...this.parts,
      '</svg>',
    ].join('\n');
  }
}
