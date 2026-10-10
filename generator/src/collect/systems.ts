/**
 * Per-system readouts for the allowlisted repositories.
 *
 * This is the privacy boundary. A SystemSource (which carries a repository
 * coordinate) goes in; a SystemReadout (label, counts, short SHA) comes out.
 * Tree paths are streamed through the classifier and discarded. Facts that
 * could identify a repository (stars, release tags) are kept only when the
 * repository is public.
 */

import type { SystemSource } from '../config.ts';
import { GitHubAccessError, type GitHub, type GitHubPool } from '../github.ts';
import type { SystemLabel, SystemReadout } from '../model.ts';
import type { Log } from './profile.ts';
import { classifyPaths } from './classify.ts';
import { localDate } from './time.ts';

export interface RawSystem {
  readonly isPrivate: boolean;
  readonly stars: number;
  readonly latestRelease: string | null;
  readonly latestReleaseAt: string | null;
  readonly headOid: string;
  /** ISO timestamps of every commit on the branch. Messages and authors are never requested. */
  readonly commitTimes: ReadonlyArray<string>;
  readonly commits: number;
  readonly authoredCommits: number;
  readonly paths: ReadonlyArray<string>;
}

interface CommitFields {
  oid: string;
  tree: { oid: string };
  all: { totalCount: number };
  mine: { totalCount: number };
}

const COMMIT = `... on Commit { oid tree { oid } all: history { totalCount } mine: history(author: { id: $author }) { totalCount } }`;

export async function fetchRawSystem(gh: GitHub, src: SystemSource, authorId: string): Promise<RawSystem> {
  const data = await gh.graphql<{
    repository: {
      isPrivate: boolean;
      stargazerCount: number;
      releases: { nodes: ReadonlyArray<{ tagName: string; publishedAt: string | null }> };
      defaultBranchRef: { target: CommitFields | null } | null;
      branch: { target: CommitFields | null } | null;
    } | null;
  }>(
    `query($owner: String!, $name: String!, $ref: String!, $author: ID!) {
      repository(owner: $owner, name: $name) {
        isPrivate
        stargazerCount
        releases(first: 1, orderBy: { field: CREATED_AT, direction: DESC }) { nodes { tagName publishedAt } }
        defaultBranchRef { target { ${COMMIT} } }
        branch: ref(qualifiedName: $ref) { target { ${COMMIT} } }
      }
    }`,
    { owner: src.owner, name: src.name, ref: `refs/heads/${src.branch ?? '__none__'}`, author: authorId },
  );
  const repo = data.repository;
  // Errors name the label, never the repository.
  if (!repo) throw new GitHubAccessError(`System "${src.label}": repository not readable with this token`);
  const head = src.branch ? repo.branch?.target : repo.defaultBranchRef?.target;
  if (!head) throw new Error(`System "${src.label}": configured branch not found`);

  const tree = await gh.get<{ truncated: boolean; tree: ReadonlyArray<{ path: string; type: string }> }>(
    `/repos/${encodeURIComponent(src.owner)}/${encodeURIComponent(src.name)}/git/trees/${head.tree.oid}?recursive=1`,
  );
  if (tree.truncated) throw new Error(`System "${src.label}": tree listing truncated; counts would be wrong`);

  return {
    isPrivate: repo.isPrivate,
    stars: repo.stargazerCount,
    latestRelease: repo.releases.nodes[0]?.tagName ?? null,
    latestReleaseAt: repo.releases.nodes[0]?.publishedAt ?? null,
    headOid: head.oid,
    commitTimes: await commitTimes(gh, src, head.oid),
    commits: head.all.totalCount,
    authoredCommits: head.mine.totalCount,
    paths: tree.tree.filter((e) => e.type === 'blob').map((e) => e.path),
  };
}

/** Committed-at timestamps of every commit reachable from `oid`, newest first. */
async function commitTimes(gh: GitHub, src: SystemSource, oid: string): Promise<string[]> {
  const out: string[] = [];
  let after: string | null = null;
  for (;;) {
    const data: {
      repository: { object: { history: { nodes: ReadonlyArray<{ committedDate: string }>; pageInfo: { hasNextPage: boolean; endCursor: string | null } } } | null } | null;
    } = await gh.graphql(
      `query($owner: String!, $name: String!, $oid: GitObjectID!, $after: String) {
        repository(owner: $owner, name: $name) {
          object(oid: $oid) { ... on Commit { history(first: 100, after: $after) { nodes { committedDate } pageInfo { hasNextPage endCursor } } } }
        }
      }`,
      { owner: src.owner, name: src.name, oid, after },
    );
    const h = data.repository?.object?.history;
    if (!h) throw new Error(`System "${src.label}": commit history not readable`);
    for (const n of h.nodes) out.push(n.committedDate);
    if (!h.pageInfo.hasNextPage) return out;
    after = h.pageInfo.endCursor;
  }
}

const SEMVER = /^v?\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/;

/** Reduce raw repository data to the public readout. Pure; the unit under the privacy test. */
export function toReadout(label: SystemReadout['label'], raw: RawSystem, now: Date, timeZone: string): SystemReadout {
  const counts = classifyPaths(raw.paths);
  const sha = raw.headOid.slice(0, 7).toLowerCase();
  const days = [...new Set(raw.commitTimes.map((t) => localDate(new Date(t), timeZone)))].sort();
  if (!days.length) throw new Error(`System "${label}": no commits`);
  if (!/^[0-9a-f]{7}$/.test(sha)) throw new Error(`System "${label}": unexpected commit id format`);
  return {
    label,
    commits: raw.commits,
    authoredCommits: raw.authoredCommits,
    testFiles: counts.testFiles,
    sourceFiles: counts.sourceFiles,
    migrations: counts.migrations,
    firstCommit: days[0]!,
    lastCommit: days[days.length - 1]!,
    activeDays: days.length,
    publicFacts: raw.isPrivate
      ? null
      : {
          stars: raw.stars,
          latestRelease: raw.latestRelease && SEMVER.test(raw.latestRelease) ? raw.latestRelease : null,
          releasedOn: raw.latestReleaseAt ? localDate(new Date(raw.latestReleaseAt), timeZone) : null,
        },
    stamp: { date: localDate(now, timeZone), sha },
  };
}

/**
 * Each system is read with its owner's token. If that token can't read it, the
 * figure keeps its last-good readout (labels and numbers, with the stamp of the
 * day it was really computed) and the run continues; with no last-good value,
 * the figure is left out. Either way, one log line that names only the label.
 */
export async function collectSystems(
  pool: GitHubPool,
  sources: ReadonlyArray<SystemSource>,
  authorId: string,
  now: Date,
  timeZone: string,
  lastGood: { readonly [K in SystemLabel]?: SystemReadout } = {},
  log: Log = console.log,
): Promise<SystemReadout[]> {
  const out: SystemReadout[] = [];
  for (const src of sources) {
    try {
      out.push(toReadout(src.label, await fetchRawSystem(pool.forOwner(src.owner), src, authorId), now, timeZone));
    } catch (err) {
      if (!(err instanceof GitHubAccessError)) throw err;
      const kept = lastGood[src.label];
      if (kept) {
        out.push(kept);
        log(`system "${src.label}": not readable with its owner's token; kept last-good values from ${kept.stamp.date}`);
      } else {
        log(`system "${src.label}": not readable with its owner's token and no last-good values; figure left out`);
      }
    }
  }
  return out;
}
