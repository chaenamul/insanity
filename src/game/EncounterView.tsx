import { useEffect, useRef, type ReactNode } from 'react';
import type { EncounterView as View } from '../engine/run';
import type { LogEntry, RunState } from '../engine/types';
import { RichText } from '../shared/RichText';

interface Props {
  state: RunState;
  view: View;
  onChoose: (id: string) => void;
  onProceed: () => void;
}

/** 연속된 효과 로그는 한 줄의 칩으로 묶는다 */
function renderLog(log: LogEntry[]): ReactNode[] {
  const out: ReactNode[] = [];
  for (let i = 0; i < log.length; i++) {
    const e = log[i];
    if (e.kind === 'effect') {
      const chips: (LogEntry & { kind: 'effect' })[] = [];
      while (i < log.length && log[i].kind === 'effect') chips.push(log[i++] as LogEntry & { kind: 'effect' });
      i--;
      out.push(
        <div key={i} className="effects">
          {chips.map((c, j) => (
            <span key={j} className={`chip tone-${c.tone}`}>
              {c.text}
            </span>
          ))}
        </div>,
      );
    } else if (e.kind === 'choice') {
      out.push(
        <p key={i} className="chosen">
          {e.text}
        </p>,
      );
    } else {
      out.push(<RichText key={i} className="passage" text={e.text} />);
    }
  }
  return out;
}

export function EncounterView({ state, view, onChoose, onProceed }: Props) {
  const endRef = useRef<HTMLDivElement>(null);
  const logLength = view.current.log.length;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [logLength, view.current.encounterId]);

  const continueLabel = state.pendingEnding ? '…' : view.current.phase === 'continue' ? '계속' : '어쩔 수 없다 (계속)';

  return (
    <article className="encounter" key={`${state.turn}-${view.current.encounterId}`}>
      <h2 className="encounter-title">{view.encounter.title}</h2>
      <div className="log">{renderLog(view.current.log)}</div>
      <div className="choices">
        {view.choices.map((c, i) => (
          <button key={c.id} className={`choice ${c.enabled ? '' : 'locked'}`} disabled={!c.enabled} onClick={() => onChoose(c.id)}>
            <span className="choice-num">{i + 1}</span>
            {c.tags.map((t, j) => (
              <span key={j} className={`tag ${t.ok ? 'ok' : 'no'}`}>
                [{t.label}]
              </span>
            ))}
            <span className="choice-text">{c.text}</span>
          </button>
        ))}
        {view.canProceed && (
          <button className="choice continue" onClick={onProceed}>
            {continueLabel}
          </button>
        )}
      </div>
      <div ref={endRef} />
    </article>
  );
}
