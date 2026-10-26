import { scanTags, type TagSpan } from '../markup/parse';
import { FORMAT_OPTIONS, isKnownTag, type FormatOption } from '../markup/registry';

// 에디터 입력칸의 서식 편집 (DOM과 무관한 순수 함수)
//  - 선택한 글자에 이미 어떤 서식이 걸려 있는지
//  - 서식 켜기/끄기 (같은 서식을 다시 고르면 해제, 값만 다르면 값 교체)
//  - [shake] 같은 표기를 눌렀을 때 그 서식 찾기/지우기

export interface Range {
  start: number;
  end: number;
}

export interface EditResult {
  text: string;
  selection: Range;
}

export function spansOf(text: string): TagSpan[] {
  return scanTags(text, isKnownTag);
}

/** 선택 범위를 다듬는다: 앞뒤 공백을 빼고, 서식 표기까지 통째로 고른 경우([shake]글[/shake]) 안쪽 글자로 */
export function innerSelection(text: string, sel: Range, spans: TagSpan[]): Range {
  let { start, end } = sel;
  while (start < end && /\s/.test(text[start])) start++;
  while (end > start && /\s/.test(text[end - 1])) end--;
  for (;;) {
    const s = spans.find((x) => x.open[0] === start && x.close[1] === end);
    if (!s) break;
    start = s.open[1];
    end = s.close[0];
  }
  return { start, end };
}

/** 선택한 글자를 정확히 감싸고 있는 서식들 (안쪽부터). [색][떨림]글[/떨림][/색] 이면 둘 다 */
export function appliedSpans(sel: Range, spans: TagSpan[]): TagSpan[] {
  const out: TagSpan[] = [];
  let { start, end } = sel;
  for (;;) {
    const s = spans.find((x) => x.open[1] === start && x.close[0] === end && !out.includes(x));
    if (!s) break;
    out.push(s);
    start = s.open[0];
    end = s.close[1];
  }
  return out;
}

export function isApplied(applied: TagSpan[], opt: FormatOption): boolean {
  return applied.some((s) => s.tag === opt.tag && (s.param ?? null) === opt.param);
}

/** 별표 표기 옆에 또 별표를 붙이면 ***처럼 읽히므로 그때는 [b] / [i] 표기를 쓴다 */
function markupFor(opt: FormatOption, text: string, at: Range): { open: string; close: string } {
  const touching = text[at.start - 1] === '*' || text[at.end] === '*';
  if (opt.open.startsWith('*') && touching) return { open: `[${opt.tag}]`, close: `[/${opt.tag}]` };
  return { open: opt.open, close: opt.close };
}

/** 여러 줄을 고르면 줄마다 따로 감싼다 (서식은 한 문단 안에서만 적용되므로) */
function wrapLines(text: string, sel: Range, opt: FormatOption): EditResult {
  const replaced = text
    .slice(sel.start, sel.end)
    .split('\n')
    .map((line) => {
      const lead = line.match(/^\s*/)![0];
      const trail = line.match(/\s*$/)![0];
      const core = line.trim();
      return core ? `${lead}${opt.open}${core}${opt.close}${trail}` : line;
    })
    .join('\n');
  return { text: text.slice(0, sel.start) + replaced + text.slice(sel.end), selection: { start: sel.start, end: sel.start + replaced.length } };
}

/**
 * 서식 켜기/끄기. 선택한 글자에 같은 서식이 이미 있으면 해제하고, 값만 다르면(떨림 → 떨림 강하게, 색 바꾸기) 값을 바꾼다.
 * 결과의 selection은 서식 안쪽 글자 (이어서 다른 서식을 겹쳐 걸 수 있도록)
 */
export function toggleFormat(text: string, selection: Range, opt: FormatOption): EditResult {
  const spans = spansOf(text);
  const sel = innerSelection(text, selection, spans);
  if (sel.start === sel.end) return { text, selection };
  if (text.slice(sel.start, sel.end).includes('\n')) return wrapLines(text, sel, opt);

  const same = appliedSpans(sel, spans).find((s) => s.tag === opt.tag);
  if (same) {
    const openLength = same.open[1] - same.open[0];
    if ((same.param ?? null) === opt.param) {
      return { text: removeSpan(text, same), selection: { start: sel.start - openLength, end: sel.end - openLength } };
    }
    const shift = opt.open.length - openLength;
    return {
      text: text.slice(0, same.open[0]) + opt.open + text.slice(same.open[1]),
      selection: { start: sel.start + shift, end: sel.end + shift },
    };
  }
  const { open, close } = markupFor(opt, text, sel);
  return {
    text: text.slice(0, sel.start) + open + text.slice(sel.start, sel.end) + close + text.slice(sel.end),
    selection: { start: sel.start + open.length, end: sel.end + open.length },
  };
}

/** 서식 표기만 지우고 안의 글자는 남긴다 */
export function removeSpan(text: string, s: TagSpan): string {
  return text.slice(0, s.open[0]) + text.slice(s.open[1], s.close[0]) + text.slice(s.close[1]);
}

/** 선택한 부분의 서식 표기를 모두 지운다 */
export function clearFormats(text: string, sel: Range): EditResult {
  const cleared = text
    .slice(sel.start, sel.end)
    .replace(/\[\/?[A-Za-z][A-Za-z0-9_-]*(?:=[^\]\n]*)?\]/g, '')
    .replace(/(?<!\\)\*/g, '');
  return { text: text.slice(0, sel.start) + cleared + text.slice(sel.end), selection: { start: sel.start, end: sel.start + cleared.length } };
}

/** 커서가 서식 표기([shake], [/shake], **) 위에 있으면 그 서식. 별표는 한두 글자라 양 끝도 포함한다 */
export function spanAtCaret(text: string, pos: number, spans: TagSpan[] = spansOf(text)): TagSpan | null {
  const on = ([a, b]: [number, number]) => (text[a] === '*' ? a <= pos && pos <= b : a < pos && pos < b);
  return spans.find((s) => on(s.open) || on(s.close)) ?? null;
}

/** 서식 이름 (예: "떨림 (강하게)", "핏빛") */
export function spanLabel(s: TagSpan): string {
  const opt = FORMAT_OPTIONS.find((o) => o.tag === s.tag && o.param === (s.param ?? null));
  if (opt) return opt.group === 'color' ? `색: ${opt.label}` : opt.label;
  return s.param ? `${s.tag}=${s.param}` : s.tag;
}
