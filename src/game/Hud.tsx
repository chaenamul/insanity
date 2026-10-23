import type { RunState } from '../engine/types';

/** 상단 한 줄: 메뉴 버튼 · 체력 · 정신력 */
export function Hud({ state, baseSanity, onMenu, badge }: { state: RunState; baseSanity: number; onMenu: () => void; badge?: string }) {
  const scale = Math.max(baseSanity, state.maxSanity, 1);
  const pct = (v: number) => `${(Math.max(0, v) / scale) * 100}%`;
  return (
    <header className="hud">
      <button type="button" className="hud-menu" aria-label="메뉴" onClick={onMenu}>
        <span />
        <span />
        <span />
      </button>
      <div className="hud-hp" role="img" aria-label={`체력 ${state.hp} / ${state.maxHp}`} title={`체력 ${state.hp} / ${state.maxHp}`}>
        {Array.from({ length: state.maxHp }, (_, i) => (
          <span key={i} className={`hp-cell ${i < state.hp ? 'full' : ''}`} />
        ))}
      </div>
      <div className="hud-sanity" title="정신력 (현재 / 최대). 빗금은 영영 잃어버린 정신력">
        <span className="hud-label">정신력</span>
        <span className="sanity-bar">
          <span className="sanity-lost" style={{ left: pct(state.maxSanity), width: `calc(100% - ${pct(state.maxSanity)})` }} />
          <span className="sanity-fill" style={{ width: pct(state.sanity) }} />
        </span>
        <span className="sanity-text">
          <b>{state.sanity}</b>/{state.maxSanity}
        </span>
      </div>
      {badge && <span className="hud-badge">{badge}</span>}
    </header>
  );
}
