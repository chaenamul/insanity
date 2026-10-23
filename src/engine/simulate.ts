import { nextRandom } from './rng';
import { choose, getView, newRun, proceed } from './run';
import type { GameContent, RunState } from './types';

// 무작위로 선택지를 고르는 가상 플레이를 여러 번 돌려 출현 빈도/엔딩 분포를 본다.

export interface SimulationOptions {
  runs: number;
  /** 한 판에서 허용할 최대 진행 횟수 (무한 루프 방지) */
  maxSteps?: number;
  seed?: number;
}

export interface EncounterStat {
  id: string;
  /** 등장한 판 수 */
  runsSeen: number;
  /** 총 등장 횟수 */
  total: number;
  /** 처음 등장한 순번 평균 */
  avgFirstTurn: number;
  minFirstTurn: number;
  maxFirstTurn: number;
}

export interface SimulationReport {
  runs: number;
  avgTurns: number;
  maxTurns: number;
  endings: Record<string, number>;
  encounters: EncounterStat[];
  /** maxSteps에 걸려 강제로 끊긴 판 수 */
  truncated: number;
}

export function simulate(content: GameContent, options: SimulationOptions): SimulationReport {
  const maxSteps = options.maxSteps ?? 2000;
  const policy = { rng: options.seed ?? 12345 };
  const endings: Record<string, number> = {};
  const stats = new Map<string, { runsSeen: number; total: number; firstTurns: number[] }>();
  for (const e of content.encounters) stats.set(e.id, { runsSeen: 0, total: 0, firstTurns: [] });
  let turnSum = 0;
  let maxTurns = 0;
  let truncated = 0;

  for (let r = 0; r < options.runs; r++) {
    let state: RunState = newRun(content, { seed: Math.floor(nextRandom(policy) * 0x7fffffff) });
    const firstSeen = new Map<string, number>();
    let lastKey = '';
    // 인카운터마다 고유한 순번을 가지므로 "순번:id"가 바뀌면 새 인카운터가 시작된 것
    const track = () => {
      const cur = state.current;
      if (!cur) return;
      const key = `${state.turn}:${cur.encounterId}`;
      if (key === lastKey) return;
      lastKey = key;
      const s = stats.get(cur.encounterId);
      if (s) s.total++;
      if (!firstSeen.has(cur.encounterId)) firstSeen.set(cur.encounterId, state.turn + 1);
    };
    track();
    let steps = 0;
    while (!state.ending && steps < maxSteps) {
      steps++;
      const view = getView(content, state);
      const enabled = view?.choices.filter((c) => c.enabled) ?? [];
      if (enabled.length > 0) {
        const pick = enabled[Math.floor(nextRandom(policy) * enabled.length)];
        state = choose(content, state, pick.id);
      } else {
        state = proceed(content, state);
      }
      track();
    }
    if (!state.ending) truncated++;
    const endingId = state.ending ?? '(중단됨)';
    endings[endingId] = (endings[endingId] ?? 0) + 1;
    turnSum += state.turn;
    maxTurns = Math.max(maxTurns, state.turn);
    for (const [id, turn] of firstSeen) {
      const s = stats.get(id);
      if (!s) continue;
      s.runsSeen++;
      s.firstTurns.push(turn);
    }
  }

  return {
    runs: options.runs,
    avgTurns: options.runs ? turnSum / options.runs : 0,
    maxTurns,
    endings,
    truncated,
    encounters: [...stats.entries()].map(([id, s]) => ({
      id,
      runsSeen: s.runsSeen,
      total: s.total,
      avgFirstTurn: s.firstTurns.length ? s.firstTurns.reduce((a, b) => a + b, 0) / s.firstTurns.length : 0,
      minFirstTurn: s.firstTurns.length ? Math.min(...s.firstTurns) : 0,
      maxFirstTurn: s.firstTurns.length ? Math.max(...s.firstTurns) : 0,
    })),
  };
}
