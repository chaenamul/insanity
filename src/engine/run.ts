import { evaluate } from './conditions';
import { conditionTags, type ConditionTag } from './describe';
import { applyEffects, checkDeath, clampStat, isZeroEnding } from './effects';
import { makeSeed, weightedPick } from './rng';
import { selectNextEncounter } from './scheduler';
import {
  BUILTIN_ENDINGS,
  type Choice,
  type CurrentEncounter,
  type Encounter,
  type EncounterNode,
  type GameContent,
  type RunState,
  type SelectionSource,
} from './types';

// 한 판의 진행. 모든 함수는 입력 상태를 바꾸지 않고 새 상태를 돌려준다.

function clone(state: RunState): RunState {
  return structuredClone(state);
}

export function findEncounter(content: GameContent, id: string): Encounter | undefined {
  return content.encounters.find((e) => e.id === id);
}

export function findNode(enc: Encounter, nodeId: string): EncounterNode | undefined {
  return enc.nodes.find((n) => n.id === nodeId);
}

/** 파라미터 시작값을 상태에 채운다. 이미 값이 있는 것은 그대로 둔다 */
function fillParams(content: GameContent, state: Pick<RunState, 'stats' | 'texts' | 'dates'>): void {
  for (const p of content.params) {
    if (p.kind === 'stat' && !state.stats[p.id]) {
      const s = { value: p.value, max: p.max };
      clampStat(s);
      state.stats[p.id] = s;
    } else if (p.kind === 'text' && state.texts[p.id] == null) {
      state.texts[p.id] = p.value;
    } else if (p.kind === 'date' && state.dates[p.id] == null) {
      state.dates[p.id] = p.value;
    }
  }
}

export function createInitialState(content: GameContent, seed: number = makeSeed()): RunState {
  const s = content.start;
  const items: Record<string, number> = {};
  for (const { id, count } of s.items) if (count > 0) items[id] = (items[id] ?? 0) + count;
  const flags: Record<string, number> = {};
  for (const f of content.flags) if (f.initial !== 0) flags[f.id] = f.initial;
  const params = { stats: {}, texts: {}, dates: {} };
  fillParams(content, params);
  return {
    seed,
    rng: seed,
    turn: 0,
    ...params,
    colors: { background: null, text: null },
    items,
    traits: [...new Set(s.traits)],
    flags,
    history: [],
    queue: [],
    current: null,
    pendingEnding: null,
    ending: null,
  };
}

export interface NewRunOptions {
  seed?: number;
  /** 테스트 플레이: 이 인카운터부터 시작 */
  startEncounterId?: string;
}

/** 새 판을 시작하고 첫 인카운터까지 진행한 상태를 돌려준다 */
export function newRun(content: GameContent, options: NewRunOptions = {}): RunState {
  const state = createInitialState(content, options.seed);
  if (options.startEncounterId && findEncounter(content, options.startEncounterId)) {
    beginEncounter(content, state, options.startEncounterId, 'debug');
    return state;
  }
  advanceToNextEncounter(content, state);
  return state;
}

function enterNode(content: GameContent, state: RunState, enc: Encounter, nodeId: string): void {
  const cur = state.current!;
  const node = findNode(enc, nodeId);
  cur.nodeId = nodeId;
  if (!node) {
    cur.log.push({ kind: 'text', text: `(오류: '${enc.id}'에 페이지 '${nodeId}'가 없습니다)` });
    cur.phase = 'continue';
    return;
  }
  const body = node.variants.find((v) => evaluate(v.condition, state))?.text ?? node.text;
  if (body.trim()) cur.log.push({ kind: 'text', text: body });
  for (const extra of node.extraTexts) {
    if (extra.text.trim() && evaluate(extra.condition, state)) cur.log.push({ kind: 'text', text: extra.text });
  }
  applyEffects(content, state, node.effects, cur.log);
  const hasChoices = visibleChoices(node, state).length > 0;
  cur.phase = state.pendingEnding || !hasChoices ? 'continue' : 'choose';
}

function beginEncounter(content: GameContent, state: RunState, encounterId: string, source: SelectionSource): void {
  const enc = findEncounter(content, encounterId)!;
  state.current = { encounterId, nodeId: null, phase: 'choose', source, log: [] };
  // 가변 색상: 인카운터가 시작될 때 바꾸는 색 (시작 페이지의 진입 효과보다 먼저)
  if (enc.startColors) state.colors = { ...enc.startColors };
  enterNode(content, state, enc, enc.start);
}

function advanceToNextEncounter(content: GameContent, state: RunState): void {
  const next = selectNextEncounter(content, state);
  if (!next) {
    state.current = null;
    state.ending = BUILTIN_ENDINGS.exhausted;
    return;
  }
  beginEncounter(content, state, next.encounterId, next.source);
}

function visibleChoices(node: EncounterNode, state: RunState): Choice[] {
  return node.choices.filter((c) => evaluate(c.showIf, state));
}

export interface ChoiceView {
  id: string;
  text: string;
  tags: ConditionTag[];
  enabled: boolean;
}

export interface EncounterView {
  encounter: Encounter;
  current: CurrentEncounter;
  choices: ChoiceView[];
  /** '계속' 버튼을 보여줄지. 선택지가 전부 빨간색이라 고를 수 없을 때도 막히지 않도록 true */
  canProceed: boolean;
}

