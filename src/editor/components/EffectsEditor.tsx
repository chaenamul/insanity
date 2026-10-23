import type { Effect, GameContent, StatKey } from '../../engine/types';
import { useEditor } from '../state';
import { RefSelect } from './RefSelect';
import { IconButton, NumberInput } from './ui';

// 효과 종류 목록. 수치 효과는 stat별로 따로 보여준다.
type EffectKind = StatKey | Exclude<Effect['type'], 'stat'>;

const KINDS: { value: EffectKind; label: string }[] = [
  { value: 'sanity', label: '정신력' },
  { value: 'maxSanity', label: '최대 정신력' },
  { value: 'hp', label: '체력' },
  { value: 'maxHp', label: '최대 체력' },
  { value: 'item', label: '아이템' },
  { value: 'trait', label: '능력' },
  { value: 'flag', label: '플래그' },
  { value: 'queue', label: '인카운터 예약' },
  { value: 'ending', label: '엔딩' },
];

function kindOf(e: Effect): EffectKind {
  return e.type === 'stat' ? e.stat : e.type;
}

function defaultEffect(kind: EffectKind, content: GameContent): Effect {
  switch (kind) {
    case 'hp':
    case 'maxHp':
      return { type: 'stat', stat: kind, value: -1, valueMax: null };
    case 'sanity':
    case 'maxSanity':
      return { type: 'stat', stat: kind, value: -5, valueMax: null };
    case 'item':
      return { type: 'item', id: content.items[0]?.id ?? '', value: 1 };
    case 'trait':
      return { type: 'trait', id: content.traits[0]?.id ?? '', has: true };
    case 'flag':
      return { type: 'flag', id: content.flags[0]?.id ?? '', mode: 'set', value: 1 };
    case 'queue':
      return { type: 'queue', encounterId: '', delay: 0 };
    case 'ending':
      return { type: 'ending', endingId: content.endings[0]?.id ?? '' };
  }
}

function EffectRow({ effect, onChange, onRemove, encounterId }: { effect: Effect; onChange: (e: Effect) => void; onRemove: () => void; encounterId?: string }) {
  const { content } = useEditor();
  const fields = (() => {
    switch (effect.type) {
      case 'stat': {
        const ranged = effect.valueMax != null;
        return (
          <>
            <NumberInput value={effect.value} onChange={(v) => onChange({ ...effect, value: v ?? 0 })} width={52} title="음수면 감소" />
            {ranged && (
              <>
                <span className="unit">~</span>
                <NumberInput value={effect.valueMax ?? null} onChange={(v) => onChange({ ...effect, valueMax: v })} width={52} nullable />
              </>
            )}
            <button
              type="button"
              className="link-btn small"
              title="범위 안에서 무작위 값 (예: -1 ~ -6)"
              onClick={() => onChange({ ...effect, valueMax: ranged ? null : effect.value * 2 || -2 })}
            >
              {ranged ? '고정값' : '범위'}
            </button>
          </>
        );
      }
      case 'item':
        return (
          <>
            <RefSelect kind="item" value={effect.id} onChange={(id) => onChange({ ...effect, id })} />
            <NumberInput value={effect.value} onChange={(v) => onChange({ ...effect, value: v ?? 0 })} width={44} title="음수면 잃음" />
            <span className="unit">개 {effect.value >= 0 ? '획득' : '잃음'}</span>
          </>
        );
      case 'trait':
        return (
          <>
            <RefSelect kind="trait" value={effect.id} onChange={(id) => onChange({ ...effect, id })} />
            <select value={effect.has ? 'y' : 'n'} onChange={(e) => onChange({ ...effect, has: e.target.value === 'y' })}>
              <option value="y">획득</option>
              <option value="n">상실</option>
            </select>
          </>
        );
      case 'flag':
        return (
          <>
            <RefSelect kind="flag" value={effect.id} onChange={(id) => onChange({ ...effect, id })} />
            <select value={effect.mode} onChange={(e) => onChange({ ...effect, mode: e.target.value as 'set' | 'add' })}>
              <option value="set">= 로 설정</option>
              <option value="add">+= 만큼 더함</option>
            </select>
            <NumberInput value={effect.value} onChange={(v) => onChange({ ...effect, value: v ?? 0 })} width={44} />
          </>
        );
      case 'queue':
        return (
          <>
            <RefSelect
              kind="encounter"
              value={effect.encounterId}
              newEncounterMode="triggered"
              onChange={(encounterId) => onChange({ ...effect, encounterId })}
            />
            <NumberInput value={effect.delay} min={0} onChange={(v) => onChange({ ...effect, delay: v ?? 0 })} width={40} />
            <span className="unit">{effect.delay === 0 ? '개 뒤 (바로 다음)' : '개 뒤'}</span>
          </>
        );
      case 'ending':
        return <RefSelect kind="ending" value={effect.endingId} onChange={(endingId) => onChange({ ...effect, endingId })} />;
    }
  })();

  return (
    <div className={`effect-row effect-${kindOf(effect)}`}>
      <select
        className="effect-kind"
        value={kindOf(effect)}
        onChange={(e) => onChange(defaultEffect(e.target.value as EffectKind, content))}
      >
        {KINDS.map((k) => (
          <option key={k.value} value={k.value}>
            {k.label}
          </option>
        ))}
      </select>
      {fields}
      {effect.type === 'queue' && effect.encounterId === encounterId && <span className="warn-text">자기 자신</span>}
      <IconButton title="효과 삭제" onClick={onRemove} danger>
        ✕
      </IconButton>
    </div>
  );
}

export function EffectsEditor({
  value,
  onChange,
  encounterId,
  label = '효과',
}: {
  value: Effect[];
  onChange: (effects: Effect[]) => void;
  encounterId?: string;
  label?: string;
}) {
  const { content } = useEditor();
  return (
    <div className="effects-editor">
      {value.map((e, i) => (
        <EffectRow
          key={i}
          effect={e}
          encounterId={encounterId}
          onChange={(next) => onChange(value.map((x, j) => (j === i ? next : x)))}
          onRemove={() => onChange(value.filter((_, j) => j !== i))}
        />
      ))}
      <select
        className="add-effect"
        value=""
        onChange={(e) => e.target.value && onChange([...value, defaultEffect(e.target.value as EffectKind, content)])}
      >
        <option value="">+ {label} 추가…</option>
        {KINDS.map((k) => (
          <option key={k.value} value={k.value}>
            {k.label}
          </option>
        ))}
      </select>
    </div>
  );
}
