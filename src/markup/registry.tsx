import { cloneElement, Fragment, isValidElement, type CSSProperties, type ReactNode } from 'react';

// ─────────────────────────────────────────────────────────────
// 글자 효과 목록 — 새 효과는 여기에 항목 하나만 추가하면 된다.
//
//  1. TEXT_EFFECTS에 { tag, label, description, ... } 추가
//  2. 모양은 둘 중 하나로 정한다
//     - render를 생략하면 <span class="fx-태그 fx-태그--값">으로 감싸므로 markup.css에 CSS만 쓰면 됨
//     - 글자별 애니메이션 등은 render로 직접 그린다 (splitLetters 참고)
//  3. 에디터 도구 모음, 게임 화면, 검증(알 수 없는 태그 경고)에 자동으로 반영된다
// ─────────────────────────────────────────────────────────────

export interface EffectParam {
  /** ''이면 값 없이 [tag]로 쓴다 */
  value: string;
  label: string;
}

export interface RenderContext {
  /** [tag=값]의 값 */
  param: string | null;
  /** 같은 글이면 항상 같은 숫자. 애니메이션 시작 시점을 흩뜨리는 등에 사용 */
  seed: number;
}

export interface TextEffect {
  /** 표기에 쓰는 태그 이름 (영문 소문자) */
  tag: string;
  /** 에디터 도구 모음 이름 */
  label: string;
  description: string;
  /** 고를 수 있는 값. 없으면 값 없이 사용 */
  params?: EffectParam[];
  /** 에디터 도구 모음에 보일지 (기본 true) */
  toolbar?: boolean;
  render?: (children: ReactNode, ctx: RenderContext) => ReactNode;
}

/**
 * 글자 하나하나를 span으로 감싼다. 단어는 줄바꿈되지 않게 묶고, 공백은 그대로 둔다.
 * 글자마다 CSS 변수 --fx-i (0부터)가 붙는다.
 */
export function splitLetters(node: ReactNode, letterClass: string): ReactNode {
  let index = 0;
  const visit = (n: ReactNode, path: string): ReactNode => {
    if (typeof n === 'string') {
      return (
        <Fragment key={path}>
          {n.split(/(\s+)/).map((part, wi) =>
            !part || /^\s+$/.test(part) ? (
              part
            ) : (
              <span key={wi} className="fx-word">
                {[...part].map((ch, ci) => (
                  <span key={ci} className={letterClass} style={{ '--fx-i': index++ } as CSSProperties}>
                    {ch}
                  </span>
                ))}
              </span>
            ),
          )}
        </Fragment>
      );
    }
    if (Array.isArray(n)) return n.map((c, i) => visit(c, `${path}.${i}`));
    if (isValidElement<{ children?: ReactNode }>(n) && n.props.children != null) {
      return cloneElement(n, undefined, visit(n.props.children, `${path}c`));
    }
    return n;
  };
  return visit(node, 'l');
}

export const TEXT_EFFECTS: TextEffect[] = [
  {
    tag: 'b',
    label: '굵게',
    description: '**글자** 와 같음',
    toolbar: false,
    render: (children) => <strong>{children}</strong>,
  },
  {
    tag: 'i',
    label: '기울임',
    description: '*글자* 와 같음',
    toolbar: false,
    render: (children) => <em>{children}</em>,
  },
  {
    tag: 'color',
    label: '색',
    description: '글자 색. [color=#ff0000]처럼 직접 색을 써도 된다',
    params: [
      { value: 'blood', label: '핏빛' },
      { value: 'abyss', label: '심연의 녹색' },
      { value: 'void', label: '보랏빛' },
      { value: 'pale', label: '창백함' },
      { value: 'gold', label: '빛바랜 금색' },
    ],
    render: (children, { param }) =>
      param && /^#[0-9a-fA-F]{3,8}$/.test(param) ? (
        <span style={{ color: param }}>{children}</span>
      ) : (
        <span className={`fx-color fx-color--${param ?? 'blood'}`}>{children}</span>
      ),
  },
  {
    tag: 'faint',
    label: '희미하게',
    description: '흐릿하게 사라질 듯한 글자 (속삭임, 환청)',
  },
  {
    tag: 'shake',
    label: '떨림',
    description: '글자가 간헐적으로 부르르 떤다',
    params: [
      { value: '', label: '보통' },
      { value: 'strong', label: '강하게' },
    ],
    render: (children, { param, seed }) => (
      <span
        className={`fx-shake${param === 'strong' ? ' fx-shake--strong' : ''}`}
        // 여러 군데의 떨림이 동시에 일어나지 않도록 시작 시점을 흩뜨린다
        style={{ '--fx-delay': `${-(seed % 4000)}ms` } as CSSProperties}
      >
        {splitLetters(children, 'fx-shake-ch')}
      </span>
    ),
  },
];

export const EFFECTS_BY_TAG: ReadonlyMap<string, TextEffect> = new Map(TEXT_EFFECTS.map((e) => [e.tag, e]));
export const EFFECT_TAGS: ReadonlySet<string> = new Set(EFFECTS_BY_TAG.keys());
export const isKnownTag = (tag: string): boolean => EFFECT_TAGS.has(tag);
