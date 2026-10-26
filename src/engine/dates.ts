import type { DateParts } from './types';

// 캘린더 파라미터용 날짜 계산. 날짜는 항상 'YYYY-MM-DD' 문자열로 다루므로 문자열 비교 = 날짜 비교다.

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export const DEFAULT_DATE = '1931-12-01';

function toUtc(date: string): Date | null {
  const m = DATE_RE.exec(date);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  // 2월 30일 같은 날짜는 거부
  return d.getUTCMonth() === Number(m[2]) - 1 ? d : null;
}

function fromUtc(d: Date): string {
  const y = String(d.getUTCFullYear()).padStart(4, '0');
  return `${y}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

export function isValidDate(date: string): boolean {
  return toUtc(date) !== null;
}

/** 올바른 날짜가 아니면 fallback */
export function normalizeDate(v: unknown, fallback = DEFAULT_DATE): string {
  return typeof v === 'string' && isValidDate(v) ? v : fallback;
}

export function addDays(date: string, days: number): string {
  const d = toUtc(date);
  if (!d) return date;
  d.setUTCDate(d.getUTCDate() + Math.trunc(days));
  return fromUtc(d);
}

/** a < b 이면 음수, 같으면 0, a > b 이면 양수 */
export function compareDates(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export const DEFAULT_DATE_PARTS: DateParts = { year: true, month: true, day: true, weekday: false };

export const DATE_PART_LABELS: Record<keyof DateParts, string> = {
  year: '연',
  month: '월',
  day: '일',
  weekday: '요일',
};

/** 고른 정보만: "1931년 12월 1일 (화)", "12월 1일", "화요일" … 아무것도 고르지 않으면 "—" */
export function formatDate(date: string, parts: DateParts = DEFAULT_DATE_PARTS): string {
  const d = toUtc(date);
  if (!d) return date || '(날짜 없음)';
  const out: string[] = [];
  if (parts.year) out.push(`${d.getUTCFullYear()}년`);
  if (parts.month) out.push(`${d.getUTCMonth() + 1}월`);
  if (parts.day) out.push(`${d.getUTCDate()}일`);
  const weekday = WEEKDAYS[d.getUTCDay()];
  if (parts.weekday) out.push(out.length ? `(${weekday})` : `${weekday}요일`);
  return out.join(' ') || '—';
}
