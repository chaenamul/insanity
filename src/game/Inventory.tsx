import type { GameContent, RunState } from '../engine/types';

export type SheetKind = 'items' | 'traits';

/** 제작자가 보이게 한 것만 (숨긴 것은 버튼 자체가 없다) */
export function visibleShelves(content: GameContent): SheetKind[] {
  return (['items', 'traits'] as const).filter((k) => content.ui[k].show);
}

/** 하단 버튼. 마지막으로 열어 본 뒤 내용이 바뀌었으면 점 표시. 보일 것이 없으면 그리지 않는다 */
export function Dock({
  content,
  state,
  seen,
  onOpen,
}: {
  content: GameContent;
  state: RunState;
  seen: Record<SheetKind, string>;
  onOpen: (kind: SheetKind) => void;
}) {
  const shelves = visibleShelves(content);
  if (shelves.length === 0) return null;
  const counts: Record<SheetKind, number> = {
    items: Object.values(state.items).reduce((sum, n) => sum + (n > 0 ? 1 : 0), 0),
    traits: state.traits.length,
  };
  const sig = signatures(state);
  return (
    <nav className="dock" style={{ gridTemplateColumns: `repeat(${shelves.length}, 1fr)` }}>
      {shelves.map((kind) => (
        <button key={kind} type="button" onClick={() => onOpen(kind)}>
          {content.ui[kind].label} <span className="dock-count">{counts[kind]}</span>
          {sig[kind] !== seen[kind] && <span className="dock-dot" aria-label="새 소식" />}
        </button>
      ))}
    </nav>
  );
}

export function signatures(state: RunState): Record<SheetKind, string> {
  return {
    items: Object.entries(state.items)
      .filter(([, n]) => n > 0)
      .sort()
      .map(([id, n]) => `${id}:${n}`)
      .join(','),
    traits: [...state.traits].sort().join(','),
  };
}

export function ItemList({ content, state }: { content: GameContent; state: RunState }) {
  const items = Object.entries(state.items).filter(([, n]) => n > 0);
  if (items.length === 0) return <p className="sheet-empty">{content.ui.items.empty}</p>;
  return (
    <ul className="entry-list">
      {items.map(([id, count]) => {
        const def = content.items.find((i) => i.id === id);
        return (
          <li key={id}>
            <div className="entry-name">
              {def?.name ?? id}
              {count > 1 && <span className="entry-count">×{count}</span>}
            </div>
            {def?.description && <p className="entry-desc">{def.description}</p>}
          </li>
        );
      })}
    </ul>
  );
}

export function TraitList({ content, state }: { content: GameContent; state: RunState }) {
  if (state.traits.length === 0) return <p className="sheet-empty">{content.ui.traits.empty}</p>;
  return (
    <ul className="entry-list traits">
      {state.traits.map((id) => {
        const def = content.traits.find((t) => t.id === id);
        return (
          <li key={id}>
            <div className="entry-name">{def?.name ?? id}</div>
            {def?.description && <p className="entry-desc">{def.description}</p>}
          </li>
        );
      })}
    </ul>
  );
}
