// ─────────────────────────────────────────────────────────────
// 콘텐츠 데이터 모델 (에디터가 편집하고, 게임 엔진이 읽는 형식)
// ─────────────────────────────────────────────────────────────

export type CompareOp = '>=' | '<=' | '==' | '!=' | '>' | '<';

/** 수치 파라미터의 현재값 / 최대값 */
export type StatField = 'value' | 'max';

/**
 * 조건. 그룹(all/any)으로 묶어 중첩할 수 있다.
 * 빈 그룹(all: [])은 항상 참이다.
 */
export type Condition =
  | { type: 'all'; items: Condition[] }
  | { type: 'any'; items: Condition[] }
  /** 아이템 보유 개수 비교 (기본: 1개 이상) */
  | { type: 'item'; id: string; op: CompareOp; value: number }
  /** 능력 보유/미보유 */
  | { type: 'trait'; id: string; has: boolean }
  /** 숨겨진 플래그(숫자 변수) 비교 */
  | { type: 'flag'; id: string; op: CompareOp; value: number }
  /** 수치 파라미터(체력, 정신력 등) 비교 */
  | { type: 'stat'; id: string; field: StatField; op: CompareOp; value: number }
  /** 상태 파라미터(짧은 텍스트)가 같은지/다른지 */
  | { type: 'text'; id: string; op: '==' | '!='; value: string }
  /** 캘린더 파라미터의 날짜 비교 (YYYY-MM-DD) */
  | { type: 'date'; id: string; op: CompareOp; value: string }
  /** 현재 몇 번째 인카운터인지 (1부터) */
  | { type: 'turn'; op: CompareOp; value: number }
  /** 이번 판에서 해당 인카운터를 겪었는지 */
  | { type: 'seen'; encounterId: string; has: boolean };

export type ConditionType = Condition['type'];
export type ConditionGroup = Extract<Condition, { type: 'all' | 'any' }>;

export type Effect =
  /** 수치 파라미터 증감. valueMax가 있으면 value~valueMax 사이 무작위 (예: 정신력 -1~-6) */
  | { type: 'stat'; id: string; field: StatField; value: number; valueMax?: number | null }
  /** 상태 파라미터를 이 글로 바꾼다 */
  | { type: 'text'; id: string; value: string }
  /** 캘린더 파라미터: add면 days일 지남(음수면 거꾸로), set이면 date로 */
  | { type: 'date'; id: string; mode: 'add' | 'set'; days: number; date: string }
  /** 가변 색상: 배경/글자 색을 바꾼다. null이면 이야기 기본 색으로 */
  | ({ type: 'theme' } & ThemeColors)
  /** 아이템 증감 (음수면 잃음) */
  | { type: 'item'; id: string; value: number }
  /** 능력 획득/상실 */
  | { type: 'trait'; id: string; has: boolean }
  /** 플래그 설정(set) 또는 증감(add) */
  | { type: 'flag'; id: string; mode: 'set' | 'add'; value: number }
  /** 인카운터 예약: 지금 인카운터가 끝난 뒤 delay개 후에 반드시 등장 (0 = 바로 다음) */
  | { type: 'queue'; encounterId: string; delay: number }
  /** 게임 종료 (엔딩) */
  | { type: 'ending'; endingId: string };

export type EffectType = Effect['type'];

export interface Outcome {
  id: string;
  /** 같은 분기 안에서의 확률 가중치 */
  weight: number;
  /** 결과 서술 */
  text: string;
  effects: Effect[];
  /** 이어질 페이지 id. null이면 인카운터 종료 */
  next: string | null;
}

export interface Branch {
  id: string;
  /** null이면 "그 외/항상". 위에서부터 처음으로 조건을 만족한 분기가 선택된다 */
  condition: Condition | null;
  /** 결과가 여러 개면 가중치에 따라 무작위로 하나 */
  outcomes: Outcome[];
}

export interface Choice {
  id: string;
  text: string;
  /** 표시 조건: 만족하지 않으면 선택지가 아예 보이지 않음 (특정 능력이 있어야 생기는 선택지) */
  showIf: Condition | null;
  /** 요구 조건: 선택지 앞에 [태그]로 표시, 만족 시 초록 / 불만족 시 빨강 + 선택 불가 */
  require: Condition | null;
  branches: Branch[];
}

export interface ConditionalText {
  id: string;
  condition: Condition | null;
  text: string;
}

