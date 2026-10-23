import { useMemo, useState } from 'react';
import { makeUniqueId } from '../../engine/content';
import type { EndingKind, GameContent } from '../../engine/types';
import { BUILTIN_ENDINGS } from '../../engine/types';
import { findReferences, refsOfCondition, refsOfEffect, renameReferences, walkContent, type Loc, type RefKind } from '../../engine/walk';
import { useEditor } from '../state';
import { IdInput } from './IdInput';
import { RefSelect } from './RefSelect';
import { RichTextArea } from './RichTextArea';
import { Field, IconButton, NumberInput } from './ui';

/** 종류:id → 참조 위치 목록 */
function collectReferences(content: GameContent): Map<string, Loc[]> {
  const map = new Map<string, Loc[]>();
  const add = (kind: RefKind, id: string, loc: Loc) => {
    const key = `${kind}:${id}`;
    map.set(key, [...(map.get(key) ?? []), loc]);
  };
  walkContent(content, {
    condition(c, loc) {
      const r = refsOfCondition(c);
      if (r) add(r.kind, r.id, loc);
    },
    effect(e, loc) {
      const r = refsOfEffect(e);
      if (r) add(r.kind, r.id, loc);
    },
  });
  return map;
}

function Usage({ refs }: { refs: Loc[] }) {
  const { content, navigate } = useEditor();
  const [open, setOpen] = useState(false);
  if (refs.length === 0) return <span className="muted usage">미사용</span>;
  return (
    <span className="usage">
      <button type="button" className="link-btn small" onClick={() => setOpen(!open)}>
        {refs.length}곳에서 사용 {open ? '▴' : '▾'}
      </button>
      {open && (
        <ul className="usage-list">
          {refs.map((r, i) => (
            <li key={i}>
              <button
                type="button"
                className="link-btn small"
                onClick={() =>
                  r.encounterId ? navigate({ tab: 'encounters', encounterId: r.encounterId, nodeId: r.nodeId, nonce: Date.now() }) : navigate({ tab: 'settings' })
                }
              >
                {r.encounterId ? content.encounters.find((e) => e.id === r.encounterId)?.title || r.encounterId : ''} {r.where}
              </button>
            </li>
          ))}
        </ul>
      )}
    </span>
  );
}

const SECTIONS: { kind: 'item' | 'trait' | 'flag'; key: 'items' | 'traits' | 'flags'; title: string; help: string }[] = [
  { kind: 'item', key: 'items', title: '아이템', help: '플레이어에게 보이는 소지품. 개수가 있습니다.' },
  { kind: 'trait', key: 'traits', title: '능력', help: '플레이어에게 보이는 특성. 있거나 없거나.' },
  { kind: 'flag', key: 'flags', title: '플래그', help: '플레이어에게 보이지 않는 숫자 변수. 이야기 진행 상태를 기억할 때 사용.' },
];

