import { Fragment, type ReactNode } from 'react';
import { parseLine, parseParagraphs, plainText, stripMarkup as strip, type MarkupNode } from './parse';
import { EFFECTS_BY_TAG, isKnownTag } from './registry';
import './markup.css';

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** 타이핑 효과: 앞에서부터 left글자만 보이고 나머지는 자리만 차지한다 */
interface Budget {
  left: number;
}

function renderText(value: string, key: string, budget?: Budget): ReactNode {
  if (!budget || budget.left >= value.length) {
    if (budget) budget.left -= value.length;
    return value;
  }
  const shown = value.slice(0, Math.max(0, budget.left));
  budget.left = 0;
  return (
    <Fragment key={key}>
      {shown}
      <span className="ty-hidden">{value.slice(shown.length)}</span>
    </Fragment>
  );
}

function renderNodes(nodes: MarkupNode[], path: string, budget?: Budget): ReactNode[] {
  return nodes.map((n, i) => {
    const key = `${path}.${i}`;
    if (n.type === 'text') return renderText(n.value, key, budget);
    const children = renderNodes(n.children, key, budget);
    const effect = EFFECTS_BY_TAG.get(n.tag);
    const param = n.param;
    if (effect?.render) {
      return <Fragment key={key}>{effect.render(children, { param, seed: hash(`${key}:${plainText(n.children)}`) })}</Fragment>;
    }
    const safe = param?.replace(/[^a-z0-9-]/gi, '');
    return (
      <span key={key} className={`fx-${n.tag}${safe ? ` fx-${n.tag}--${safe}` : ''}`}>
        {children}
      </span>
    );
  });
}

/** 여러 문단 (줄바꿈 = 문단). reveal을 주면 서식을 뺀 글자 기준으로 앞에서부터 그만큼만 보인다 */
export function RichText({ text, className, reveal }: { text: string; className?: string; reveal?: number }) {
  const budget = reveal == null ? undefined : { left: reveal };
  return (
    <div className={className}>
      {parseParagraphs(text, isKnownTag).map((p, i) => (
        <p key={i}>{renderNodes(p.nodes, `p${i}`, budget)}</p>
      ))}
    </div>
  );
}

/** 한 줄 (선택지 등) */
export function RichInline({ text }: { text: string }) {
  return <>{renderNodes(parseLine(text.replace(/\n/g, ' '), isKnownTag).nodes, 'in')}</>;
}

export function stripMarkup(text: string): string {
  return strip(text, isKnownTag);
}

/** 문단별로 서식을 뺀 글자 (타이핑 효과의 글자 수 계산용) */
export function plainParagraphs(text: string): string[] {
  return parseParagraphs(text, isKnownTag).map((p) => plainText(p.nodes));
}
