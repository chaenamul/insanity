import type { EndingKind, GameContent, RunState } from '../engine/types';
import { RichText } from '../shared/RichText';

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
    <article className={`ending ending-${kind}`}>
      <p className="ending-kind">{KIND_LABELS[kind]}</p>
      <h2>{ending?.title ?? state.ending}</h2>
      {ending?.text && <RichText className="passage" text={ending.text} />}
      <dl className="ending-summary">
        <div>
          <dt>겪은 인카운터</dt>
          <dd>{state.history.length}개</dd>
        </div>
        <div>
          <dt>체력</dt>
          <dd>
            {state.hp} / {state.maxHp}
          </dd>
        </div>
        <div>
          <dt>정신력</dt>
          <dd>
            {state.sanity} / {state.maxSanity}
          </dd>
        </div>
      </dl>
      <div className="title-actions">
        <button className="btn primary" onClick={onRestart}>
          다시 시작
        </button>
        <button className="btn" onClick={onTitle}>
          타이틀로
        </button>
      </div>
    </article>
  );
}