export function DefinitionsPanel() {
  const { content, update } = useEditor();
  const refs = useMemo(() => collectReferences(content), [content]);

  return (
    <div className="panel">
      {SECTIONS.map(({ kind, key, title, help }) => {
        const list = content[key];
        const refsOf = (id: string) => [
          ...(refs.get(`${kind}:${id}`) ?? []),
          ...findReferences({ ...content, encounters: [] }, kind, id),
        ];
        return (
          <section key={kind} className="card">
            <h3 className="card-title">
              {title} <span className="help">{help}</span>
            </h3>
            <table className="def-table">
              <thead>
                <tr>
                  <th>id</th>
                  <th>이름</th>
                  <th>설명</th>
                  {kind === 'flag' && <th>초기값</th>}
                  <th>사용처</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.map((d, i) => {
                  const used = refsOf(d.id);
                  return (
                    <tr key={i}>
                      <td>
                        <IdInput
                          value={d.id}
                          onCommit={(to) => {
                            if (!to) return 'id를 입력하세요';
                            if (list.some((x) => x.id === to)) return '이미 있는 id입니다';
                            update((draft) => {
                              draft[key][i].id = to;
                              renameReferences(draft, kind, d.id, to);
                            });
                            return null;
                          }}
                        />
                      </td>
                      <td>
                        <input value={d.name} onChange={(e) => update((draft) => void (draft[key][i].name = e.target.value), `def:${key}:${i}:name`)} />
                      </td>
                      <td className="wide">
                        <input
                          value={d.description}
                          onChange={(e) => update((draft) => void (draft[key][i].description = e.target.value), `def:${key}:${i}:desc`)}
                        />
                      </td>
                      {kind === 'flag' && (
                        <td>
                          <NumberInput
                            value={content.flags[i].initial}
                            onChange={(v) => update((draft) => void (draft.flags[i].initial = v ?? 0), `def:flags:${i}:init`)}
                          />
                        </td>
                      )}
                      <td>
                        <Usage refs={used} />
                      </td>
                      <td>
                        <IconButton
                          title="삭제"
                          danger
                          onClick={() => {
                            const msg = used.length
                              ? `'${d.name || d.id}'는 ${used.length}곳에서 사용 중입니다. 삭제하면 해당 조건/효과가 오류로 표시됩니다. 삭제할까요?`
                              : `'${d.name || d.id}'를 삭제할까요?`;
                            if (window.confirm(msg)) update((draft) => void draft[key].splice(i, 1));
                          }}
                        >
                          ✕
                        </IconButton>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <button
              type="button"
              className="link-btn"
              onClick={() =>
                update((draft) => {
                  const id = makeUniqueId('', list.map((x) => x.id), kind);
                  if (kind === 'flag') draft.flags.push({ id, name: '', description: '', initial: 0 });
                  else draft[key as 'items' | 'traits'].push({ id, name: '', description: '' });
                })
              }
            >
              + {title} 추가
            </button>
          </section>
        );
      })}
    </div>
  );
}

const ENDING_KINDS: { value: EndingKind; label: string }[] = [
  { value: 'death', label: '사망' },
  { value: 'madness', label: '광기' },
  { value: 'victory', label: '생존/승리' },
  { value: 'other', label: '기타 결말' },
];

const BUILTIN_HELP: Record<string, string> = {
  [BUILTIN_ENDINGS.death]: '체력이 0이 되면 자동으로 도달',
  [BUILTIN_ENDINGS.madness]: '정신력이 0이 되면 자동으로 도달',
  [BUILTIN_ENDINGS.exhausted]: '더 이상 출현 가능한 인카운터가 없을 때 (보통은 설계 실수 → 채움용 반복 인카운터 추천)',
};

export function EndingsPanel() {
  const { content, update } = useEditor();
  const refs = useMemo(() => collectReferences(content), [content]);
  return (
    <div className="panel">
      {content.endings.map((e, i) => {
        const builtin = e.id in BUILTIN_HELP;
        return (
          <section key={i} className={`card ending-card kind-${e.kind}`}>
            <div className="row">
              {builtin ? <code className="builtin-id">{e.id}</code> : (
                <IdInput
                  value={e.id}
                  onCommit={(to) => {
                    if (!to) return 'id를 입력하세요';
                    if (content.endings.some((x) => x.id === to)) return '이미 있는 id입니다';
                    update((d) => {
                      d.endings[i].id = to;
                      renameReferences(d, 'ending', e.id, to);
                    });
                    return null;
                  }}
                />
              )}
              <input
                className="ending-title"
                value={e.title}
                placeholder="엔딩 제목"
                onChange={(ev) => update((d) => void (d.endings[i].title = ev.target.value), `ending:${i}:title`)}
              />
              <select value={e.kind} onChange={(ev) => update((d) => void (d.endings[i].kind = ev.target.value as EndingKind))}>
                {ENDING_KINDS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </select>
              {builtin ? <span className="start-badge">기본</span> : <Usage refs={refs.get(`ending:${e.id}`) ?? []} />}
              <span className="spacer" />
              {!builtin && (
                <IconButton title="삭제" danger onClick={() => window.confirm(`엔딩 '${e.title || e.id}'를 삭제할까요?`) && update((d) => void d.endings.splice(i, 1))}>
                  ✕
                </IconButton>
              )}
            </div>
            {builtin && <p className="help">{BUILTIN_HELP[e.id]}</p>}
            <RichTextArea value={e.text} placeholder="엔딩 서술" onChange={(v) => update((d) => void (d.endings[i].text = v), `ending:${i}:text`)} />
          </section>
        );
      })}
      <button
        type="button"
        className="btn"
        onClick={() =>
          update((d) => void d.endings.push({ id: makeUniqueId('', content.endings.map((x) => x.id), 'ending'), title: '', text: '', kind: 'other' }))
        }
      >
        + 엔딩 추가
      </button>
      <p className="help">엔딩은 결과 효과의 "엔딩"으로 도달합니다.</p>
    </div>
  );
}

export function SettingsPanel() {
  const { content, update } = useEditor();
  const s = content.start;
  return (
    <div className="panel">
      <section className="card">
        <h3 className="card-title">게임 정보</h3>
        <div className="row wrap">
          <Field label="제목">
            <input value={content.meta.title} onChange={(e) => update((d) => void (d.meta.title = e.target.value), 'meta:title')} />
          </Field>
          <Field label="부제">
            <input value={content.meta.subtitle} onChange={(e) => update((d) => void (d.meta.subtitle = e.target.value), 'meta:subtitle')} />
          </Field>
        </div>
        <Field label="도입부" hint="타이틀 화면에 표시">
          <RichTextArea value={content.meta.intro} onChange={(v) => update((d) => void (d.meta.intro = v), 'meta:intro')} />
        </Field>
      </section>

      <section className="card">
        <h3 className="card-title">시작 상태</h3>
        <div className="row wrap">
          <Field label="체력 (칸)">
            <span className="inline">
              <NumberInput value={s.hp} min={0} onChange={(v) => update((d) => void (d.start.hp = v ?? 0), 'start:hp')} />
              <span className="unit">/</span>
              <NumberInput value={s.maxHp} min={1} onChange={(v) => update((d) => void (d.start.maxHp = v ?? 1), 'start:maxHp')} />
            </span>
          </Field>
          <Field label="정신력" hint="현재 / 최대">
            <span className="inline">
              <NumberInput value={s.sanity} min={0} onChange={(v) => update((d) => void (d.start.sanity = v ?? 0), 'start:sanity')} />
              <span className="unit">/</span>
              <NumberInput value={s.maxSanity} min={1} onChange={(v) => update((d) => void (d.start.maxSanity = v ?? 1), 'start:maxSanity')} />
            </span>
          </Field>
        </div>

        <div className="subsection">
          <div className="subsection-title">시작 아이템</div>
          {s.items.map((it, i) => (
            <div key={i} className="row">
              <RefSelect kind="item" value={it.id} onChange={(id) => update((d) => void (d.start.items[i].id = id))} />
              <NumberInput value={it.count} min={1} width={44} onChange={(v) => update((d) => void (d.start.items[i].count = v ?? 1))} />
              <span className="unit">개</span>
              <IconButton title="삭제" danger onClick={() => update((d) => void d.start.items.splice(i, 1))}>
                ✕
              </IconButton>
            </div>
          ))}
          <button type="button" className="link-btn" onClick={() => update((d) => void d.start.items.push({ id: content.items[0]?.id ?? '', count: 1 }))}>
            + 시작 아이템
          </button>
        </div>

        <div className="subsection">
          <div className="subsection-title">시작 능력</div>
          {s.traits.map((t, i) => (
            <div key={i} className="row">
              <RefSelect kind="trait" value={t} onChange={(id) => update((d) => void (d.start.traits[i] = id))} />
              <IconButton title="삭제" danger onClick={() => update((d) => void d.start.traits.splice(i, 1))}>
                ✕
              </IconButton>
            </div>
          ))}
          <button type="button" className="link-btn" onClick={() => update((d) => void d.start.traits.push(content.traits[0]?.id ?? ''))}>
            + 시작 능력
          </button>
        </div>
        <p className="help">플래그 초기값은 "아이템·능력·플래그" 탭에서 정합니다.</p>
      </section>
    </div>
  );
}

export function IssuesPanel() {
  const { content, issues, navigate } = useEditor();
  if (issues.length === 0) return <div className="panel"><p className="ok-text">문제 없음 ✓</p></div>;
  const groups = new Map<string, typeof issues>();
  for (const i of issues) {
    const key = i.encounterId ?? '';
    groups.set(key, [...(groups.get(key) ?? []), i]);
  }
  return (
    <div className="panel">
      {[...groups.entries()].map(([encId, list]) => (
        <section key={encId} className="card">
          <h3 className="card-title">
            {encId ? (
              <button type="button" className="link-btn" onClick={() => navigate({ tab: 'encounters', encounterId: encId, nodeId: null })}>
                {content.encounters.find((e) => e.id === encId)?.title || encId} <span className="muted">({encId})</span>
              </button>
            ) : (
              '전체 설정'
            )}
          </h3>
          <ul className="issue-list">
            {list.map((i, k) => (
              <li
                key={k}
                className={i.severity}
                onClick={() =>
                  i.encounterId
                    ? navigate({ tab: 'encounters', encounterId: i.encounterId, nodeId: i.nodeId ?? null, nonce: Date.now() })
                    : i.tab && navigate({ tab: i.tab })
                }
              >
                {i.severity === 'error' ? '✖' : '⚠'} {i.where && <span className="muted">[{i.where}] </span>}
                {i.message}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
