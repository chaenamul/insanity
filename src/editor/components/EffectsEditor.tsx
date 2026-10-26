import { DEFAULT_DATE } from '../../engine/dates';
import { PARAM_KIND_LABELS, statUnit } from '../../engine/describe';
import type { Effect, GameContent } from '../../engine/types';
import { useEditor } from '../state';
import { ThemeColorsFields } from './ColorPicker';
import { RefSelect } from './RefSelect';
import { IconButton, NumberInput } from './ui';

// 효과 종류 목록. 파라미터 효과는 파라미터마다 따로 보여준다 ("정신력", "최대 정신력", "날짜 (캘린더)" …).
//  값: 'stat:<id>' | 'statmax:<id>' | 'text:<id>' | 'date:<id>' | 그 밖의 효과 type

const OTHER_KINDS: { value: string; label: string }[] = [
  { value: 'item', label: '아이템' },
  { value: 'trait', label: '능력' },
  { value: 'flag', label: '플래그' },
  { value: 'queue', label: '인카운터 예약' },
  { value: 'ending', label: '엔딩' },
];

function effectKinds(content: GameContent): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  for (const p of content.params) {
    const name = p.name || p.id;
    if (p.kind === 'stat') {
      out.push({ value: `stat:${p.id}`, label: name });
      if (p.max != null) out.push({ value: `statmax:${p.id}`, label: `최대 ${name}` });
    } else {
      out.push({ value: `${p.kind}:${p.id}`, label: `${name} (${PARAM_KIND_LABELS[p.kind]})` });
    }
  }
  out.push(...OTHER_KINDS);
  if (content.theme.variable) out.push({ value: 'theme', label: '색 변경 (가변 색상)' });
  return out;
}

function kindOf(e: Effect): string {
  switch (e.type) {
    case 'stat':
      return `${e.field === 'max' ? 'statmax' : 'stat'}:${e.id}`;
    case 'text':
    case 'date':
      return `${e.type}:${e.id}`;
    default:
      return e.type;
  }
}

function defaultEffect(kind: string, content: GameContent): Effect {
  const sep = kind.indexOf(':');
  const type = sep === -1 ? kind : kind.slice(0, sep);
  const id = sep === -1 ? '' : kind.slice(sep + 1);
  const param = content.params.find((p) => p.id === id);
  switch (type) {
    case 'stat':
    case 'statmax': {
      // 정신력처럼 큰 수치는 -5, 체력처럼 작은 수치는 -1
      const big = param?.kind === 'stat' && (param.max ?? param.value) >= 30;
      return { type: 'stat', id, field: type === 'statmax' ? 'max' : 'value', value: big ? -5 : -1, valueMax: null };
    }
    case 'text':
      return { type: 'text', id, value: '' };
    case 'date':
      return { type: 'date', id, mode: 'add', days: 1, date: param?.kind === 'date' ? param.value : DEFAULT_DATE };
    case 'theme':
      return { type: 'theme', background: content.theme.background, text: content.theme.text };
    case 'item':
      return { type: 'item', id: content.items[0]?.id ?? '', value: 1 };
    case 'trait':
      return { type: 'trait', id: content.traits[0]?.id ?? '', has: true };
    case 'flag':
      return { type: 'flag', id: content.flags[0]?.id ?? '', mode: 'set', value: 1 };
    case 'queue':
      return { type: 'queue', encounterId: '', delay: 0 };
    default:
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
            {statUnit(content, effect.id) && <span className="unit">{statUnit(content, effect.id)}</span>}
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
      case 'text':
        return (
          <>
            <span className="unit">→</span>
            <input className="text-value" value={effect.value} placeholder="새 상태 (예: 중독)" onChange={(e) => onChange({ ...effect, value: e.target.value })} />
          </>
        );
      case 'date':
        return (
          <>
            <select value={effect.mode} onChange={(e) => onChange({ ...effect, mode: e.target.value as 'add' | 'set' })}>
              <option value="add">날짜 넘기기</option>
              <option value="set">날짜 정하기</option>
            </select>
            {effect.mode === 'add' ? (
              <>
                <NumberInput value={effect.days} onChange={(v) => onChange({ ...effect, days: v ?? 0 })} width={48} title="음수면 거꾸로" />
                <span className="unit">일</span>
              </>
            ) : (
              <input type="date" value={effect.date} onChange={(e) => e.target.value && onChange({ ...effect, date: e.target.value })} />
            )}
          </>
        );
      case 'theme':
        return <ThemeColorsFields value={effect} onChange={(colors) => onChange({ type: 'theme', ...colors })} />;
    }
  })();

  const kinds = effectKinds(content);
  const kind = kindOf(effect);
  const className = effect.type === 'stat' ? (effect.field === 'max' ? 'statmax' : 'stat') : effect.type;

  return (
    <div className={`effect-row effect-${className}`}>
      <select className="effect-kind" value={kind} onChange={(e) => onChange(defaultEffect(e.target.value, content))}>
        {!kinds.some((k) => k.value === kind) && (
          <option value={kind}>
            {effect.type === 'theme' ? '⚠ 색 변경 (가변 색상 꺼짐)' : `⚠ ${'id' in effect ? effect.id || '(선택 안 됨)' : kind} (없음)`}
          </option>
        )}
        {kinds.map((k) => (
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
      <select className="add-effect" value="" onChange={(e) => e.target.value && onChange([...value, defaultEffect(e.target.value, content)])}>
        <option value="">+ {label} 추가…</option>
        {effectKinds(content).map((k) => (
          <option key={k.value} value={k.value}>
            {k.label}
          </option>
        ))}
      </select>
    </div>
  );
}
