import { DEFAULT_THEME, isColor } from './colors';
import { DEFAULT_DATE, DEFAULT_DATE_PARTS, normalizeDate } from './dates';
import {
  BUILTIN_ENDINGS,
  type Branch,
  type Choice,
  type CompareOp,
  type Condition,
  type ConditionalText,
  type DateParts,
  type Effect,
  type Encounter,
  type EncounterNode,
  type EndingDef,
  type EndingKind,
  type GameContent,
  type Outcome,
  type ParamDef,
  type ParamShow,
  type Prerequisite,
  type ShelfSettings,
  type Spawn,
  type StatDisplay,
  type StatField,
  type ThemeColors,
  type UiSettings,
} from './types';

// 콘텐츠 정규화: 손으로 작성했거나 일부 필드가 빠진 JSON도 완전한 형태로 맞춰준다.
// 생략 가능한 것들: 대부분의 기본값, id, choice.outcomes(분기 없이 결과만 나열), 조건 배열(= 모두 만족).
// 예전 형식(start.hp/sanity, { stat: 'maxSanity' })도 파라미터 형식으로 바꿔 읽는다.

type Loose = Record<string, unknown>;

let uidCounter = 0;
export function uid(prefix: string): string {
  uidCounter = (uidCounter + 1) % 1296;
  return `${prefix}_${Date.now().toString(36).slice(-4)}${Math.random().toString(36).slice(2, 5)}${uidCounter.toString(36)}`;
}

const OPS: CompareOp[] = ['>=', '<=', '==', '!=', '>', '<'];
const ENDING_KINDS: EndingKind[] = ['death', 'madness', 'victory', 'other'];
const PARAM_SHOWS: ParamShow[] = ['pinned', 'panel', 'hidden'];
const STAT_DISPLAYS: StatDisplay[] = ['bar', 'cells', 'number'];

