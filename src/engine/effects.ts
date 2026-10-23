import { itemName, STAT_LABELS, traitName } from './describe';
import { randomInt } from './rng';
import { BUILTIN_ENDINGS, type Effect, type GameContent, type LogEntry, type LogTone, type RunState, type StatKey } from './types';

function clampStats(state: RunState): void {
  state.maxHp = Math.max(0, state.maxHp);
  state.maxSanity = Math.max(0, state.maxSanity);
  state.hp = Math.min(Math.max(0, state.hp), state.maxHp);
  state.sanity = Math.min(Math.max(0, state.sanity), state.maxSanity);
}

function statTone(stat: StatKey, delta: number): LogTone {
  if (delta > 0) return 'good';
  return stat === 'maxHp' || stat === 'maxSanity' ? 'worse' : 'bad';
}

/** 다음 인카운터 예약. 같은 인카운터가 이미 예약돼 있으면 더 이른 쪽을 유지한다 */
export function enqueue(state: RunState, encounterId: string, delay: number): void {
  // 현재 인카운터가 끝나면 turn이 1 증가하므로, delay 0 = 바로 다음
  const dueTurn = state.turn + (state.current ? 1 : 0) + Math.max(0, Math.floor(delay));
  const existing = state.queue.find((q) => q.encounterId === encounterId);
  if (existing) {
    existing.dueTurn = Math.min(existing.dueTurn, dueTurn);
  } else {
    state.queue.push({ encounterId, dueTurn });
  }
}

/**
 * 효과를 상태에 적용(변경)하고, 플레이어에게 보여줄 로그를 log에 추가한다.
 * 플래그/예약은 숨겨진 효과이므로 로그에 남기지 않는다.
 */
export function applyEffects(content: GameContent, state: RunState, effects: Effect[], log: LogEntry[]): void {
  for (const e of effects) {
    switch (e.type) {
      case 'stat': {
        const amount = e.valueMax != null && e.valueMax !== e.value ? randomInt(state, e.value, e.valueMax) : e.value;
        const before = state[e.stat];
        state[e.stat] += amount;
        clampStats(state);
        const delta = state[e.stat] - before;
        if (delta !== 0) {
          log.push({ kind: 'effect', text: `${STAT_LABELS[e.stat]} ${delta > 0 ? '+' : ''}${delta}`, tone: statTone(e.stat, delta) });
        }
        break;
      }
      case 'item': {
        const before = state.items[e.id] ?? 0;
        const after = Math.max(0, before + e.value);
        if (after > 0) state.items[e.id] = after;
        else delete state.items[e.id];
        const delta = after - before;
        const name = itemName(content, e.id);
        if (delta > 0) log.push({ kind: 'effect', text: `${name} 획득${delta > 1 ? ` ×${delta}` : ''}`, tone: 'good' });
        if (delta < 0) log.push({ kind: 'effect', text: `${name} 잃음${delta < -1 ? ` ×${-delta}` : ''}`, tone: 'bad' });
        break;
      }
      case 'trait': {
        const has = state.traits.includes(e.id);
        if (e.has && !has) {
          state.traits.push(e.id);
          log.push({ kind: 'effect', text: `능력 획득: ${traitName(content, e.id)}`, tone: 'good' });
        } else if (!e.has && has) {
          state.traits = state.traits.filter((t) => t !== e.id);
          log.push({ kind: 'effect', text: `능력 상실: ${traitName(content, e.id)}`, tone: 'bad' });
        }
        break;
      }
      case 'flag':
        state.flags[e.id] = e.mode === 'set' ? e.value : (state.flags[e.id] ?? 0) + e.value;
        break;
      case 'queue':
        enqueue(state, e.encounterId, e.delay);
        break;
      case 'ending':
        if (!state.pendingEnding) state.pendingEnding = e.endingId;
        break;
    }
  }
  checkDeath(state);
}

/** 체력 0 → 사망, 정신력 0 → 광기. 수치로 인한 종료는 명시적 엔딩보다 우선한다 */
export function checkDeath(state: RunState): void {
  if (state.hp <= 0) state.pendingEnding = BUILTIN_ENDINGS.death;
  else if (state.sanity <= 0) state.pendingEnding = BUILTIN_ENDINGS.madness;
}
