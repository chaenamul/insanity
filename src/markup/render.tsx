import { Fragment, type ReactNode } from 'react';
import { parseLine, parseParagraphs, plainText, stripMarkup as strip, type MarkupNode } from './parse';
import { EFFECTS_BY_TAG, isKnownTag } from './registry';
import './markup.css';

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function renderNodes(nodes: MarkupNode[], path: string): ReactNode[] {
  return nodes.map((n, i) => {
    if (n.type === 'text') return n.value;
    const key = `${path}.${i}`;
    const children = renderNodes(n.children, key);
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

/** 여러 문단 (줄바꿈 = 문단) */
export function RichText({ text, className }: { text: string; className?: string }) {
  return (
    <div className={className}>
      {parseParagraphs(text, isKnownTag).map((p, i) => (
        <p key={i}>{renderNodes(p.nodes, `p${i}`)}</p>
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
