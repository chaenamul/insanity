import { isEmptyCondition } from '../../engine/conditions';
import { createBranch, createChoice, createOutcome, uid } from '../../engine/content';
import { conditionTags } from '../../engine/describe';
import type { Branch, Choice, Encounter, EncounterNode, Outcome } from '../../engine/types';
import { child, useEditor, type Edit } from '../state';
import { ConditionEditor } from './ConditionEditor';
import { EffectsEditor } from './EffectsEditor';
import { IdInput } from './IdInput';
import { IconButton, move, NumberInput, TextArea } from './ui';

interface PageOps {
  enc: Encounter;
  /** 새 페이지를 만들고 id를 돌려준다 */
  createPage: () => string;
  jumpTo: (nodeId: string) => void;
}

// ─── 결과 ───

function OutcomeEditor({
  outcome,
  edit,
  totalWeight,
  siblings,
  index,
  onRemove,
  ops,
}: {
  outcome: Outcome;
  edit: Edit<Outcome>;
  totalWeight: number;
  siblings: number;
  index: number;
  onRemove: () => void;
  ops: PageOps;
}) {
  const percent = totalWeight > 0 ? Math.round((Math.max(0, outcome.weight) / totalWeight) * 1000) / 10 : 0;
  return (
    <div className="outcome">
      {siblings > 1 && (
        <div className="outcome-head">
          <span className="outcome-label">확률 결과 {String.fromCharCode(65 + index)}</span>
          <span className="inline">
            <span className="unit">가중치</span>
            <NumberInput value={outcome.weight} min={0} width={44} onChange={(v) => edit((o) => void (o.weight = v ?? 0), `w:${outcome.id}`)} />
            <span className="percent">{percent}%</span>
          </span>
          <IconButton title="이 결과 삭제" danger onClick={onRemove}>
            ✕
          </IconButton>
        </div>
      )}
      <TextArea
        value={outcome.text}
        placeholder="결과 서술 (비워도 됨). 줄바꿈 = 문단, *기울임*, **굵게**"
        onChange={(v) => edit((o) => void (o.text = v), `text:${outcome.id}`)}
      />
      <EffectsEditor value={outcome.effects} encounterId={ops.enc.id} onChange={(effects) => edit((o) => void (o.effects = effects))} />
      <div className="next-row">
        <span className="unit">그 다음</span>
        <select
          className={outcome.next && !ops.enc.nodes.some((n) => n.id === outcome.next) ? 'invalid' : ''}
          value={outcome.next ?? ''}
          onChange={(e) => {
            const v = e.target.value;
            if (v === '__new__') {
              const id = ops.createPage();
              edit((o) => void (o.next = id));
            } else {
              edit((o) => void (o.next = v || null));
            }
          }}
        >
          <option value="">인카운터 종료</option>
          {ops.enc.nodes.map((n) => (
            <option key={n.id} value={n.id}>
              → 페이지 {n.id}
            </option>
          ))}
          {outcome.next && !ops.enc.nodes.some((n) => n.id === outcome.next) && <option value={outcome.next}>⚠ {outcome.next} (없음)</option>}
          <option value="__new__">＋ 새 페이지 만들어 연결</option>
        </select>
        {outcome.next && ops.enc.nodes.some((n) => n.id === outcome.next) && (
          <button type="button" className="link-btn small" onClick={() => ops.jumpTo(outcome.next!)}>
            이동
          </button>
        )}
      </div>
    </div>
  );
}

// ─── 분기 ───

function BranchEditor({
  branch,
  edit,
  index,
  count,
  onMove,
  onRemove,
  ops,
}: {
  branch: Branch;
  edit: Edit<Branch>;
  index: number;
  count: number;
  onMove: (delta: number) => void;
  onRemove: () => void;
  ops: PageOps;
}) {
  const total = branch.outcomes.reduce((sum, o) => sum + Math.max(0, o.weight), 0);
  const isElse = isEmptyCondition(branch.condition);
  return (
    <div className={`branch ${count > 1 ? 'multi' : ''}`}>
      {count > 1 && (
        <div className="branch-head">
          <span className="branch-label">{isElse ? (index === count - 1 ? '그 외의 경우' : '항상 (조건 없음)') : `만약`}</span>
          {!isElse || index !== count - 1 ? (
            <ConditionEditor
              value={branch.condition}
              onChange={(c) => edit((b) => void (b.condition = c))}
              emptyLabel="조건 없음 — 아래 분기는 선택되지 않습니다"
            />
          ) : (
            <span className="help">위 조건에 모두 해당하지 않으면</span>
          )}
          <span className="branch-tools">
            <IconButton title="위로" onClick={() => onMove(-1)} disabled={index === 0}>
              ↑
            </IconButton>
            <IconButton title="아래로" onClick={() => onMove(1)} disabled={index === count - 1}>
              ↓
            </IconButton>
            <IconButton title="분기 삭제" danger onClick={onRemove}>
              ✕
            </IconButton>
          </span>
        </div>
      )}
      {branch.outcomes.map((o, i) => (
        <OutcomeEditor
          key={o.id}
          outcome={o}
          index={i}
          siblings={branch.outcomes.length}
          totalWeight={total}
          edit={child(edit, (b) => b.outcomes, o.id)}
          onRemove={() => edit((b) => void b.outcomes.splice(i, 1))}
          ops={ops}
        />
      ))}
      <button type="button" className="link-btn" onClick={() => edit((b) => void b.outcomes.push(createOutcome()))}>
        + 확률 결과 추가
      </button>
    </div>
  );
}

