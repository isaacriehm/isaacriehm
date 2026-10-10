/** Path classifiers for counting files in a git tree. Paths are counted, never kept. */

const VENDORED = /(^|\/)(node_modules|dist|build|\.next|coverage|vendor)\//;

/** foo.test.ts, foo.spec.tsx, foo.e2e-spec.ts, foo_test.js, __tests__/foo.ts */
const TEST = /([._-](test|spec)\.[cm]?[jt]sx?$)|((^|\/)__tests__\/.+\.[cm]?[jt]sx?$)/;
const TS_SOURCE = /\.(ts|tsx|mts|cts)$/;
const DECLARATION = /\.d\.[cm]?ts$/;
const MIGRATION = /(^|\/)migrations?\/.*\.sql$/;

export interface FileCounts {
  testFiles: number;
  sourceFiles: number;
  migrations: number;
}

export function classifyPaths(paths: Iterable<string>): FileCounts {
  const counts: FileCounts = { testFiles: 0, sourceFiles: 0, migrations: 0 };
  for (const p of paths) {
    if (VENDORED.test(p)) continue;
    if (TEST.test(p)) counts.testFiles++;
    else if (TS_SOURCE.test(p) && !DECLARATION.test(p)) counts.sourceFiles++;
    if (MIGRATION.test(p)) counts.migrations++;
  }
  return counts;
}
