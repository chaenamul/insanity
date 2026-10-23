// 본문 서식 파서 (React와 무관한 순수 TypeScript)
//
// 표기법
//   줄바꿈           문단 나누기
//   **굵게**  *기울임*
//   [태그]글자[/태그]          예) [shake]부르르[/shake]
//   [태그=값]글자[/태그]       예) [color=blood]핏빛[/color], [shake=strong]강하게[/shake]
//   \[  \*  \\                 기호를 그대로 쓰고 싶을 때
//
// 어떤 태그가 있는지는 registry.tsx가 정한다. 모르는 태그나 짝이 맞지 않는 표기는 글자 그대로 보인다.
// 서식은 한 문단(줄) 안에서만 적용된다.

export type MarkupNode =
  | { type: 'text'; value: string }
  | { type: 'tag'; tag: string; param: string | null; children: MarkupNode[] };

export interface ParsedLine {
  nodes: MarkupNode[];
  problems: string[];
}

interface Frame {
  kind: 'root' | 'asterisk' | 'bracket';
  tag: string;
  param: string | null;
  /** 짝이 안 맞을 때 글자 그대로 되돌리기 위한 원문 */
  raw: string;
  children: MarkupNode[];
}

const TAG_RE = /\[(\/)?([A-Za-z][A-Za-z0-9_-]*)(?:=([^\]\n]*))?\]/y;
const ESCAPABLE = new Set(['\\', '*', '[', ']']);

function pushText(list: MarkupNode[], value: string): void {
  if (!value) return;
  const last = list[list.length - 1];
  if (last?.type === 'text') last.value += value;
  else list.push({ type: 'text', value });
}

function pushNodes(list: MarkupNode[], nodes: MarkupNode[]): void {
  for (const n of nodes) {
    if (n.type === 'text') pushText(list, n.value);
    else list.push(n);
  }
}

export function parseLine(line: string, isKnownTag: (tag: string) => boolean): ParsedLine {
  const problems: string[] = [];
  const stack: Frame[] = [{ kind: 'root', tag: '', param: null, raw: '', children: [] }];
  const top = () => stack[stack.length - 1];
  let buf = '';
  const flush = () => {
    pushText(top().children, buf);
    buf = '';
  };
  const close = () => {
    const f = stack.pop()!;
    top().children.push({ type: 'tag', tag: f.tag, param: f.param, children: f.children });
  };
  /** 닫히지 않은 서식은 원문 그대로 되돌린다 */
  const unwind = () => {
    const f = stack.pop()!;
    if (f.kind === 'bracket') problems.push(`닫히지 않은 서식 ${f.raw}`);
    pushText(top().children, f.raw);
    pushNodes(top().children, f.children);
  };

  let i = 0;
  while (i < line.length) {
    const ch = line[i];
    if (ch === '\\' && ESCAPABLE.has(line[i + 1])) {
      buf += line[i + 1];
      i += 2;
      continue;
    }
    if (ch === '*') {
      const raw = line[i + 1] === '*' ? '**' : '*';
      flush();
      const t = top();
      if (t.kind === 'asterisk' && t.raw === raw) close();
      else stack.push({ kind: 'asterisk', tag: raw === '**' ? 'b' : 'i', param: null, raw, children: [] });
      i += raw.length;
      continue;
    }
    if (ch === '[') {
      TAG_RE.lastIndex = i;
      const m = TAG_RE.exec(line);
      if (m) {
        const tag = m[2].toLowerCase();
        if (!isKnownTag(tag)) {
          problems.push(`알 수 없는 서식 ${m[0]}`);
          buf += m[0];
        } else if (m[1]) {
          let idx = -1;
          for (let k = stack.length - 1; k > 0; k--) {
            if (stack[k].kind === 'bracket' && stack[k].tag === tag) {
              idx = k;
              break;
            }
          }
          if (idx === -1) {
            problems.push(`여는 짝이 없는 ${m[0]}`);
            buf += m[0];
          } else {
            flush();
            while (stack.length - 1 > idx) unwind();
            close();
          }
        } else {
          flush();
          stack.push({ kind: 'bracket', tag, param: m[3]?.trim() || null, raw: m[0], children: [] });
        }
        i += m[0].length;
        continue;
      }
    }
    buf += ch;
    i++;
  }
  flush();
  while (stack.length > 1) unwind();
  return { nodes: stack[0].children, problems };
}

/** 비어 있지 않은 줄마다 한 문단 */
export function parseParagraphs(text: string, isKnownTag: (tag: string) => boolean): ParsedLine[] {
  return text
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => parseLine(l, isKnownTag));
}

export function plainText(nodes: MarkupNode[]): string {
  return nodes.map((n) => (n.type === 'text' ? n.value : plainText(n.children))).join('');
}

/** 서식을 걷어낸 글자 (목록/미리보기용) */
export function stripMarkup(text: string, isKnownTag: (tag: string) => boolean): string {
  return parseParagraphs(text, isKnownTag)
    .map((p) => plainText(p.nodes))
    .join('\n');
}

export function findMarkupProblems(text: string, isKnownTag: (tag: string) => boolean): string[] {
  return parseParagraphs(text, isKnownTag).flatMap((p) => p.problems);
}
