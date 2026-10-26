import { addDays, formatDate } from './dates';
import { findParam, itemName, statLabel, traitName } from './describe';
import { randomInt } from './rng';
import type { Effect, GameContent, LogEntry, RunState } from './types';

/** 0 ~ 최대값 사이로 맞춘다 (최대값이 없으면 아래만) */
export function clampStat(s: { value: number; max: number | null }): void {
  if (s.max != null) s.max = Math.max(0, s.max);
  s.value = Math.min(Math.max(0, s.value), s.max ?? Infinity);
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
 * 플래그/예약/색 변경과 숨김 파라미터, 숨긴 소지품/능력은 로그에 남기지 않는다.
 */
export function applyEffects(content: GameContent, state: RunState, effects: Effect[], log: LogEntry[]): void {
  for (const e of effects) {
    switch (e.type) {
      case 'stat': {
        const def = findParam(content, e.id);
        if (def?.kind !== 'stat') break;
        const s = (state.stats[e.id] ??= { value: def.value, max: def.max });
        if (e.field === 'max' && s.max == null) break;
        const amount = e.valueMax != null && e.valueMax !== e.value ? randomInt(state, e.value, e.valueMax) : e.value;
        const read = () => (e.field === 'max' ? s.max! : s.value);
        const before = read();
        if (e.field === 'max') s.max! += amount;
        else s.value += amount;
        clampStat(s);
        const delta = read() - before;
        if (delta !== 0 && def.show !== 'hidden') {
          log.push({
            kind: 'effect',
            text: `${statLabel(content, e.id, e.field)} ${delta > 0 ? '+' : ''}${delta}${def.unit ?? ''}`,
            tone: delta > 0 ? 'good' : e.field === 'max' ? 'worse' : 'bad',
          });
        }
        break;
      }
      case 'text': {
        const def = findParam(content, e.id);
        if (def?.kind !== 'text' || state.texts[e.id] === e.value) break;
        state.texts[e.id] = e.value;
        if (def.show !== 'hidden' && e.value) log.push({ kind: 'effect', text: `${def.name}: ${e.value}`, tone: 'neutral' });
        break;
      }
      case 'date': {
        const def = findParam(content, e.id);
        if (def?.kind !== 'date') break;
        const before = state.dates[e.id] ?? def.value;
        const after = e.mode === 'set' ? e.date : addDays(before, e.days);
        state.dates[e.id] = after;
        if (after !== before && def.show !== 'hidden') {
          const text = e.mode === 'set' ? `${def.name}: ${formatDate(after, def.parts)}` : `${e.days > 0 ? '+' : ''}${e.days}일`;
          log.push({ kind: 'effect', text, tone: 'neutral' });
        }
        break;
      }
      case 'theme':
        state.colors = { background: e.background, text: e.text };
        break;
      case 'item': {
        const before = state.items[e.id] ?? 0;
        const after = Math.max(0, before + e.value);
        if (after > 0) state.items[e.id] = after;
        else delete state.items[e.id];
        const delta = after - before;
        if (!content.ui.items.show) break;
        const name = itemName(content, e.id);
        if (delta > 0) log.push({ kind: 'effect', text: `${name} 획득${delta > 1 ? ` ×${delta}` : ''}`, tone: 'good' });
        if (delta < 0) log.push({ kind: 'effect', text: `${name} 잃음${delta < -1 ? ` ×${-delta}` : ''}`, tone: 'bad' });
        break;
      }
      case 'trait': {
        const has = state.traits.includes(e.id);
        const label = content.ui.traits.label;
        const visible = content.ui.traits.show;
        if (e.has && !has) {
          state.traits.push(e.id);
          if (visible) log.push({ kind: 'effect', text: `${label} 획득: ${traitName(content, e.id)}`, tone: 'good' });
        } else if (!e.has && has) {
          state.traits = state.traits.filter((t) => t !== e.id);
          if (visible) log.push({ kind: 'effect', text: `${label} 상실: ${traitName(content, e.id)}`, tone: 'bad' });
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
  checkDeath(content, state);
}

/** 수치가 0이 되면 그 파라미터의 엔딩 (체력 → 죽음, 정신력 → 광기). 목록 위쪽 파라미터가 먼저이고, 명시적 엔딩보다 우선한다 */
export function checkDeath(content: GameContent, state: RunState): void {
  for (const p of content.params) {
    if (p.kind !== 'stat' || !p.zeroEnding) continue;
    if ((state.stats[p.id]?.value ?? p.value) <= 0) {
      state.pendingEnding = p.zeroEnding;
      return;
    }
  }
}

/** 수치 0으로 도달하는 엔딩인지 (디버그에서 수치를 되돌리면 취소하기 위해) */
export function isZeroEnding(content: GameContent, endingId: string | null): boolean {
  return !!endingId && content.params.some((p) => p.kind === 'stat' && p.zeroEnding === endingId);
}
