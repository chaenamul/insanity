import { useState } from 'react';
import { encounterTitle, endingTitle, SPAWN_MODE_LABELS } from '../../engine/describe';
import { simulate, type SimulationReport } from '../../engine/simulate';
import { useEditor } from '../state';
import { NumberInput } from './ui';

// 무작위 선택으로 여러 판을 돌려 출현 빈도와 엔딩 분포를 확인한다.

export function SimulationPanel() {
  const { content, navigate } = useEditor();
  const [runs, setRuns] = useState(1000);
  const [report, setReport] = useState<SimulationReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<'order' | 'rate' | 'turn'>('order');

  const run = () => {
    try {
      setError(null);
      setReport(simulate(content, { runs, seed: Date.now() % 100000 }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const rows = report
    ? [...report.encounters].sort((a, b) =>
        sort === 'rate' ? a.runsSeen - b.runsSeen : sort === 'turn' ? a.avgFirstTurn - b.avgFirstTurn : 0,
      )
    : [];

  return (
    <div className="panel">
      <section className="card">
        <h3 className="card-title">
          시뮬레이션 <span className="help">선택지를 무작위로 고르는 가상 플레이를 여러 번 돌립니다. 출현 순서 설계를 확인할 때 사용하세요.</span>
        </h3>
        <div className="row">
          <NumberInput value={runs} min={1} width={80} onChange={(v) => setRuns(Math.min(20000, v ?? 1))} />
          <span className="unit">판</span>
          <button type="button" className="btn primary" onClick={run}>
            실행
          </button>
        </div>
        {error && <p className="warn-text">{error}</p>}
      </section>

      {report && (
        <>
          <section className="card">
            <h3 className="card-title">요약</h3>
            <p>
              평균 {report.avgTurns.toFixed(1)}개 인카운터 진행 (최대 {report.maxTurns}개)
              {report.truncated > 0 && <span className="warn-text"> · {report.truncated}판이 끝나지 않음 (무한 반복 의심)</span>}
            </p>
            <div className="bars">
              {Object.entries(report.endings)
                .sort((a, b) => b[1] - a[1])
                .map(([id, n]) => (
                  <div key={id} className="bar-row">
                    <span className="bar-label">{endingTitle(content, id)}</span>
                    <span className="bar">
                      <span style={{ width: `${(n / report.runs) * 100}%` }} />
                    </span>
                    <span className="bar-value">{((n / report.runs) * 100).toFixed(1)}%</span>
                  </div>
                ))}
            </div>
          </section>

          <section className="card">
            <h3 className="card-title">
              인카운터별 출현
              <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
                <option value="order">목록 순</option>
                <option value="rate">출현률 낮은 순</option>
                <option value="turn">처음 나오는 순번 순</option>
              </select>
            </h3>
            <table className="sim-table">
              <thead>
                <tr>
                  <th>인카운터</th>
                  <th>방식</th>
                  <th>출현한 판</th>
                  <th>판당 횟수</th>
                  <th>처음 나온 순번 (평균 / 범위)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const enc = content.encounters.find((e) => e.id === r.id);
                  const rate = r.runsSeen / report.runs;
                  return (
                    <tr key={r.id} className={rate === 0 ? 'never' : ''}>
                      <td>
                        <button type="button" className="link-btn" onClick={() => navigate({ tab: 'encounters', encounterId: r.id, nodeId: null })}>
                          {encounterTitle(content, r.id)}
                        </button>
                      </td>
                      <td className="muted">{enc ? SPAWN_MODE_LABELS[enc.spawn.mode] : ''}</td>
                      <td>
                        <span className="bar small">
                          <span style={{ width: `${rate * 100}%` }} />
                        </span>
                        {(rate * 100).toFixed(1)}%
                      </td>
                      <td>{(r.total / report.runs).toFixed(2)}</td>
                      <td>{r.runsSeen ? `${r.avgFirstTurn.toFixed(1)} (${r.minFirstTurn}~${r.maxFirstTurn})` : '한 번도 안 나옴'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  );
}
