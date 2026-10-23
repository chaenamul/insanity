import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { joinContent, normalizeContent } from './content';
import { conditionTags } from './describe';
import { checkAvailability, selectNextEncounter } from './scheduler';
import { choose, createInitialState, getView, newRun, proceed } from './run';
import { simulate } from './simulate';
import type { GameContent, RunState } from './types';
import { validateContent } from './validate';
import { findReferences, renameReferences } from './walk';

/** 선택지 하나짜리 단순 인카운터 */
function simple(id: string, spawn: object = {}, effects: object[] = []) {
  return {
    id,
    title: id,
    spawn,
    nodes: [{ id: 'start', text: `${id} 본문`, choices: [{ id: 'ok', text: '확인', outcomes: [{ text: '끝', effects }] }] }],
  };
}

function content(encounters: object[], extra: object = {}): GameContent {
  return normalizeContent({
    meta: { title: 't' },
    items: [{ id: 'gun', name: '권총' }, { id: 'key', name: '열쇠' }],
    traits: [{ id: 'lore', name: '금지된 지식' }],
    flags: [{ id: 'f', name: '플래그' }],
    encounters,
    ...extra,
  });
}

/** 현재 인카운터를 첫 선택지로 끝내고 다음으로 */
function playThrough(c: GameContent, s: RunState): RunState {
  const view = getView(c, s)!;
  let next = view.choices.length ? choose(c, s, view.choices[0].id) : s;
  while (next.current && next.current.phase === 'choose') {
    next = choose(c, next, getView(c, next)!.choices[0].id);
  }
  return proceed(c, next);
}

function sequence(c: GameContent, seed: number, count: number): string[] {
  let s = newRun(c, { seed });
  const ids: string[] = [];
  for (let i = 0; i < count && s.current; i++) {
    ids.push(s.current.encounterId);
    s = playThrough(c, s);
  }
  return ids;
}

describe('정규화', () => {
  it('단축 표기(outcomes, 조건 배열)를 분기 형태로 바꾼다', () => {
    const c = content([
      {
        id: 'a',
        nodes: [{ text: 'x', choices: [{ text: 'y', require: [{ type: 'item', id: 'gun' }], outcomes: [{ text: 'z' }] }] }],
      },
    ]);
    const choice = c.encounters[0].nodes[0].choices[0];
    expect(choice.branches).toHaveLength(1);
    expect(choice.branches[0].condition).toBeNull();
    expect(choice.require).toEqual({ type: 'all', items: [{ type: 'item', id: 'gun', op: '>=', value: 1 }] });
    expect(c.encounters[0].start).toBe('start');
    expect(c.endings.map((e) => e.id)).toEqual(expect.arrayContaining(['death', 'madness', 'exhausted']));
  });

  it('game.json의 순서대로 인카운터를 합친다', () => {
    const c = joinContent({ encounterOrder: ['b', 'a'] }, [simple('a'), simple('c'), simple('b')]);
    expect(c.encounters.map((e) => e.id)).toEqual(['b', 'a', 'c']);
  });
});

describe('효과', () => {
  it('최대 정신력이 줄면 현재 정신력도 그 이하로 깎인다', () => {
    const c = content([simple('a', {}, [{ type: 'stat', stat: 'maxSanity', value: -30 }])]);
    const s = choose(c, newRun(c, { seed: 1 }), 'ok');
    expect(s.maxSanity).toBe(70);
    expect(s.sanity).toBe(70);
  });

  it('범위 효과는 범위 안의 값을 준다', () => {
    const c = content([simple('a', {}, [{ type: 'stat', stat: 'sanity', value: -1, valueMax: -6 }])]);
    for (let seed = 0; seed < 30; seed++) {
      const s = choose(c, newRun(c, { seed }), 'ok');
      expect(s.sanity).toBeGreaterThanOrEqual(94);
      expect(s.sanity).toBeLessThanOrEqual(99);
    }
  });

  it('체력이 0이 되면 서술을 보여준 뒤 사망 엔딩', () => {
    const c = content([simple('a', {}, [{ type: 'stat', stat: 'hp', value: -3 }])]);
    let s = choose(c, newRun(c, { seed: 1 }), 'ok');
    expect(s.pendingEnding).toBe('death');
    expect(s.ending).toBeNull();
    s = proceed(c, s);
    expect(s.ending).toBe('death');
    // 엔딩이 난 인카운터도 겪은 것으로 기록
    expect(s.history.map((h) => h.encounterId)).toEqual(['a']);
  });

  it('정신력이 0이 되면 광기 엔딩', () => {
    const c = content([simple('a', {}, [{ type: 'stat', stat: 'sanity', value: -999 }])]);
    expect(proceed(c, choose(c, newRun(c, { seed: 1 }), 'ok')).ending).toBe('madness');
  });
});

