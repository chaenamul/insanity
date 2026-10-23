import { useMemo } from 'react';
import { encounterTitle } from '../../engine/describe';
import type { Encounter, SpawnMode } from '../../engine/types';
import { buildRelations, type Relation } from '../relations';
import { useEditor, type Edit } from '../state';
import { ConditionEditor } from './ConditionEditor';
import { RefSelect } from './RefSelect';
import { Field, IconButton, NumberInput, Segmented } from './ui';

const MODE_HELP: Record<SpawnMode, string> = {
  random: '조건을 만족하면 랜덤 풀에 들어가 가중치에 따라 뽑힙니다.',
  triggered: '랜덤으로는 나오지 않습니다. 다른 인카운터 결과의 "인카운터 예약" 효과로만 등장합니다.',
  fixed: '정해진 순번에 등장합니다 (그 순번에 예약된 인카운터가 있으면 바로 다음). 프롤로그/피날레 등에 사용.',
};

export function SpawnEditor({ enc, edit }: { enc: Encounter; edit: Edit<Encounter> }) {
  const { content, navigate } = useEditor();
  const s = enc.spawn;
  const relations = useMemo(() => buildRelations(content), [content]);
  const incoming = relations.filter((r) => r.to === enc.id);
  const outgoing = relations.filter((r) => r.from === enc.id);

  const setSpawn = <K extends keyof Encounter['spawn']>(key: K, value: Encounter['spawn'][K], merge = false) =>
    edit((e) => {
      e.spawn[key] = value as never;
    }, merge ? `spawn:${enc.id}:${String(key)}` : undefined);

  return (
    <section className="card spawn-card">
      <h3 className="card-title">출현 설정</h3>
      <div className="row">
        <Segmented<SpawnMode>
          value={s.mode}
          onChange={(m) => setSpawn('mode', m)}
          options={[
            { value: 'random', label: '랜덤' },
            { value: 'triggered', label: '후속 전용' },
            { value: 'fixed', label: '고정 순번' },
          ]}
        />
        <span className="help">{MODE_HELP[s.mode]}</span>
      </div>

      {s.mode === 'random' && (
        <div className="row wrap">
          <Field label="가중치" hint="클수록 자주">
            <NumberInput value={s.weight} min={0} onChange={(v) => setSpawn('weight', v ?? 0, true)} />
          </Field>
          <Field label="등장 구간" hint="n번째 인카운터 기준, 비우면 제한 없음">
            <span className="inline">
              <NumberInput value={s.minTurn} nullable min={1} placeholder="1" onChange={(v) => setSpawn('minTurn', v, true)} />
              <span className="unit">번째 ~</span>
              <NumberInput value={s.maxTurn} nullable min={1} placeholder="∞" onChange={(v) => setSpawn('maxTurn', v, true)} />
              <span className="unit">번째</span>
            </span>
          </Field>
        </div>
      )}
      {s.mode === 'fixed' && (
        <div className="row">
          <Field label="등장 순번">
            <span className="inline">
              <NumberInput value={s.fixedTurn} min={1} onChange={(v) => setSpawn('fixedTurn', v ?? 1, true)} />
              <span className="unit">번째 인카운터</span>
            </span>
          </Field>
        </div>
      )}
      <div className="row wrap">
        <label className="check">
          <input type="checkbox" checked={s.repeatable} onChange={(e) => setSpawn('repeatable', e.target.checked)} />
          한 판에 여러 번 나올 수 있음
        </label>
        {s.repeatable && (
          <span className="inline">
            <span className="unit">다시 나오려면 사이에 최소</span>
            <NumberInput value={s.cooldown} min={0} onChange={(v) => setSpawn('cooldown', v ?? 0, true)} width={44} />
            <span className="unit">개</span>
          </span>
        )}
      </div>

      {s.mode !== 'triggered' && (
        <>
          <div className="subsection">
            <div className="subsection-title">
              선행 인카운터
              <span className="help">지정한 인카운터를 겪은 뒤에만 등장. 그 사이에 다른 인카운터가 몇 개 끼어들 수 있는지 정합니다.</span>
            </div>
            {s.after.map((p, i) => (
              <div key={i} className="prereq-row">
                <RefSelect
                  kind="encounter"
                  value={p.encounterId}
                  exclude={enc.id}
                  onChange={(id) => edit((e) => void (e.spawn.after[i].encounterId = id))}
                />
                <span className="unit">이후, 사이에 최소</span>
                <NumberInput
                  value={p.minGap}
                  min={0}
                  width={44}
                  onChange={(v) => edit((e) => void (e.spawn.after[i].minGap = v ?? 0), `after:${enc.id}:${i}:min`)}
                />
                <span className="unit">~ 최대</span>
                <NumberInput
                  value={p.maxGap}
                  nullable
                  min={0}
                  width={44}
                  placeholder="∞"
                  onChange={(v) => edit((e) => void (e.spawn.after[i].maxGap = v), `after:${enc.id}:${i}:max`)}
                />
                <span className="unit">개</span>
                <span className="prereq-presets">
                  <button type="button" className="link-btn small" onClick={() => edit((e) => void Object.assign(e.spawn.after[i], { minGap: 0, maxGap: 0 }))}>
                    바로 다음
                  </button>
                  <button type="button" className="link-btn small" onClick={() => edit((e) => void Object.assign(e.spawn.after[i], { minGap: 0, maxGap: null }))}>
                    언제든
                  </button>
                </span>
                <IconButton title="삭제" danger onClick={() => edit((e) => void e.spawn.after.splice(i, 1))}>
                  ✕
                </IconButton>
              </div>
            ))}
            <button
              type="button"
              className="link-btn"
              onClick={() => edit((e) => void e.spawn.after.push({ encounterId: '', minGap: 0, maxGap: null }))}
            >
              + 선행 인카운터 추가
            </button>
            {s.after.some((p) => p.maxGap != null) && (
              <p className="help">최대값을 정하면, 그만큼 지났을 때 다른 랜덤 인카운터보다 우선해서 강제로 등장합니다.</p>
            )}
          </div>

          <div className="subsection">
            <div className="subsection-title">
              추가 출현 조건
              <span className="help">아이템/능력/플래그/수치 등. 만족할 때만 등장 후보가 됩니다.</span>
            </div>
            <ConditionEditor value={s.condition} onChange={(c) => edit((e) => void (e.spawn.condition = c))} emptyLabel="없음" />
          </div>
        </>
      )}

      <RelationList title="이 인카운터로 이어지는 곳" relations={incoming} side="from" onOpen={(id) => navigate({ tab: 'encounters', encounterId: id })} />
      <RelationList title="이 인카운터 다음에 이어지는 것" relations={outgoing} side="to" onOpen={(id) => navigate({ tab: 'encounters', encounterId: id })} />
      {s.mode === 'triggered' && !incoming.some((r) => r.kind === 'queue') && (
        <p className="warn-text">아직 이 인카운터를 예약하는 결과가 없습니다. 다른 인카운터 결과에 "인카운터 예약" 효과를 추가하세요.</p>
      )}
    </section>
  );
}

const KIND_LABELS: Record<Relation['kind'], string> = {
  after: '선행',
  queue: '예약',
  seen: '조건',
  state: '상태',
};

function RelationList({ title, relations, side, onOpen }: { title: string; relations: Relation[]; side: 'from' | 'to'; onOpen: (id: string) => void }) {
  const { content } = useEditor();
  if (relations.length === 0) return null;
  return (
    <div className="relations">
      <span className="relations-title">{title}</span>
      {relations.map((r, i) => {
        const id = side === 'from' ? r.from : r.to;
        return (
          <button key={i} type="button" className={`relation rel-${r.kind}`} onClick={() => onOpen(id)} title={r.where}>
            <span className="rel-kind">{KIND_LABELS[r.kind]}</span>
            {encounterTitle(content, id)}
            <span className="rel-label">{r.label}</span>
          </button>
        );
      })}
    </div>
  );
}