/** 화면에 그릴 정보. 진행 중인 인카운터가 없으면 null */
export function getView(content: GameContent, state: RunState): EncounterView | null {
  const cur = state.current;
  if (!cur) return null;
  const encounter = findEncounter(content, cur.encounterId);
  if (!encounter) return null;
  const node = cur.nodeId ? findNode(encounter, cur.nodeId) : undefined;
  const choices: ChoiceView[] =
    cur.phase === 'choose' && node
      ? visibleChoices(node, state).map((c) => ({
          id: c.id,
          text: c.text,
          tags: conditionTags(content, c.require, state),
          enabled: evaluate(c.require, state),
        }))
      : [];
  const canProceed = cur.phase === 'continue' || !choices.some((c) => c.enabled);
  return { encounter, current: cur, choices, canProceed };
}

/** 선택지를 고른다 */
export function choose(content: GameContent, prev: RunState, choiceId: string): RunState {
  const state = clone(prev);
  const cur = state.current;
  if (!cur || cur.phase !== 'choose' || !cur.nodeId) return prev;
  const enc = findEncounter(content, cur.encounterId);
  const node = enc && findNode(enc, cur.nodeId);
  const choice = node && visibleChoices(node, state).find((c) => c.id === choiceId);
  if (!enc || !choice || !evaluate(choice.require, state)) return prev;

  cur.log.push({ kind: 'choice', text: choice.text });

  const branch = choice.branches.find((b) => evaluate(b.condition, state));
  const outcome = branch ? weightedPick(state, branch.outcomes, (o) => o.weight) : null;
  if (!outcome) {
    cur.phase = 'continue';
    return state;
  }
  if (outcome.text.trim()) cur.log.push({ kind: 'text', text: outcome.text });
  applyEffects(content, state, outcome.effects, cur.log);

  if (state.pendingEnding || !outcome.next) {
    cur.phase = 'continue';
  } else {
    enterNode(content, state, enc, outcome.next);
  }
  return state;
}

/** '계속' 버튼: 엔딩 대기 중이면 엔딩으로, 아니면 인카운터를 마치고 다음 인카운터로 */
export function proceed(content: GameContent, prev: RunState): RunState {
  const state = clone(prev);
  if (state.ending) return prev;
  if (state.pendingEnding) {
    // 엔딩이 난 인카운터도 겪은 것으로 기록
    if (state.current) finishCurrent(state);
    state.ending = state.pendingEnding;
    state.pendingEnding = null;
    return state;
  }
  if (state.current) {
    if (!getView(content, prev)?.canProceed) return prev;
    finishCurrent(state);
  }
  advanceToNextEncounter(content, state);
  return state;
}

function finishCurrent(state: RunState): void {
  state.turn += 1;
  state.history.push({ encounterId: state.current!.encounterId, turn: state.turn });
  state.current = null;
}

/** 디버그: 진행 중인 인카운터를 버리고 지정한 인카운터를 바로 시작 */
export function debugStartEncounter(content: GameContent, prev: RunState, encounterId: string): RunState {
  if (!findEncounter(content, encounterId)) return prev;
  const state = clone(prev);
  state.pendingEnding = null;
  state.ending = null;
  beginEncounter(content, state, encounterId, 'debug');
  return state;
}

/** 디버그: 상태 값을 직접 바꾼 뒤 수치 0 엔딩 여부 재확인 */
export function debugPatch(content: GameContent, prev: RunState, patch: (draft: RunState) => void): RunState {
  const state = clone(prev);
  patch(state);
  if (isZeroEnding(content, state.pendingEnding)) state.pendingEnding = null;
  for (const s of Object.values(state.stats)) clampStat(s);
  checkDeath(content, state);
  if (state.pendingEnding && state.current) state.current.phase = 'continue';
  return state;
}

/**
 * 저장된 판을 지금 콘텐츠에 맞춘다: 예전 형식(hp/sanity)을 파라미터로 옮기고,
 * 저장 뒤에 추가된 파라미터는 시작값으로 채운다. 바꿀 게 없으면 같은 객체를 돌려준다.
 */
export function syncRunState(content: GameContent, saved: RunState): RunState {
  const legacy = saved as RunState & { hp?: number; maxHp?: number; sanity?: number; maxSanity?: number };
  const needsMigration = !saved.stats || !saved.texts || !saved.dates || !saved.colors;
  const state = needsMigration ? clone(saved) : saved;
  if (needsMigration) {
    state.stats ??= {};
    state.texts ??= {};
    state.dates ??= {};
    state.colors ??= { background: null, text: null };
    if (legacy.hp != null) state.stats.hp ??= { value: legacy.hp, max: legacy.maxHp ?? legacy.hp };
    if (legacy.sanity != null) state.stats.sanity ??= { value: legacy.sanity, max: legacy.maxSanity ?? legacy.sanity };
  }
  const missing = content.params.some((p) =>
    p.kind === 'stat' ? !state.stats[p.id] : p.kind === 'text' ? state.texts[p.id] == null : state.dates[p.id] == null,
  );
  if (!missing) return state;
  const filled = needsMigration ? state : clone(state);
  fillParams(content, filled);
  return filled;
}

/** 저장된 상태가 현재 콘텐츠와 맞는지 (인카운터가 삭제되었으면 이어하기 불가) */
export function isStateCompatible(content: GameContent, state: RunState): boolean {
  if (state.ending) return true;
  if (!state.current) return false;
  const enc = findEncounter(content, state.current.encounterId);
  return !!enc && (!state.current.nodeId || !!findNode(enc, state.current.nodeId));
}
