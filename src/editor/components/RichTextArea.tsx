import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { EFFECT_GROUP_LABELS, FORMAT_OPTIONS, type EffectGroup, type FormatOption } from '../../markup/registry';
import { RichInline, RichText } from '../../markup/render';
import { caretRect, mirrorStyle, type CaretRect, type TextField } from '../caret';
import {
  appliedSpans,
  clearFormats,
  innerSelection,
  isApplied,
  removeSpan,
  spanAtCaret,
  spanLabel,
  spansOf,
  toggleFormat,
  type EditResult,
  type Range,
} from '../markup-edit';

// 서식 입력칸. 서식 목록은 markup/registry.tsx의 효과 목록에서 자동으로 만들어진다.
//  - 위 도구 모음: 굵게 · 기울임 · 색 ▾ · 특수 효과 ▾ · 서식 지우기
//  - 글자를 드래그해 고르면 그 옆에 서식 메뉴가 뜬다. 누를 때마다 켜고/끄고(체크 표시), 메뉴는 닫히지 않는다
//  - [shake] 같은 표기를 누르면 그 서식이 걸린 곳을 강조하고, 지우기/닫기 메뉴가 뜬다

const HAS_MARKUP = /\*|\[\/?[A-Za-z]/;
const GROUPS: EffectGroup[] = ['basic', 'color', 'special'];

type MenuState = { mode: 'select'; start: number; end: number } | { mode: 'tag'; at: number } | null;

/** 선택 영역/서식 옆에 뜨는 메뉴. 아래쪽(우하단)이 모자라면 위쪽(우상단)으로 */
function FloatingMenu({ anchor, children, className }: { anchor: () => { start: CaretRect; end: CaretRect } | null; children: ReactNode; className: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const anchorRef = useRef(anchor);
  anchorRef.current = anchor;

  const place = useCallback(() => {
    const menu = ref.current;
    const a = anchorRef.current();
    if (!menu || !a) return;
    const gap = 6;
    const m = menu.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let top = a.end.top + a.end.height + gap;
    if (top + m.height > vh - 8) top = a.start.top - m.height - gap;
    const left = Math.max(8, Math.min(a.end.left - 10, vw - m.width - 8));
    const offscreen = a.end.top + a.end.height < 0 || a.start.top > vh;
    menu.style.top = `${Math.max(8, top)}px`;
    menu.style.left = `${left}px`;
    menu.style.visibility = offscreen ? 'hidden' : 'visible';
  }, []);

  useLayoutEffect(place);
  useEffect(() => {
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [place]);

  return createPortal(
    <div
      ref={ref}
      className={`fmt-menu ${className}`}
      style={{ visibility: 'hidden' }}
      // 메뉴를 눌러도 입력칸의 포커스와 선택 영역이 유지되도록
      onMouseDown={(e) => e.preventDefault()}
    >
      {children}
    </div>,
    document.body,
  );
}

export function RichTextArea({
  value,
  onChange,
  placeholder,
  minRows = 2,
  className = '',
  singleLine = false,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  minRows?: number;
  className?: string;
  singleLine?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement & HTMLInputElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<MenuState>(null);
  /** 값이 바뀐 뒤 되살릴 선택 영역 */
  const pendingSelection = useRef<Range | null>(null);
  const dragging = useRef(false);

  const spans = spansOf(value);
  const tagSpan = menu?.mode === 'tag' ? (spans.find((s) => s.open[0] === menu.at) ?? null) : null;

  useLayoutEffect(() => {
    const el = ref.current;
    const sel = pendingSelection.current;
    if (!el || !sel) return;
    pendingSelection.current = null;
    el.focus();
    el.setSelectionRange(sel.start, sel.end);
  }, [value]);

  // 메뉴가 가리키던 서식이 사라졌으면 닫는다
  useEffect(() => {
    if (menu?.mode === 'tag' && !tagSpan) setMenu(null);
  }, [menu, tagSpan]);

  // 메뉴 밖에서 글이 바뀌면(되돌리기 등) 선택 위치가 맞지 않으므로 닫는다
  const expectedValue = useRef<string | null>(null);
  useEffect(() => {
    if (value !== expectedValue.current) setMenu(null);
    expectedValue.current = null;
  }, [value]);

  /** 지금 선택 상태에 맞는 메뉴. 클릭으로 커서를 놓았을 때만 서식 표기 메뉴를 연다 */
  const evaluate = (fromPointer: boolean) => {
    const el = ref.current;
    if (!el || document.activeElement !== el) return;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? start;
    if (start !== end) {
      setMenu({ mode: 'select', start, end });
      return;
    }
    const span = fromPointer ? spanAtCaret(el.value, start) : null;
    setMenu(span ? { mode: 'tag', at: span.open[0] } : null);
  };

  const commit = (r: EditResult, next: MenuState) => {
    if (r.text === value) return;
    pendingSelection.current = r.selection;
    expectedValue.current = r.text;
    onChange(r.text);
    setMenu(next);
  };

  const currentSelection = (): Range => {
    const el = ref.current;
    const start = el?.selectionStart ?? value.length;
    return { start, end: el?.selectionEnd ?? start };
  };

  /** 도구 모음: 선택이 있으면 켜기/끄기, 없으면 빈 표기를 넣고 커서를 그 안에 */
  const toolbarApply = (opt: FormatOption) => {
    const sel = currentSelection();
    if (sel.start === sel.end) {
      pendingSelection.current = { start: sel.start + opt.open.length, end: sel.start + opt.open.length };
      onChange(value.slice(0, sel.start) + opt.open + opt.close + value.slice(sel.end));
      return;
    }
    const r = toggleFormat(value, sel, opt);
    commit(r, { mode: 'select', ...r.selection });
  };

  const anchor = () => {
    const el = ref.current;
    if (!el || !menu) return null;
    if (menu.mode === 'select') return { start: caretRect(el, menu.start), end: caretRect(el, menu.end) };
    if (!tagSpan) return null;
    return { start: caretRect(el, tagSpan.open[0]), end: caretRect(el, tagSpan.close[1]) };
  };

  // 서식 강조: 입력칸 뒤에 같은 글을 깔고 해당 부분에만 배경색을 칠한다
  useLayoutEffect(() => {
    const el = ref.current;
    const bd = backdropRef.current;
    if (!el || !bd || !tagSpan) return;
    Object.assign(bd.style, mirrorStyle(el));
    const sync = () => {
      bd.scrollTop = el.scrollTop;
      bd.scrollLeft = el.scrollLeft;
    };
    sync();
    el.addEventListener('scroll', sync);
    return () => el.removeEventListener('scroll', sync);
  });

  const selection = menu?.mode === 'select' ? innerSelection(value, menu, spans) : null;
  const multiLine = !!selection && value.slice(selection.start, selection.end).includes('\n');
  const applied = selection && !multiLine ? appliedSpans(selection, spans) : [];
  const rows = Math.max(minRows, value.split('\n').length + Math.floor(value.length / 70) + 1);

  const fieldProps = {
    ref,
    value,
    placeholder,
    // [shake] 같은 표기에 맞춤법 밑줄이 그어지지 않도록
    spellCheck: false,
    onChange: (e: ChangeEvent<TextField>) => {
      setMenu(null);
      onChange(e.target.value);
    },
    onMouseDown: () => {
      dragging.current = true;
      const up = () => {
        dragging.current = false;
        window.removeEventListener('mouseup', up);
        setTimeout(() => evaluate(true), 0);
      };
      window.addEventListener('mouseup', up);
    },
    // 휴대폰: 선택 손잡이를 놓은 뒤
    onTouchEnd: () => setTimeout(() => evaluate(true), 250),
    onKeyUp: (e: ReactKeyboardEvent) => {
      if (e.key !== 'Escape' && !dragging.current) evaluate(false);
    },
    onKeyDown: (e: ReactKeyboardEvent) => {
      if (e.key === 'Escape' && menu) {
        e.stopPropagation();
        setMenu(null);
      }
    },
    onBlur: () => setMenu(null),
  };

  const groupOptions = (group: EffectGroup) => FORMAT_OPTIONS.filter((o) => o.group === group);

  return (
    <div className={`rich-field ${singleLine ? 'single' : ''}`}>
      {/* mousedown 기본 동작을 막아 입력칸의 선택 영역을 유지한다 (select는 열려야 하므로 제외) */}
      <div className="rich-toolbar" onMouseDown={(e) => e.target instanceof HTMLSelectElement || e.preventDefault()}>
        {groupOptions('basic').map((o) => (
          <button key={o.tag} type="button" title={`${o.label} ${o.open}글자${o.close}`} onClick={() => toolbarApply(o)}>
            {o.tag === 'b' ? <b>B</b> : <i>I</i>}
          </button>
        ))}
        {(['color', 'special'] as const).map((group) => (
          <select
            key={group}
            value=""
            title={group === 'special' ? '떨림, 깜빡임 같은 글자 효과' : '글자 색'}
            onChange={(e) => {
              const o = groupOptions(group)[Number(e.target.value)];
              if (o) toolbarApply(o);
            }}
          >
            <option value="">{EFFECT_GROUP_LABELS[group]} ▾</option>
            {groupOptions(group).map((o, i) => (
              <option key={`${o.tag}:${o.param}`} value={i} title={o.description}>
                {o.label}
              </option>
            ))}
          </select>
        ))}
        <button type="button" className="clear" title="선택한 부분의 서식 지우기" onClick={() => commit(clearFormats(value, currentSelection()), null)}>
          서식 지우기
        </button>
      </div>
      <div className={`rich-box ${tagSpan ? 'has-highlight' : ''}`}>
        {tagSpan && (
          <div ref={backdropRef} className="rich-backdrop" aria-hidden>
            {value.slice(0, tagSpan.open[0])}
            <mark className="hl-tag">{value.slice(...tagSpan.open)}</mark>
            <mark className="hl-body">{value.slice(tagSpan.open[1], tagSpan.close[0])}</mark>
            <mark className="hl-tag">{value.slice(...tagSpan.close)}</mark>
            {value.slice(tagSpan.close[1])}
            {'​'}
          </div>
        )}
        {singleLine ? (
          <input {...fieldProps} className={`rich-input ${className}`} />
        ) : (
          <textarea {...fieldProps} className={`textarea ${className}`} rows={Math.min(rows, 24)} />
        )}
      </div>
      {HAS_MARKUP.test(value) && (
        <div className="rich-preview">
          <span className="rich-preview-label">미리보기</span>
          {singleLine ? <RichInline text={value} /> : <RichText text={value} className="rich-preview-body" />}
        </div>
      )}

      {menu?.mode === 'select' && selection && selection.start !== selection.end && (
        <FloatingMenu anchor={anchor} className="select-mode">
          {GROUPS.map((group) => (
            <div key={group} className="fmt-group">
              <span className="fmt-group-label">{EFFECT_GROUP_LABELS[group]}</span>
              <div className="fmt-items">
                {groupOptions(group).map((o) => {
                  const on = isApplied(applied, o);
                  return (
                    <button
                      key={`${o.tag}:${o.param}`}
                      type="button"
                      className={`fmt-item ${on ? 'on' : ''}`}
                      title={on ? `${o.label} 해제` : o.description}
                      aria-pressed={on}
                      onClick={() => {
                        const r = toggleFormat(value, menu, o);
                        commit(r, { mode: 'select', ...r.selection });
                      }}
                    >
                      <span className="fmt-check" aria-hidden>
                        {on ? '✓' : ''}
                      </span>
                      <RichInline text={`${o.open}${o.label}${o.close}`} />
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <div className="fmt-actions">
            {multiLine && <span className="fmt-note">여러 줄: 줄마다 따로 감쌉니다</span>}
            <button type="button" className="fmt-action" onClick={() => commit(clearFormats(value, menu), null)}>
              서식 지우기
            </button>
            <button type="button" className="fmt-action" onClick={() => setMenu(null)}>
              닫기
            </button>
          </div>
        </FloatingMenu>
      )}

      {tagSpan && (
        <FloatingMenu anchor={anchor} className="tag-mode">
          <div className="fmt-tag-title">
            <RichInline text={`${value.slice(...tagSpan.open)}${spanLabel(tagSpan)}${value.slice(...tagSpan.close)}`} /> 서식
          </div>
          <div className="fmt-actions">
            <button
              type="button"
              className="fmt-action danger"
              onClick={() =>
                commit({ text: removeSpan(value, tagSpan), selection: { start: tagSpan.open[0], end: tagSpan.open[0] } }, null)
              }
            >
              서식 삭제
            </button>
            <button type="button" className="fmt-action" onClick={() => setMenu(null)}>
              닫기
            </button>
          </div>
        </FloatingMenu>
      )}
    </div>
  );
}