describe('선택지', () => {
  const c = content([
    {
      id: 'a',
      nodes: [
        {
          id: 'start',
          text: '',
          choices: [
            { id: 'shoot', text: '쏜다', require: [{ type: 'item', id: 'gun' }], outcomes: [{ text: '' }] },
            { id: 'chant', text: '주문', showIf: [{ type: 'trait', id: 'lore', has: true }], outcomes: [{ text: '' }] },
            {
              id: 'approach',
              text: '다가간다',
              branches: [
                { condition: [{ type: 'trait', id: 'lore', has: true }], outcomes: [{ text: '알고 있다', next: 'deep' }] },
                { condition: null, outcomes: [{ text: '모른다' }] },
              ],
            },
          ],
        },
        { id: 'deep', text: '깊은 곳', choices: [{ id: 'back', text: '돌아간다', outcomes: [{ text: '' }] }] },
      ],
    },
  ]);

  it('요구 조건은 초록/빨강 태그, 표시 조건은 숨김', () => {
    const s = newRun(c, { seed: 1 });
    const view = getView(c, s)!;
    expect(view.choices.map((ch) => ch.id)).toEqual(['shoot', 'approach']);
    expect(view.choices[0]).toMatchObject({ enabled: false, tags: [{ label: '권총', ok: false }] });

    const armed = { ...s, items: { gun: 1 }, traits: ['lore'] };
    const view2 = getView(c, armed)!;
    expect(view2.choices.map((ch) => ch.id)).toEqual(['shoot', 'chant', 'approach']);
    expect(view2.choices[0]).toMatchObject({ enabled: true, tags: [{ label: '권총', ok: true }] });
  });

  it('빨간 선택지는 고를 수 없다', () => {
    const s = newRun(c, { seed: 1 });
    expect(choose(c, s, 'shoot')).toBe(s);
  });

  it('같은 선택지라도 능력에 따라 다른 분기로 간다', () => {
    const plain = choose(c, newRun(c, { seed: 1 }), 'approach');
    expect(plain.current!.phase).toBe('continue');
    expect(plain.current!.log.at(-1)).toEqual({ kind: 'text', text: '모른다' });

    const s = newRun(c, { seed: 1 });
    const wise = choose(c, { ...s, traits: ['lore'] }, 'approach');
    expect(wise.current!.nodeId).toBe('deep');
    expect(wise.current!.phase).toBe('choose');
  });

  it('any 그룹 요구 조건은 태그 하나로 묶인다', () => {
    const tags = conditionTags(
      c,
      { type: 'any', items: [{ type: 'item', id: 'gun', op: '>=', value: 1 }, { type: 'item', id: 'key', op: '>=', value: 1 }] },
      { ...createInitialState(c, 1), items: { key: 1 } },
    );
    expect(tags).toEqual([{ label: '권총/열쇠', ok: true }]);
  });
});

describe('출현 순서', () => {
  it('고정 순번 인카운터는 정확히 그 순번에 나온다', () => {
    const c = content([simple('intro', { mode: 'fixed', fixedTurn: 1 }), simple('r1', { repeatable: true }), simple('end', { mode: 'fixed', fixedTurn: 4 })]);
    for (let seed = 0; seed < 10; seed++) {
      const ids = sequence(c, seed, 4);
      expect(ids[0]).toBe('intro');
      expect(ids[3]).toBe('end');
    }
  });

  it('후속 전용 인카운터는 예약으로만, 바로 다음에 나온다', () => {
    const c = content([
      simple('a', { mode: 'fixed', fixedTurn: 1 }, [{ type: 'queue', encounterId: 'b', delay: 0 }]),
      simple('b', { mode: 'triggered' }),
      simple('filler', { repeatable: true }),
    ]);
    expect(sequence(c, 3, 3)).toEqual(['a', 'b', 'filler']);
  });

  it('예약 지연(delay)만큼 다른 인카운터가 끼어든다', () => {
    const c = content([
      simple('a', { mode: 'fixed', fixedTurn: 1 }, [{ type: 'queue', encounterId: 'b', delay: 2 }]),
      simple('b', { mode: 'triggered' }),
      simple('filler', { repeatable: true }),
    ]);
    expect(sequence(c, 3, 4)).toEqual(['a', 'filler', 'filler', 'b']);
  });

  it('선행 인카운터 이후 최소~최대 간격 사이에 나오고, 최대 간격에서 강제된다', () => {
    const c = content([
      simple('a', { mode: 'fixed', fixedTurn: 1 }),
      simple('b', { weight: 1, after: [{ encounterId: 'a', minGap: 2, maxGap: 4 }] }),
      simple('filler', { weight: 1000, repeatable: true }),
    ]);
    for (let seed = 0; seed < 30; seed++) {
      const ids = sequence(c, seed, 8);
      const at = ids.indexOf('b');
      // a는 0번 위치. 사이에 2~4개 → b는 3~5번 위치
      expect(at).toBeGreaterThanOrEqual(3);
      expect(at).toBeLessThanOrEqual(5);
    }
  });

  it('최소=최대=0 이면 바로 다음', () => {
    const c = content([
      simple('a', { weight: 1 }),
      simple('b', { weight: 1, after: [{ encounterId: 'a', minGap: 0, maxGap: 0 }] }),
      simple('filler', { weight: 1, repeatable: true }),
    ]);
    for (let seed = 0; seed < 20; seed++) {
      const ids = sequence(c, seed, 12);
      const ia = ids.indexOf('a');
      if (ia !== -1 && ia < ids.length - 1) expect(ids[ia + 1]).toBe('b');
    }
  });

  it('조건(플래그)을 만족해야 나온다', () => {
    const c = content([
      simple('a', { mode: 'fixed', fixedTurn: 1 }),
      simple('b', { condition: [{ type: 'flag', id: 'f', op: '==', value: 1 }] }),
      simple('filler', { repeatable: true, weight: 1 }),
    ]);
    const s = proceed(c, choose(c, newRun(c, { seed: 1 }), 'ok'));
    const enc = c.encounters.find((e) => e.id === 'b')!;
    expect(checkAvailability(c, s, enc).status).toBe('blocked');
    expect(checkAvailability(c, { ...s, flags: { f: 1 } }, enc).status).toBe('available');
  });

  it('한 판에 한 번만 / 반복 간격', () => {
    const c = content([simple('once'), simple('rep', { repeatable: true, cooldown: 1 })]);
    for (let seed = 0; seed < 10; seed++) {
      const ids = sequence(c, seed, 6);
      expect(ids.filter((id) => id === 'once')).toHaveLength(1);
      for (let i = 1; i < ids.length; i++) expect(ids[i] === 'rep' && ids[i - 1] === 'rep').toBe(false);
    }
  });

  it('출현 가능한 인카운터가 없으면 exhausted 엔딩', () => {
    const c = content([simple('only')]);
    const s = proceed(c, choose(c, newRun(c, { seed: 1 }), 'ok'));
    expect(s.ending).toBe('exhausted');
  });

  it('같은 시드면 같은 순서, 다른 시드면 대체로 다른 순서', () => {
    const c = content(['a', 'b', 'c', 'd', 'e', 'f'].map((id) => simple(id)));
    expect(sequence(c, 42, 6)).toEqual(sequence(c, 42, 6));
    const orders = new Set(Array.from({ length: 20 }, (_, seed) => sequence(c, seed, 6).join()));
    expect(orders.size).toBeGreaterThan(5);
  });

  it('예약된 인카운터가 없어도 selectNextEncounter는 상태를 망가뜨리지 않는다', () => {
    const c = content([simple('a')]);
    const s = createInitialState(c, 1);
    s.queue.push({ encounterId: 'deleted', dueTurn: 0 });
    expect(selectNextEncounter(c, s)?.encounterId).toBe('a');
    expect(s.queue).toEqual([]);
  });
});