/** 예전 형식의 수치 이름 → 파라미터 id와 현재/최대값 */
const LEGACY_STATS: Record<string, { id: string; field: StatField }> = {
  hp: { id: 'hp', field: 'value' },
  maxHp: { id: 'hp', field: 'max' },
  sanity: { id: 'sanity', field: 'value' },
  maxSanity: { id: 'sanity', field: 'max' },
};

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
function oneOf<T extends string>(v: unknown, list: readonly T[], fallback: T): T {
  return list.includes(v as T) ? (v as T) : fallback;
}
/** 수치 조건/효과의 대상. { id, field } 또는 예전 형식 { stat: 'maxSanity' } */
function statRef(r: Loose): { id: string; field: StatField } {
  if (r.id == null && typeof r.stat === 'string') return LEGACY_STATS[r.stat] ?? { id: r.stat, field: 'value' };
  return { id: str(r.id), field: r.field === 'max' ? 'max' : 'value' };
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
      return { type: 'stat', ...statRef(r), op: op(r.op), value: num(r.value, 0) };
    case 'text':
      return { type: 'text', id: str(r.id), op: r.op === '!=' ? '!=' : '==', value: str(r.value) };
    case 'date':
      return { type: 'date', id: str(r.id), op: op(r.op), value: normalizeDate(r.value) };
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
      return { type: 'stat', ...statRef(r), value: num(r.value, 0), valueMax: numOrNull(r.valueMax) };
    case 'text':
      return { type: 'text', id: str(r.id), value: str(r.value) };
    case 'date':
      return { type: 'date', id: str(r.id), mode: r.mode === 'set' ? 'set' : 'add', days: num(r.days, 1), date: normalizeDate(r.date) };
    case 'theme':
      return { type: 'theme', ...normalizeColors(r) };
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

/** 가변 색상의 배경/글자 색. 올바른 색(#rrggbb)이 아니면 null = 이야기 기본 색 */
function normalizeColors(r: Loose): ThemeColors {
  return { background: isColor(r.background) ? r.background : null, text: isColor(r.text) ? r.text : null };
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
    startColors: r.startColors && typeof r.startColors === 'object' ? normalizeColors(obj(r.startColors)) : null,
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

/** 새 파라미터의 기본값 */
export function createParam(kind: ParamDef['kind'], id: string, name: string): ParamDef {
  switch (kind) {
    case 'stat':
      return { kind, id, name, show: 'pinned', value: 10, max: 10, unit: null, display: 'bar', zeroEnding: null, mood: false };
    case 'text':
      return { kind, id, name, show: 'pinned', value: '' };
    case 'date':
      return { kind, id, name, show: 'pinned', value: DEFAULT_DATE, parts: { ...DEFAULT_DATE_PARTS } };
  }
}

/** 날짜에서 보여줄 정보. 예전 형식 format: 'ymd' | 'ymdw' | 'md' | 'mdw'도 읽는다 */
function normalizeDateParts(r: Loose): DateParts {
  if (r.parts && typeof r.parts === 'object') {
    const p = obj(r.parts);
    return {
      year: bool(p.year, DEFAULT_DATE_PARTS.year),
      month: bool(p.month, DEFAULT_DATE_PARTS.month),
      day: bool(p.day, DEFAULT_DATE_PARTS.day),
      weekday: bool(p.weekday, DEFAULT_DATE_PARTS.weekday),
    };
  }
  const format = str(r.format);
  return { year: !format.startsWith('m'), month: true, day: true, weekday: format.endsWith('w') };
}

/** params가 없는 예전 콘텐츠: start의 체력/정신력을 파라미터로 */
function legacyParams(start: Loose): ParamDef[] {
  const maxHp = num(start.maxHp, 3);
  const maxSanity = num(start.maxSanity, 100);
  return [
    { kind: 'stat', id: 'hp', name: '체력', show: 'pinned', value: num(start.hp, maxHp), max: maxHp, unit: null, display: 'cells', zeroEnding: BUILTIN_ENDINGS.death, mood: false },
    {
      kind: 'stat',
      id: 'sanity',
      name: '정신력',
      show: 'pinned',
      value: num(start.sanity, maxSanity),
      max: maxSanity,
      unit: null,
      display: 'bar',
      zeroEnding: BUILTIN_ENDINGS.madness,
      mood: true,
    },
  ];
}

function normalizeParam(raw: unknown): ParamDef {
  const r = obj(raw);
  const kind = r.kind === 'text' || r.kind === 'date' ? r.kind : 'stat';
  const base = { id: str(r.id), name: str(r.name), show: oneOf(r.show, PARAM_SHOWS, 'pinned') };
  switch (kind) {
    case 'text':
      return { ...base, kind, value: str(r.value) };
    case 'date':
      return { ...base, kind, value: normalizeDate(r.value), parts: normalizeDateParts(r) };
    case 'stat': {
      const max = numOrNull(r.max);
      return {
        ...base,
        kind,
        value: num(r.value, max ?? 0),
        max: max == null ? null : Math.max(0, max),
        unit: typeof r.unit === 'string' ? r.unit : null,
        display: oneOf(r.display, STAT_DISPLAYS, max == null ? 'number' : 'bar'),
        zeroEnding: r.zeroEnding == null || r.zeroEnding === '' ? null : str(r.zeroEnding),
        mood: bool(r.mood, false),
      };
    }
  }
}

function normalizeShelf(raw: unknown, label: string, empty: string): ShelfSettings {
  const r = obj(raw);
  return { show: bool(r.show, true), label: str(r.label) || label, empty: str(r.empty, empty) };
}

function normalizeUi(raw: unknown): UiSettings {
  const r = obj(raw);
  const hud = obj(r.hud);
  return {
    hud: { summary: hud.summary === 'text' ? 'text' : 'pinned', text: str(hud.text, '상태 보기') },
    items: normalizeShelf(r.items, '소지품', '아무것도 가지고 있지 않다.'),
    traits: normalizeShelf(r.traits, '능력', '아직 아무것도 깨닫지 못했다.'),
  };
}

export function normalizeContent(raw: unknown): GameContent {
  const r = obj(raw);
  const meta = obj(r.meta);
  const start = obj(r.start);
  const theme = obj(r.theme);
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
  return {
    version: 2,
    meta: { title: str(meta.title, '제목 없음'), subtitle: str(meta.subtitle), intro: str(meta.intro) },
    start: {
      items: arr(start.items).map((i) => ({ id: str(obj(i).id), count: num(obj(i).count, 1) })),
      traits: arr(start.traits).map((t) => str(t)),
    },
    params: Array.isArray(r.params) ? r.params.map(normalizeParam) : legacyParams(start),
    ui: normalizeUi(r.ui),
    theme: {
      background: isColor(theme.background) ? theme.background : DEFAULT_THEME.background,
      text: isColor(theme.text) ? theme.text : DEFAULT_THEME.text,
      variable: bool(theme.variable, false),
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
