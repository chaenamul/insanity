import { flagName, itemName, traitName } from '../engine/describe';
import type { Condition, GameContent, Prerequisite } from '../engine/types';
import { walkEncounter } from '../engine/walk';

// 인카운터 사이의 선후관계. 흐름도와 출현 설정 패널에서 사용.
//  after: 선행 인카운터 (출현 설정)
//  queue: 결과 효과의 '인카운터 예약'
//  seen : 출현 조건의 '인카운터 겪음'
//  state: A가 바꾸는 아이템/능력/플래그를 B의 출현 조건이 검사

export type RelationKind = 'after' | 'queue' | 'seen' | 'state';

export interface Relation {
  from: string;
  to: string;
  kind: RelationKind;
  label: string;
  where?: string;
}

export function gapLabel(p: Pick<Prerequisite, 'minGap' | 'maxGap'>): string {
  if (p.maxGap == null) return p.minGap > 0 ? `사이 ${p.minGap}개 이상` : '이후 언제든';
  if (p.maxGap === 0) return '바로 다음';
  return p.minGap === p.maxGap ? `사이 ${p.minGap}개` : `사이 ${p.minGap}~${p.maxGap}개`;
}

function leaves(c: Condition | null): Condition[] {
  if (!c) return [];
  return c.type === 'all' || c.type === 'any' ? c.items.flatMap(leaves) : [c];
}

export function buildRelations(content: GameContent): Relation[] {
  const out: Relation[] = [];
  const seenKeys = new Set<string>();
  const push = (r: Relation) => {
    const key = `${r.from}|${r.to}|${r.kind}|${r.label}`;
    if (seenKeys.has(key)) return;
    seenKeys.add(key);
    out.push(r);
  };

  // 각 인카운터가 바꾸는 상태 (아이템/능력/플래그)
  const writes = new Map<string, Set<string>>();
  for (const enc of content.encounters) {
    const set = new Set<string>();
    walkEncounter(enc, {
      effect(e, loc) {
        if (e.type === 'item' || e.type === 'trait' || e.type === 'flag') set.add(`${e.type}:${e.id}`);
        if (e.type === 'queue' && e.encounterId) {
          push({
            from: enc.id,
            to: e.encounterId,
            kind: 'queue',
            label: e.delay === 0 ? '예약 · 바로 다음' : `예약 · 사이 ${e.delay}개`,
            where: loc.where,
          });
        }
      },
    });
    writes.set(enc.id, set);
  }

  for (const enc of content.encounters) {
    if (enc.spawn.mode === 'triggered') continue;
    for (const p of enc.spawn.after) {
      if (p.encounterId) push({ from: p.encounterId, to: enc.id, kind: 'after', label: gapLabel(p) });
    }
    for (const c of leaves(enc.spawn.condition)) {
      if (c.type === 'seen' && c.encounterId) {
        push({ from: c.encounterId, to: enc.id, kind: 'seen', label: c.has ? '겪었으면' : '안 겪었으면' });
      }
      if (c.type === 'item' || c.type === 'trait' || c.type === 'flag') {
        const key = `${c.type}:${c.id}`;
        const name = c.type === 'item' ? itemName(content, c.id) : c.type === 'trait' ? traitName(content, c.id) : flagName(content, c.id);
        for (const [from, set] of writes) {
          if (from !== enc.id && set.has(key)) push({ from, to: enc.id, kind: 'state', label: name });
        }
      }
    }
  }
  return out;
}
