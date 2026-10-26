import { DEFAULT_DATE } from '../../engine/dates';
import { statUnit } from '../../engine/describe';
import type { CompareOp, Condition, ConditionGroup, ConditionType, GameContent, ParamKind, StatField } from '../../engine/types';
import { useEditor } from '../state';
import { ParamSelect } from './ParamSelect';
import { RefSelect } from './RefSelect';
import { IconButton, NumberInput, Segmented } from './ui';

type Leaf = Exclude<Condition, ConditionGroup>;

const LEAF_TYPES: { value: Leaf['type']; label: string }[] = [
  { value: 'item', label: '아이템' },
  { value: 'trait', label: '능력' },
  { value: 'stat', label: '수치' },
  { value: 'text', label: '상태' },
  { value: 'date', label: '날짜' },
  { value: 'flag', label: '플래그' },
  { value: 'seen', label: '인카운터 겪음' },
  { value: 'turn', label: '진행 순번' },
];

const DATE_OPS: { value: CompareOp; label: string }[] = [
  { value: '>=', label: '부터 (≥)' },
  { value: '<=', label: '까지 (≤)' },
  { value: '==', label: '당일 (=)' },
  { value: '!=', label: '아닌 날 (≠)' },
  { value: '>', label: '이후 (>)' },
  { value: '<', label: '이전 (<)' },
];

function firstParam(content: GameContent, kind: ParamKind): string {
  return content.params.find((p) => p.kind === kind)?.id ?? '';
}

const OPS: { value: CompareOp; label: string }[] = [
  { value: '>=', label: '이상 (≥)' },
  { value: '<=', label: '이하 (≤)' },
  { value: '==', label: '같음 (=)' },
  { value: '!=', label: '다름 (≠)' },
  { value: '>', label: '초과 (>)' },
  { value: '<', label: '미만 (<)' },
];

export function defaultLeaf(type: Leaf['type'], content: GameContent): Leaf {
  switch (type) {
    case 'item':
      return { type, id: content.items[0]?.id ?? '', op: '>=', value: 1 };
    case 'trait':
      return { type, id: content.traits[0]?.id ?? '', has: true };
    case 'flag':
      return { type, id: content.flags[0]?.id ?? '', op: '==', value: 1 };
    case 'stat':
      return { type, id: firstParam(content, 'stat'), field: 'value', op: '>=', value: 1 };
    case 'text':
      return { type, id: firstParam(content, 'text'), op: '==', value: '' };
    case 'date': {
      const id = firstParam(content, 'date');
      const p = content.params.find((x) => x.id === id);
      return { type, id, op: '>=', value: p?.kind === 'date' ? p.value : DEFAULT_DATE };
    }
    case 'turn':
      return { type, op: '>=', value: 5 };
    case 'seen':
      return { type, encounterId: content.encounters[0]?.id ?? '', has: true };
  }
}

