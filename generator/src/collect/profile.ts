/**
 * Cover-plate readouts: activity across every repository the token can read.
 *
 * Repository coordinates are used to address queries and are discarded here;
 * the returned ProfileReadout holds counts, timestamps and one short SHA.
 * Each owner is queried with its own token; an owner whose token can't read
 * it is dropped from the scan with one log line, and the run continues.
 */

export type Log = (line: string) => void;

import type { Config } from '../config.ts';
import { GitHubAccessError, type GitHub, type GitHubPool } from '../github.ts';
import type { ProfileReadout } from '../model.ts';
import { collectContributions, fetchCalendar } from './contributions.ts';
import { isoSeconds, localDate, monthStart } from './time.ts';

interface RepoRef {
  readonly owner: string;
  readonly name: string;
  readonly pushedAt: Date;
}

interface RepoPage {
  readonly nodes: ReadonlyArray<{ name: string; owner: { login: string }; pushedAt: string | null }>;
  readonly pageInfo: { hasNextPage: boolean; endCursor: string | null };
}

const REPO_FIELDS = `nodes { name owner { login } pushedAt } pageInfo { hasNextPage endCursor }`;

type OwnerKind = 'user' | 'organization';

/** One owner's repositories, newest push first, stopping once pushes predate `since` (keeping at least `minCount`). */
async function ownerRepos(gh: GitHub, kind: OwnerKind, login: string, since: Date, minCount: number): Promise<RepoRef[]> {
  const affiliation = kind === 'user' ? ', ownerAffiliations: [OWNER]' : '';
  const found: RepoRef[] = [];
  let after: string | null = null;
  for (;;) {
    const data: Record<string, { repositories: RepoPage } | null> = await gh.graphql(
      `query($login: String!, $after: String) {
        owner: ${kind}(login: $login) {
          repositories(first: 50, after: $after${affiliation}, orderBy: { field: PUSHED_AT, direction: DESC }) { ${REPO_FIELDS} }
        }
      }`,
      { login, after },
    );
    const page = data.owner?.repositories;
    if (!page) return found;
    for (const n of page.nodes) {
      if (!n.pushedAt) continue;
      const pushedAt = new Date(n.pushedAt);
      if (pushedAt < since && found.length >= minCount) return found;
      found.push({ owner: n.owner.login, name: n.name, pushedAt });
    }
    if (!page.pageInfo.hasNextPage) return found;
    after = page.pageInfo.endCursor;
  }
}

/** Recent repositories across the account and its orgs. An org its token can't read is skipped, not fatal. */
async function recentRepos(pool: GitHubPool, cfg: Config, since: Date, minCount: number, log: Log): Promise<RepoRef[]> {
  const out = await ownerRepos(pool.user, 'user', cfg.login, since, minCount);
  for (const org of cfg.orgs) {
    try {
      out.push(...(await ownerRepos(pool.forOwner(org), 'organization', org, since, minCount)));
    } catch (err) {
      if (!(err instanceof GitHubAccessError)) throw err;
      log(`cover: organization ${org} is not readable with its token; left out of the activity scan`);
    }
  }
  // The profile repository is committed to by its own Action; it is not "service".
  return out.filter((r) => !(r.owner.toLowerCase() === cfg.login.toLowerCase() && r.name.toLowerCase() === cfg.login.toLowerCase()));
}

interface CommitNode {
  readonly oid: string;
  readonly committedDate: string;
}

interface RepoActivity {
  readonly defaultBranchRef: { target: { month?: { totalCount: number } } | null } | null;
  readonly refs: { nodes: ReadonlyArray<{ target: { history?: { nodes: ReadonlyArray<CommitNode> } } | null }> } | null;
}

/** For each repo: commits authored this month on the default branch, and the newest authored commit on any recent branch. */
async function repoActivity(pool: GitHubPool, repos: ReadonlyArray<RepoRef>, authorId: string, since: Date, log: Log) {
  const results: RepoActivity[] = [];
  const byOwner = Map.groupBy(repos, (r) => r.owner);
  for (const [owner, ownerRepos] of byOwner) {
    try {
      results.push(...(await ownerActivity(pool.forOwner(owner), ownerRepos, authorId, since)));
    } catch (err) {
      if (!(err instanceof GitHubAccessError)) throw err;
      log(`cover: commit history under ${owner} is not readable with its token; left out of the activity scan`);
    }
  }
  return results;
}

/** Batched by owner, so every query in a batch uses that owner's token. */
async function ownerActivity(gh: GitHub, repos: ReadonlyArray<RepoRef>, authorId: string, since: Date) {
  const results: RepoActivity[] = [];
  for (let i = 0; i < repos.length; i += 15) {
    const batch = repos.slice(i, i + 15);
    const vars: Record<string, unknown> = { author: authorId, since: isoSeconds(since) };
    const decls = ['$author: ID!', '$since: GitTimestamp!'];
    const fields = batch.map((r, j) => {
      vars[`o${j}`] = r.owner;
      vars[`n${j}`] = r.name;
      decls.push(`$o${j}: String!`, `$n${j}: String!`);
      return `r${j}: repository(owner: $o${j}, name: $n${j}) {
        defaultBranchRef { target { ... on Commit { month: history(since: $since, author: { id: $author }) { totalCount } } } }
        refs(refPrefix: "refs/heads/", first: 5, orderBy: { field: TAG_COMMIT_DATE, direction: DESC }) {
          nodes { target { ... on Commit { history(first: 1, author: { id: $author }) { nodes { oid committedDate } } } } }
        }
      }`;
    });
    const data = await gh.graphql<Record<string, RepoActivity | null>>(
      `query(${decls.join(', ')}) { ${fields.join('\n')} }`,
      vars,
    );
    for (let j = 0; j < batch.length; j++) {
      const r = data[`r${j}`];
      if (r) results.push(r);
    }
  }
  return results;
}

export async function collectProfile(
  pool: GitHubPool,
  cfg: Config,
  now: Date,
  log: Log = console.log,
  fetchPublic: typeof fetch = fetch,
): Promise<ProfileReadout> {
  const month = monthStart(now, cfg.timeZone);
  const who = await pool.user.graphql<{ user: { id: string } }>(`query($login: String!) { user(login: $login) { id } }`, { login: cfg.login });
  const contributions = await collectContributions(pool.contributions, cfg.login, await fetchCalendar(cfg.login, fetchPublic), log);

  const repos = await recentRepos(pool, cfg, month.instant, 5, log);
  const activity = await repoActivity(pool, repos, who.user.id, month.instant, log);

  let commitsThisMonth = 0;
  let latest: CommitNode | null = null;
  for (const a of activity) {
    commitsThisMonth += a.defaultBranchRef?.target?.month?.totalCount ?? 0;
    for (const ref of a.refs?.nodes ?? []) {
      const c = ref.target?.history?.nodes[0];
      if (c && (!latest || c.committedDate > latest.committedDate)) latest = c;
    }
  }
  if (!latest) throw new Error('No authored commits found in readable repositories');

  const lastCommitAt = new Date(latest.committedDate);
  return {
    lastCommitAt: isoSeconds(lastCommitAt),
    minutesSinceLastCommit: Math.max(0, Math.round((now.getTime() - lastCommitAt.getTime()) / 60_000)),
    contributions12mo: contributions.total,
    privateContributions12mo: contributions.privateCount,
    commitsThisMonth,
    monthStart: month.date,
    stamp: { date: localDate(now, cfg.timeZone), sha: latest.oid.slice(0, 7) },
  };
}
