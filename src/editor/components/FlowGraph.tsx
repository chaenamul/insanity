import { useMemo, useState } from 'react';
import { SPAWN_MODE_LABELS } from '../../engine/describe';
import type { Encounter } from '../../engine/types';
import { buildRelations, type Relation, type RelationKind } from '../relations';
import { useEditor } from '../state';

// 인카운터 선후관계 흐름도. 왼쪽 → 오른쪽으로 이어지는 순서.
// 연결이 없는 인카운터는 아래쪽에 출현 방식별로 모아 보여준다.

const NODE_W = 184;
const NODE_H = 52;
const COL_GAP = 96;
const ROW_GAP = 22;
const PAD = 24;

const KIND_INFO: Record<RelationKind, { label: string; help: string }> = {
  after: { label: '선행', help: '출현 설정의 선행 인카운터' },
  queue: { label: '예약', help: '결과 효과의 인카운터 예약' },
  seen: { label: '조건', help: '출현 조건의 "인카운터 겪음"' },
  state: { label: '상태', help: 'A가 바꾸는 아이템/능력/플래그를 B의 출현 조건이 검사' },
};

interface Placed {
  enc: Encounter;
  x: number;
  y: number;
}

function layout(encounters: Encounter[], relations: Relation[]) {
  const ids = new Set(encounters.map((e) => e.id));
  const edges = relations.filter((r) => ids.has(r.from) && ids.has(r.to) && r.from !== r.to);
  const connected = new Set(edges.flatMap((e) => [e.from, e.to]));
  const graphNodes = encounters.filter((e) => connected.has(e.id));

  // 순환을 끊기 위해 DFS로 역방향 간선을 찾는다
  const out = new Map<string, string[]>();
  for (const e of edges) out.set(e.from, [...(out.get(e.from) ?? []), e.to]);
  const state = new Map<string, number>();
  const back = new Set<string>();
  const dfs = (id: string) => {
    state.set(id, 1);
    for (const to of out.get(id) ?? []) {
      if (state.get(to) === 1) back.add(`${id}>${to}`);
      else if (!state.has(to)) dfs(to);
    }
    state.set(id, 2);
  };
  for (const n of graphNodes) if (!state.has(n.id)) dfs(n.id);

  // 가장 긴 경로 기준으로 열(layer) 배치
  const forward = edges.filter((e) => !back.has(`${e.from}>${e.to}`));
  const layer = new Map(graphNodes.map((n) => [n.id, 0]));
  for (let pass = 0; pass < graphNodes.length; pass++) {
    let changed = false;
    for (const e of forward) {
      const next = (layer.get(e.from) ?? 0) + 1;
      if (next > (layer.get(e.to) ?? 0)) {
        layer.set(e.to, next);
        changed = true;
      }
    }
    if (!changed) break;
  }

  // 열 안의 순서: 앞 열 이웃의 평균 위치(barycenter)로 정렬
  const columns: string[][] = [];
  for (const n of graphNodes) {
    const l = layer.get(n.id) ?? 0;
    (columns[l] ??= []).push(n.id);
  }
  const rowOf = new Map<string, number>();
  columns.forEach((col, ci) => {
    if (ci > 0) {
      const score = (id: string) => {
        const preds = forward.filter((e) => e.to === id).map((e) => rowOf.get(e.from)).filter((r): r is number => r != null);
        return preds.length ? preds.reduce((a, b) => a + b, 0) / preds.length : Number.MAX_SAFE_INTEGER;
      };
      col.sort((a, b) => score(a) - score(b));
    }
    col.forEach((id, ri) => rowOf.set(id, ri));
  });

  const byId = new Map(encounters.map((e) => [e.id, e]));
  const placed = new Map<string, Placed>();
  columns.forEach((col, ci) =>
    col.forEach((id, ri) => placed.set(id, { enc: byId.get(id)!, x: PAD + ci * (NODE_W + COL_GAP), y: PAD + 28 + ri * (NODE_H + ROW_GAP) })),
  );
  const graphHeight = Math.max(0, ...columns.map((c) => c.length)) * (NODE_H + ROW_GAP) + 28;
  const graphWidth = columns.length * (NODE_W + COL_GAP);

  // 연결 없는 인카운터
  const isolated = encounters.filter((e) => !connected.has(e.id));
  const groups: { title: string; list: Encounter[] }[] = [
    { title: '고정 순번', list: isolated.filter((e) => e.spawn.mode === 'fixed').sort((a, b) => a.spawn.fixedTurn - b.spawn.fixedTurn) },
    { title: '독립 랜덤 (선후관계 없음)', list: isolated.filter((e) => e.spawn.mode === 'random') },
    { title: '후속 전용 (연결 없음 — 등장 불가)', list: isolated.filter((e) => e.spawn.mode === 'triggered') },
  ].filter((g) => g.list.length > 0);
  const perRow = 5;
  let y = PAD + (graphNodes.length ? graphHeight + 40 : 0);
  const groupLabels: { title: string; y: number }[] = [];
  for (const g of groups) {
    groupLabels.push({ title: g.title, y });
    g.list.forEach((enc, i) => {
      placed.set(enc.id, { enc, x: PAD + (i % perRow) * (NODE_W + 24), y: y + 24 + Math.floor(i / perRow) * (NODE_H + 16) });
    });
    y += 24 + Math.ceil(g.list.length / perRow) * (NODE_H + 16) + 24;
  }

  return {
    placed,
    edges,
    back,
    groupLabels,
    width: Math.max(graphWidth, perRow * (NODE_W + 24)) + PAD * 2,
    height: y + PAD,
  };
}

