/**
 * The public data model: the only shape the render layer ever receives.
 *
 * Privacy rule: nothing in here may carry free text from a private repository.
 * Every string is one of a small set of machine formats (a known label, an ISO
 * date, a 7-hex short SHA, a semver tag), and `assertPublic` enforces that at
 * runtime before anything is rendered. Repo names, branch names, paths and
 * commit messages exist only inside the collectors and are dropped there.
 */

export const SYSTEM_LABELS = ['claims', 'portal', 'cairn'] as const;
export type SystemLabel = (typeof SYSTEM_LABELS)[number];

/** Proof stamp: the day a readout was computed and the commit it was computed at. */
export interface Stamp {
  /** YYYY-MM-DD, in the profile's time zone. */
  readonly date: string;
  /** Short SHA (7 hex characters). */
  readonly sha: string;
}

export interface ProfileReadout {
  /** ISO timestamp of the most recent commit authored by the account, any readable repo. */
  readonly lastCommitAt: string;
  /** Whole minutes between that commit and `computedAt`. */
  readonly minutesSinceLastCommit: number;
  /** GitHub's own count, from the public contribution calendar. */
  readonly contributions12mo: number;
  /**
   * Contributions in private repositories (restrictedContributionsCount), or
   * null when the API's view did not agree with the public total within 1%.
   */
  readonly privateContributions12mo: number | null;
  /** Commits authored this calendar month on default branches. */
  readonly commitsThisMonth: number;
  /** First day of the counted month, YYYY-MM-DD. */
  readonly monthStart: string;
  readonly stamp: Stamp;
}

export interface SystemReadout {
  readonly label: SystemLabel;
  /** Commits reachable from the configured branch. */
  readonly commits: number;
  /** Of those, commits GitHub attributes to the account. */
  readonly authoredCommits: number;
  readonly testFiles: number;
  /** TypeScript source files, tests excluded. */
  readonly sourceFiles: number;
  /** SQL migration files. */
  readonly migrations: number;
  /** Local dates (YYYY-MM-DD) of the oldest and newest commit on the branch. */
  readonly firstCommit: string;
  readonly lastCommit: string;
  /** Distinct local calendar days with at least one commit on the branch. */
  readonly activeDays: number;
  /** Public repositories only; always null for a private one. */
  readonly publicFacts: {
    readonly stars: number;
    readonly latestRelease: string | null;
    /** Local date the latest release was published. */
    readonly releasedOn: string | null;
  } | null;
  readonly stamp: Stamp;
}

export interface Readouts {
  /** ISO timestamp of the run. */
  readonly computedAt: string;
  readonly profile: ProfileReadout;
  readonly systems: { readonly [K in SystemLabel]?: SystemReadout };
}

// ── runtime guard ────────────────────────────────────────────────────────────

const STRING_FORMATS: ReadonlyArray<RegExp> = [
  /^\d{4}-\d{2}-\d{2}$/, // date
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/, // ISO timestamp (UTC)
  /^[0-9a-f]{7}$/, // short SHA
  /^v?\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/, // release tag
  new RegExp(`^(${SYSTEM_LABELS.join('|')})$`), // label
];

/**
 * Throws unless every leaf of `value` is a finite number, a boolean, null, or a
 * string in one of the machine formats above. This is what makes "the render
 * layer only sees labels and numbers" a checked property instead of a promise.
 */
export function assertPublic(value: unknown, path = 'readouts'): void {
  if (value === null || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`${path}: non-finite number`);
    return;
  }
  if (typeof value === 'string') {
    if (!STRING_FORMATS.some((re) => re.test(value))) {
      throw new Error(`${path}: string is not in an allowed public format`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => assertPublic(v, `${path}[${i}]`));
    return;
  }
  if (typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (!/^[A-Za-z0-9]+$/.test(k)) throw new Error(`${path}: unexpected key`);
      assertPublic(v, `${path}.${k}`);
    }
    return;
  }
  throw new Error(`${path}: unsupported type ${typeof value}`);
}
