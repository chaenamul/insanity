import { createParam, makeUniqueId } from '../../engine/content';
import { PARAM_KIND_LABELS } from '../../engine/describe';
import type { ParamKind } from '../../engine/types';
import { useEditor } from '../state';

const CREATE = '__create__';

/** 한 종류(수치/상태/캘린더)의 파라미터 선택. 목록 맨 아래에서 바로 새로 만들 수 있다 */
export function ParamSelect({ kind, value, onChange }: { kind: ParamKind; value: string; onChange: (id: string) => void }) {
  const { content, update } = useEditor();
  const options = content.params.filter((p) => p.kind === kind);
  const current = content.params.find((p) => p.id === value);
  const missing = value && !options.some((p) => p.id === value);
  const label = PARAM_KIND_LABELS[kind];

  const create = () => {
    const name = window.prompt(`새 ${label} 파라미터 이름`);
    if (!name?.trim()) return;
    const id = makeUniqueId(name, content.params.map((p) => p.id), kind === 'stat' ? 'stat' : kind);
    update((d) => void d.params.push(createParam(kind, id, name.trim())));
    onChange(id);
  };

  return (
    <select
      className={`ref-select ${!value || missing ? 'invalid' : ''}`}
      value={value}
      onChange={(e) => (e.target.value === CREATE ? create() : onChange(e.target.value))}
    >
      {!value && <option value="">{label} 선택…</option>}
      {missing && <option value={value}>⚠ {current ? `${current.name || value} (${PARAM_KIND_LABELS[current.kind]})` : `${value} (없음)`}</option>}
      {options.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name || p.id}
        </option>
      ))}
      <option value={CREATE}>＋ 새 {label} 만들기…</option>
    </select>
  );
}
