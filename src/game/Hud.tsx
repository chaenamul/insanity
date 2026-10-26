import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { paramValueText } from '../engine/describe';
import type { GameContent, ParamDef, RunState, StatParam } from '../engine/types';
import './hud.css';

// 상단: ☰ 메뉴 · 파라미터 요약(상단 고정 파라미터 또는 제작자가 쓴 문구).
// 고정 파라미터는 두 줄까지 줄바꿈하고, 그래도 넘치는 것은 숨긴 뒤 "+N"으로 알려준다 (겹치거나 잘려 보이지 않게).
// 펼칠 것이 있으면 요약을 눌러 모든 파라미터를 아래로 펼쳐 볼 수 있다. 에디터의 모바일 미리보기에서도 쓴다.

/** 칸으로 그리기에는 너무 많으면 숫자로 */
const MAX_CELLS = 12;

function StatView({ p, state, wide }: { p: StatParam; state: RunState; wide: boolean }) {
  const s = state.stats[p.id] ?? { value: p.value, max: p.max };
  const text = paramValueText(p, state);
  const display = s.max == null || (p.display === 'cells' && s.max > MAX_CELLS) ? 'number' : p.display;

  if (display === 'cells') {
    return (
      <span className="hud-param kind-cells" role="img" aria-label={`${p.name} ${text}`} title={`${p.name} ${text}`}>
        {wide && <span className="hud-label">{p.name}</span>}
        <span className="hud-cells">
          {Array.from({ length: s.max! }, (_, i) => (
            <span key={i} className={`hud-cell ${i < s.value ? 'full' : ''}`} />
          ))}
        </span>
      </span>
    );
  }
  if (display === 'bar') {
    // 최대값이 시작보다 줄면 줄어든 만큼을 빗금으로 (영영 잃어버린 몫)
    const scale = Math.max(p.max ?? 0, s.max!, 1);
    const pct = (v: number) => `${(Math.max(0, v) / scale) * 100}%`;
    return (
      <span className="hud-param kind-bar" title={`${p.name} (현재 / 최대). 빗금은 영영 잃어버린 몫`}>
        <span className="hud-label">{p.name}</span>
        <span className="hud-bar">
          <span className="hud-bar-lost" style={{ left: pct(s.max!), width: `calc(100% - ${pct(s.max!)})` }} />
          <span className="hud-bar-fill" style={{ width: pct(s.value) }} />
        </span>
        <span className="hud-num">
          <b>{s.value}</b>/{s.max}
          {p.unit}
        </span>
      </span>
    );
  }
  return (
    <span className="hud-param kind-number">
      <span className="hud-label">{p.name}</span>
      <span className="hud-num">
        <b>{s.value}</b>
        {s.max != null && `/${s.max}`}
        {p.unit}
      </span>
    </span>
  );
}

function ParamView({ p, state, wide = false }: { p: ParamDef; state: RunState; wide?: boolean }) {
  if (p.kind === 'stat') return <StatView p={p} state={state} wide={wide} />;
  return (
    <span className={`hud-param kind-${p.kind}`}>
      <span className="hud-label">{p.name}</span>
      <span className="hud-value">{paramValueText(p, state) || '—'}</span>
    </span>
  );
}

/** 두 줄 안에 다 들어가지 않는 파라미터를 숨기고 그 개수를 돌려준다. mountKey가 바뀌면(상자가 새로 생기면) 다시 지켜본다 */
function useOverflowCount(mountKey: string) {
  const ref = useRef<HTMLDivElement>(null);
  const [hidden, setHidden] = useState(0);
  const measure = useCallback(() => {
    const box = ref.current;
    let count = 0;
    for (const el of (box?.children ?? []) as HTMLCollectionOf<HTMLElement>) {
      el.classList.remove('overflow');
      // 두 줄 아래로 넘어갔거나, 혼자서도 한 줄보다 넓은 것
      if (el.offsetTop + el.offsetHeight > box!.clientHeight + 1 || el.offsetLeft + el.offsetWidth > box!.clientWidth + 1) {
        el.classList.add('overflow');
        count++;
      }
    }
    setHidden(count);
  }, []);
  // 값이 바뀌면 폭도 바뀌므로 그릴 때마다 잰다
  useLayoutEffect(measure);
  useEffect(() => {
    const box = ref.current;
    if (!box) return;
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    return () => ro.disconnect();
  }, [measure, mountKey]);
  return [ref, hidden] as const;
}

interface Props {
  content: GameContent;
  state: RunState;
  onMenu: () => void;
  badge?: string;
}

export function Hud({ content, state, onMenu, badge }: Props) {
  const [open, setOpen] = useState(false);
  const visible = content.params.filter((p) => p.show !== 'hidden');
  const pinned = visible.filter((p) => p.show === 'pinned');
  const { summary, text } = content.ui.hud;
  const [itemsRef, overflowed] = useOverflowCount(summary);
  const expandable = summary === 'text' ? visible.length > 0 : visible.length > pinned.length || overflowed > 0;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  useEffect(() => {
    if (!expandable) setOpen(false);
  }, [expandable]);

  const toggle = () => expandable && setOpen((v) => !v);

  return (
    <div className={`hud-wrap ${open ? 'open' : ''}`}>
      {open && <div className="hud-backdrop" onClick={() => setOpen(false)} />}
      <header className="hud">
        <button type="button" className="hud-menu" aria-label="메뉴" onClick={onMenu}>
          <span />
          <span />
          <span />
        </button>
        <div
          className={`hud-summary ${expandable ? 'expandable' : ''}`}
          role={expandable ? 'button' : undefined}
          tabIndex={expandable ? 0 : undefined}
          aria-expanded={expandable ? open : undefined}
          aria-label={expandable ? (open ? '상태 접기' : '상태 모두 보기') : undefined}
          onClick={toggle}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              e.stopPropagation();
              toggle();
            }
          }}
        >
          {summary === 'text' ? (
            <span className="hud-text">{text || '상태'}</span>
          ) : (
            <div className="hud-items" ref={itemsRef}>
              {pinned.map((p) => (
                <ParamView key={p.id} p={p} state={state} />
              ))}
            </div>
          )}
          {summary === 'pinned' && overflowed > 0 && (
            <span className="hud-more" title={`${overflowed}개 더 있음`}>
              +{overflowed}
            </span>
          )}
          {expandable && <span className={`hud-chevron ${open ? 'up' : ''}`} aria-hidden />}
        </div>
        {badge && <span className="hud-badge">{badge}</span>}
      </header>
      {open && (
        <div className="hud-panel">
          {visible.map((p) => (
            <div key={p.id} className="hud-row">
              <ParamView p={p} state={state} wide />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
