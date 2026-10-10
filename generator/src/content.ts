/**
 * Static copy. System descriptions stay at the level of detail the developer
 * résumé already discloses (02 - Business/Operations/Resume/... Generation
 * Script.js) and go no deeper. Clients are described generically.
 */

import type { SystemLabel } from './model.ts';

export const IDENTITY = {
  name: 'Isaac Riehm',
  line: 'Software engineer. I build the systems small businesses run on.',
  github: 'isaacriehm',
  email: 'isaac@devplustech.com',
  site: 'devplustech.com',
  phone: '(623) 252-4330',
  phoneTel: '+16232524330',
} as const;

export interface Part {
  readonly name: string;
  readonly detail: string;
}

export interface SystemCopy {
  readonly fig: number;
  readonly title: string;
  readonly kind: string;
  /** Exploded layers, top to bottom; each gets a numbered callout. */
  readonly parts: ReadonlyArray<Part>;
  readonly flowLabel: string;
  readonly flow: ReadonlyArray<string>;
  readonly note: string | null;
  readonly link: { readonly text: string; readonly href: string } | null;
}

export const SYSTEMS: Record<SystemLabel, SystemCopy> = {
  claims: {
    fig: 1,
    title: 'Claims platform',
    kind: 'Medical billing company',
    parts: [
      { name: 'Interface', detail: 'Next.js and React. Imports are retryable and sit behind a preview-and-confirm step.' },
      { name: 'API', detail: 'NestJS, typed end to end with OpenAPI and Zod.' },
      { name: 'Claims engine', detail: 'Re-validates payer, authorization, provider and rate data at generation time and groups claims deterministically.' },
      { name: 'Data', detail: 'PostgreSQL through Drizzle. Unsafe, malformed or wrong-account files are rejected before they land.' },
    ],
    flowLabel: 'Claim path',
    flow: ['Billing files', 'Per-client mapping', 'Payer-rule validation', 'X12 837P file', 'Payer', '999 acknowledgment'],
    note: 'Replaced a spreadsheet billing workflow. Delivered under a fixed-price contract.',
    link: null,
  },
  portal: {
    fig: 2,
    title: 'Investor portal',
    kind: 'Investment firm',
    parts: [
      { name: 'Interface', detail: 'Investor and admin screens for portfolios, holdings, valuations and documents, built in Next.js.' },
      { name: 'API', detail: 'tRPC procedures, with Better Auth for sign-in.' },
      { name: 'Transactions', detail: 'Validation and every write commit together, or not at all.' },
      { name: 'Data', detail: 'PostgreSQL with Prisma, and documents in AWS S3.' },
    ],
    flowLabel: 'Distribution path',
    flow: ['Distribution recorded', 'Checked against current value', 'Holdings, history and totals updated', 'ROI and total return recalculated', 'Monthly valuation history rebuilt'],
    note: null,
    link: null,
  },
  cairn: {
    fig: 3,
    title: 'Cairn',
    kind: 'Open source · MIT',
    parts: [
      { name: 'cairn', detail: 'The CLI: sets a project up and installs the hooks.' },
      { name: 'cairn-plugin', detail: 'One agent plugin for Claude Code, Cursor and Codex.' },
      { name: 'cairn-core', detail: 'MCP server, hook runners and the sensors that read the project’s decisions and invariants.' },
      { name: 'cairn-state', detail: 'Typed schemas and read-only state I/O.' },
      { name: 'cairn-lens', detail: 'Hovers and code lens in the editor for invariant and task references.' },
    ],
    flowLabel: 'Check loop',
    flow: ['Agent writes a diff', 'Sensors check at pre-commit', 'Commit', 'CI checks again', 'Hook bypasses flagged'],
    note: 'The sensors catch stubs and changes that contradict a recorded decision.',
    link: { text: 'github.com/isaacriehm/cairn', href: 'https://github.com/isaacriehm/cairn' },
  },
};

export const SPECS: ReadonlyArray<{ readonly label: string; readonly value: string }> = [
  { label: 'Languages', value: 'TypeScript, JavaScript, Python, HTML/CSS, Bash' },
  { label: 'Frontend', value: 'React, Next.js, TanStack Query and Table, Tailwind CSS' },
  { label: 'Backend', value: 'Node.js, NestJS, REST APIs, OpenAPI, tRPC, Zod' },
  { label: 'Data', value: 'PostgreSQL through Drizzle ORM and Prisma: schema design, migrations, transactions' },
  { label: 'Testing and ops', value: 'Jest, Vitest, Playwright, GitHub Actions, Docker, Linux servers (systemd, Caddy), AWS S3, Google Cloud' },
  { label: 'AI tooling', value: 'Claude Code, Cursor, Codex, Model Context Protocol, OpenAI API, review of AI-generated code' },
  { label: 'Security', value: 'Role-based access control, session management, Argon2 password hashing' },
];

export const UPSTREAM = {
  label: 'Upstream',
  value: 'Open pull request to openapi-typescript (#2865): openapi-react-query rejects undeclared query and path parameters.',
  href: 'https://github.com/openapi-ts/openapi-typescript/pull/2865',
} as const;

export const TERMS: ReadonlyArray<{ readonly name: string; readonly detail: string }> = [
  { name: 'Fixed price', detail: 'The number is agreed in writing before any work starts.' },
  { name: 'Weekly demo', detail: 'Working software every week. The demo is the acceptance gate.' },
  { name: 'In the client’s name', detail: 'Code, data, hosting and every account belong to the client.' },
  { name: '30-day fixes', detail: 'Bugs found in the 30 days after handoff are fixed at no charge.' },
];

export const DOORS = [
  { title: 'Contract or full-time roles', dest: IDENTITY.email, href: `mailto:${IDENTITY.email}` },
  { title: 'A project for your business', dest: `${IDENTITY.site} · ${IDENTITY.phone}`, href: `https://${IDENTITY.site}` },
] as const;
