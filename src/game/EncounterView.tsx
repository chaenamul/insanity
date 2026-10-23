import { useLayoutEffect, useRef, type ReactNode } from 'react';
import type { EncounterView as View } from '../engine/run';
import type { LogEntry, RunState } from '../engine/types';
import { RichInline, RichText } from '../markup/render';

interface Props {
  state: RunState;
  view: View;
  onChoose: (id: string) => void;
  onProceed: () => void;
}

/** 로그를 그린다. 각 덩어리에 시작 로그 번호(data-log)를 붙여 새로 추가된 곳으로 스크롤할 수 있게 한다 */
function renderLog(log: LogEntry[]): ReactNode[] {
  const out: ReactNode[] = [];
  for (let i = 0; i < log.length; i++) {
    const e = log[i];
    const start = i;
    if (e.kind === 'effect') {
      const chips: (LogEntry & { kind: 'effect' })[] = [];
      while (i < log.length && log[i].kind === 'effect') chips.push(log[i++] as LogEntry & { kind: 'effect' });
      i--;
      out.push(
        <div key={start} data-log={start} className="effects">
          {chips.map((c, j) => (
            <span key={j} className={`chip tone-${c.tone}`}>
              {c.text}
            </span>
          ))}
        </div>,
      );
    } else if (e.kind === 'choice') {
      out.push(
        <p key={start} data-log={start} className="chosen">
          <RichInline text={e.text} />
        </p>,
      );
    } else {
      out.push(
        <div key={start} data-log={start}>
          <RichText className="passage" text={e.text} />
        </div>,
      );
    }
  }
  return out;
}

export function EncounterView({ state, view, onChoose, onProceed }: Props) {
  const storyRef = useRef<HTMLDivElement>(null);
  const choicesRef = useRef<HTMLDivElement>(null);
  const shown = useRef({ key: '', length: 0 });
  const encounterKey = `${state.turn}-${view.current.encounterId}`;
  const logLength = view.current.log.length;

  // 새 인카운터면 맨 위로, 같은 인카운터에 글이 늘었으면 새로 추가된 곳의 시작으로 (본문 영역 안에서만 스크롤)
  useLayoutEffect(() => {
    const box = storyRef.current;
    if (!box) return;
    const prev = shown.current;
    if (prev.key !== encounterKey) {
      box.scrollTop = 0;
    } else if (logLength > prev.length) {
      const blocks = [...box.querySelectorAll<HTMLElement>('[data-log]')];
      const target = blocks.find((el) => Number(el.dataset.log) >= prev.length);
      if (target) box.scrollTo({ top: Math.max(0, target.offsetTop - 12), behavior: 'smooth' });
    }
    shown.current = { key: encounterKey, length: logLength };
    choicesRef.current?.scrollTo({ top: 0 });
  }, [encounterKey, logLength]);

  const continueLabel = state.pendingEnding ? '…' : view.current.phase === 'continue' ? '계속' : '어쩔 수 없다';

  return (
    <>
      <div className="story-scroll" ref={storyRef}>
        <article className="log" key={encounterKey}>
          {renderLog(view.current.log)}
        </article>
      </div>
      <div className="choice-scroll" ref={choicesRef}>
        <div className="choice-list" key={`${encounterKey}-${logLength}`}>
          {view.choices.map((c) => (
            <button key={c.id} type="button" className={`choice ${c.enabled ? '' : 'locked'}`} disabled={!c.enabled} onClick={() => onChoose(c.id)}>
              {c.tags.map((t, j) => (
                <span key={j} className={`tag ${t.ok ? 'ok' : 'no'}`}>
                  [{t.label}]
                </span>
              ))}
              <span className="choice-text">
                <RichInline text={c.text} />
              </span>
            </button>
          ))}
          {view.canProceed && (
            <button type="button" className="choice continue" onClick={onProceed}>
              {continueLabel}
            </button>
          )}
        </div>
      </div>
    </>
  );
}
