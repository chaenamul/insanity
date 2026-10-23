import { createEncounter, makeUniqueId } from '../../engine/content';
import type { SpawnMode } from '../../engine/types';
import type { RefKind } from '../../engine/walk';
import { useEditor } from '../state';

const LABELS: Record<RefKind, string> = {
  item: '아이템',
  trait: '능력',
  flag: '플래그',
  encounter: '인카운터',
  ending: '엔딩',
};

const CREATE = '__create__';

/** 아이템/능력/플래그/인카운터/엔딩 선택. 목록 맨 아래에서 바로 새로 만들 수 있다 */
export function RefSelect({
  kind,
  value,
  onChange,
  newEncounterMode = 'random',
  exclude,
}: {
  kind: RefKind;
  value: string;
  onChange: (id: string) => void;
  /** 여기서 새 인카운터를 만들 때의 출현 방식 (예약 효과에서는 후속 전용) */
  newEncounterMode?: SpawnMode;
  exclude?: string;
}) {
  const { content, update } = useEditor();
  const options: { id: string; label: string }[] =
    kind === 'item'
      ? content.items.map((d) => ({ id: d.id, label: d.name || d.id }))
      : kind === 'trait'
        ? content.traits.map((d) => ({ id: d.id, label: d.name || d.id }))
        : kind === 'flag'
          ? content.flags.map((d) => ({ id: d.id, label: d.name || d.id }))
          : kind === 'ending'
            ? content.endings.map((d) => ({ id: d.id, label: d.title || d.id }))
            : content.encounters.filter((e) => e.id !== exclude).map((e) => ({ id: e.id, label: e.title || e.id }));
  const missing = value && !options.some((o) => o.id === value);

  const create = () => {
    const name = window.prompt(`새 ${LABELS[kind]} 이름`);
    if (!name?.trim()) return;
    const taken =
      kind === 'encounter'
        ? content.encounters.map((e) => e.id)
        : kind === 'ending'
          ? content.endings.map((e) => e.id)
          : content[kind === 'item' ? 'items' : kind === 'trait' ? 'traits' : 'flags'].map((d) => d.id);
    const id = makeUniqueId(name, taken, kind);
    update((d) => {
      if (kind === 'item') d.items.push({ id, name: name.trim(), description: '' });
      if (kind === 'trait') d.traits.push({ id, name: name.trim(), description: '' });
      if (kind === 'flag') d.flags.push({ id, name: name.trim(), description: '', initial: 0 });
      if (kind === 'ending') d.endings.push({ id, title: name.trim(), text: '', kind: 'other' });
      if (kind === 'encounter') {
        const enc = createEncounter(id, name.trim());
        enc.spawn.mode = newEncounterMode;
        d.encounters.push(enc);
      }
    });
    onChange(id);
  };

  return (
    <select
      className={`ref-select ${!value || missing ? 'invalid' : ''}`}
      value={value}
      onChange={(e) => (e.target.value === CREATE ? create() : onChange(e.target.value))}
    >
      {!value && <option value="">{LABELS[kind]} 선택…</option>}
      {missing && <option value={value}>⚠ {value} (없음)</option>}
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
          {o.label !== o.id ? ` (${o.id})` : ''}
        </option>
      ))}
      <option value={CREATE}>＋ 새 {LABELS[kind]} 만들기…</option>
    </select>
  );
}
