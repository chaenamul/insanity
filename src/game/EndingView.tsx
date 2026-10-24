import type { EndingKind, GameContent, RunState } from '../engine/types';
import { RichText } from '../markup/render';
import { ScrollArea } from './ScrollArea';

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
}

export function EndingView({ content, state, onRestart, onTitle }: Props) {
  const ending = content.endings.find((e) => e.id === state.ending);
  const kind = ending?.kind ?? 'other';
  return (
    <>
      <ScrollArea className="story-scroll">
        <article className={`ending ending-${kind}`}>
          <p className="ending-kind">{KIND_LABELS[kind]}</p>
          <h2>{ending?.title ?? state.ending}</h2>
          {ending?.text && <RichText className="passage" text={ending.text} />}
          <dl className="ending-summary">
            <div>
              <dt>겪은 일</dt>
              <dd>{state.history.length}</dd>
            </div>
            <div>
              <dt>체력</dt>
              <dd>
                {state.hp}/{state.maxHp}
              </dd>
            </div>
            <div>
              <dt>정신력</dt>
              <dd>
                {state.sanity}/{state.maxSanity}
              </dd>
            </div>
          </dl>
        </article>
      </ScrollArea>
      <ScrollArea className="choice-scroll">
        <div className="choice-list">
          <button type="button" className="choice" onClick={onRestart}>
            <span className="choice-text">다시 시작한다</span>
          </button>
          <button type="button" className="choice" onClick={onTitle}>
            <span className="choice-text">타이틀 화면으로</span>
          </button>
        </div>
      </ScrollArea>
    </>
  );
}
