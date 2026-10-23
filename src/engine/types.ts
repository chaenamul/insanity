// ─────────────────────────────────────────────────────────────
// 콘텐츠 데이터 모델 (에디터가 편집하고, 게임 엔진이 읽는 형식)
// ─────────────────────────────────────────────────────────────

/** 플레이어 수치. hp/maxHp = 체력 칸, sanity/maxSanity = 정신력 x/y */
export type StatKey = 'hp' | 'maxHp' | 'sanity' | 'maxSanity';

export type CompareOp = '>=' | '<=' | '==' | '!=' | '>' | '<';

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
  /** 체력/정신력 등 수치 비교 */
  | { type: 'stat'; stat: StatKey; op: CompareOp; value: number }
  /** 현재 몇 번째 인카운터인지 (1부터) */
  | { type: 'turn'; op: CompareOp; value: number }
  /** 이번 판에서 해당 인카운터를 겪었는지 */
  | { type: 'seen'; encounterId: string; has: boolean };

export type ConditionType = Condition['type'];
export type ConditionGroup = Extract<Condition, { type: 'all' | 'any' }>;

export type Effect =
  /** 수치 증감. valueMax가 있으면 value~valueMax 사이 무작위 (예: 정신력 -1~-6) */
  | { type: 'stat'; stat: StatKey; value: number; valueMax?: number | null }
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
  text: string;
  /** 조건을 만족하면 본문 뒤에 덧붙는 문단 */
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

export interface Encounter {
  id: string;
  title: string;
  /** 디자이너 메모 (게임에 표시되지 않음) */
  notes: string;
  spawn: Spawn;
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
  hp: number;
  maxHp: number;
  sanity: number;
  maxSanity: number;
  items: { id: string; count: number }[];
  traits: string[];
}

export interface GameMeta {
  title: string;
  subtitle: string;
  /** 타이틀 화면에 보여줄 도입부 */
  intro: string;
}

export interface GameContent {
  version: 1;
  meta: GameMeta;
  start: StartState;
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
  hp: number;
  maxHp: number;
  sanity: number;
  maxSanity: number;
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
