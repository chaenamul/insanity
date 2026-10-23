import type { Condition, Effect, Encounter, GameContent, Outcome, Prerequisite } from './types';

// 콘텐츠 안의 모든 조건/효과/결과를 순회한다. (검증, 참조 찾기, id 변경에 사용)
// 방문 함수는 실제 객체를 받으므로 immer draft에 대해 호출하면 그대로 수정할 수 있다.

export interface Loc {
  encounterId: string;
  nodeId: string | null;
  /** 사람이 읽을 위치 설명. 예) "페이지 start › 선택지 2 › 분기 1 › 결과 1" */
  where: string;
}

export interface Visitor {
  /** 그룹 안의 조건까지 모두 방문 */
  condition?(c: Condition, loc: Loc): void;
  /** 플레이어에게 보이는 글 (본문, 조건부 본문, 추가 문단, 선택지, 결과) */
  text?(text: string, loc: Loc): void;
  effect?(e: Effect, loc: Loc): void;
  outcome?(o: Outcome, loc: Loc, enc: Encounter): void;
  prerequisite?(p: Prerequisite, loc: Loc): void;
}

function walkCondition(c: Condition | null, loc: Loc, v: Visitor): void {
  if (!c) return;
  v.condition?.(c, loc);
  if (c.type === 'all' || c.type === 'any') for (const item of c.items) walkCondition(item, loc, v);
}

export function walkEncounter(enc: Encounter, v: Visitor): void {
  const spawnLoc: Loc = { encounterId: enc.id, nodeId: null, where: '출현 설정' };
  for (const p of enc.spawn.after) v.prerequisite?.(p, spawnLoc);
  walkCondition(enc.spawn.condition, { ...spawnLoc, where: '출현 조건' }, v);

  for (const node of enc.nodes) {
    const nodeLoc = (where: string): Loc => ({ encounterId: enc.id, nodeId: node.id, where: `페이지 ${node.id}${where}` });
    v.text?.(node.text, nodeLoc(' › 본문'));
    node.variants.forEach((t, i) => {
      walkCondition(t.condition, nodeLoc(` › 조건부 본문 ${i + 1}`), v);
      v.text?.(t.text, nodeLoc(` › 조건부 본문 ${i + 1}`));
    });
    node.extraTexts.forEach((t, i) => {
      walkCondition(t.condition, nodeLoc(` › 추가 문단 ${i + 1}`), v);
      v.text?.(t.text, nodeLoc(` › 추가 문단 ${i + 1}`));
    });
    for (const e of node.effects) v.effect?.(e, nodeLoc(' › 진입 효과'));
    node.choices.forEach((choice, ci) => {
      const cw = ` › 선택지 ${ci + 1}`;
      v.text?.(choice.text, nodeLoc(cw));
      walkCondition(choice.showIf, nodeLoc(`${cw} › 표시 조건`), v);
      walkCondition(choice.require, nodeLoc(`${cw} › 요구 조건`), v);
      choice.branches.forEach((branch, bi) => {
        const bw = `${cw} › 분기 ${bi + 1}`;
        walkCondition(branch.condition, nodeLoc(bw), v);
        branch.outcomes.forEach((outcome, oi) => {
          const loc = nodeLoc(`${bw} › 결과 ${oi + 1}`);
          v.outcome?.(outcome, loc, enc);
          v.text?.(outcome.text, loc);
          for (const e of outcome.effects) v.effect?.(e, loc);
        });
      });
    });
  }
}

export function walkContent(content: GameContent, v: Visitor): void {
  for (const enc of content.encounters) walkEncounter(enc, v);
}

export type RefKind = 'item' | 'trait' | 'flag' | 'encounter' | 'ending';

/** 조건/효과/선행관계가 참조하는 id를 종류별로 꺼낸다 */
export function refsOfCondition(c: Condition): { kind: RefKind; id: string } | null {
  switch (c.type) {
    case 'item':
    case 'trait':
    case 'flag':
      return { kind: c.type, id: c.id };
    case 'seen':
      return { kind: 'encounter', id: c.encounterId };
    default:
      return null;
  }
}

export function refsOfEffect(e: Effect): { kind: RefKind; id: string } | null {
  switch (e.type) {
    case 'item':
    case 'trait':
    case 'flag':
      return { kind: e.type, id: e.id };
    case 'queue':
      return { kind: 'encounter', id: e.encounterId };
    case 'ending':
      return { kind: 'ending', id: e.endingId };
    default:
      return null;
  }
}

/** 특정 id를 참조하는 위치 목록 */
export function findReferences(content: GameContent, kind: RefKind, id: string): Loc[] {
  const found: Loc[] = [];
  walkContent(content, {
    condition(c, loc) {
      const r = refsOfCondition(c);
      if (r && r.kind === kind && r.id === id) found.push(loc);
    },
    effect(e, loc) {
      const r = refsOfEffect(e);
      if (r && r.kind === kind && r.id === id) found.push(loc);
    },
    prerequisite(p, loc) {
      if (kind === 'encounter' && p.encounterId === id) found.push(loc);
    },
  });
  const startWhere = { encounterId: '', nodeId: null, where: '시작 설정' };
  if (kind === 'item' && content.start.items.some((i) => i.id === id)) found.push(startWhere);
  if (kind === 'trait' && content.start.traits.includes(id)) found.push(startWhere);
  return found;
}

/** 모든 참조의 id를 바꾼다 (draft를 직접 수정) */
export function renameReferences(content: GameContent, kind: RefKind, from: string, to: string): void {
  walkContent(content, {
    condition(c) {
      if (kind === 'encounter' && c.type === 'seen' && c.encounterId === from) c.encounterId = to;
      if ((c.type === 'item' || c.type === 'trait' || c.type === 'flag') && c.type === kind && c.id === from) c.id = to;
    },
    effect(e) {
      if (kind === 'encounter' && e.type === 'queue' && e.encounterId === from) e.encounterId = to;
      if (kind === 'ending' && e.type === 'ending' && e.endingId === from) e.endingId = to;
      if ((e.type === 'item' || e.type === 'trait' || e.type === 'flag') && e.type === kind && e.id === from) e.id = to;
    },
    prerequisite(p) {
      if (kind === 'encounter' && p.encounterId === from) p.encounterId = to;
    },
  });
  if (kind === 'item') for (const i of content.start.items) if (i.id === from) i.id = to;
  if (kind === 'trait') content.start.traits = content.start.traits.map((t) => (t === from ? to : t));
}
