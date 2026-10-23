import {
  BUILTIN_ENDINGS,
  type Branch,
  type Choice,
  type CompareOp,
  type Condition,
  type ConditionalText,
  type Effect,
  type Encounter,
  type EncounterNode,
  type EndingDef,
  type EndingKind,
  type GameContent,
  type Outcome,
  type Prerequisite,
  type Spawn,
  type StatKey,
} from './types';

// 콘텐츠 정규화: 손으로 작성했거나 일부 필드가 빠진 JSON도 완전한 형태로 맞춰준다.
// 생략 가능한 것들: 대부분의 기본값, id, choice.outcomes(분기 없이 결과만 나열), 조건 배열(= 모두 만족).

type Loose = Record<string, unknown>;

let uidCounter = 0;
export function uid(prefix: string): string {
  uidCounter = (uidCounter + 1) % 1296;
  return `${prefix}_${Date.now().toString(36).slice(-4)}${Math.random().toString(36).slice(2, 5)}${uidCounter.toString(36)}`;
}

const STATS: StatKey[] = ['hp', 'maxHp', 'sanity', 'maxSanity'];
const OPS: CompareOp[] = ['>=', '<=', '==', '!=', '>', '<'];
const ENDING_KINDS: EndingKind[] = ['death', 'madness', 'victory', 'other'];

function obj(v: unknown): Loose {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Loose) : {};
}
function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : typeof v === 'number' ? String(v) : fallback;
}
function num(v: unknown, fallback: number): number {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : fallback;
}
function numOrNull(v: unknown): number | null {
  return v == null || v === '' ? null : num(v, 0);
}
function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}
function op(v: unknown, fallback: CompareOp = '>='): CompareOp {
  return OPS.includes(v as CompareOp) ? (v as CompareOp) : fallback;
}
function stat(v: unknown): StatKey {
  return STATS.includes(v as StatKey) ? (v as StatKey) : 'sanity';
}

export function normalizeCondition(raw: unknown): Condition | null {
  if (raw == null) return null;
  if (Array.isArray(raw)) return { type: 'all', items: raw.map(normalizeCondition).filter((c): c is Condition => !!c) };
  const r = obj(raw);
  switch (r.type) {
    case 'all':
    case 'any':
      return { type: r.type, items: arr(r.items).map(normalizeCondition).filter((c): c is Condition => !!c) };
    case 'item':
      return { type: 'item', id: str(r.id), op: op(r.op), value: num(r.value, 1) };
    case 'trait':
      return { type: 'trait', id: str(r.id), has: bool(r.has, true) };
    case 'flag':
      return { type: 'flag', id: str(r.id), op: op(r.op), value: num(r.value, 1) };
    case 'stat':
      return { type: 'stat', stat: stat(r.stat), op: op(r.op), value: num(r.value, 0) };
    case 'turn':
      return { type: 'turn', op: op(r.op), value: num(r.value, 1) };
    case 'seen':
      return { type: 'seen', encounterId: str(r.encounterId), has: bool(r.has, true) };
    default:
      return null;
  }
}

export function normalizeEffect(raw: unknown): Effect | null {
  const r = obj(raw);
  switch (r.type) {
    case 'stat':
      return { type: 'stat', stat: stat(r.stat), value: num(r.value, 0), valueMax: numOrNull(r.valueMax) };
    case 'item':
      return { type: 'item', id: str(r.id), value: num(r.value, 1) };
    case 'trait':
      return { type: 'trait', id: str(r.id), has: bool(r.has, true) };
    case 'flag':
      return { type: 'flag', id: str(r.id), mode: r.mode === 'add' ? 'add' : 'set', value: num(r.value, 1) };
    case 'queue':
      return { type: 'queue', encounterId: str(r.encounterId), delay: Math.max(0, num(r.delay, 0)) };
    case 'ending':
      return { type: 'ending', endingId: str(r.endingId) };
    default:
      return null;
  }
}

function effects(v: unknown): Effect[] {
  return arr(v).map(normalizeEffect).filter((e): e is Effect => !!e);
}

function normalizeOutcome(raw: unknown): Outcome {
  const r = obj(raw);
  return {
    id: str(r.id) || uid('o'),
    weight: num(r.weight, 1),
    text: str(r.text),
    effects: effects(r.effects),
    next: r.next == null || r.next === '' ? null : str(r.next),
  };
}

