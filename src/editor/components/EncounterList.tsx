import { useMemo, useState } from 'react';
import { createEncounter, makeUniqueId } from '../../engine/content';
import { SPAWN_MODE_LABELS } from '../../engine/describe';
import type { SpawnMode } from '../../engine/types';
import { useEditor } from '../state';
import { move } from './ui';

export function EncounterList() {
  const { content, update, issues, nav, navigate } = useEditor();
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<SpawnMode | 'all'>('all');

  const issueCount = useMemo(() => {
    const map = new Map<string, { errors: number; warnings: number }>();
    for (const i of issues) {
      if (!i.encounterId) continue;
      const c = map.get(i.encounterId) ?? { errors: 0, warnings: 0 };
      if (i.severity === 'error') c.errors++;
      else c.warnings++;
      map.set(i.encounterId, c);
    }
    return map;
  }, [issues]);

  const q = query.trim().toLowerCase();
  const filtered = content.encounters.filter((e) => {
    if (mode !== 'all' && e.spawn.mode !== mode) return false;
    if (!q) return true;
    if (e.id.toLowerCase().includes(q) || e.title.toLowerCase().includes(q)) return true;
    // 본문/선택지 텍스트 검색
    return e.nodes.some((n) => n.text.toLowerCase().includes(q) || n.choices.some((c) => c.text.toLowerCase().includes(q)));
  });

  const add = () => {
    const id = makeUniqueId('', content.encounters.map((e) => e.id), 'encounter');
    update((d) => {
      const index = d.encounters.findIndex((e) => e.id === nav.encounterId);
      const enc = createEncounter(id, '새 인카운터');
      if (index === -1) d.encounters.push(enc);
      else d.encounters.splice(index + 1, 0, enc);
    });
    navigate({ tab: 'encounters', encounterId: id });
    requestAnimationFrame(() => (document.querySelector('.enc-title') as HTMLInputElement | null)?.select());
  };

  const reorder = (delta: number) => {
    if (!nav.encounterId) return;
    update((d) => move(d.encounters, d.encounters.findIndex((e) => e.id === nav.encounterId), delta));
  };

  return (
    <nav className="enc-list">
      <div className="enc-list-tools">
        <input className="search" value={query} placeholder="검색 (제목/id/본문)" onChange={(e) => setQuery(e.target.value)} />
        <select value={mode} onChange={(e) => setMode(e.target.value as SpawnMode | 'all')}>
          <option value="all">전체</option>
          <option value="random">랜덤</option>
          <option value="triggered">후속 전용</option>
          <option value="fixed">고정 순번</option>
        </select>
      </div>
      <div className="enc-list-actions">
        <button type="button" className="btn primary" onClick={add}>
          + 새 인카운터
        </button>
        <button type="button" className="icon-btn" title="선택한 인카운터를 위로 (목록 순서만 바뀜)" onClick={() => reorder(-1)}>
          ↑
        </button>
        <button type="button" className="icon-btn" title="선택한 인카운터를 아래로" onClick={() => reorder(1)}>
          ↓
        </button>
      </div>
      <ul>
        {filtered.map((e) => {
          const c = issueCount.get(e.id);
          return (
            <li key={e.id}>
              <button
                type="button"
                className={`enc-item ${nav.encounterId === e.id ? 'active' : ''}`}
                onClick={() => navigate({ tab: 'encounters', encounterId: e.id, nodeId: null })}
              >
                <span className="enc-item-title">{e.title || <span className="muted">(제목 없음)</span>}</span>
                <span className="enc-item-meta">
                  <span className={`mode-badge mode-${e.spawn.mode}`}>
                    {e.spawn.mode === 'fixed' ? `${e.spawn.fixedTurn}번째` : SPAWN_MODE_LABELS[e.spawn.mode]}
                  </span>
                  <span className="enc-item-id">{e.id}</span>
                  {c?.errors ? <span className="count-badge error">{c.errors}</span> : null}
                  {!c?.errors && c?.warnings ? <span className="count-badge warning">{c.warnings}</span> : null}
                </span>
              </button>
            </li>
          );
        })}
        {filtered.length === 0 && <li className="muted empty">결과 없음</li>}
      </ul>
      <div className="enc-list-foot muted">
        {content.encounters.length}개 · 랜덤 {content.encounters.filter((e) => e.spawn.mode === 'random').length} · 후속{' '}
        {content.encounters.filter((e) => e.spawn.mode === 'triggered').length} · 고정 {content.encounters.filter((e) => e.spawn.mode === 'fixed').length}
      </div>
    </nav>
  );
}