/** 인카운터 안의 한 장면(페이지) */
export interface EncounterNode {
  id: string;
  /** 기본 본문. variants 중 조건을 만족하는 것이 없을 때 나온다 */
  text: string;
  /** 조건부 본문: 위에서부터 처음으로 조건을 만족한 것이 기본 본문 대신 나온다 */
  variants: ConditionalText[];
  /** 추가 문단: 조건을 만족하면 본문 뒤에 덧붙는다 (만족하는 것 모두) */
  extraTexts: ConditionalText[];
  /** 이 페이지에 들어설 때 적용되는 효과 */
  effects: Effect[];
  choices: Choice[];
}

/**
 * 출현 방식
 * - random: 조건을 만족하면 랜덤 풀에 들어감 (가중치에 따라 뽑힘)
 * - triggered: 랜덤으로는 나오지 않고, 다른 인카운터의 '인카운터 예약' 효과로만 등장
 * - fixed: n번째 인카운터로 고정 등장 (그 시점에 다른 예약이 있으면 그 다음 가능한 때)
 */
export type SpawnMode = 'random' | 'triggered' | 'fixed';

/** 선행 인카운터: 해당 인카운터 이후, 사이에 minGap~maxGap개의 다른 인카운터를 거쳐 등장 */
export interface Prerequisite {
  encounterId: string;
  minGap: number;
  /** null이면 제한 없음. 값이 있으면 간격이 maxGap에 도달했을 때 강제 등장 */
  maxGap: number | null;
}

export interface Spawn {
  mode: SpawnMode;
  weight: number;
  repeatable: boolean;
  /** 반복 가능할 때, 다시 나오기까지 최소 몇 개의 다른 인카운터가 필요한지 */
  cooldown: number;
  /** 등장 가능한 구간 (n번째 인카운터 기준, 1부터). null이면 제한 없음 */
  minTurn: number | null;
  maxTurn: number | null;
  /** mode === 'fixed'일 때의 등장 순번 */
  fixedTurn: number;
  after: Prerequisite[];
  condition: Condition | null;
}

/** 가변 색상: 배경/글자 색. null이면 이야기 기본 색 */
export interface ThemeColors {
  background: string | null;
  text: string | null;
}

export interface Encounter {
  id: string;
  title: string;
  /** 디자이너 메모 (게임에 표시되지 않음) */
  notes: string;
  spawn: Spawn;
  /** 가변 색상: 이 인카운터가 시작될 때 바꿀 색. null이면 그대로 */
  startColors: ThemeColors | null;
  /** 시작 페이지 id */
  start: string;
  nodes: EncounterNode[];
}

export interface ItemDef {
  id: string;
  name: string;
  description: string;
}

export interface TraitDef {
  id: string;
  name: string;
  description: string;
}

export interface FlagDef {
  id: string;
  name: string;
  description: string;
  initial: number;
}

export type EndingKind = 'death' | 'madness' | 'victory' | 'other';

export interface EndingDef {
  id: string;
  title: string;
  text: string;
  kind: EndingKind;
}

export interface StartState {
  items: { id: string; count: number }[];
  traits: string[];
}

// ─── 파라미터: 플레이어 화면 상단에 보이는 정보 (체력, 정신력, 날짜, 상태 등) ───

export type ParamKind = 'stat' | 'text' | 'date';

/** pinned: 상단에 항상 / panel: 상단을 펼쳤을 때만 / hidden: 플레이어에게 보이지 않음 */
export type ParamShow = 'pinned' | 'panel' | 'hidden';

/** 수치 표시 방식: 막대(현재/최대) / 칸(체력처럼) / 숫자 */
export type StatDisplay = 'bar' | 'cells' | 'number';

/** 날짜에서 보여줄 정보 (예: 월·일·요일만 → "12월 1일 (화)") */
export interface DateParts {
  year: boolean;
  month: boolean;
  day: boolean;
  weekday: boolean;
}

interface ParamBase {
  id: string;
  name: string;
  show: ParamShow;
}