// ─── 선택지 ───

function ChoiceEditor({
  choice,
  edit,
  index,
  count,
  onMove,
  onDuplicate,
  onRemove,
  ops,
}: {
  choice: Choice;
  edit: Edit<Choice>;
  index: number;
  count: number;
  onMove: (delta: number) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  ops: PageOps;
}) {
  const { content } = useEditor();
  const tags = conditionTags(content, choice.require, null);
  const hasShowIf = !isEmptyCondition(choice.showIf);

  const addConditionalBranch = () =>
    edit((c) => {
      const elseIndex = c.branches.findIndex((b) => isEmptyCondition(b.condition));
      const branch = createBranch({ type: 'all', items: [{ type: 'trait', id: content.traits[0]?.id ?? '', has: true }] });
      if (elseIndex === -1) c.branches.push(branch);
      else c.branches.splice(elseIndex, 0, branch);
    });

  return (
    <div className="choice-card">
      <div className="choice-head">
        <span className="choice-index">{index + 1}</span>
        <input
          className="choice-text-input"
          value={choice.text}
          placeholder="선택지 문구"
          onChange={(e) => edit((c) => void (c.text = e.target.value), `ctext:${choice.id}`)}
        />
        <IconButton title="위로" onClick={() => onMove(-1)} disabled={index === 0}>
          ↑
        </IconButton>
        <IconButton title="아래로" onClick={() => onMove(1)} disabled={index === count - 1}>
          ↓
        </IconButton>
        <IconButton title="복제" onClick={onDuplicate}>
          ⧉
        </IconButton>
        <IconButton title="선택지 삭제" danger onClick={onRemove}>
          ✕
        </IconButton>
      </div>
      <div className="choice-preview">
        {hasShowIf && <span className="hidden-badge">숨김 선택지</span>}
        {tags.map((t, i) => (
          <span key={i} className="tag">
            [{t.label}]
          </span>
        ))}
        <span>{choice.text || <span className="muted">(문구 없음)</span>}</span>
      </div>

      <div className="choice-conds">
        <div className="cond-block">
          <span className="cond-title" title="만족하지 않으면 선택지가 아예 보이지 않습니다. 특정 능력이 있어야 생기는 선택지에 사용.">
            표시 조건
          </span>
          <ConditionEditor value={choice.showIf} onChange={(c) => edit((x) => void (x.showIf = c))} emptyLabel="항상 보임" />
        </div>
        <div className="cond-block">
          <span className="cond-title" title="선택지 앞에 [태그]로 표시됩니다. 충족 = 초록, 불충족 = 빨강(선택 불가).">
            요구 조건
          </span>
          <ConditionEditor value={choice.require} onChange={(c) => edit((x) => void (x.require = c))} emptyLabel="없음" />
        </div>
      </div>

      <div className="branches">
        <div className="branches-title">결과</div>
        {choice.branches.map((b, i) => (
          <BranchEditor
            key={b.id}
            branch={b}
            index={i}
            count={choice.branches.length}
            edit={child(edit, (c) => c.branches, b.id)}
            onMove={(d) => edit((c) => move(c.branches, i, d))}
            onRemove={() => edit((c) => void c.branches.splice(i, 1))}
            ops={ops}
          />
        ))}
        {choice.branches.length === 0 && (
          <button type="button" className="link-btn" onClick={() => edit((c) => void c.branches.push(createBranch()))}>
            + 결과 추가
          </button>
        )}
        <button type="button" className="link-btn" onClick={addConditionalBranch} title="같은 선택지라도 능력/아이템 등에 따라 다른 결과">
          + 조건에 따라 다른 결과
        </button>
      </div>
    </div>
  );
}

// ─── 페이지 ───

