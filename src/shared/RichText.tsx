import { Fragment, type ReactNode } from 'react';

// 본문 표기: 줄바꿈 = 문단, **굵게**, *기울임*

function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|\*(.+?)\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(m[1] != null ? <strong key={m.index}>{m[1]}</strong> : <em key={m.index}>{m[2]}</em>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function RichText({ text, className }: { text: string; className?: string }) {
  const lines = text.split('\n').filter((l) => l.trim());
  return (
    <div className={className}>
      {lines.map((line, i) => (
        <p key={i}>
          <Fragment>{inline(line)}</Fragment>
        </p>
      ))}
    </div>
  );
}
