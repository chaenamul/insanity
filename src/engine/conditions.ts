import { compareDates } from './dates';
import type { CompareOp, Condition, RunState } from './types';

export function compare(a: number, op: CompareOp, b: number): boolean {
  switch (op) {
    case '>=':
      return a >= b;
    case '<=':
      return a <= b;
    case '==':
      return a === b;
    case '!=':
      return a !== b;
    case '>':
      return a > b;
    case '<':
      return a < b;
  }
}

/** 진행 중(또는 다음에 뽑힐) 인카운터의 순번 (1부터) */
export function currentTurnNumber(state: RunState): number {
  return state.turn + 1;
}

export function hasSeen(state: RunState, encounterId: string): boolean {
  return state.history.some((h) => h.encounterId === encounterId);
}

/** null/undefined 조건은 항상 참 */
export function evaluate(condition: Condition | null | undefined, state: RunState): boolean {
  if (!condition) return true;
  switch (condition.type) {
    case 'all':
      return condition.items.every((c) => evaluate(c, state));
    case 'any':
      return condition.items.length === 0 || condition.items.some((c) => evaluate(c, state));
    case 'item':
      return compare(state.items[condition.id] ?? 0, condition.op, condition.value);
    case 'trait':
      return state.traits.includes(condition.id) === condition.has;
    case 'flag':
      return compare(state.flags[condition.id] ?? 0, condition.op, condition.value);
    case 'stat': {
      // 상한 없는 수치의 최대값은 무한대로 본다
      const s = state.stats[condition.id];
      const v = condition.field === 'max' ? (s ? (s.max ?? Infinity) : 0) : (s?.value ?? 0);
      return compare(v, condition.op, condition.value);
    }
    case 'text': {
      const same = (state.texts[condition.id] ?? '') === condition.value;
      return condition.op === '!=' ? !same : same;
    }
    case 'date':
      return compare(compareDates(state.dates[condition.id] ?? '', condition.value), condition.op, 0);
    case 'turn':
      return compare(currentTurnNumber(state), condition.op, condition.value);
    case 'seen':
      return hasSeen(state, condition.encounterId) === condition.has;
  }
}

/** 조건이 비어 있는지 (= 항상 참) */
export function isEmptyCondition(condition: Condition | null | undefined): boolean {
  if (!condition) return true;
  if (condition.type === 'all' || condition.type === 'any') {
    return condition.items.every(isEmptyCondition);
  }
  return false;
}
