import { useRef } from 'react';
import { TEXT_EFFECTS } from '../../markup/registry';
import { RichInline, RichText } from '../../markup/render';

// 서식 도구 모음이 붙은 글 입력칸. 도구 모음은 markup/registry.tsx의 효과 목록에서 자동으로 만들어진다.
// 선택한 글자를 감싸고, 여러 줄을 선택하면 줄마다 따로 감싼다 (서식은 한 문단 안에서만 적용되므로).

const HAS_MARKUP = /\*|\[\/?[A-Za-z]/;

export function RichTextArea({
  value,
  onChange,
  placeholder,
  minRows = 2,
  className = '',
  singleLine = false,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  minRows?: number;
  className?: string;
  singleLine?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement & HTMLInputElement>(null);

  const apply = (transform: (selected: string) => string) => {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? start;
    const selected = value.slice(start, end);
    const replaced = transform(selected);
    onChange(value.slice(0, start) + replaced + value.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start, start + replaced.length);
    });
  };

  const wrap = (open: string, close: string) => {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? start;
    if (start === end) {
      // 선택이 없으면 빈 표기를 넣고 커서를 그 안에
      onChange(value.slice(0, start) + open + close + value.slice(end));
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(start + open.length, start + open.length);
      });
      return;
    }
    apply((selected) =>
      selected
        .split('\n')
        .map((line) => {
          const lead = line.match(/^\s*/)![0];
          const trail = line.match(/\s*$/)![0];
          const core = line.trim();
          return core ? `${lead}${open}${core}${close}${trail}` : line;
        })
        .join('\n'),
    );
  };

  const clear = () =>
    apply((selected) => selected.replace(/\[\/?[A-Za-z][A-Za-z0-9_-]*(?:=[^\]\n]*)?\]/g, '').replace(/(?<!\\)\*/g, ''));

  const rows = Math.max(minRows, value.split('\n').length + Math.floor(value.length / 70) + 1);

  return (
    <div className={`rich-field ${singleLine ? 'single' : ''}`}>
      {/* mousedown 기본 동작을 막아 입력칸의 선택 영역을 유지한다 (select는 열려야 하므로 제외) */}
      <div className="rich-toolbar" onMouseDown={(e) => e.target instanceof HTMLSelectElement || e.preventDefault()}>
        <button type="button" title="굵게 **글자**" onClick={() => wrap('**', '**')}>
          <b>B</b>
        </button>
        <button type="button" title="기울임 *글자*" onClick={() => wrap('*', '*')}>
          <i>I</i>
        </button>
        {TEXT_EFFECTS.filter((fx) => fx.toolbar !== false).map((fx) =>
          fx.params ? (
            <select
              key={fx.tag}
              value=""
              title={fx.description}
              onChange={(e) => {
                const option = fx.params!.find((p) => p.value === e.target.value.slice(1));
                if (!option) return;
                wrap(option.value ? `[${fx.tag}=${option.value}]` : `[${fx.tag}]`, `[/${fx.tag}]`);
              }}
            >
              <option value="">{fx.label} ▾</option>
              {fx.params.map((p) => (
                // 값 ''도 고를 수 있도록 앞에 _를 붙인다
                <option key={p.value} value={`_${p.value}`}>
                  {fx.label}: {p.label}
                </option>
              ))}
            </select>
          ) : (
            <button key={fx.tag} type="button" title={fx.description} onClick={() => wrap(`[${fx.tag}]`, `[/${fx.tag}]`)}>
              {fx.label}
            </button>
          ),
        )}
        <button type="button" className="clear" title="선택한 부분의 서식 지우기" onClick={clear}>
          서식 지우기
        </button>
      </div>
      {singleLine ? (
        <input
          ref={ref}
          className={`rich-input ${className}`}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <textarea
          ref={ref}
          className={`textarea ${className}`}
          value={value}
          rows={Math.min(rows, 24)}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {HAS_MARKUP.test(value) && (
        <div className="rich-preview">
          <span className="rich-preview-label">미리보기</span>
          {singleLine ? <RichInline text={value} /> : <RichText text={value} className="rich-preview-body" />}
        </div>
      )}
    </div>
  );
}
