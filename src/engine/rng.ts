/** 시드 기반 난수 (mulberry32). 상태를 RunState에 저장해 같은 시드면 같은 판이 재현된다. */
export interface RngHolder {
  rng: number;
}

export function makeSeed(): number {
  return Math.floor(Math.random() * 0x7fffffff);
}

export function nextRandom(holder: RngHolder): number {
  holder.rng = (holder.rng + 0x6d2b79f5) | 0;
  let t = holder.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** min~max (양 끝 포함) 사이의 정수. 순서가 뒤바뀌어도 된다 */
export function randomInt(holder: RngHolder, a: number, b: number): number {
  const min = Math.ceil(Math.min(a, b));
  const max = Math.floor(Math.max(a, b));
  return min + Math.floor(nextRandom(holder) * (max - min + 1));
}

export function weightedPick<T>(holder: RngHolder, items: T[], weightOf: (item: T) => number): T | null {
  const weights = items.map((item) => Math.max(0, weightOf(item)));
  const total = weights.reduce((sum, w) => sum + w, 0);
  if (items.length === 0) return null;
  if (total <= 0) return items[Math.floor(nextRandom(holder) * items.length)];
  let roll = nextRandom(holder) * total;
  for (let i = 0; i < items.length; i++) {
    roll -= weights[i];
    if (roll < 0) return items[i];
  }
  return items[items.length - 1];
}
