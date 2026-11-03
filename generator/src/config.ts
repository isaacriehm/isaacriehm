/**
 * Runtime configuration, read from the environment.
 *
 * PROFILE_SYSTEMS maps public labels to repositories. Private repository names
 * identify clients, so this value lives only in an untracked .env (local) or an
 * Actions secret (CI). It is never committed and never logged.
 *
 *   PROFILE_SYSTEMS="claims=owner/repo@branch;portal=owner/repo;cairn=owner/repo@main"
 *
 * Omitting "@branch" means the repository's default branch.
 */

import { SYSTEM_LABELS, type SystemLabel } from './model.ts';

export interface SystemSource {
  readonly label: SystemLabel;
  readonly owner: string;
  readonly name: string;
  /** null = the repository's default branch. */
  readonly branch: string | null;
}

export interface Config {
  /** Default token: user-level queries and any owner without its own token. */
  readonly token: string;
  /**
   * Per-owner tokens, keyed by lowercased owner login. Fine-grained tokens have
   * a single resource owner, so an organization needs its own.
   */
  readonly ownerTokens: ReadonlyMap<string, string>;
  /** Token for the contributions query (in Actions, the workflow's own GITHUB_TOKEN); null = default token. */
  readonly contributionsToken: string | null;
  /** Fixed clock for reproducible renders; null means the real time. */
  readonly now: Date | null;
  readonly login: string;
  readonly orgs: ReadonlyArray<string>;
  readonly timeZone: string;
  readonly systems: ReadonlyArray<SystemSource>;
}

const ENTRY = /^([a-z]+)=([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+)(?:@([A-Za-z0-9._\/-]+))?$/;

export function parseSystems(raw: string): SystemSource[] {
  const out: SystemSource[] = [];
  for (const part of raw.split(/[;\n]/).map((s) => s.trim()).filter(Boolean)) {
    const m = ENTRY.exec(part);
    // The error never echoes the entry: it may contain a private repo name.
    if (!m) throw new Error(`PROFILE_SYSTEMS: entry ${out.length + 1} is malformed`);
    const label = m[1] as SystemLabel;
    if (!SYSTEM_LABELS.includes(label)) {
      throw new Error(`PROFILE_SYSTEMS: entry ${out.length + 1} uses an unknown label`);
    }
    if (out.some((s) => s.label === label)) {
      throw new Error(`PROFILE_SYSTEMS: label "${label}" appears twice`);
    }
    out.push({ label, owner: m[2]!, name: m[3]!, branch: m[4] ?? null });
  }
  return out;
}

/** PROFILE_ORG_TOKENS="DevPlusLLC=<token>;OtherOrg=<token>". Errors never echo a token. */
export function parseOwnerTokens(raw: string | undefined): Map<string, string> {
  const out = new Map<string, string>();
  for (const [i, part] of (raw ?? '').split(/[;\n]/).map((s) => s.trim()).filter(Boolean).entries()) {
    const m = /^([A-Za-z0-9-]+)=(\S+)$/.exec(part);
    if (!m) throw new Error(`PROFILE_ORG_TOKENS: entry ${i + 1} is malformed (expected Owner=token)`);
    const owner = m[1]!.toLowerCase();
    if (out.has(owner)) throw new Error(`PROFILE_ORG_TOKENS: entry ${i + 1} repeats an owner`);
    out.set(owner, m[2]!);
  }
  return out;
}

function required(env: NodeJS.ProcessEnv, key: string): string {
  const v = env[key]?.trim();
  if (!v) throw new Error(`Missing environment variable ${key}`);
  return v;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    token: required(env, 'GITHUB_TOKEN'),
    ownerTokens: parseOwnerTokens(env.PROFILE_ORG_TOKENS),
    contributionsToken: env.PROFILE_CONTRIB_TOKEN?.trim() || null,
    now: env.PROFILE_NOW?.trim() ? parseNow(env.PROFILE_NOW.trim()) : null,
    login: env.PROFILE_LOGIN?.trim() || 'isaacriehm',
    orgs: (env.PROFILE_ORGS ?? 'DevPlusLLC').split(',').map((s) => s.trim()).filter(Boolean),
    timeZone: env.PROFILE_TZ?.trim() || 'America/Phoenix',
    systems: parseSystems(required(env, 'PROFILE_SYSTEMS')),
  };
}

function parseNow(raw: string): Date {
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) throw new Error('PROFILE_NOW is not a valid ISO timestamp');
  return d;
}