export function NodeEditor({
  node,
  edit,
  editEncounter,
  ops,
  incoming,
  collapsed,
  onToggle,
}: {
  node: EncounterNode;
  edit: Edit<EncounterNode>;
  editEncounter: Edit<Encounter>;
  ops: PageOps;
  incoming: string[];
  collapsed: boolean;
  onToggle: () => void;
}) {
  const isStart = ops.enc.start === node.id;

  const rename = (to: string): string | null => {
    if (!to.trim()) return '페이지 id를 입력하세요';
    if (ops.enc.nodes.some((n) => n.id === to)) return '이미 있는 페이지 id입니다';
    editEncounter((e) => {
      const n = e.nodes.find((x) => x.id === node.id);
      if (!n) return;
      n.id = to;
      if (e.start === node.id) e.start = to;
      for (const p of e.nodes) for (const c of p.choices) for (const b of c.branches) for (const o of b.outcomes) if (o.next === node.id) o.next = to;
    });
    return null;
  };

  const remove = () => {
    if (ops.enc.nodes.length <= 1) return;
    if (!window.confirm(`페이지 '${node.id}'를 삭제할까요? 이 페이지로 연결된 결과는 '인카운터 종료'로 바뀝니다.`)) return;
    editEncounter((e) => {
      e.nodes = e.nodes.filter((n) => n.id !== node.id);
      if (e.start === node.id) e.start = e.nodes[0].id;
      for (const p of e.nodes) for (const c of p.choices) for (const b of c.branches) for (const o of b.outcomes) if (o.next === node.id) o.next = null;
    });
  };

  return (
    <section className={`card node-card ${isStart ? 'start' : ''}`} id={`node-${node.id}`}>
      <div className="node-head">
        <button type="button" className="collapse-btn" onClick={onToggle} title={collapsed ? '펼치기' : '접기'}>
          {collapsed ? '▸' : '▾'}
        </button>
        <span className="node-label">페이지</span>
        <IdInput value={node.id} onCommit={rename} />
        {isStart ? (
          <span className="start-badge">시작 페이지</span>
        ) : (
          <button type="button" className="link-btn small" onClick={() => editEncounter((e) => void (e.start = node.id))}>
            시작 페이지로
          </button>
        )}
        {incoming.length > 0 && <span className="incoming">← {incoming.join(', ')}</span>}
        <span className="spacer" />
        <IconButton title="페이지 삭제" danger onClick={remove} disabled={ops.enc.nodes.length <= 1}>
          ✕
        </IconButton>
      </div>
      {collapsed ? (
        <p className="collapsed-preview muted">{node.text.slice(0, 80) || '(본문 없음)'}</p>
      ) : (
        <>
          <TextArea
            className="node-text"
            minRows={3}
            value={node.text}
            placeholder="본문. 줄바꿈 = 문단, *기울임*, **굵게**"
            onChange={(v) => edit((n) => void (n.text = v), `ntext:${node.id}`)}
          />

          {node.extraTexts.map((t, i) => (
            <div key={t.id} className="extra-text">
              <div className="extra-text-head">
                <span className="cond-title">조건부 문단</span>
                <ConditionEditor value={t.condition} onChange={(c) => edit((n) => void (n.extraTexts[i].condition = c))} emptyLabel="항상 표시" />
                <IconButton title="삭제" danger onClick={() => edit((n) => void n.extraTexts.splice(i, 1))}>
                  ✕
                </IconButton>
              </div>
              <TextArea
                value={t.text}
                placeholder="조건을 만족하면 본문 뒤에 덧붙는 문단"
                onChange={(v) => edit((n) => void (n.extraTexts[i].text = v), `extra:${t.id}`)}
              />
            </div>
          ))}

          <div className="node-extras">
            <button
              type="button"
              className="link-btn"
              title="특정 능력/아이템이 있을 때만 덧붙는 서술"
              onClick={() => edit((n) => void n.extraTexts.push({ id: uid('t'), condition: null, text: '' }))}
            >
              + 조건부 문단
            </button>
            <div className="node-effects">
              <span className="cond-title" title="이 페이지에 들어서는 순간 적용">
                진입 효과
              </span>
              <EffectsEditor value={node.effects} encounterId={ops.enc.id} onChange={(effects) => edit((n) => void (n.effects = effects))} />
            </div>
          </div>

          <div className="choices-editor">
            {node.choices.map((c, i) => (
              <ChoiceEditor
                key={c.id}
                choice={c}
                index={i}
                count={node.choices.length}
                edit={child(edit, (n) => n.choices, c.id)}
                onMove={(d) => edit((n) => move(n.choices, i, d))}
                onDuplicate={() =>
                  edit((n) => {
                    const copy = JSON.parse(JSON.stringify(c)) as Choice;
                    copy.id = uid('c');
                    for (const b of copy.branches) {
                      b.id = uid('b');
                      for (const o of b.outcomes) o.id = uid('o');
                    }
                    n.choices.splice(i + 1, 0, copy);
                  })
                }
                onRemove={() => {
                  if (c.text && !window.confirm(`선택지 '${c.text}'를 삭제할까요?`)) return;
                  edit((n) => void n.choices.splice(i, 1));
                }}
                ops={ops}
              />
            ))}
            {node.choices.length === 0 && <p className="help">선택지가 없으면 "계속" 버튼만 나오고 인카운터가 끝납니다.</p>}
            <button type="button" className="btn add-choice" onClick={() => edit((n) => void n.choices.push(createChoice()))}>
              + 선택지 추가
            </button>
          </div>
        </>
      )}
    </section>
  );
}
