import type { Config } from '../config.ts';
import type { GitHubPool } from '../github.ts';
import { assertPublic, type Readouts, type SystemLabel, type SystemReadout } from '../model.ts';
import { collectProfile, type Log } from './profile.ts';
import { collectSystems } from './systems.ts';
import { isoSeconds } from './time.ts';

/** Collect everything the figures need. The result has passed `assertPublic`. */
export async function collect(
  pool: GitHubPool,
  cfg: Config,
  lastGood: Readouts['systems'] = {},
  now = cfg.now ?? new Date(),
  log: Log = console.log,
): Promise<Readouts> {
  const { user } = await pool.user.graphql<{ user: { id: string } }>(`query($login: String!) { user(login: $login) { id } }`, {
    login: cfg.login,
  });
  const profile = await collectProfile(pool, cfg, now, log);
  const systems: Partial<Record<SystemLabel, SystemReadout>> = {};
  for (const s of await collectSystems(pool, cfg.systems, user.id, now, cfg.timeZone, lastGood, log)) systems[s.label] = s;

  const readouts: Readouts = { computedAt: isoSeconds(now), profile, systems };
  assertPublic(readouts);
  return readouts;
}
