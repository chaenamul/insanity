import { currentTurnNumber, evaluate } from './conditions';
import { describeCondition, encounterTitle } from './describe';
import { weightedPick } from './rng';
import type { Encounter, GameContent, Prerequisite, RunState, SelectionSource } from './types';

// 다음 인카운터 선택 규칙 (우선순위 순)
//  1. 예약(queue): '인카운터 예약' 효과로 예약된 것 중 때가 된 것
//  2. 고정 순번(fixed): n번째 이상이 되었고 아직 안 나온 것 (순번이 빠른 것부터)
//  3. 강제(forced): 선행 인카운터의 최대 간격에 도달한 랜덤 인카운터
//  4. 랜덤(random): 출현 가능한 랜덤 인카운터 중 가중치 추첨

/** 마지막으로 이 인카운터를 마친 시점의 turn 값 */
export function lastSeenTurn(state: RunState, encounterId: string): number | null {
  for (let i = state.history.length - 1; i >= 0; i--) {
    if (state.history[i].encounterId === encounterId) return state.history[i].turn;
  }
  return null;
}

/** 선행 인카운터 이후 지나간 다른 인카운터 수. 아직 안 겪었으면 null */
export function gapSince(state: RunState, encounterId: string): number | null {
  const last = lastSeenTurn(state, encounterId);
  return last == null ? null : state.turn - last;
}

export type Availability =
  | { status: 'available'; forced: boolean; reasons: string[] }
  | { status: 'blocked'; reasons: string[] };

function prerequisiteReason(content: GameContent, state: RunState, p: Prerequisite): string | null {
  const gap = gapSince(state, p.encounterId);
  const title = encounterTitle(content, p.encounterId);
  if (gap == null) return `선행 '${title}' 아직 안 나옴`;
  if (gap < p.minGap) return `선행 '${title}' 이후 ${gap}개 지남 (최소 ${p.minGap}개 필요)`;
  return null;
}

/**
 * 인카운터가 지금 출현할 수 있는지 판단. (예약 여부와 무관한 '자연 출현' 기준)
 * 에디터 테스트 플레이의 디버그 패널에서도 이유를 보여주기 위해 사용한다.
 */
export function checkAvailability(content: GameContent, state: RunState, enc: Encounter): Availability {
  const s = enc.spawn;
  const n = currentTurnNumber(state);
  const reasons: string[] = [];

  if (s.mode === 'triggered') reasons.push('후속 전용 (예약으로만 등장)');
  if (state.queue.some((q) => q.encounterId === enc.id)) reasons.push('이미 예약됨');

  const last = lastSeenTurn(state, enc.id);
  if (last != null) {
    if (!s.repeatable) reasons.push('이미 나옴 (한 판에 한 번)');
    else if (state.turn - last < s.cooldown) reasons.push(`재등장 대기 (${state.turn - last}/${s.cooldown})`);
  }

  if (s.mode === 'fixed') {
    if (n < s.fixedTurn) reasons.push(`${s.fixedTurn}번째부터 (현재 ${n}번째)`);
  } else if (s.mode === 'random') {
    if (s.weight <= 0) reasons.push('가중치 0');
    if (s.minTurn != null && n < s.minTurn) reasons.push(`${s.minTurn}번째부터 (현재 ${n}번째)`);
    if (s.maxTurn != null && n > s.maxTurn) reasons.push(`${s.maxTurn}번째까지 (현재 ${n}번째)`);
  }

  if (s.mode !== 'triggered') {
    for (const p of s.after) {
      const reason = prerequisiteReason(content, state, p);
      if (reason) reasons.push(reason);
    }
    if (!evaluate(s.condition, state)) reasons.push(`조건 불충족: ${describeCondition(content, s.condition)}`);
  }

  if (reasons.length > 0) return { status: 'blocked', reasons };

  const forced =
    s.mode === 'random' &&
    s.after.some((p) => {
      const gap = gapSince(state, p.encounterId);
      return p.maxGap != null && gap != null && gap >= p.maxGap;
    });
  return { status: 'available', forced, reasons: forced ? ['선행 인카운터 최대 간격 도달 → 강제 등장'] : [] };
}

export interface Selection {
  encounterId: string;
  source: SelectionSource;
}

/** 다음 인카운터를 고르고, 예약에서 뽑았다면 큐에서 제거한다. 출현 가능한 게 없으면 null */
export function selectNextEncounter(content: GameContent, state: RunState): Selection | null {
  const byId = new Map(content.encounters.map((e) => [e.id, e]));

  // 1. 예약
  const due = state.queue
    .map((q, index) => ({ q, index }))
    .filter(({ q }) => q.dueTurn <= state.turn && byId.has(q.encounterId))
    .sort((a, b) => a.q.dueTurn - b.q.dueTurn || a.index - b.index);
  // 존재하지 않는 인카운터를 가리키는 예약은 버린다
  state.queue = state.queue.filter((q) => byId.has(q.encounterId));
  if (due.length > 0) {
    const pick = due[0].q;
    state.queue = state.queue.filter((q) => q !== pick);
    return { encounterId: pick.encounterId, source: 'queue' };
  }

  const available = content.encounters
    .map((enc) => ({ enc, a: checkAvailability(content, state, enc) }))
    .filter((x): x is { enc: Encounter; a: Availability & { status: 'available' } } => x.a.status === 'available');

  // 2. 고정 순번
  const fixed = available
    .filter(({ enc }) => enc.spawn.mode === 'fixed')
    .sort((a, b) => a.enc.spawn.fixedTurn - b.enc.spawn.fixedTurn);
  if (fixed.length > 0) return { encounterId: fixed[0].enc.id, source: 'fixed' };

  // 3. 강제
  const forced = available.filter(({ enc, a }) => enc.spawn.mode === 'random' && a.forced);
  if (forced.length > 0) {
    const pick = weightedPick(state, forced, ({ enc }) => enc.spawn.weight);
    if (pick) return { encounterId: pick.enc.id, source: 'forced' };
  }

  // 4. 랜덤
  const random = available.filter(({ enc }) => enc.spawn.mode === 'random');
  const pick = weightedPick(state, random, ({ enc }) => enc.spawn.weight);
  return pick ? { encounterId: pick.enc.id, source: 'random' } : null;
}

/** 진행 중인 인카운터를 마쳤다고 가정한 상태 (디버그 패널에서 '다음 인카운터' 후보를 정확히 보여주기 위함) */
export function stateAfterCurrent(state: RunState): RunState {
  if (!state.current) return state;
  const next = structuredClone(state);
  next.turn += 1;
  next.history.push({ encounterId: state.current.encounterId, turn: next.turn });
  next.current = null;
  return next;
}
