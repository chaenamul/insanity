import type { GameContent } from '../engine/types';
import { refsOfCondition, refsOfEffect, walkContent, type Loc, type RefKind } from '../engine/walk';

/** 종류:id → 인카운터 안에서 참조하는 위치 목록 (정의 목록의 "사용처") */
export function collectReferences(content: GameContent): Map<string, Loc[]> {
  const map = new Map<string, Loc[]>();
  const add = (kind: RefKind, id: string, loc: Loc) => {
    const key = `${kind}:${id}`;
    map.set(key, [...(map.get(key) ?? []), loc]);
  };
  walkContent(content, {
    condition(c, loc) {
      const r = refsOfCondition(c);
      if (r) add(r.kind, r.id, loc);
    },
    effect(e, loc) {
      const r = refsOfEffect(e);
      if (r) add(r.kind, r.id, loc);
    },
  });
  return map;
}
