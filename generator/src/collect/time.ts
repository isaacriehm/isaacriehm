/** Calendar helpers that respect the profile's time zone. */

function parts(date: Date, timeZone: string): { year: number; month: number; day: number } {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  const p = Object.fromEntries(fmt.formatToParts(date).map((x) => [x.type, x.value]));
  return { year: Number(p.year), month: Number(p.month), day: Number(p.day) };
}

/** YYYY-MM-DD of `date` in `timeZone`. */
export function localDate(date: Date, timeZone: string): string {
  const { year, month, day } = parts(date, timeZone);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Offset of `timeZone` from UTC at `date`, in minutes (Phoenix: -420). */
function offsetMinutes(date: Date, timeZone: string): number {
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' });
  const name = fmt.formatToParts(date).find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
  const m = /GMT([+-])(\d{2}):(\d{2})/.exec(name);
  if (!m) return 0;
  return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]));
}

/** The instant the local calendar month containing `date` began. */
export function monthStart(date: Date, timeZone: string): { instant: Date; date: string } {
  const { year, month } = parts(date, timeZone);
  const utcMidnight = Date.UTC(year, month - 1, 1);
  const instant = new Date(utcMidnight - offsetMinutes(new Date(utcMidnight), timeZone) * 60_000);
  return { instant, date: `${year}-${String(month).padStart(2, '0')}-01` };
}

export function isoSeconds(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}
