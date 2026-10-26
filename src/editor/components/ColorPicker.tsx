import { useEffect, useRef, useState } from 'react';
import { BACKGROUND_PALETTE, swatchLabel, TEXT_PALETTE, type Swatch } from '../../engine/colors';
import type { ThemeColors } from '../../engine/types';
import { useEditor } from '../state';

// 가변 색상용 색 선택. 각 색 이름 옆에 한 글자 크기의 색 견본을 보여준다 (기본 select로는 색을 그릴 수 없어서 직접 만든 목록).
// null = 이야기 기본 색 (견본은 fallback 색으로)

export function ColorPicker({
  value,
  palette,
  fallback,
  onChange,
  label,
}: {
  value: string | null;
  palette: Swatch[];
  /** 이야기 기본 색 (value가 null일 때 보이는 색) */
  fallback: string;
  onChange: (v: string | null) => void;
  /** 화면 읽기용 이름 (예: 배경) */
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const options: { value: string | null; label: string; color: string }[] = [
    { value: null, label: '이야기 기본 색', color: fallback },
    ...palette.map((s) => ({ value: s.value, label: s.label, color: s.value })),
  ];
  if (value && !palette.some((s) => s.value === value)) options.push({ value, label: swatchLabel(value), color: value });
  const current = options.find((o) => o.value === value) ?? options[0];

  const pick = (v: string | null) => {
    onChange(v);
    setOpen(false);
  };

  return (
    <div className="color-picker" ref={ref}>
      <button type="button" className="color-picker-btn" aria-haspopup="listbox" aria-expanded={open} aria-label={`${label} 색`} onClick={() => setOpen((o) => !o)}>
        <span className="color-dot" style={{ background: current.color }} />
        {current.label}
        <span className="color-picker-caret">▾</span>
      </button>
      {open && (
        <ul className="color-picker-list" role="listbox" aria-label={`${label} 색`}>
          {options.map((o) => (
            <li key={o.value ?? 'default'}>
              <button type="button" role="option" aria-selected={o.value === value} className={o.value === value ? 'on' : ''} onClick={() => pick(o.value)}>
                <span className="color-dot" style={{ background: o.color }} />
                {o.label}
                {o.value === value && <span className="color-picker-check">✓</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** 가변 색상의 배경/글자 색 고르기 + 둘을 합친 미리보기 (색 변경 효과, 인카운터 시작 시 색) */
export function ThemeColorsFields({ value, onChange }: { value: ThemeColors; onChange: (v: ThemeColors) => void }) {
  const { content } = useEditor();
  return (
    <>
      <span className="unit">배경</span>
      <ColorPicker
        label="배경"
        value={value.background}
        palette={BACKGROUND_PALETTE}
        fallback={content.theme.background}
        onChange={(background) => onChange({ ...value, background })}
      />
      <span className="unit">글자</span>
      <ColorPicker label="글자" value={value.text} palette={TEXT_PALETTE} fallback={content.theme.text} onChange={(text) => onChange({ ...value, text })} />
      <span
        className="theme-chip"
        style={{ background: value.background ?? content.theme.background, color: value.text ?? content.theme.text }}
        title="미리보기"
      >
        가나다
      </span>
    </>
  );
}
