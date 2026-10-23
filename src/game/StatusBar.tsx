import type { GameContent, RunState } from '../engine/types';

export function StatusBar({ state, baseSanity }: { state: RunState; baseSanity: number }) {
  const scale = Math.max(baseSanity, state.maxSanity, 1);
  const pct = (v: number) => `${(Math.max(0, v) / scale) * 100}%`;
  return (
    <div className="status">
      <div className="stat hp" title="체력">
        <span className="stat-label">체력</span>
        <span className="hp-cells">
          {Array.from({ length: state.maxHp }, (_, i) => (
            <span key={i} className={`hp-cell ${i < state.hp ? 'full' : ''}`} />
          ))}
        </span>
      </div>
      <div className="stat sanity" title="정신력 (현재 / 최대). 어두운 빗금은 영영 잃어버린 정신력">
        <span className="stat-label">정신력</span>
        <span className="sanity-bar">
          <span className="sanity-lost" style={{ left: pct(state.maxSanity), width: `calc(100% - ${pct(state.maxSanity)})` }} />
          <span className="sanity-fill" style={{ width: pct(state.sanity) }} />
        </span>
        <span className="sanity-text">
          <b>{state.sanity}</b> / {state.maxSanity}
        </span>
      </div>
      <div className="stat turn" title="몇 번째 인카운터인지">
        <span className="stat-label">기록</span>
        <span>{state.current ? state.turn + 1 : state.turn}</span>
      </div>
    </div>
  );
}

export function Inventory({ content, state }: { content: GameContent; state: RunState }) {
  const items = Object.entries(state.items).filter(([, n]) => n > 0);
  return (
    <div className="inventory">
      <h3>소지품</h3>
      {items.length === 0 ? (
        <p className="empty">없음</p>
      ) : (
        <ul>
          {items.map(([id, count]) => {
            const def = content.items.find((i) => i.id === id);
            return (
              <li key={id} title={def?.description}>
                {def?.name ?? id}
                {count > 1 && <span className="count">×{count}</span>}
              </li>
            );
          })}
        </ul>
      )}
      <h3>능력</h3>
      {state.traits.length === 0 ? (
        <p className="empty">없음</p>
      ) : (
        <ul>
          {state.traits.map((id) => {
            const def = content.traits.find((t) => t.id === id);
            return (
              <li key={id} className="trait" title={def?.description}>
                {def?.name ?? id}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
