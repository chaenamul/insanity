import { useCallback, useEffect, useRef, useState } from 'react';
import { plainParagraphs } from '../markup/render';

// 타이핑 효과: 본문 글자를 앞에서부터 하나씩 보여준다. 문장 끝/쉼표/문단 끝에서는 잠깐 멈춘다.

/** 한 글자를 보여주는 데 드는 시간 (보통 글자 = 1) */
function charCost(ch: string): number {
  if (/[.!?…。]/.test(ch)) return 7;
  if (/[,、;:—]/.test(ch)) return 3;
  return 1;
}

/** 서식을 뺀 글자 하나하나의 비용. 길이 = RichText reveal 기준 글자 수 */
export function textCosts(text: string): number[] {
  const out: number[] = [];
  for (const p of plainParagraphs(text)) {
    for (let i = 0; i < p.length; i++) out.push(charCost(p[i]));
    if (out.length) out[out.length - 1] += 5;
  }
  return out;
}

/**
 * costs.length 글자 중 지금 보여줄 글자 수. key가 바뀌면 처음부터 다시 시작한다.
 * cps(초당 글자 수)가 0이면 바로 전부 보인다.
 */
export function useTypewriter(costs: number[], cps: number, key: string): { shown: number; done: boolean; finish: () => void } {
  const total = costs.length;
  const [state, setState] = useState({ key, shown: cps > 0 ? 0 : total });
  let shown = state.shown;
  if (state.key !== key) {
    // 새 글이 들어온 첫 렌더부터 숨긴다 (다 보였다가 사라지지 않도록)
    shown = cps > 0 ? 0 : total;
    setState({ key, shown });
  }
  const costsRef = useRef(costs);
  costsRef.current = costs;
  const shownRef = useRef(shown);
  shownRef.current = shown;

  useEffect(() => {
    const list = costsRef.current;
    if (cps <= 0) {
      setState({ key, shown: list.length });
      return;
    }
    // 속도를 바꿨을 때는 이미 보인 데서부터 이어간다
    let i = Math.min(shownRef.current, list.length);
    let acc = 0;
    for (let k = 0; k < i; k++) acc += list[k];
    const start = performance.now() - (acc / cps) * 1000;
    let raf = 0;
    const tick = (now: number) => {
      if (shownRef.current >= list.length) return; // 건너뛰기로 이미 다 보임
      const units = ((now - start) / 1000) * cps;
      while (i < list.length && acc + list[i] <= units) acc += list[i++];
      const next = i;
      setState((s) => (s.key === key && s.shown < next ? { key, shown: next } : s));
      if (i < list.length) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [key, cps]);

  const finish = useCallback(() => setState({ key, shown: costsRef.current.length }), [key]);
  return { shown, done: shown >= total, finish };
}
