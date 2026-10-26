import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { EncounterView as View } from '../engine/run';
import type { LogEntry, RunState } from '../engine/types';
import { RichInline, RichText } from '../markup/render';
import { ScrollArea } from './ScrollArea';
import { textCosts, useTypewriter } from './typing';

interface Props {
  state: RunState;
  view: View;
  onChoose: (id: string) => void;
  onProceed: () => void;
  /** 타이핑 속도 (초당 글자 수, 0 = 한 번에) */
  cps: number;
}

/** 타이핑할 때 로그 항목 하나가 차지하는 글자들. 선택한 문구/효과 알림은 한 글자처럼 잠깐 멈췄다 나온다 */
function entryCosts(e: LogEntry): number[] {
  return e.kind === 'text' ? textCosts(e.text) : [e.kind === 'choice' ? 4 : 6];
}

/**
 * 로그를 그린다. 각 덩어리에 시작 로그 번호(data-log)를 붙여 새로 추가된 곳으로 스크롤할 수 있게 한다.
 * revealOf(i): 그 항목에서 보일 글자 수 (null = 전부)
 */
function renderLog(log: LogEntry[], revealOf: (i: number) => number | null): ReactNode[] {
  const out: ReactNode[] = [];
  const waitClass = (i: number) => {
    const r = revealOf(i);
    return r != null && r < 1 ? ' ty-wait' : '';
  };
  for (let i = 0; i < log.length; i++) {
    const e = log[i];
    const start = i;
    if (e.kind === 'effect') {
      const chips: { entry: LogEntry & { kind: 'effect' }; index: number }[] = [];
      while (i < log.length && log[i].kind === 'effect') chips.push({ entry: log[i] as LogEntry & { kind: 'effect' }, index: i++ });
      i--;
      out.push(
        <div key={start} data-log={start} className="effects">
          {chips.map(({ entry, index }) => (
            <span key={index} className={`chip tone-${entry.tone}${waitClass(index)}`}>
              {entry.text}
            </span>
          ))}
        </div>,
      );
    } else if (e.kind === 'choice') {
      out.push(
        <p key={start} data-log={start} className={`chosen${waitClass(start)}`}>
          <RichInline text={e.text} />
        </p>,
      );
    } else {
      out.push(
        <div key={start} data-log={start}>
          <RichText className="passage" text={e.text} reveal={revealOf(start) ?? undefined} />
        </div>,
      );
    }
  }
  return out;
}

export function EncounterView({ state, view, onChoose, onProceed, cps }: Props) {
  const storyRef = useRef<HTMLDivElement>(null);
  const choicesRef = useRef<HTMLDivElement>(null);
  const shown = useRef({ key: '', length: 0 });
  /** 새 글로 부드럽게 스크롤하는 동안은 타이핑 위치 따라가기를 쉰다 */
  const followPausedUntil = useRef(0);
  const encounterKey = `${state.turn}-${view.current.encounterId}`;
  const log = view.current.log;
  const logLength = log.length;

  // 타이핑 시작 위치: 새 인카운터면 처음부터, 같은 인카운터에 글이 늘었으면 늘어난 곳부터
  const [typing, setTyping] = useState({ key: encounterKey, from: 0, length: logLength });
  let from = typing.from;
  if (typing.key !== encounterKey || logLength < typing.length) {
    from = 0;
    setTyping({ key: encounterKey, from, length: logLength });
  } else if (logLength > typing.length) {
    from = typing.length;
    setTyping({ key: encounterKey, from, length: logLength });
  }

  const { costs, offsets } = useMemo(() => {
    const costs: number[] = [];
    const offsets: number[] = [];
    for (let i = from; i < log.length; i++) {
      offsets.push(costs.length);
      costs.push(...entryCosts(log[i]));
    }
    return { costs, offsets };
  }, [log, from]);
  const typer = useTypewriter(costs, cps, `${encounterKey}:${from}:${logLength}`);
  const revealOf = (i: number): number | null => (i < from || typer.done ? null : Math.max(0, typer.shown - offsets[i - from]));

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
      if (target) {
        box.scrollTo({ top: Math.max(0, target.offsetTop - 12), behavior: 'smooth' });
        followPausedUntil.current = performance.now() + 700;
      }
    }
    shown.current = { key: encounterKey, length: logLength };
    choicesRef.current?.scrollTo({ top: 0 });
  }, [encounterKey, logLength]);

  // 타이핑 중인 곳이 본문 영역 아래로 내려가면 따라 내려간다
  useLayoutEffect(() => {
    const box = storyRef.current;
    if (!box || typer.done || performance.now() < followPausedUntil.current) return;
    const next = box.querySelector('.ty-hidden, .ty-wait');
    if (!next) return;
    const top = next.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop;
    if (top > box.scrollTop + box.clientHeight - 28) box.scrollTop = top - box.clientHeight + 56;
  }, [typer.shown, typer.done]);

  // 타이핑 중에는 키(Space/Enter/숫자)가 먼저 글을 다 보여준다
  const { done: typingDone, finish: finishTyping } = typer;
  useEffect(() => {
    if (typingDone) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === ' ' || e.key === 'Enter' || /^[1-9]$/.test(e.key)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        finishTyping();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [typingDone, finishTyping]);

  const continueLabel = state.pendingEnding ? '…' : view.current.phase === 'continue' ? '계속' : '어쩔 수 없다';

  return (
    <div
      className="encounter-view"
      onClickCapture={(e) => {
        // 타이핑 중에 화면을 누르면 글을 다 보여준다 (그 클릭은 버튼에 전달하지 않음)
        if (typer.done) return;
        e.stopPropagation();
        e.preventDefault();
        typer.finish();
      }}
    >
      <ScrollArea className="story-scroll" scrollRef={storyRef}>
        <article className={`log${cps > 0 ? ' typing-on' : ''}`} key={encounterKey}>
          {renderLog(log, revealOf)}
        </article>
      </ScrollArea>
      <ScrollArea className="choice-scroll" scrollRef={choicesRef}>
        <div className={`choice-list${typer.done ? '' : ' ty-wait'}`} key={`${encounterKey}-${logLength}`}>
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
      </ScrollArea>
    </div>
  );
}
