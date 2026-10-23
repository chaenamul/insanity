import { isEmptyCondition } from './conditions';
import { ID_PATTERN } from './content';
import type { GameContent } from './types';
import { refsOfCondition, refsOfEffect, walkEncounter, type RefKind } from './walk';

export type Severity = 'error' | 'warning';

export interface Issue {
  severity: Severity;
  message: string;
  /** 문제가 있는 인카운터 (없으면 전역 설정 문제) */
  encounterId?: string;
  nodeId?: string | null;
  where?: string;
  /** 전역 문제일 때 이동할 에디터 탭 */
  tab?: 'definitions' | 'endings' | 'settings';
}

const KIND_LABELS: Record<RefKind, string> = {
  item: '아이템',
  trait: '능력',
  flag: '플래그',
  encounter: '인카운터',
  ending: '엔딩',
};

function duplicates(ids: string[]): string[] {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const id of ids) (seen.has(id) ? dup : seen).add(id);
  return [...dup];
}

export function validateContent(content: GameContent): Issue[] {
  const issues: Issue[] = [];
  const known: Record<RefKind, Set<string>> = {
    item: new Set(content.items.map((i) => i.id)),
    trait: new Set(content.traits.map((t) => t.id)),
    flag: new Set(content.flags.map((f) => f.id)),
    encounter: new Set(content.encounters.map((e) => e.id)),
    ending: new Set(content.endings.map((e) => e.id)),
  };

  // ── 정의 ──
  const defLists: [RefKind, { id: string; name?: string; title?: string }[], Issue['tab']][] = [
    ['item', content.items, 'definitions'],
    ['trait', content.traits, 'definitions'],
    ['flag', content.flags, 'definitions'],
    ['ending', content.endings, 'endings'],
  ];
  for (const [kind, list, tab] of defLists) {
    for (const d of list) {
      if (!d.id) issues.push({ severity: 'error', message: `id가 비어 있는 ${KIND_LABELS[kind]}가 있습니다`, tab });
      if (!(d.name ?? d.title)) issues.push({ severity: 'warning', message: `${KIND_LABELS[kind]} '${d.id}'의 이름이 비어 있습니다`, tab });
    }
    for (const id of duplicates(list.map((d) => d.id))) {
      issues.push({ severity: 'error', message: `${KIND_LABELS[kind]} id '${id}'가 중복됩니다`, tab });
    }
  }
  for (const i of content.start.items) {
    if (!known.item.has(i.id)) issues.push({ severity: 'error', message: `시작 아이템 '${i.id}'가 정의되지 않았습니다`, tab: 'settings' });
  }
  for (const t of content.start.traits) {
    if (!known.trait.has(t)) issues.push({ severity: 'error', message: `시작 능력 '${t}'가 정의되지 않았습니다`, tab: 'settings' });
  }

  // ── 인카운터 id ──
  for (const enc of content.encounters) {
    if (!enc.id) issues.push({ severity: 'error', message: `id가 비어 있는 인카운터가 있습니다 ('${enc.title}')` });
    else if (!ID_PATTERN.test(enc.id)) {
      issues.push({ severity: 'error', message: 'id에는 영문, 숫자, _, - 만 쓸 수 있습니다 (파일 이름으로 쓰임)', encounterId: enc.id });
    }
  }
  for (const id of duplicates(content.encounters.map((e) => e.id))) {
    issues.push({ severity: 'error', message: `인카운터 id '${id}'가 중복됩니다`, encounterId: id });
  }

  // ── 후속 전용 인카운터가 예약되는 곳이 있는지 ──
  const queued = new Set<string>();
  for (const enc of content.encounters) {
    walkEncounter(enc, {
      effect(e) {
        if (e.type === 'queue') queued.add(e.encounterId);
      },
    });
  }

  // ── 고정 순번 충돌 ──
  const fixedTurns = new Map<number, string[]>();
  for (const enc of content.encounters) {
    if (enc.spawn.mode !== 'fixed') continue;
    fixedTurns.set(enc.spawn.fixedTurn, [...(fixedTurns.get(enc.spawn.fixedTurn) ?? []), enc.id]);
  }
  for (const [turn, ids] of fixedTurns) {
    if (ids.length > 1) {
      issues.push({
        severity: 'warning',
        message: `${turn}번째 고정 인카운터가 여러 개입니다 (${ids.join(', ')}). 조건이 겹치면 하나씩 밀려서 등장합니다`,
        encounterId: ids[0],
      });
    }
  }

  // ── 선행 관계 순환 ──
  const afterOf = new Map(content.encounters.map((e) => [e.id, e.spawn.mode === 'triggered' ? [] : e.spawn.after.map((p) => p.encounterId)]));
  const state = new Map<string, 'visiting' | 'done'>();
  const reportedCycles = new Set<string>();
  const visit = (id: string, path: string[]): void => {
    if (state.get(id) === 'done') return;
    if (state.get(id) === 'visiting') {
      const cycle = path.slice(path.indexOf(id));
      const key = [...cycle].sort().join('|');
      if (!reportedCycles.has(key)) {
        reportedCycles.add(key);
        issues.push({
          severity: 'error',
          message: `선행 인카운터가 순환합니다: ${[...cycle, id].join(' → ')} (서로를 기다려 영원히 등장하지 않음)`,
          encounterId: id,
        });
      }
      return;
    }
    state.set(id, 'visiting');
    for (const dep of afterOf.get(id) ?? []) visit(dep, [...path, id]);
    state.set(id, 'done');
  };
  for (const enc of content.encounters) visit(enc.id, []);

  // ── 인카운터별 ──
  for (const enc of content.encounters) {
    const at = (message: string, severity: Severity = 'error', nodeId: string | null = null, where?: string): void => {
      issues.push({ severity, message, encounterId: enc.id, nodeId, where });
    };
    const s = enc.spawn;

    if (!enc.title.trim()) at('제목이 비어 있습니다', 'warning');
    if (s.mode === 'random' && s.weight <= 0) at('가중치가 0 이하라서 랜덤으로 뽑히지 않습니다', 'warning');
    if (s.mode === 'triggered' && !queued.has(enc.id)) {
      at('후속 전용인데 이 인카운터를 예약하는 효과가 없어 등장할 방법이 없습니다', 'warning');
    }
    if (s.minTurn != null && s.maxTurn != null && s.minTurn > s.maxTurn) at('등장 구간의 시작이 끝보다 큽니다');
    if (s.mode !== 'triggered') {
      for (const p of s.after) {
        if (!p.encounterId) at('선행 인카운터가 선택되지 않았습니다', 'error', null, '출현 설정');
        else if (p.encounterId === enc.id) at('자기 자신을 선행 인카운터로 지정했습니다', 'error', null, '출현 설정');
        else if (!known.encounter.has(p.encounterId)) at(`선행 인카운터 '${p.encounterId}'가 없습니다`, 'error', null, '출현 설정');
        if (p.maxGap != null && p.maxGap < p.minGap) at('선행 인카운터의 최대 간격이 최소 간격보다 작습니다', 'error', null, '출현 설정');
      }
    }

    // 페이지
    const nodeIds = new Set(enc.nodes.map((n) => n.id));
    for (const id of duplicates(enc.nodes.map((n) => n.id))) at(`페이지 id '${id}'가 중복됩니다`, 'error', id);
    for (const n of enc.nodes) if (!n.id) at('id가 비어 있는 페이지가 있습니다');
    if (!nodeIds.has(enc.start)) at(`시작 페이지 '${enc.start}'가 없습니다`);

    // 도달 가능성
    const reachable = new Set<string>();
    const stack = [enc.start];
    while (stack.length) {
      const id = stack.pop()!;
      if (reachable.has(id) || !nodeIds.has(id)) continue;
      reachable.add(id);
      const node = enc.nodes.find((n) => n.id === id)!;
      for (const c of node.choices) for (const b of c.branches) for (const o of b.outcomes) if (o.next) stack.push(o.next);
    }
    for (const n of enc.nodes) {
      if (!reachable.has(n.id)) at(`페이지 '${n.id}'는 어떤 선택지로도 도달할 수 없습니다`, 'warning', n.id);
    }

    for (const node of enc.nodes) {
      if (node.id === enc.start && !node.text.trim()) at('시작 페이지 본문이 비어 있습니다', 'warning', node.id);
      node.choices.forEach((choice, ci) => {
        const where = `페이지 ${node.id} › 선택지 ${ci + 1}`;
        if (!choice.text.trim()) at('선택지 문구가 비어 있습니다', 'warning', node.id, where);
        if (choice.branches.length === 0 || choice.branches.every((b) => b.outcomes.length === 0)) {
          at('결과가 없는 선택지입니다 (고르면 바로 인카운터가 끝남)', 'warning', node.id, where);
        }
        const elseIndex = choice.branches.findIndex((b) => isEmptyCondition(b.condition));
        if (elseIndex !== -1 && elseIndex < choice.branches.length - 1) {
          at(`분기 ${elseIndex + 1}에 조건이 없어서 그 아래 분기는 절대 선택되지 않습니다`, 'warning', node.id, where);
        }
        if (choice.branches.length > 0 && elseIndex === -1) {
          at('모든 분기에 조건이 있습니다. 어느 것도 해당하지 않으면 아무 결과 없이 끝납니다 (조건 없는 마지막 분기 권장)', 'warning', node.id, where);
        }
        choice.branches.forEach((b, bi) => {
          if (b.outcomes.length > 0 && b.outcomes.every((o) => o.weight <= 0)) {
            at(`분기 ${bi + 1}의 모든 결과 확률이 0입니다`, 'warning', node.id, where);
          }
        });
      });
    }

    walkEncounter(enc, {
      outcome(o, loc) {
        if (o.next && !nodeIds.has(o.next)) at(`다음 페이지 '${o.next}'가 없습니다`, 'error', loc.nodeId, loc.where);
      },
      condition(c, loc) {
        const r = refsOfCondition(c);
        if (!r) return;
        if (!r.id) at(`조건의 ${KIND_LABELS[r.kind]}가 선택되지 않았습니다`, 'error', loc.nodeId, loc.where);
        else if (!known[r.kind].has(r.id)) at(`조건이 없는 ${KIND_LABELS[r.kind]} '${r.id}'를 참조합니다`, 'error', loc.nodeId, loc.where);
      },
      effect(e, loc) {
        const r = refsOfEffect(e);
        if (!r) return;
        if (!r.id) at(`효과의 ${KIND_LABELS[r.kind]}가 선택되지 않았습니다`, 'error', loc.nodeId, loc.where);
        else if (!known[r.kind].has(r.id)) at(`효과가 없는 ${KIND_LABELS[r.kind]} '${r.id}'를 참조합니다`, 'error', loc.nodeId, loc.where);
      },
    });
  }

  const hasEntry = content.encounters.some((e) => e.spawn.mode !== 'triggered');
  if (content.encounters.length > 0 && !hasEntry) {
    issues.push({ severity: 'error', message: '랜덤/고정 인카운터가 하나도 없어 게임을 시작할 수 없습니다' });
  }

  return issues;
}
