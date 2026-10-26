import { useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { addDays, normalizeDate } from '../engine/dates';
import { encounterTitle, SPAWN_MODE_LABELS } from '../engine/describe';
import { debugPatch, debugStartEncounter } from '../engine/run';
import { checkAvailability, stateAfterCurrent } from '../engine/scheduler';
import type { GameContent, RunState, SelectionSource, StatParam } from '../engine/types';

// 테스트 플레이용 패널: 상태를 직접 바꾸고, 각 인카운터가 왜 나오는지/안 나오는지 확인한다.

const SOURCE_LABELS: Record<SelectionSource, string> = {
  queue: '예약',
  fixed: '고정 순번',
  forced: '강제 (최대 간격)',
  random: '랜덤',
  debug: '디버그 시작',
};

interface Props {
  content: GameContent;
  state: RunState;
  setState: Dispatch<SetStateAction<RunState | null>>;
  onNewRun: (seed?: number, startEncounterId?: string) => void;
  onClose: () => void;
}

export function DebugPanel({ content, state, setState, onNewRun, onClose }: Props) {
  const [tab, setTab] = useState<'state' | 'spawn'>('spawn');
  const [addItem, setAddItem] = useState('');
  const patch = (fn: (draft: RunState) => void) => setState((s) => (s ? debugPatch(content, s, fn) : s));
  const nextState = useMemo(() => stateAfterCurrent(state), [state]);
  const stats = content.params.filter((p): p is StatParam => p.kind === 'stat');
  /** 큰 수치는 10씩 */
  const step = (p: StatParam) => ((p.max ?? p.value) >= 30 ? 10 : 1);
  const statRow = (p: StatParam, field: 'value' | 'max') => {
    const s = state.stats[p.id] ?? { value: p.value, max: p.max };
    const v = field === 'max' ? s.max : s.value;
    if (v == null) return null;
    const set = (n: number) =>
      patch((d) => {
        const cur = (d.stats[p.id] ??= { value: p.value, max: p.max });
        if (field === 'max') cur.max = n;
        else cur.value = n;
      });
    return (
      <div key={`${p.id}:${field}`} className="debug-row">
        <span title={p.id}>{field === 'max' ? `최대 ${p.name}` : p.name}</span>
        <button onClick={() => set(v - step(p))}>−</button>
        <input type="number" value={v} onChange={(e) => set(Number(e.target.value) || 0)} />
        <button onClick={() => set(v + step(p))}>+</button>
      </div>
    );
  };

  return (
    <aside className="debug">
      <div className="debug-head">
        <div className="debug-tabs">
          <button className={tab === 'spawn' ? 'active' : ''} onClick={() => setTab('spawn')}>
            출현
          </button>
          <button className={tab === 'state' ? 'active' : ''} onClick={() => setTab('state')}>
            상태
          </button>
          <button className="debug-close" aria-label="디버그 패널 닫기" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="debug-meta">
          시드 {state.seed}
          {state.current && <> · {SOURCE_LABELS[state.current.source]}</>}
        </div>
        <div className="debug-actions">
          <button className="btn small" onClick={() => onNewRun(state.seed)}>
            같은 시드로 새 판
          </button>
          <button className="btn small" onClick={() => onNewRun()}>
            새 판
          </button>
        </div>
      </div>

      {tab === 'state' ? (
        <div className="debug-body">
          <h4>수치</h4>
          {stats.length === 0 && <p className="muted">수치 파라미터 없음</p>}
          {stats.flatMap((p) => [statRow(p, 'value'), statRow(p, 'max')])}

          {content.params.some((p) => p.kind !== 'stat') && <h4>상태 · 캘린더</h4>}
          {content.params.map((p) =>
            p.kind === 'text' ? (
              <div key={p.id} className="debug-row">
                <span title={p.id}>{p.name}</span>
                <input
                  className="wide"
                  value={state.texts[p.id] ?? ''}
                  onChange={(e) => patch((d) => void (d.texts[p.id] = e.target.value))}
                />
              </div>
            ) : p.kind === 'date' ? (
              <div key={p.id} className="debug-row">
                <span title={p.id}>{p.name}</span>
                <button onClick={() => patch((d) => void (d.dates[p.id] = addDays(d.dates[p.id] ?? p.value, -1)))}>−</button>
                <input
                  className="wide"
                  type="date"
                  value={state.dates[p.id] ?? p.value}
                  onChange={(e) => patch((d) => void (d.dates[p.id] = normalizeDate(e.target.value, d.dates[p.id] ?? p.value)))}
                />
                <button onClick={() => patch((d) => void (d.dates[p.id] = addDays(d.dates[p.id] ?? p.value, 1)))}>+</button>
              </div>
            ) : null,
          )}
          {content.theme.variable && (
            <p className="muted">
              색: 배경 {state.colors.background ?? '기본'} · 글자 {state.colors.text ?? '기본'}{' '}
              <button onClick={() => patch((d) => void (d.colors = { background: null, text: null }))}>기본으로</button>
            </p>
          )}

          <h4>아이템</h4>
          {Object.entries(state.items).map(([id, count]) => (
            <div key={id} className="debug-row">
              <span>{content.items.find((i) => i.id === id)?.name ?? id}</span>
              <button onClick={() => patch((d) => void (d.items[id] > 1 ? d.items[id]-- : delete d.items[id]))}>−</button>
              <span className="num">{count}</span>
              <button onClick={() => patch((d) => void d.items[id]++)}>+</button>
            </div>
          ))}
          <div className="debug-row">
            <select value={addItem} onChange={(e) => setAddItem(e.target.value)}>
              <option value="">아이템 추가…</option>
              {content.items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
            <button disabled={!addItem} onClick={() => patch((d) => void (d.items[addItem] = (d.items[addItem] ?? 0) + 1))}>
              추가
            </button>
          </div>

          <h4>능력</h4>
          {content.traits.map((t) => (
            <label key={t.id} className="debug-check">
              <input
                type="checkbox"
                checked={state.traits.includes(t.id)}
                onChange={(e) =>
                  patch((d) => {
                    d.traits = e.target.checked ? [...d.traits, t.id] : d.traits.filter((x) => x !== t.id);
                  })
                }
              />
              {t.name}
            </label>
          ))}

          <h4>플래그</h4>
          {content.flags.length === 0 && <p className="muted">정의된 플래그 없음</p>}
          {content.flags.map((f) => (
            <div key={f.id} className="debug-row">
              <span title={f.id}>{f.name || f.id}</span>
              <input
                type="number"
                value={state.flags[f.id] ?? 0}
                onChange={(e) => patch((d) => void (d.flags[f.id] = Number(e.target.value) || 0))}
              />
            </div>
          ))}

          <h4>예약</h4>
          {state.queue.length === 0 ? (
            <p className="muted">없음</p>
          ) : (
            <ul className="debug-list">
              {state.queue.map((q) => (
                <li key={q.encounterId}>
                  {encounterTitle(content, q.encounterId)} — {q.dueTurn + 1}번째부터
                </li>
              ))}
            </ul>
          )}

          <h4>지나온 인카운터</h4>
          <ol className="debug-list">
            {state.history.map((h, i) => (
              <li key={i}>{encounterTitle(content, h.encounterId)}</li>
            ))}
          </ol>
        </div>
      ) : (
        <div className="debug-body">
          <p className="muted">
            지금 인카운터를 마친 뒤 <b>{nextState.turn + 1}번째</b> 인카운터를 고를 때의 출현 여부입니다. ▶를 누르면 해당 인카운터를 바로
            시작합니다.
          </p>
          <ul className="spawn-list">
            {content.encounters.map((enc) => {
              const a = checkAvailability(content, nextState, enc);
              const current = state.current?.encounterId === enc.id;
              const queued = nextState.queue.some((q) => q.encounterId === enc.id);
              const status = current ? 'current' : queued ? 'queued' : a.status === 'available' ? (a.forced ? 'forced' : 'ok') : 'blocked';
              return (
                <li key={enc.id} className={`spawn-${status}`}>
                  <button title="이 인카운터 바로 시작" onClick={() => setState((s) => (s ? debugStartEncounter(content, s, enc.id) : s))}>
                    ▶
                  </button>
                  <div>
                    <div className="spawn-title">
                      {enc.title || enc.id} <span className="muted">{SPAWN_MODE_LABELS[enc.spawn.mode]}</span>
                    </div>
                    <div className="spawn-reason">
                      {current
                        ? '진행 중'
                        : queued
                          ? '예약됨'
                          : a.status === 'available'
                            ? a.forced
                              ? '강제 등장 대기'
                              : '출현 가능'
                            : a.reasons.join(' · ')}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </aside>
  );
}
