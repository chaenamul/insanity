import { useEffect, useState } from 'react';

/** id 입력. 엔터/포커스 이탈 시 확정하고, onCommit이 오류 메시지를 돌려주면 원래 값으로 되돌린다 */
export function IdInput({ value, onCommit, width }: { value: string; onCommit: (next: string) => string | null; width?: number }) {
  const [text, setText] = useState(value);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setText(value), [value]);

  const commit = () => {
    const next = text.trim();
    if (next === value) {
      setText(value);
      return;
    }
    const err = onCommit(next);
    setError(err);
    if (err) setText(value);
  };

  return (
    <span className="id-input-wrap">
      <input
        className="id-input"
        value={text}
        style={width ? { width } : { width: `${Math.max(6, text.length + 2)}ch` }}
        spellCheck={false}
        title="id (참조용). 바꾸면 이 id를 쓰는 모든 곳이 함께 바뀝니다"
        onChange={(e) => {
          setText(e.target.value);
          setError(null);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') {
            setText(value);
            setError(null);
          }
        }}
      />
      {error && <span className="id-error">{error}</span>}
    </span>
  );
}
