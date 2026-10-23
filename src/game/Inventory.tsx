import type { GameContent, RunState } from '../engine/types';

export type SheetKind = 'items' | 'traits';

/** 하단 버튼. 마지막으로 열어 본 뒤 내용이 바뀌었으면 점 표시 */
export function Dock({ state, seen, onOpen }: { state: RunState; seen: Record<SheetKind, string>; onOpen: (kind: SheetKind) => void }) {
  const itemCount = Object.values(state.items).reduce((sum, n) => sum + (n > 0 ? 1 : 0), 0);
  const sig = signatures(state);
  return (
    <nav className="dock">
      <button type="button" onClick={() => onOpen('items')}>
        소지품 <span className="dock-count">{itemCount}</span>
        {sig.items !== seen.items && <span className="dock-dot" aria-label="새 소식" />}
      </button>
      <button type="button" onClick={() => onOpen('traits')}>
        능력 <span className="dock-count">{state.traits.length}</span>
        {sig.traits !== seen.traits && <span className="dock-dot" aria-label="새 소식" />}
      </button>
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
  if (items.length === 0) return <p className="sheet-empty">아무것도 가지고 있지 않다.</p>;
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
  if (state.traits.length === 0) return <p className="sheet-empty">아직 아무것도 깨닫지 못했다.</p>;
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
