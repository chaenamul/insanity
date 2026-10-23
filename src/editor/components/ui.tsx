import { useEffect, useState, type ReactNode } from 'react';

// 에디터 공용 입력 컴포넌트

export function TextArea({
  value,
  onChange,
  placeholder,
  minRows = 2,
  className = '',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  minRows?: number;
  className?: string;
}) {
  const rows = Math.max(minRows, value.split('\n').length + Math.floor(value.length / 70) + 1);
  return (
    <textarea
      className={`textarea ${className}`}
      value={value}
      rows={Math.min(rows, 24)}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/** 입력 중 빈 칸/음수 기호를 허용하는 숫자 입력. nullable이면 빈 칸 = null */
export function NumberInput({
  value,
  onChange,
  nullable = false,
  min,
  placeholder,
  width = 56,
  title,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  nullable?: boolean;
  min?: number;
  placeholder?: string;
  width?: number;
  title?: string;
}) {
  const [text, setText] = useState(value == null ? '' : String(value));
  useEffect(() => {
    // 외부에서 값이 바뀌면(되돌리기 등) 반영
    setText((t) => (t === '' && value == null) || Number(t) === value ? t : value == null ? '' : String(value));
  }, [value]);
  return (
    <input
      className="num-input"
      style={{ width }}
      inputMode="numeric"
      value={text}
      placeholder={placeholder}
      title={title}
      onChange={(e) => {
        const t = e.target.value;
        setText(t);
        if (t.trim() === '') {
          if (nullable) onChange(null);
          return;
        }
        const n = Number(t);
        if (Number.isFinite(n)) onChange(min != null ? Math.max(min, n) : n);
      }}
      onBlur={() => setText(value == null ? '' : String(value))}
    />
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">
        {label}
        {hint && <span className="field-hint">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

export function IconButton({
  onClick,
  title,
  children,
  danger,
  disabled,
}: {
  onClick: () => void;
  title: string;
  children: ReactNode;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button type="button" className={`icon-btn ${danger ? 'danger' : ''}`} title={title} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string; title?: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="segmented">
      {options.map((o) => (
        <button key={o.value} type="button" title={o.title} className={o.value === value ? 'active' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** 배열에서 index 항목을 delta만큼 이동 (immer draft에서 사용) */
export function move<T>(list: T[], index: number, delta: number): void {
  const to = index + delta;
  if (to < 0 || to >= list.length) return;
  const [item] = list.splice(index, 1);
  list.splice(to, 0, item);
}