describe('검증', () => {
  it('끊어진 참조와 도달 불가 페이지를 찾는다', () => {
    const c = content([
      {
        id: 'a',
        nodes: [
          { id: 'start', text: 'x', choices: [{ text: 'y', require: [{ type: 'item', id: 'nope' }], outcomes: [{ text: '', next: 'missing' }] }] },
          { id: 'orphan', text: 'z' },
        ],
      },
      simple('b', { mode: 'triggered' }),
      simple('c', { after: [{ encounterId: 'd', minGap: 0, maxGap: null }] }),
      simple('d', { after: [{ encounterId: 'c', minGap: 0, maxGap: null }] }),
    ]);
    const messages = validateContent(c).map((i) => i.message);
    expect(messages.some((m) => m.includes("'nope'"))).toBe(true);
    expect(messages.some((m) => m.includes("'missing'"))).toBe(true);
    expect(messages.some((m) => m.includes("'orphan'"))).toBe(true);
    expect(messages.some((m) => m.includes('등장할 방법이 없습니다'))).toBe(true);
    expect(messages.some((m) => m.includes('순환'))).toBe(true);
  });

  it('id 변경 시 모든 참조를 함께 바꾼다', () => {
    const c = content([
      simple('a', {}, [{ type: 'queue', encounterId: 'b', delay: 0 }, { type: 'item', id: 'gun', value: 1 }]),
      simple('b', { after: [{ encounterId: 'a', minGap: 0, maxGap: null }], condition: [{ type: 'seen', encounterId: 'a' }] }),
    ]);
    renameReferences(c, 'encounter', 'a', 'alpha');
    renameReferences(c, 'item', 'gun', 'revolver');
    expect(findReferences(c, 'encounter', 'a')).toEqual([]);
    expect(findReferences(c, 'encounter', 'alpha')).toHaveLength(2);
    expect(findReferences(c, 'item', 'revolver')).toHaveLength(1);
  });
});

describe('예시 콘텐츠', () => {
  const dir = join(__dirname, '../../content');
  const game = JSON.parse(readFileSync(join(dir, 'game.json'), 'utf8'));
  const encounters = readdirSync(join(dir, 'encounters'))
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(dir, 'encounters', f), 'utf8')));
  const c = joinContent(game, encounters);

  it('검증 오류가 없다', () => {
    expect(validateContent(c).filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('무작위 플레이 시뮬레이션이 막힘 없이 끝난다', () => {
    const report = simulate(c, { runs: 300, seed: 7 });
    expect(report.truncated).toBe(0);
    expect(report.encounters.find((e) => e.id === 'prologue')!.avgFirstTurn).toBe(1);
  });
});
