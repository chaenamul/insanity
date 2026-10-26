// 입력칸(textarea/input) 안의 글자 위치를 화면 좌표로 구한다.
// 입력칸과 똑같이 줄바꿈되는 복제 상자를 만들어 재는 방식 (서식 메뉴 위치, 서식 강조 표시에 사용).

export type TextField = HTMLTextAreaElement | HTMLInputElement;

const COPIED = [
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'borderStyle',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'fontStyle',
  'fontVariant',
  'fontWeight',
  'fontStretch',
  'fontSize',
  'fontFamily',
  'lineHeight',
  'textAlign',
  'textTransform',
  'textIndent',
  'letterSpacing',
  'wordSpacing',
  'tabSize',
] as const;

/** 입력칸과 같은 자리에서 같은 모양으로 줄바꿈되는 상자의 스타일 */
export function mirrorStyle(el: TextField): Partial<CSSStyleDeclaration> {
  const cs = getComputedStyle(el);
  const style: Partial<CSSStyleDeclaration> = {};
  for (const p of COPIED) style[p] = cs[p];
  const single = el instanceof HTMLInputElement;
  const px = (v: string) => parseFloat(v) || 0;
  Object.assign(style, {
    boxSizing: 'border-box',
    borderColor: 'transparent',
    whiteSpace: single ? 'pre' : 'pre-wrap',
    overflowWrap: 'break-word',
    // 스크롤바를 뺀 실제 글자 폭에 맞춘다
    width: `${el.clientWidth + px(cs.borderLeftWidth) + px(cs.borderRightWidth)}px`,
    height: `${el.offsetHeight}px`,
    overflow: 'hidden',
  });
  // 한 줄 입력칸은 글자가 세로 가운데에 온다
  if (single) style.lineHeight = `${el.clientHeight - px(cs.paddingTop) - px(cs.paddingBottom)}px`;
  return style;
}

export interface CaretRect {
  left: number;
  top: number;
  height: number;
}

/** pos번째 글자 앞의 화면 좌표 (viewport 기준) */
export function caretRect(el: TextField, pos: number): CaretRect {
  const cs = getComputedStyle(el);
  const div = document.createElement('div');
  Object.assign(div.style, mirrorStyle(el), { position: 'absolute', visibility: 'hidden', top: '0', left: '0', height: 'auto' });
  div.textContent = el.value.slice(0, pos);
  const mark = document.createElement('span');
  // 뒤 글자까지 넣어야 줄 끝 단어가 입력칸과 같은 곳에서 넘어간다
  mark.textContent = el.value.slice(pos) || '.';
  div.appendChild(mark);
  document.body.appendChild(div);
  const rect = el.getBoundingClientRect();
  const px = (v: string) => parseFloat(v) || 0;
  const single = el instanceof HTMLInputElement;
  const lineHeight = single ? el.clientHeight : px(cs.lineHeight) || px(cs.fontSize) * 1.4;
  const result = {
    left: rect.left + px(cs.borderLeftWidth) + mark.offsetLeft - el.scrollLeft,
    top: single ? rect.top + px(cs.borderTopWidth) : rect.top + px(cs.borderTopWidth) + mark.offsetTop - el.scrollTop,
    height: lineHeight,
  };
  div.remove();
  return result;
}