/** 수치: 현재값과 (있으면) 최대값. 0 아래로는 내려가지 않는다 */
export interface StatParam extends ParamBase {
  kind: 'stat';
  /** 시작 값 */
  value: number;
  /** 시작 최대값. null이면 상한 없음 */
  max: number | null;
  /** 숫자 뒤에 붙는 단위 (예: 원, %, kg). null이면 단위 없음 */
  unit: string | null;
  display: StatDisplay;
  /** 0이 되면 도달하는 엔딩 (체력 → 죽음, 정신력 → 광기). null이면 없음 */
  zeroEnding: string | null;
  /** 시작 최대값에 비해 낮아질수록 화면이 어두워지고 흔들린다 */
  mood: boolean;
}

/** 상태: 짧은 텍스트 (예: "중독", "평온") */
export interface TextParam extends ParamBase {
  kind: 'text';
  value: string;
}

/** 캘린더: 날짜 (YYYY-MM-DD) */
export interface DateParam extends ParamBase {
  kind: 'date';
  value: string;
  parts: DateParts;
}

export type ParamDef = StatParam | TextParam | DateParam;

// ─── 플레이어 화면 설정 ───

/** 상단 정보가 접혀 있을 때 보일 것: 상단 고정 파라미터들 / 제작자가 쓴 문구만 */
export interface HudSettings {
  summary: 'pinned' | 'text';
  text: string;
}

/** 하단 소지품/능력 버튼 */
export interface ShelfSettings {
  /** false면 버튼과 획득/상실 알림이 아예 보이지 않는다 */
  show: boolean;
  label: string;
  /** 비어 있을 때의 문구 */
  empty: string;
}

export interface UiSettings {
  hud: HudSettings;
  items: ShelfSettings;
  traits: ShelfSettings;
}

/** 이야기의 배경/글자 색 (#rrggbb). variable이면 진행 중 효과로 바꿀 수 있다 */
export interface StoryTheme {
  background: string;
  text: string;
  variable: boolean;
}

export interface GameMeta {
  title: string;
  subtitle: string;
  /** 타이틀 화면에 보여줄 도입부 */
  intro: string;
}

export interface GameContent {
  version: 2;
  meta: GameMeta;
  start: StartState;
  params: ParamDef[];
  ui: UiSettings;
  theme: StoryTheme;
  items: ItemDef[];
  traits: TraitDef[];
  flags: FlagDef[];
  endings: EndingDef[];
  encounters: Encounter[];
}

/** 엔진이 자동으로 사용하는 엔딩 id (콘텐츠에 없으면 기본값으로 채워진다) */
export const BUILTIN_ENDINGS = {
  death: 'death',
  madness: 'madness',
  exhausted: 'exhausted',
} as const;

// ─────────────────────────────────────────────────────────────
// 런(한 판) 상태
// ─────────────────────────────────────────────────────────────

export type LogTone = 'good' | 'bad' | 'worse' | 'neutral';

export type LogEntry =
  | { kind: 'text'; text: string }
  | { kind: 'choice'; text: string }
  | { kind: 'effect'; text: string; tone: LogTone };

export interface HistoryEntry {
  encounterId: string;
  /** 이 인카운터를 마친 직후의 turn 값 */
  turn: number;
}

export interface QueueEntry {
  encounterId: string;
  /** state.turn이 이 값 이상이 되면 등장 */
  dueTurn: number;
}

export type SelectionSource = 'queue' | 'fixed' | 'forced' | 'random' | 'debug';

export interface CurrentEncounter {
  encounterId: string;
  nodeId: string | null;
  /** choose: 선택지 고르는 중 / continue: '계속' 버튼 대기 */
  phase: 'choose' | 'continue';
  source: SelectionSource;
  log: LogEntry[];
}

export interface RunState {
  seed: number;
  rng: number;
  /** 완료한 인카운터 수. 진행 중인 인카운터는 turn + 1번째 */
  turn: number;
  /** 수치 파라미터의 현재값/최대값 */
  stats: Record<string, { value: number; max: number | null }>;
  /** 상태 파라미터 */
  texts: Record<string, string>;
  /** 캘린더 파라미터 (YYYY-MM-DD) */
  dates: Record<string, string>;
  /** 가변 색상 효과로 바뀐 색. null이면 이야기 기본 색 */
  colors: ThemeColors;
  items: Record<string, number>;
  traits: string[];
  flags: Record<string, number>;
  history: HistoryEntry[];
  queue: QueueEntry[];
  current: CurrentEncounter | null;
  /** '계속'을 누르면 도달할 엔딩 (사망 서술을 먼저 보여주기 위함) */
  pendingEnding: string | null;
  ending: string | null;
}