export function FlowGraph() {
  const { content, issues, navigate } = useEditor();
  const [hidden, setHidden] = useState<Set<RelationKind>>(new Set());
  const [hover, setHover] = useState<string | null>(null);
  const relations = useMemo(() => buildRelations(content).filter((r) => !hidden.has(r.kind)), [content, hidden]);
  const g = useMemo(() => layout(content.encounters, relations), [content.encounters, relations]);
  const errorIds = new Set(issues.filter((i) => i.severity === 'error' && i.encounterId).map((i) => i.encounterId));

  const toggle = (k: RelationKind) =>
    setHidden((s) => {
      const next = new Set(s);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  return (
    <div className="flow">
      <div className="flow-legend">
        {(Object.keys(KIND_INFO) as RelationKind[]).map((k) => (
          <label key={k} className={`legend-item rel-${k}`} title={KIND_INFO[k].help}>
            <input type="checkbox" checked={!hidden.has(k)} onChange={() => toggle(k)} />
            <svg width="28" height="10">
              <line x1="0" y1="5" x2="28" y2="5" className={`edge edge-${k}`} />
            </svg>
            {KIND_INFO[k].label}
          </label>
        ))}
        <span className="muted">노드를 클릭하면 편집으로 이동 · 마우스를 올리면 연결 강조</span>
      </div>
      <div className="flow-canvas">
        <svg width={g.width} height={g.height}>
          <defs>
            {(Object.keys(KIND_INFO) as RelationKind[]).map((k) => (
              <marker key={k} id={`arrow-${k}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" className={`arrow arrow-${k}`} />
              </marker>
            ))}
          </defs>
          {g.groupLabels.map((l) => (
            <text key={l.title} x={PAD} y={l.y + 12} className="group-label">
              {l.title}
            </text>
          ))}
          {g.edges.map((e, i) => {
            const a = g.placed.get(e.from);
            const b = g.placed.get(e.to);
            if (!a || !b) return null;
            // 같은 두 인카운터 사이의 간선이 여러 개면 위아래로 벌려 그린다
            const siblings = g.edges.filter((x) => x.from === e.from && x.to === e.to);
            const spread = (siblings.indexOf(e) - (siblings.length - 1) / 2) * 14;
            const isBack = g.back.has(`${e.from}>${e.to}`) || b.x <= a.x;
            const x1 = a.x + NODE_W;
            const y1 = a.y + NODE_H / 2 + spread / 2;
            const x2 = isBack ? b.x + NODE_W / 2 + spread : b.x;
            const y2 = isBack ? b.y + NODE_H : b.y + NODE_H / 2 + spread / 2;
            const d = isBack
              ? `M${x1},${y1} C${x1 + 60},${y1 + 80 + spread} ${x2},${y2 + 80 + spread} ${x2},${y2}`
              : `M${x1},${y1} C${x1 + COL_GAP / 2},${y1 + spread} ${x2 - COL_GAP / 2},${y2 + spread} ${x2},${y2}`;
            const dim = hover && hover !== e.from && hover !== e.to;
            const lx = (x1 + x2) / 2;
            const ly = isBack ? (y1 + y2) / 2 + 60 + spread : (y1 + y2) / 2 + spread * 1.4 - 4;
            return (
              <g key={i} className={dim ? 'dim' : ''}>
                <path d={d} className={`edge edge-${e.kind}`} markerEnd={`url(#arrow-${e.kind})`}>
                  <title>{`${e.label}${e.where ? ` (${e.where})` : ''}`}</title>
                </path>
                <text x={lx} y={ly} className={`edge-label label-${e.kind}`} textAnchor="middle">
                  {e.label}
                </text>
              </g>
            );
          })}
          {[...g.placed.values()].map(({ enc, x, y }) => {
            const dim = hover && hover !== enc.id && !g.edges.some((e) => (e.from === hover && e.to === enc.id) || (e.to === hover && e.from === enc.id));
            return (
              <g
                key={enc.id}
                transform={`translate(${x},${y})`}
                className={`flow-node mode-${enc.spawn.mode} ${errorIds.has(enc.id) ? 'has-error' : ''} ${dim ? 'dim' : ''}`}
                onClick={() => navigate({ tab: 'encounters', encounterId: enc.id, nodeId: null })}
                onMouseEnter={() => setHover(enc.id)}
                onMouseLeave={() => setHover(null)}
              >
                <rect width={NODE_W} height={NODE_H} rx="4" />
                <text x="10" y="21" className="node-title">
                  {(enc.title || enc.id).length > 13 ? `${(enc.title || enc.id).slice(0, 12)}…` : enc.title || enc.id}
                </text>
                <text x="10" y="40" className="node-sub">
                  {enc.spawn.mode === 'fixed' ? `${enc.spawn.fixedTurn}번째 고정` : SPAWN_MODE_LABELS[enc.spawn.mode]}
                  {enc.spawn.mode === 'random' && enc.spawn.repeatable ? ' · 반복' : ''} · {enc.id.length > 14 ? `${enc.id.slice(0, 13)}…` : enc.id}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
