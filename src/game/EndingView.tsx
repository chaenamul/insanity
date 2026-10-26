import { useMemo } from 'react';
import { paramValueText } from '../engine/describe';
import type { EndingKind, GameContent, RunState } from '../engine/types';
import { RichText } from '../markup/render';
import { ScrollArea } from './ScrollArea';
import { textCosts, useTypewriter } from './typing';

const KIND_LABELS: Record<EndingKind, string> = {
  death: '사망',
  madness: '광기',
  victory: '생존',
  other: '결말',
};

interface Props {
  content: GameContent;
  state: RunState;
  onRestart: () => void;
  onTitle: () => void;
  cps: number;
}

export function EndingView({ content, state, onRestart, onTitle, cps }: Props) {
  const ending = content.endings.find((e) => e.id === state.ending);
  const kind = ending?.kind ?? 'other';
  const text = ending?.text ?? '';
  const costs = useMemo(() => textCosts(text), [text]);
  const typer = useTypewriter(costs, cps, `ending:${state.seed}:${state.ending}`);
  const params = content.params.filter((p) => p.show !== 'hidden');

  return (
    <div
      className="encounter-view"
      onClickCapture={(e) => {
        if (typer.done) return;
        e.stopPropagation();
        typer.finish();
      }}
    >
      <ScrollArea className="story-scroll">
        <article className={`ending ending-${kind}${cps > 0 ? ' typing-on' : ''}`}>
          <p className="ending-kind">{KIND_LABELS[kind]}</p>
          <h2>{ending?.title ?? state.ending}</h2>
          {text && <RichText className="passage" text={text} reveal={typer.done ? undefined : typer.shown} />}
          <dl className={`ending-summary${typer.done ? '' : ' ty-wait'}`}>
            <div>
              <dt>겪은 일</dt>
              <dd>{state.history.length}</dd>
            </div>
            {params.map((p) => (
              <div key={p.id}>
                <dt>{p.name}</dt>
                <dd>{paramValueText(p, state) || '—'}</dd>
              </div>
            ))}
          </dl>
        </article>
      </ScrollArea>
      <ScrollArea className="choice-scroll">
        <div className={`choice-list${typer.done ? '' : ' ty-wait'}`}>
          <button type="button" className="choice" onClick={onRestart}>
            <span className="choice-text">다시 시작한다</span>
          </button>
          <button type="button" className="choice" onClick={onTitle}>
            <span className="choice-text">타이틀 화면으로</span>
          </button>
        </div>
      </ScrollArea>
    </div>
  );
}
