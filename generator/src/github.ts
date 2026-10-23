/**
 * A read-only GitHub client. It can issue GraphQL queries and REST GETs and
 * nothing else: there is no method parameter, and any GraphQL document that is
 * not a single query operation is refused before it leaves the process.
 */

export interface GitHub {
  graphql<T>(query: string, variables?: Record<string, unknown>): Promise<T>;
  get<T>(path: string): Promise<T>;
}

const API = 'https://api.github.com';

/**
 * The token can't see the resource: HTTP 401/403/404, or GraphQL errors that
 * are all FORBIDDEN/NOT_FOUND. Callers treat this as "skip that owner", never
 * as "the run failed". The message carries no resource names.
 */
export class GitHubAccessError extends Error {
  override name = 'GitHubAccessError';
}

const ACCESS_TYPES = new Set(['FORBIDDEN', 'NOT_FOUND']);

/** Strips comments and string literals so keyword checks can't be fooled by them. */
function stripNoise(doc: string): string {
  return doc.replace(/#[^\n]*/g, '').replace(/"(?:\\.|[^"\\])*"/g, '""');
}

export function assertReadOnlyQuery(doc: string): void {
  const code = stripNoise(doc).trim();
  if (/\b(mutation|subscription)\b/.test(code)) {
    throw new Error('Refusing GraphQL document: only queries are allowed');
  }
  if (!/^(query\b|\{)/.test(code)) {
    throw new Error('Refusing GraphQL document: it must start with "query" or "{"');
  }
}

export function assertReadOnlyPath(path: string): void {
  if (!path.startsWith('/') || path.includes('..') || /^\/\//.test(path)) {
    throw new Error('Refusing REST path: must be an absolute API path');
  }
}

export function createGitHub(token: string, fetchImpl: typeof fetch = fetch): GitHub {
  const headers = {
    authorization: `Bearer ${token}`,
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
    'user-agent': 'isaacriehm-profile-generator',
  };

  async function send<T>(url: string, init: RequestInit): Promise<T> {
    const res = await fetchImpl(url, init);
    if (!res.ok) {
      // Status only: response bodies can name private resources.
      const msg = `GitHub API ${init.method ?? 'GET'} failed with HTTP ${res.status}`;
      throw [401, 403, 404].includes(res.status) ? new GitHubAccessError(msg) : new Error(msg);
    }
    return (await res.json()) as T;
  }

  return {
    async graphql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
      assertReadOnlyQuery(query);
      const body = await send<{ data?: T; errors?: ReadonlyArray<{ type?: string }> }>(`${API}/graphql`, {
        method: 'POST', // GraphQL transport; the document itself is verified to be a query.
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({ query, variables }),
      });
      if (body.errors?.length) {
        const types = [...new Set(body.errors.map((e) => e.type ?? 'UNKNOWN'))];
        const msg = `GitHub GraphQL returned errors (${types.join(', ')})`;
        throw types.every((t) => ACCESS_TYPES.has(t)) ? new GitHubAccessError(msg) : new Error(msg);
      }
      if (!body.data) throw new Error('GitHub GraphQL returned no data');
      return body.data;
    },

    async get<T>(path: string): Promise<T> {
      assertReadOnlyPath(path);
      return send<T>(`${API}${path}`, { method: 'GET', headers });
    },
  };
}

/** One client per token. `forOwner` routes to that owner's token, else the default. */
export interface GitHubPool {
  readonly user: GitHub;
  /** For contributionsCollection: a viewer that sees private contributions as restricted counts. */
  readonly contributions: GitHub;
  forOwner(owner: string): GitHub;
}

export function createGitHubPool(
  defaultToken: string,
  ownerTokens: ReadonlyMap<string, string>,
  fetchImpl: typeof fetch = fetch,
  contributionsToken: string | null = null,
): GitHubPool {
  const user = createGitHub(defaultToken, fetchImpl);
  const byOwner = new Map([...ownerTokens].map(([owner, token]) => [owner, createGitHub(token, fetchImpl)]));
  const contributions = contributionsToken ? createGitHub(contributionsToken, fetchImpl) : user;
  return { user, contributions, forOwner: (owner) => byOwner.get(owner.toLowerCase()) ?? user };
}