function OpSelect({ value, onChange, options = OPS }: { value: CompareOp; onChange: (op: CompareOp) => void; options?: typeof OPS }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as CompareOp)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function LeafEditor({ leaf, onChange, onRemove }: { leaf: Leaf; onChange: (c: Leaf) => void; onRemove: () => void }) {
  const { content } = useEditor();
  const fields = (() => {
    switch (leaf.type) {
      case 'item':
        return (
          <>
            <RefSelect kind="item" value={leaf.id} onChange={(id) => onChange({ ...leaf, id })} />
            <NumberInput value={leaf.value} onChange={(v) => onChange({ ...leaf, value: v ?? 0 })} width={44} />
            <span className="unit">개</span>
            <OpSelect value={leaf.op} onChange={(op) => onChange({ ...leaf, op })} />
          </>
        );
      case 'trait':
        return (
          <>
            <RefSelect kind="trait" value={leaf.id} onChange={(id) => onChange({ ...leaf, id })} />
            <select value={leaf.has ? 'y' : 'n'} onChange={(e) => onChange({ ...leaf, has: e.target.value === 'y' })}>
              <option value="y">보유</option>
              <option value="n">미보유</option>
            </select>
          </>
        );
      case 'flag':
        return (
          <>
            <RefSelect kind="flag" value={leaf.id} onChange={(id) => onChange({ ...leaf, id })} />
            <span className="unit">값이</span>
            <NumberInput value={leaf.value} onChange={(v) => onChange({ ...leaf, value: v ?? 0 })} width={44} />
            <OpSelect value={leaf.op} onChange={(op) => onChange({ ...leaf, op })} />
          </>
        );
      case 'stat':
        return (
          <>
            <ParamSelect kind="stat" value={leaf.id} onChange={(id) => onChange({ ...leaf, id })} />
            <select value={leaf.field} onChange={(e) => onChange({ ...leaf, field: e.target.value as StatField })}>
              <option value="value">현재값</option>
              <option value="max">최대값</option>
            </select>
            <NumberInput value={leaf.value} onChange={(v) => onChange({ ...leaf, value: v ?? 0 })} width={48} />
            {statUnit(content, leaf.id) && <span className="unit">{statUnit(content, leaf.id)}</span>}
            <OpSelect value={leaf.op} onChange={(op) => onChange({ ...leaf, op })} />
          </>
        );
      case 'text':
        return (
          <>
            <ParamSelect kind="text" value={leaf.id} onChange={(id) => onChange({ ...leaf, id })} />
            <input className="text-value" value={leaf.value} placeholder="(빈 값)" onChange={(e) => onChange({ ...leaf, value: e.target.value })} />
            <select value={leaf.op} onChange={(e) => onChange({ ...leaf, op: e.target.value as '==' | '!=' })}>
              <option value="==">같음 (=)</option>
              <option value="!=">다름 (≠)</option>
            </select>
          </>
        );
      case 'date':
        return (
          <>
            <ParamSelect kind="date" value={leaf.id} onChange={(id) => onChange({ ...leaf, id })} />
            <input type="date" value={leaf.value} onChange={(e) => e.target.value && onChange({ ...leaf, value: e.target.value })} />
            <OpSelect value={leaf.op} options={DATE_OPS} onChange={(op) => onChange({ ...leaf, op })} />
          </>
        );
      case 'turn':
        return (
          <>
            <span className="unit">현재</span>
            <NumberInput value={leaf.value} onChange={(v) => onChange({ ...leaf, value: v ?? 1 })} width={44} />
            <span className="unit">번째 인카운터</span>
            <OpSelect value={leaf.op} onChange={(op) => onChange({ ...leaf, op })} />
          </>
        );
      case 'seen':
        return (
          <>
            <RefSelect kind="encounter" value={leaf.encounterId} onChange={(encounterId) => onChange({ ...leaf, encounterId })} />
            <select value={leaf.has ? 'y' : 'n'} onChange={(e) => onChange({ ...leaf, has: e.target.value === 'y' })}>
              <option value="y">겪음</option>
              <option value="n">겪지 않음</option>
            </select>
          </>
        );
    }
  })();

  return (
    <div className="cond-leaf">
      <select
        className="cond-type"
        value={leaf.type}
        onChange={(e) => onChange(defaultLeaf(e.target.value as Leaf['type'], content))}
      >
        {LEAF_TYPES.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </select>
      {fields}
      <IconButton title="조건 삭제" onClick={onRemove} danger>
        ✕
      </IconButton>
    </div>
  );
}

function GroupEditor({
  group,
  onChange,
  onRemove,
  nested,
}: {
  group: ConditionGroup;
  onChange: (g: ConditionGroup) => void;
  onRemove?: () => void;
  nested?: boolean;
}) {
  const { content } = useEditor();
  const setItem = (i: number, c: Condition) => onChange({ ...group, items: group.items.map((x, j) => (j === i ? c : x)) });
  const removeItem = (i: number) => onChange({ ...group, items: group.items.filter((_, j) => j !== i) });
  const addLeaf = (type: Leaf['type'] = 'item') => onChange({ ...group, items: [...group.items, defaultLeaf(type, content)] });
  const addGroup = () =>
    onChange({
      ...group,
      items: [...group.items, { type: group.type === 'all' ? 'any' : 'all', items: [defaultLeaf('item', content), defaultLeaf('item', content)] }],
    });

  return (
    <div className={`cond-group ${nested ? 'nested' : ''}`}>
      {(group.items.length > 1 || nested) && (
        <div className="cond-group-head">
          <Segmented<ConditionType>
            value={group.type}
            onChange={(type) => onChange({ ...group, type: type as ConditionGroup['type'] })}
            options={[
              { value: 'all', label: '모두 만족', title: 'AND' },
              { value: 'any', label: '하나라도 만족', title: 'OR' },
            ]}
          />
          {onRemove && (
            <IconButton title="묶음 삭제" onClick={onRemove} danger>
              ✕
            </IconButton>
          )}
        </div>
      )}
      {group.items.map((item, i) =>
        item.type === 'all' || item.type === 'any' ? (
          <GroupEditor key={i} group={item} nested onChange={(g) => setItem(i, g)} onRemove={() => removeItem(i)} />
        ) : (
          <LeafEditor key={i} leaf={item} onChange={(c) => setItem(i, c)} onRemove={() => removeItem(i)} />
        ),
      )}
      <div className="cond-actions">
        <button type="button" className="link-btn" onClick={() => addLeaf()}>
          + 조건
        </button>
        <button type="button" className="link-btn" onClick={addGroup} title="'A 또는 B' 같은 하위 묶음">
          + 묶음
        </button>
      </div>
    </div>
  );
}

/** 조건 편집기. 비어 있으면 null을 돌려준다 (= 항상 참) */
export function ConditionEditor({
  value,
  onChange,
  emptyLabel = '없음',
  addLabel = '+ 조건 추가',
}: {
  value: Condition | null;
  onChange: (c: Condition | null) => void;
  emptyLabel?: string;
  addLabel?: string;
}) {
  const { content } = useEditor();
  const group: ConditionGroup | null = !value ? null : value.type === 'all' || value.type === 'any' ? value : { type: 'all', items: [value] };

  if (!group || group.items.length === 0) {
    return (
      <div className="cond-empty">
        <span className="muted">{emptyLabel}</span>
        <button type="button" className="link-btn" onClick={() => onChange({ type: 'all', items: [defaultLeaf('item', content)] })}>
          {addLabel}
        </button>
      </div>
    );
  }
  return <GroupEditor group={group} onChange={(g) => onChange(g.items.length === 0 ? null : g)} />;
}
