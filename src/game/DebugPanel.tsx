import { useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { encounterTitle, SPAWN_MODE_LABELS, STAT_LABELS } from '../engine/describe';
import { debugPatch, debugStartEncounter } from '../engine/run';
import { checkAvailability, stateAfterCurrent } from '../engine/scheduler';
import type { GameContent, RunState, SelectionSource, StatKey } from '../engine/types';

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
}

export function DebugPanel({ content, state, setState, onNewRun }: Props) {
  const [tab, setTab] = useState<'state' | 'spawn'>('spawn');
  const [addItem, setAddItem] = useState('');
  const patch = (fn: (draft: RunState) => void) => setState((s) => (s ? debugPatch(s, fn) : s));
  const nextState = useMemo(() => stateAfterCurrent(state), [state]);

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
          {(['hp', 'maxHp', 'sanity', 'maxSanity'] as StatKey[]).map((k) => (
            <div key={k} className="debug-row">
              <span>{STAT_LABELS[k]}</span>
              <button onClick={() => patch((d) => void (d[k] -= k.includes('anity') ? 10 : 1))}>−</button>
              <input
                type="number"
                value={state[k]}
                onChange={(e) => patch((d) => void (d[k] = Number(e.target.value) || 0))}
              />
              <button onClick={() => patch((d) => void (d[k] += k.includes('anity') ? 10 : 1))}>+</button>
            </div>
          ))}

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