function normalizeBranch(raw: unknown): Branch {
  const r = obj(raw);
  return {
    id: str(r.id) || uid('b'),
    condition: normalizeCondition(r.condition),
    outcomes: arr(r.outcomes).map(normalizeOutcome),
  };
}

function normalizeChoice(raw: unknown): Choice {
  const r = obj(raw);
  let branches = arr(r.branches).map(normalizeBranch);
  if (branches.length === 0) {
    // 단축 표기: outcomes / outcome 만 적은 경우 → 조건 없는 분기 하나
    const outcomes = r.outcomes ? arr(r.outcomes) : r.outcome ? [r.outcome] : [];
    if (outcomes.length > 0) branches = [{ id: uid('b'), condition: null, outcomes: outcomes.map(normalizeOutcome) }];
  }
  return {
    id: str(r.id) || uid('c'),
    text: str(r.text),
    showIf: normalizeCondition(r.showIf),
    require: normalizeCondition(r.require),
    branches,
  };
}

function normalizeConditionalText(raw: unknown): ConditionalText {
  const r = obj(raw);
  return { id: str(r.id) || uid('t'), condition: normalizeCondition(r.condition), text: str(r.text) };
}

function normalizeNode(raw: unknown, fallbackId: string): EncounterNode {
  const r = obj(raw);
  return {
    id: str(r.id) || fallbackId,
    text: str(r.text),
    variants: arr(r.variants).map(normalizeConditionalText),
    extraTexts: arr(r.extraTexts).map(normalizeConditionalText),
    effects: effects(r.effects),
    choices: arr(r.choices).map(normalizeChoice),
  };
}

function normalizePrerequisite(raw: unknown): Prerequisite {
  const r = obj(raw);
  const minGap = Math.max(0, num(r.minGap, 0));
  const maxGap = numOrNull(r.maxGap);
  return { encounterId: str(r.encounterId), minGap, maxGap: maxGap == null ? null : Math.max(0, maxGap) };
}

export function defaultSpawn(): Spawn {
  return {
    mode: 'random',
    weight: 10,
    repeatable: false,
    cooldown: 0,
    minTurn: null,
    maxTurn: null,
    fixedTurn: 1,
    after: [],
    condition: null,
  };
}

function normalizeSpawn(raw: unknown): Spawn {
  const r = obj(raw);
  const d = defaultSpawn();
  const mode = r.mode === 'triggered' || r.mode === 'fixed' ? r.mode : 'random';
  return {
    mode,
    weight: num(r.weight, d.weight),
    repeatable: bool(r.repeatable, d.repeatable),
    cooldown: Math.max(0, num(r.cooldown, d.cooldown)),
    minTurn: numOrNull(r.minTurn),
    maxTurn: numOrNull(r.maxTurn),
    fixedTurn: Math.max(1, num(r.fixedTurn, d.fixedTurn)),
    after: arr(r.after).map(normalizePrerequisite),
    condition: normalizeCondition(r.condition),
  };
}

export function normalizeEncounter(raw: unknown): Encounter {
  const r = obj(raw);
  // nodes는 배열 또는 { 페이지id: 페이지 } 객체 모두 허용
  const rawNodes = Array.isArray(r.nodes)
    ? r.nodes
    : Object.entries(obj(r.nodes)).map(([id, node]) => ({ id, ...obj(node) }));
  const nodes = rawNodes.map((n, i) => normalizeNode(n, i === 0 ? 'start' : `p${i + 1}`));
  if (nodes.length === 0) nodes.push(normalizeNode({}, 'start'));
  const start = str(r.start) || nodes[0].id;
  return {
    id: str(r.id),
    title: str(r.title),
    notes: str(r.notes),
    spawn: normalizeSpawn(r.spawn),
    start,
    nodes,
  };
}

export const DEFAULT_ENDINGS: EndingDef[] = [
  { id: BUILTIN_ENDINGS.death, title: '죽음', text: '당신의 이야기는 여기서 끝났다.', kind: 'death' },
  { id: BUILTIN_ENDINGS.madness, title: '광기', text: '당신은 더 이상 무엇이 진짜인지 알 수 없게 되었다.', kind: 'madness' },
  {
    id: BUILTIN_ENDINGS.exhausted,
    title: '정적',
    text: '더 이상 아무 일도 일어나지 않았다. (출현 가능한 인카운터가 없습니다)',
    kind: 'other',
  },
];

