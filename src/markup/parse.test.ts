import { describe, expect, it } from 'vitest';
import { findMarkupProblems, parseLine, stripMarkup } from './parse';

const known = (t: string) => ['b', 'i', 'shake', 'color'].includes(t);

describe('서식 파서', () => {
  it('별표와 태그를 중첩해서 읽는다', () => {
    expect(parseLine('가 **굵게 [shake]떨림[/shake]** 나', known).nodes).toEqual([
      { type: 'text', value: '가 ' },
      {
        type: 'tag',
        tag: 'b',
        param: null,
        children: [
          { type: 'text', value: '굵게 ' },
          { type: 'tag', tag: 'shake', param: null, children: [{ type: 'text', value: '떨림' }] },
        ],
      },
      { type: 'text', value: ' 나' },
    ]);
  });

  it('값이 있는 태그', () => {
    expect(parseLine('[color=blood]피[/color]', known).nodes).toEqual([
      { type: 'tag', tag: 'color', param: 'blood', children: [{ type: 'text', value: '피' }] },
    ]);
  });

  it('짝이 안 맞거나 모르는 표기는 글자 그대로 둔다', () => {
    expect(stripMarkup('5 * 3 = 15', known)).toBe('5 * 3 = 15');
    expect(stripMarkup('[shake]닫히지 않음', known)).toBe('[shake]닫히지 않음');
    expect(stripMarkup('[권총] 쏜다 [what]', known)).toBe('[권총] 쏜다 [what]');
    expect(stripMarkup('\\*별\\* \\[shake]', known)).toBe('*별* [shake]');
  });

  it('문제를 알려준다', () => {
    expect(findMarkupProblems('[shake]열림', known)).toEqual(['닫히지 않은 서식 [shake]']);
    expect(findMarkupProblems('[shak]오타[/shak]', known)).toEqual(['알 수 없는 서식 [shak]', '알 수 없는 서식 [/shak]']);
    expect(findMarkupProblems('닫힘[/color]', known)).toEqual(['여는 짝이 없는 [/color]']);
    expect(findMarkupProblems('**정상** [shake=strong]떨림[/shake]', known)).toEqual([]);
  });

  it('서식은 문단(줄) 안에서만 적용된다', () => {
    expect(findMarkupProblems('[shake]첫 줄\n둘째 줄[/shake]', known)).toHaveLength(2);
  });
});
