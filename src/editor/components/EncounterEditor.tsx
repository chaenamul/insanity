import { useEffect, useMemo, useState } from 'react';
import { createNode, ID_PATTERN, makeUniqueId } from '../../engine/content';
import { describeSpawn } from '../../engine/describe';
import type { Encounter } from '../../engine/types';
import { findReferences, renameReferences } from '../../engine/walk';
import { child, useEditor, useEncounterEdit } from '../state';
import { IdInput } from './IdInput';
import { NodeEditor } from './NodeEditor';
import { SpawnEditor } from './SpawnEditor';
import { TextArea } from './ui';

export function EncounterEditor({ enc }: { enc: Encounter }) {
  const { content, update, issues, nav, navigate, playtest } = useEditor();
  const edit = useEncounterEdit(enc.id);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const myIssues = issues.filter((i) => i.encounterId === enc.id);

  const jumpTo = (nodeId: string) => {
    setCollapsed((s) => {
      const next = new Set(s);
      next.delete(nodeId);
      return next;
    });
    requestAnimationFrame(() => document.getElementById(`node-${nodeId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  useEffect(() => {
    if (nav.nodeId) jumpTo(nav.nodeId);
    else document.querySelector('.editor-main')?.scrollTo({ top: 0 });
  }, [nav.encounterId, nav.nodeId, nav.nonce]);

  // 페이지별로 들어오는 선택지
  const incoming = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const n of enc.nodes) {
      n.choices.forEach((c, ci) => {
        for (const b of c.branches) {
          for (const o of b.outcomes) {
            if (!o.next) continue;
            const label = `${n.id}의 선택지 ${ci + 1}`;
            const list = map.get(o.next) ?? [];
            if (!list.includes(label)) list.push(label);
            map.set(o.next, list);
          }
        }
      });
    }
    return map;
  }, [enc]);

  const renameEncounter = (to: string): string | null => {
    if (!ID_PATTERN.test(to)) return '영문, 숫자, _, - 만 쓸 수 있습니다';
    if (content.encounters.some((e) => e.id === to)) return '이미 있는 id입니다';
    update((d) => {
      const e = d.encounters.find((x) => x.id === enc.id);
      if (!e) return;
      e.id = to;
      renameReferences(d, 'encounter', enc.id, to);
    });
    navigate({ encounterId: to });
    return null;
  };

  const createPage = (): string => {
    const taken = new Set(enc.nodes.map((n) => n.id));
    let i = enc.nodes.length + 1;
    while (taken.has(`p${i}`)) i++;
    const id = `p${i}`;
    edit((e) => void e.nodes.push(createNode(id)));
    return id;
  };

  const duplicate = () => {
    const id = makeUniqueId(`${enc.id}_copy`, content.encounters.map((e) => e.id), 'encounter');
    update((d) => {
      const index = d.encounters.findIndex((e) => e.id === enc.id);
      const copy = JSON.parse(JSON.stringify(enc)) as Encounter;
      copy.id = id;
      copy.title = `${enc.title} (복사본)`;
      d.encounters.splice(index + 1, 0, copy);
    });
    navigate({ encounterId: id });
  };

  const remove = () => {
    const refs = findReferences(content, 'encounter', enc.id);
    const warn = refs.length ? `\n\n주의: ${refs.length}곳에서 이 인카운터를 참조하고 있습니다 (검증 탭에 오류로 표시됨).` : '';
    if (!window.confirm(`'${enc.title || enc.id}' 인카운터를 삭제할까요?${warn}`)) return;
    const index = content.encounters.findIndex((e) => e.id === enc.id);
    const neighbor = content.encounters[index + 1] ?? content.encounters[index - 1];
    update((d) => {
      d.encounters = d.encounters.filter((e) => e.id !== enc.id);
    });
    navigate({ encounterId: neighbor?.id ?? null });
  };

  const ops = { enc, createPage, jumpTo };

  return (
    <div className="encounter-editor">
      <header className="enc-header">
        <input
          className="enc-title"
          value={enc.title}
          placeholder="인카운터 제목"
          onChange={(e) => edit((x) => void (x.title = e.target.value), `title:${enc.id}`)}
        />
        <div className="enc-actions">
          <button type="button" className="btn primary" onClick={() => playtest(enc.id)} title="이 인카운터부터 테스트 플레이">
            ▶ 여기서 테스트
          </button>
          <button type="button" className="btn" onClick={duplicate}>
            복제
          </button>
          <button type="button" className="btn danger" onClick={remove}>
            삭제
          </button>
        </div>
      </header>
      <div className="enc-meta">
        <span className="muted">id</span>
        <IdInput value={enc.id} onCommit={renameEncounter} />
        <span className="spawn-summary">{describeSpawn(content, enc)}</span>
      </div>

      {myIssues.length > 0 && (
        <ul className="issue-inline">
          {myIssues.map((i, k) => (
            <li key={k} className={i.severity} onClick={() => i.nodeId && jumpTo(i.nodeId)}>
              {i.severity === 'error' ? '✖' : '⚠'} {i.where && <span className="muted">[{i.where}] </span>}
              {i.message}
            </li>
          ))}
        </ul>
      )}

      <TextArea
        className="notes"
        minRows={1}
        value={enc.notes}
        placeholder="디자이너 메모 (게임에 표시되지 않음)"
        onChange={(v) => edit((x) => void (x.notes = v), `notes:${enc.id}`)}
      />

      <SpawnEditor enc={enc} edit={edit} />

      <div className="page-nav">
        <span className="muted">페이지</span>
        {enc.nodes.map((n) => (
          <button key={n.id} type="button" className={`page-chip ${n.id === enc.start ? 'start' : ''}`} onClick={() => jumpTo(n.id)}>
            {n.id}
          </button>
        ))}
        <button type="button" className="link-btn" onClick={() => jumpTo(createPage())}>
          + 페이지
        </button>
        <span className="spacer" />
        <button
          type="button"
          className="link-btn small"
          onClick={() => setCollapsed(collapsed.size ? new Set() : new Set(enc.nodes.map((n) => n.id)))}
        >
          {collapsed.size ? '모두 펼치기' : '모두 접기'}
        </button>
      </div>

      {enc.nodes.map((n) => (
        <NodeEditor
          key={n.id}
          node={n}
          edit={child(edit, (e) => e.nodes, n.id)}
          editEncounter={edit}
          ops={ops}
          incoming={incoming.get(n.id) ?? []}
          collapsed={collapsed.has(n.id)}
          onToggle={() =>
            setCollapsed((s) => {
              const next = new Set(s);
              if (next.has(n.id)) next.delete(n.id);
              else next.add(n.id);
              return next;
            })
          }
        />
      ))}
      <button type="button" className="btn add-page" onClick={() => jumpTo(createPage())}>
        + 페이지 추가
      </button>
    </div>
  );
}