export function normalizeContent(raw: unknown): GameContent {
  const r = obj(raw);
  const meta = obj(r.meta);
  const start = obj(r.start);
  const endings: EndingDef[] = arr(r.endings).map((e) => {
    const o = obj(e);
    return {
      id: str(o.id),
      title: str(o.title),
      text: str(o.text),
      kind: ENDING_KINDS.includes(o.kind as EndingKind) ? (o.kind as EndingKind) : 'other',
    };
  });
  for (const builtin of DEFAULT_ENDINGS) {
    if (!endings.some((e) => e.id === builtin.id)) endings.push({ ...builtin });
  }
  const maxHp = num(start.maxHp, 3);
  const maxSanity = num(start.maxSanity, 100);
  return {
    version: 1,
    meta: { title: str(meta.title, '제목 없음'), subtitle: str(meta.subtitle), intro: str(meta.intro) },
    start: {
      hp: num(start.hp, maxHp),
      maxHp,
      sanity: num(start.sanity, maxSanity),
      maxSanity,
      items: arr(start.items).map((i) => ({ id: str(obj(i).id), count: num(obj(i).count, 1) })),
      traits: arr(start.traits).map((t) => str(t)),
    },
    items: arr(r.items).map((i) => ({ id: str(obj(i).id), name: str(obj(i).name), description: str(obj(i).description) })),
    traits: arr(r.traits).map((t) => ({ id: str(obj(t).id), name: str(obj(t).name), description: str(obj(t).description) })),
    flags: arr(r.flags).map((f) => ({
      id: str(obj(f).id),
      name: str(obj(f).name),
      description: str(obj(f).description),
      initial: num(obj(f).initial, 0),
    })),
    endings,
    encounters: arr(r.encounters).map(normalizeEncounter),
  };
}

// ─── 디스크 저장 형식: content/game.json + content/encounters/<id>.json ───

export type GameFile = Omit<GameContent, 'encounters'> & { encounterOrder: string[] };

export function splitContent(content: GameContent): { game: GameFile; encounters: Encounter[] } {
  const { encounters, ...rest } = content;
  return { game: { ...rest, encounterOrder: encounters.map((e) => e.id) }, encounters };
}

/** game.json과 인카운터 파일들을 합친다. encounterOrder에 없는 인카운터는 id 순으로 뒤에 붙는다 */
export function joinContent(game: unknown, encounterFiles: unknown[]): GameContent {
  const order = arr(obj(game).encounterOrder).map((id) => str(id));
  const rank = (id: string) => {
    const i = order.indexOf(id);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  const sorted = [...encounterFiles].sort((a, b) => {
    const ia = str(obj(a).id);
    const ib = str(obj(b).id);
    return rank(ia) - rank(ib) || ia.localeCompare(ib);
  });
  return normalizeContent({ ...obj(game), encounters: sorted });
}

export function createEncounter(id: string, title: string): Encounter {
  return normalizeEncounter({
    id,
    title,
    nodes: [{ id: 'start', text: '', choices: [createChoice()] }],
  });
}

export function createNode(id: string): EncounterNode {
  return { id, text: '', variants: [], extraTexts: [], effects: [], choices: [createChoice()] };
}

export function createChoice(text = ''): Choice {
  return { id: uid('c'), text, showIf: null, require: null, branches: [createBranch()] };
}

export function createBranch(condition: Condition | null = null): Branch {
  return { id: uid('b'), condition, outcomes: [createOutcome()] };
}

export function createOutcome(): Outcome {
  return { id: uid('o'), weight: 1, text: '', effects: [], next: null };
}

/** ASCII 슬러그가 가능하면 그것을, 아니면 prefix_N 형태의 겹치지 않는 id를 만든다 */
export function makeUniqueId(base: string, taken: Iterable<string>, prefix: string): string {
  const used = new Set(taken);
  const slug = base
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (slug && /^[a-z]/.test(slug) && !used.has(slug)) return slug;
  const stem = slug && /^[a-z]/.test(slug) ? slug : prefix;
  for (let i = 1; ; i++) {
    const candidate = `${stem}_${i}`;
    if (!used.has(candidate)) return candidate;
  }
}

export const ID_PATTERN = /^[A-Za-z0-9_-]+$/;
