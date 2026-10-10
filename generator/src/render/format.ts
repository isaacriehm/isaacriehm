/** Number and time formatting shared by the SVGs and the alt text. */

export const int = (n: number): string => n.toLocaleString('en-US');

export function percent(part: number, whole: number): string {
  return whole > 0 ? `${Math.round((part / whole) * 100)}%` : '0%';
}

/** "40 minutes", "3 hours", "2 days" */
export function elapsed(minutes: number): { value: string; unit: string } {
  if (minutes < 60) return { value: String(minutes), unit: minutes === 1 ? 'minute' : 'minutes' };
  const hours = Math.round(minutes / 60);
  if (hours < 48) return { value: String(hours), unit: hours === 1 ? 'hour' : 'hours' };
  const days = Math.round(hours / 24);
  return { value: String(days), unit: 'days' };
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "2026-10-01" → "October" */
export function monthName(isoDate: string): string {
  return MONTHS[Number(isoDate.slice(5, 7)) - 1] ?? '';
}

/** "2026-10-04" → "2026.10" */
export function revision(isoDate: string): string {
  return isoDate.slice(0, 7).replace('-', '.');
}

export function stampText(s: { date: string; sha: string }): string {
  return `${s.date} · ${s.sha}`;
}

/** "2026-04-03" → "April 2026" */
export function monthYear(isoDate: string): string {
  return `${monthName(isoDate)} ${isoDate.slice(0, 4)}`;
}

/** Whole weeks between two YYYY-MM-DD dates, rounded up, at least 1. */
export function weeksBetween(a: string, b: string): number {
  const ms = Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`);
  return Math.max(1, Math.ceil((ms / 86_400_000 + 1) / 7));
}
