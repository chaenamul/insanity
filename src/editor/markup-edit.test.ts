import { describe, expect, it } from 'vitest';
import { FORMAT_OPTIONS } from '../markup/registry';
import { appliedSpans, innerSelection, spanAtCaret, spansOf, toggleFormat, type Range } from './markup-edit';

const opt = (tag: string, param: string | null = null) => FORMAT_OPTIONS.find((o) => o.tag === tag && o.param === param)!;

/** 'ab[cd]ef'처럼 [ ]로 선택 범위를 표시한 글 → 글과 범위 */
function sel(marked: string): { text: string; range: Range } {
  const start = marked.indexOf('⟨');
  const end = marked.indexOf('⟩') - 1;
  return { text: marked.replace('⟨', '').replace('⟩', ''), range: { start, end } };
}
function show(text: string, r: Range): string {
  return `${text.slice(0, r.start)}⟨${text.slice(r.start, r.end)}⟩${text.slice(r.end)}`;
}

describe('선택 영역 서식', () => {
  it('감싸고, 안쪽 글자를 계속 선택해 둔다', () => {
    const { text, range } = sel('가 ⟨떨림⟩ 나');
    const r = toggleFormat(text, range, opt('shake'));
    expect(show(r.text, r.selection)).toBe('가 [shake]⟨떨림⟩[/shake] 나');
  });

  it('여러 서식을 겹치고, 이미 걸린 서식은 체크로 보인다', () => {
    let { text, range } = sel('⟨피⟩');
    for (const o of [opt('shake'), opt('color', 'blood')]) ({ text, selection: range } = toggleFormat(text, range, o));
    // 나중에 건 서식이 안쪽
    expect(show(text, range)).toBe('[shake][color=blood]⟨피⟩[/color][/shake]');
    expect(appliedSpans(range, spansOf(text)).map((s) => s.tag)).toEqual(['color', 'shake']);
  });

  it('같은 서식을 다시 고르면 해제, 값만 다르면 값을 바꾼다', () => {
    const { text, range } = sel('[color=blood][shake]⟨피⟩[/shake][/color]');
    const off = toggleFormat(text, range, opt('color', 'blood'));
    expect(show(off.text, off.selection)).toBe('[shake]⟨피⟩[/shake]');
    const strong = toggleFormat(off.text, off.selection, opt('shake', 'strong'));
    expect(show(strong.text, strong.selection)).toBe('[shake=strong]⟨피⟩[/shake]');
  });

  it('표기까지 통째로 선택해도 안쪽 글자 기준으로 판단한다', () => {
    const { text, range } = sel('가 ⟨**굵게**⟩');
    expect(innerSelection(text, range, spansOf(text))).toEqual({ start: 4, end: 6 });
    expect(toggleFormat(text, range, opt('b')).text).toBe('가 굵게');
  });

  it('별표 서식 바로 옆에는 [i] 표기를 쓴다', () => {
    const { text, range } = sel('**⟨굵게⟩**');
    expect(toggleFormat(text, range, opt('i')).text).toBe('**[i]굵게[/i]**');
  });

  it('여러 줄은 줄마다 감싼다', () => {
    const { text, range } = sel('⟨첫 줄\n둘째 줄⟩');
    expect(toggleFormat(text, range, opt('faint')).text).toBe('[faint]첫 줄[/faint]\n[faint]둘째 줄[/faint]');
  });

  it('서식 표기 위의 커서로 그 서식을 찾는다', () => {
    const text = '가 [shake]떨림[/shake] *기울임*';
    expect(spanAtCaret(text, 4)?.tag).toBe('shake');
    expect(spanAtCaret(text, 13)?.tag).toBe('shake');
    expect(spanAtCaret(text, 10)).toBeNull();
    expect(spanAtCaret(text, text.indexOf('*'))?.tag).toBe('i');
  });
});
