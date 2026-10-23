import { evaluate } from './conditions';
import type { CompareOp, Condition, Effect, Encounter, GameContent, RunState, StatKey } from './types';

// 조건/효과/출현 규칙을 사람이 읽을 수 있는 한국어로 바꾼다. 게임(선택지 태그)과 에디터(요약) 모두 사용.

export const STAT_LABELS: Record<StatKey, string> = {
  hp: '체력',
  maxHp: '최대 체력',
  sanity: '정신력',
  maxSanity: '최대 정신력',
};

export const OP_LABELS: Record<CompareOp, string> = {
  '>=': '이상',
  '<=': '이하',
  '==': '',
  '!=': '아님',
  '>': '초과',
  '<': '미만',
};

const TURN_OP_LABELS: Record<CompareOp, string> = {
  '>=': ' 이후',
  '<=': '까지',
  '==': '',
  '!=': '가 아님',
  '>': ' 다음부터',
  '<': ' 전까지',
};

export function itemName(content: GameContent, id: string): string {
  return content.items.find((i) => i.id === id)?.name || id || '(아이템 없음)';
}

export function traitName(content: GameContent, id: string): string {
  return content.traits.find((t) => t.id === id)?.name || id || '(능력 없음)';
}

export function flagName(content: GameContent, id: string): string {
  return content.flags.find((f) => f.id === id)?.name || id || '(플래그 없음)';
}

export function encounterTitle(content: GameContent, id: string): string {
  return content.encounters.find((e) => e.id === id)?.title || id || '(인카운터 없음)';
}

export function endingTitle(content: GameContent, id: string): string {
  return content.endings.find((e) => e.id === id)?.title || id || '(엔딩 없음)';
}

function cmp(value: number, op: CompareOp): string {
  return op === '==' ? `${value}` : `${value} ${OP_LABELS[op]}`;
}

export function describeCondition(content: GameContent, c: Condition | null | undefined): string {
  if (!c) return '항상';
  switch (c.type) {
    case 'all':
    case 'any': {
      const parts = c.items.map((item) => {
        const text = describeCondition(content, item);
        return item.type === 'all' || item.type === 'any' ? `(${text})` : text;
      });
      if (parts.length === 0) return '항상';
      return parts.join(c.type === 'all' ? ' 그리고 ' : ' 또는 ');
    }
    case 'item': {
      const name = itemName(content, c.id);
      if (c.op === '>=' && c.value === 1) return name;
      if (c.op === '<' && c.value === 1) return `${name} 없음`;
      if (c.op === '==' && c.value === 0) return `${name} 없음`;
      return `${name} ${cmp(c.value, c.op)}${c.op === '==' ? '개' : ''}`;
    }
    case 'trait':
      return c.has ? traitName(content, c.id) : `${traitName(content, c.id)} 없음`;
    case 'flag':
      return `${flagName(content, c.id)} ${c.op === '==' ? '= ' + c.value : cmp(c.value, c.op)}`;
    case 'stat':
      return `${STAT_LABELS[c.stat]} ${cmp(c.value, c.op)}`;
    case 'turn':
      return `${c.value}번째 인카운터${TURN_OP_LABELS[c.op]}`;
    case 'seen':
      return `'${encounterTitle(content, c.encounterId)}' ${c.has ? '겪음' : '겪지 않음'}`;
  }
}

export interface ConditionTag {
  label: string;
  ok: boolean;
}

/** 선택지 요구 조건을 [태그] 목록으로. all 그룹은 태그 여러 개, any 그룹은 'A/B' 태그 하나 */
export function conditionTags(content: GameContent, c: Condition | null, state: RunState | null): ConditionTag[] {
  if (!c) return [];
  const ok = (cond: Condition) => (state ? evaluate(cond, state) : true);
  if (c.type === 'all') return c.items.flatMap((item) => conditionTags(content, item, state));
  if (c.type === 'any') {
    if (c.items.length === 0) return [];
    return [{ label: c.items.map((i) => describeCondition(content, i)).join('/'), ok: ok(c) }];
  }
  return [{ label: describeCondition(content, c), ok: ok(c) }];
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : `${n}`;
}

export function describeEffect(content: GameContent, e: Effect): string {
  switch (e.type) {
    case 'stat': {
      const range =
        e.valueMax != null && e.valueMax !== e.value ? `${signed(e.value)}~${signed(e.valueMax)}` : signed(e.value);
      return `${STAT_LABELS[e.stat]} ${range}`;
    }
    case 'item':
      return `${itemName(content, e.id)} ${signed(e.value)}`;
    case 'trait':
      return `${traitName(content, e.id)} ${e.has ? '획득' : '상실'}`;
    case 'flag':
      return e.mode === 'set' ? `${flagName(content, e.id)} = ${e.value}` : `${flagName(content, e.id)} ${signed(e.value)}`;
    case 'queue':
      return `'${encounterTitle(content, e.encounterId)}' 예약 (${e.delay === 0 ? '바로 다음' : `${e.delay}개 뒤`})`;
    case 'ending':
      return `엔딩: ${endingTitle(content, e.endingId)}`;
  }
}

export const SPAWN_MODE_LABELS: Record<Encounter['spawn']['mode'], string> = {
  random: '랜덤',
  triggered: '후속 전용',
  fixed: '고정 순번',
};

/** 출현 규칙 한 줄 요약 */
export function describeSpawn(content: GameContent, enc: Encounter): string {
  const s = enc.spawn;
  const parts: string[] = [];
  if (s.mode === 'triggered') {
    parts.push('다른 인카운터의 "인카운터 예약" 효과로만 등장');
  } else if (s.mode === 'fixed') {
    parts.push(`${s.fixedTurn}번째 인카운터로 고정 등장`);
  } else {
    parts.push(`랜덤 등장 (가중치 ${s.weight})`);
    if (s.minTurn != null || s.maxTurn != null) {
      parts.push(`${s.minTurn ?? 1}~${s.maxTurn ?? '∞'}번째 사이`);
    }
  }
  if (s.mode !== 'triggered') {
    for (const p of s.after) {
      const title = encounterTitle(content, p.encounterId);
      if (p.maxGap === 0) {
        parts.push(`'${title}' 바로 다음`);
      } else if (p.maxGap == null) {
        parts.push(`'${title}' 이후 ${p.minGap > 0 ? `사이에 ${p.minGap}개 이상 지나서` : '언제든'}`);
      } else {
        parts.push(`'${title}' 이후 사이에 ${p.minGap}~${p.maxGap}개 (${p.maxGap}개가 지나면 강제)`);
      }
    }
    if (s.condition && !(s.condition.type === 'all' && s.condition.items.length === 0)) {
      parts.push(`조건: ${describeCondition(content, s.condition)}`);
    }
  }
  parts.push(s.repeatable ? `반복 가능${s.cooldown > 0 ? ` (간격 ${s.cooldown})` : ''}` : '한 판에 한 번');
  return parts.join(' · ');
}
