import { useLayoutEffect, useRef } from 'react';
import { DARK_COLORS, isLightColor, LIGHT_COLORS } from '../engine/colors';
import type { GameContent, RunState } from '../engine/types';
import type { ThemeMode } from './settings';

// 화면 색. 배경/글자 두 색만 정하면 나머지(테두리, 흐린 글자 등)는 game.css가 두 색을 섞어 만든다.

export interface Colors {
  background: string;
  text: string;
}

/** 플레이어 설정 → 이야기 기본 색 → 가변 색상 효과 순으로 정한다 */
export function resolveColors(content: GameContent, run: RunState | null, mode: ThemeMode): Colors {
  if (mode === 'light') return LIGHT_COLORS;
  if (mode === 'dark') return DARK_COLORS;
  const { theme } = content;
  const changed = theme.variable && run ? run.colors : null;
  return { background: changed?.background ?? theme.background, text: changed?.text ?? theme.text };
}

/** 문서 전체(html)에 색을 적용한다. 밝은 배경이면 html.theme-light로 강조색들도 진하게 바뀐다 */
export function useDocumentColors({ background, text }: Colors): void {
  const first = useRef(true);
  useLayoutEffect(() => {
    const root = document.documentElement;
    // 처음 열 때는 기본 색에서 천천히 바뀌지 않고 바로 이야기 색으로
    if (first.current) {
      first.current = false;
      root.classList.add('theme-instant');
      requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('theme-instant')));
    }
    root.style.setProperty('--bg', background);
    root.style.setProperty('--text', text);
    root.classList.toggle('theme-light', isLightColor(background));
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', background);
  }, [background, text]);
}
