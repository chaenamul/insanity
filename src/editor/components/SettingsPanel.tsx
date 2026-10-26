import { useMemo, useState, type CSSProperties } from 'react';
import { BACKGROUND_PALETTE, contrastRatio, isLightColor, TEXT_PALETTE, type Swatch } from '../../engine/colors';
import { createParam, makeUniqueId } from '../../engine/content';
import { DATE_PART_LABELS, formatDate } from '../../engine/dates';
import { PARAM_KIND_LABELS } from '../../engine/describe';
import { createInitialState } from '../../engine/run';
import type { DateParts, ParamDef, ParamKind, ParamShow, ShelfSettings, StatDisplay } from '../../engine/types';
import { renameReferences, type Loc } from '../../engine/walk';
import { Hud } from '../../game/Hud';
import '../../game/colors.css';
import { collectReferences } from '../references';
import { useEditor } from '../state';
import { Usage } from './DefinitionsPanel';
import { IdInput } from './IdInput';
import { RefSelect } from './RefSelect';
import { RichTextArea } from './RichTextArea';
import { Field, Group, IconButton, move, NumberInput, Segmented } from './ui';

// "기본 설정" 탭: 게임 정보, 파라미터(플레이어 화면 상단), 상단 표시(모바일 미리보기), 소지품·능력, 테마

const SHOW_OPTIONS: { value: ParamShow; label: string; title: string }[] = [
  { value: 'pinned', label: '상단 고정', title: '상단에 항상 보입니다' },
  { value: 'panel', label: '펼치면 보임', title: '플레이어가 상단을 눌러 펼쳤을 때만 보입니다' },
  { value: 'hidden', label: '숨김', title: '플레이어에게 보이지 않습니다 (조건/효과에만 사용)' },
];

const DISPLAY_OPTIONS: { value: StatDisplay; label: string }[] = [
  { value: 'bar', label: '막대' },
  { value: 'cells', label: '칸' },
  { value: 'number', label: '숫자' },
];

function GameInfoSection() {
  const { content, update } = useEditor();
  return (
    <section className="card">
      <h3 className="card-title">게임 정보</h3>
      <div className="row wrap">
        <Field label="제목">
          <input value={content.meta.title} onChange={(e) => update((d) => void (d.meta.title = e.target.value), 'meta:title')} />
        </Field>
        <Field label="부제">
          <input value={content.meta.subtitle} onChange={(e) => update((d) => void (d.meta.subtitle = e.target.value), 'meta:subtitle')} />
        </Field>
      </div>
      <Field label="도입부" hint="타이틀 화면에 표시">
        <RichTextArea value={content.meta.intro} onChange={(v) => update((d) => void (d.meta.intro = v), 'meta:intro')} />
      </Field>
    </section>
  );
}

function ParamCard({ p, index, count, refs }: { p: ParamDef; index: number; count: number; refs: Loc[] }) {
  const { content, update } = useEditor();
  const edit = (fn: (d: ParamDef) => void, key?: string) =>
    update((draft) => {
      const target = draft.params[index];
      if (target) fn(target);
    }, key);

  const changeKind = (kind: ParamKind) => {
    if (kind === p.kind) return;
    if (refs.length && !window.confirm(`'${p.name || p.id}'는 ${refs.length}곳에서 사용 중입니다. 종류를 바꾸면 그곳이 오류로 표시됩니다. 바꿀까요?`)) return;
    update((d) => void (d.params[index] = { ...createParam(kind, p.id, p.name), show: p.show }));
  };

  const setPart = (part: keyof DateParts, on: boolean) => edit((d) => void (d.kind === 'date' && (d.parts[part] = on)));

  return (
    <div className={`param-card kind-${p.kind}`}>
      <div className="param-head">
        <select className="param-kind" value={p.kind} onChange={(e) => changeKind(e.target.value as ParamKind)} title="종류">
          {(Object.keys(PARAM_KIND_LABELS) as ParamKind[]).map((k) => (
            <option key={k} value={k}>
              {PARAM_KIND_LABELS[k]}
            </option>
          ))}
        </select>
        <IdInput
          value={p.id}
          onCommit={(to) => {
            if (!to) return 'id를 입력하세요';
            if (content.params.some((x) => x.id === to)) return '이미 있는 id입니다';
            update((d) => {
              d.params[index].id = to;
              renameReferences(d, 'param', p.id, to);
            });
            return null;
          }}
        />
        <input className="param-name" value={p.name} placeholder="이름 (플레이어에게 보임)" onChange={(e) => edit((d) => void (d.name = e.target.value), `param:${index}:name`)} />
        <Segmented value={p.show} options={SHOW_OPTIONS} onChange={(show) => edit((d) => void (d.show = show))} />
        <Usage refs={refs} />
        <span className="param-tools">
          <IconButton title="위로" onClick={() => update((d) => move(d.params, index, -1))} disabled={index === 0}>
            ↑
          </IconButton>
          <IconButton title="아래로" onClick={() => update((d) => move(d.params, index, 1))} disabled={index === count - 1}>
            ↓
          </IconButton>
          <IconButton
            title="삭제"
            danger
            onClick={() => {
              const msg = refs.length
                ? `'${p.name || p.id}'는 ${refs.length}곳에서 사용 중입니다. 삭제하면 해당 조건/효과가 오류로 표시됩니다. 삭제할까요?`
                : `'${p.name || p.id}'를 삭제할까요?`;
              if (window.confirm(msg)) update((d) => void d.params.splice(index, 1));
            }}
          >
            ✕
          </IconButton>
        </span>
      </div>

      <div className="row wrap param-values">
        {p.kind === 'stat' && (
          <>
            <Field label="시작 값">
              <NumberInput value={p.value} min={0} onChange={(v) => edit((d) => void (d.kind === 'stat' && (d.value = v ?? 0)), `param:${index}:value`)} />
            </Field>
            <Group label="최대값" hint="없으면 상한 없이 늘어남">
              <span className="inline">
                <input
                  type="checkbox"
                  checked={p.max != null}
                  title="최대값 사용"
                  onChange={(e) => edit((d) => void (d.kind === 'stat' && (d.max = e.target.checked ? Math.max(d.value, 1) : null)))}
                />
                {p.max != null ? (
                  <NumberInput value={p.max} min={0} onChange={(v) => edit((d) => void (d.kind === 'stat' && (d.max = v ?? 0)), `param:${index}:max`)} />
                ) : (
                  <span className="muted">없음</span>
                )}
              </span>
            </Group>
            <Group label="단위" hint="숫자 뒤에 붙음">
              <span className="inline">
                <input
                  type="checkbox"
                  checked={p.unit != null}
                  title="단위 사용"
                  onChange={(e) => edit((d) => void (d.kind === 'stat' && (d.unit = e.target.checked ? '' : null)))}
                />
                {p.unit != null ? (
                  <input
                    className="unit-input"
                    value={p.unit}
                    maxLength={8}
                    placeholder="예: 원, %, kg"
                    onChange={(e) => edit((d) => void (d.kind === 'stat' && (d.unit = e.target.value)), `param:${index}:unit`)}
                  />
                ) : (
                  <span className="muted">없음</span>
                )}
              </span>
            </Group>
            <Group label="표시">
              <Segmented
                value={p.max == null ? 'number' : p.display}
                options={DISPLAY_OPTIONS.map((o) => ({ ...o, title: o.value !== 'number' && p.max == null ? '최대값이 있어야 합니다' : undefined }))}
                onChange={(display) => edit((d) => void (d.kind === 'stat' && (d.display = display)))}
              />
            </Group>
            <Field label="0이 되면">
              <select value={p.zeroEnding ?? ''} onChange={(e) => edit((d) => void (d.kind === 'stat' && (d.zeroEnding = e.target.value || null)))}>
                <option value="">아무 일 없음</option>
                {content.endings.map((e) => (
                  <option key={e.id} value={e.id}>
                    엔딩: {e.title || e.id}
                  </option>
                ))}
                {p.zeroEnding && !content.endings.some((e) => e.id === p.zeroEnding) && <option value={p.zeroEnding}>⚠ {p.zeroEnding} (없음)</option>}
              </select>
            </Field>
            <label className="check" title="시작 최대값의 40% 이하면 화면 가장자리가 어두워지고, 20% 이하면 글이 흔들립니다">
              <input type="checkbox" checked={p.mood} onChange={(e) => edit((d) => void (d.kind === 'stat' && (d.mood = e.target.checked)))} />
              낮아지면 화면이 어두워지고 흔들림
            </label>
          </>
        )}
        {p.kind === 'text' && (
          <Field label="시작 값" hint="짧은 글 (예: 평온, 중독)">
            <input value={p.value} onChange={(e) => edit((d) => void (d.kind === 'text' && (d.value = e.target.value)), `param:${index}:value`)} />
          </Field>
        )}
        {p.kind === 'date' && (
          <>
            <Field label="시작 날짜">
              <input type="date" value={p.value} onChange={(e) => e.target.value && edit((d) => void (d.kind === 'date' && (d.value = e.target.value)))} />
            </Field>
            <Group label="보여줄 정보">
              <span className="date-parts">
                {(Object.keys(DATE_PART_LABELS) as (keyof DateParts)[]).map((part) => (
                  <label key={part} className="check">
                    <input type="checkbox" checked={p.parts[part]} onChange={(e) => setPart(part, e.target.checked)} />
                    {DATE_PART_LABELS[part]}
                  </label>
                ))}
              </span>
            </Group>
            <Group label="화면에는">
              <span className={`date-sample ${Object.values(p.parts).some(Boolean) ? '' : 'warn-text'}`}>
                {Object.values(p.parts).some(Boolean) ? formatDate(p.value, p.parts) : '하나 이상 고르세요'}
              </span>
            </Group>
          </>
        )}
      </div>
    </div>
  );
}

function ParamsSection() {
  const { content, update } = useEditor();
  const refs = useMemo(() => collectReferences(content), [content]);
  const add = (kind: ParamKind) =>
    update((d) => {
      const name = kind === 'stat' ? '새 수치' : kind === 'text' ? '상태' : '날짜';
      d.params.push(createParam(kind, makeUniqueId('', d.params.map((p) => p.id), kind), name));
    });
  return (
    <section className="card">
      <h3 className="card-title">
        파라미터 <span className="help">플레이어 화면 상단에 보이는 정보. 효과로 바꾸고 조건으로 검사합니다.</span>
      </h3>
      {content.params.length === 0 && <p className="help">파라미터가 없습니다. 상단에는 메뉴 버튼만 보입니다.</p>}
      {content.params.map((p, i) => (
        <ParamCard key={i} p={p} index={i} count={content.params.length} refs={refs.get(`param:${p.id}`) ?? []} />
      ))}
      <div className="row">
        <button type="button" className="link-btn" onClick={() => add('stat')} title="체력, 정신력, 돈 등 숫자 (최대값을 둘 수 있음)">
          + 수치
        </button>
        <button type="button" className="link-btn" onClick={() => add('text')} title="중독, 평온처럼 짧은 글">
          + 상태
        </button>
        <button type="button" className="link-btn" onClick={() => add('date')} title="이야기 속 날짜. 효과로 며칠씩 넘길 수 있음">
          + 캘린더
        </button>
      </div>
    </section>
  );
}

/** 실제 게임의 상단을 휴대폰 폭(375px)으로 그린다. 눌러서 펼쳐 볼 수도 있다 */
function MobileHudPreview() {
  const { content } = useEditor();
  const state = useMemo(() => createInitialState(content, 1), [content]);
  const { background, text } = content.theme;
  return (
    <div className={`game-colors mobile-preview${isLightColor(background) ? ' theme-light' : ''}`} style={{ '--bg': background, '--text': text } as CSSProperties}>
      <Hud content={content} state={state} onMenu={() => {}} />
      <div className="mobile-preview-body" aria-hidden>
        <p>안개 속에서 무언가가 당신의 이름을 부른다.</p>
        <p>바다 쪽에서 젖은 발소리가 가까워진다.</p>
      </div>
    </div>
  );
}

const ZONES: { show: ParamShow; label: string; help: string }[] = [
  { show: 'pinned', label: '상단 고정', help: '접혀 있어도 보임 (두 줄까지)' },
  { show: 'panel', label: '펼치면 보임', help: '상단을 눌러 펼쳤을 때만' },
  { show: 'hidden', label: '숨김', help: '플레이어에게 보이지 않음' },
];

/**
 * 상단 표시 배치: 파라미터를 마우스로 끌어 칸(상단 고정/펼치면 보임/숨김) 사이를 옮기거나 순서를 바꾼다.
 * 순서는 파라미터 목록 순서 = 상단과 펼친 목록에 보이는 순서
 */
function HudArrange() {
  const { content, update } = useEditor();
  const [dragId, setDragId] = useState<string | null>(null);
  /** 놓을 자리: 그 칸에서 before 앞 (null = 맨 끝) */
  const [target, setTarget] = useState<{ show: ParamShow; before: string | null } | null>(null);

  const moveParam = (id: string, show: ParamShow, before: string | null) => {
    if (before === id) return;
    update((d) => {
      const from = d.params.findIndex((p) => p.id === id);
      if (from === -1) return;
      const [p] = d.params.splice(from, 1);
      p.show = show;
      let at = before ? d.params.findIndex((x) => x.id === before) : -1;
      if (at === -1) {
        // 그 칸의 맨 끝: 같은 칸 마지막 항목 바로 뒤 (칸이 비었으면 목록 끝)
        const last = d.params.reduce((found, x, i) => (x.show === show ? i : found), -1);
        at = last === -1 ? d.params.length : last + 1;
      }
      d.params.splice(at, 0, p);
    });
  };

  const end = () => {
    setDragId(null);
    setTarget(null);
  };

  return (
    <div className="hud-arrange">
      {ZONES.map((zone) => {
        const items = content.params.filter((p) => p.show === zone.show);
        const isTarget = !!dragId && target?.show === zone.show;
        const mark = (before: string | null) => isTarget && target!.before === before && <span className="drop-mark" aria-hidden />;
        return (
          <div
            key={zone.show}
            className={`arrange-zone zone-${zone.show} ${isTarget ? 'over' : ''}`}
            onDragOver={(e) => {
              if (!dragId) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              // 칩 위(칩이 먼저 처리하고 멈춤)가 아니면 칸의 맨 끝
              setTarget((t) => (t?.show === zone.show && t.before === null ? t : { show: zone.show, before: null }));
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (dragId && target) moveParam(dragId, target.show, target.before);
              end();
            }}
          >
            <div className="arrange-zone-head">
              <b>{zone.label}</b> <span className="help">{zone.help}</span>
            </div>
            <div className="arrange-items">
              {items.map((p, i) => (
                <span key={`${p.id}:${i}`} className="arrange-slot">
                  {mark(p.id)}
                  <span
                    className={`arrange-chip kind-${p.kind} ${dragId === p.id ? 'dragging' : ''}`}
                    draggable
                    title="끌어서 옮기기"
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', p.id);
                      e.dataTransfer.effectAllowed = 'move';
                      setDragId(p.id);
                    }}
                    onDragEnd={end}
                    onDragOver={(e) => {
                      if (!dragId) return;
                      e.preventDefault();
                      e.stopPropagation();
                      // 칩의 왼쪽 절반이면 그 앞, 오른쪽 절반이면 그 뒤(= 다음 칩 앞)
                      const r = e.currentTarget.getBoundingClientRect();
                      const before = e.clientX > r.left + r.width / 2 ? (items[i + 1]?.id ?? null) : p.id;
                      setTarget((t) => (t?.show === zone.show && t.before === before ? t : { show: zone.show, before }));
                    }}
                  >
                    <span className="grip" aria-hidden>
                      ⠿
                    </span>
                    {p.name || p.id}
                    <span className="arrange-kind">{PARAM_KIND_LABELS[p.kind]}</span>
                  </span>
                </span>
              ))}
              {mark(null)}
              {items.length === 0 && <span className="arrange-empty">여기로 끌어 놓기</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function HudSection() {
  const { content, update } = useEditor();
  const { hud } = content.ui;
  return (
    <section className="card">
      <h3 className="card-title">
        상단 표시 <span className="help">정보가 많으면 일부(또는 문구)만 보이고, 플레이어가 눌러서 모두 펼쳐 봅니다.</span>
      </h3>
      <div className="hud-settings">
        <div className="hud-settings-form">
          <Group label="접혀 있을 때">
            <Segmented
              value={hud.summary}
              options={[
                { value: 'pinned', label: '"상단 고정" 파라미터' },
                { value: 'text', label: '문구만' },
              ]}
              onChange={(summary) => update((d) => void (d.ui.hud.summary = summary))}
            />
          </Group>
          {hud.summary === 'text' && (
            <Field label="문구">
              <input value={hud.text} placeholder="예: 탐사자 상태" onChange={(e) => update((d) => void (d.ui.hud.text = e.target.value), 'ui:hud:text')} />
            </Field>
          )}
          <Group label="배치" hint="끌어서 옮기기 · 순서도 바꿀 수 있음">
            <HudArrange />
          </Group>
          <p className="help">
            상단 고정 파라미터는 두 줄까지 보이고, 넘치는 것은 겹치지 않게 숨긴 뒤 <b>+N</b>으로 알려줍니다. "펼치면 보임" 파라미터가 있거나 넘치는 것이
            있으면 플레이어가 상단을 눌러 모두 볼 수 있습니다.
          </p>
        </div>
        <div className="mobile-preview-wrap">
          <span className="field-label">휴대폰 화면 미리보기 (폭 375px) · 눌러서 펼쳐 보기</span>
          <MobileHudPreview />
        </div>
      </div>
    </section>
  );
}

function ShelfSection({ kind, title }: { kind: 'items' | 'traits'; title: string }) {
  const { content, update } = useEditor();
  const s: ShelfSettings = content.ui[kind];
  return (
    <div className={`subsection shelf ${s.show ? '' : 'off'}`}>
      <div className="row wrap shelf-row">
        <label className="check">
          <input type="checkbox" checked={s.show} onChange={(e) => update((d) => void (d.ui[kind].show = e.target.checked))} />
          {title} 보여주기
        </label>
        <Field label="이름">
          <input value={s.label} disabled={!s.show} onChange={(e) => update((d) => void (d.ui[kind].label = e.target.value), `ui:${kind}:label`)} />
        </Field>
        <Field label="비어 있을 때">
          <input className="wide-input" value={s.empty} disabled={!s.show} onChange={(e) => update((d) => void (d.ui[kind].empty = e.target.value), `ui:${kind}:empty`)} />
        </Field>
      </div>
      {kind === 'items' ? (
        <div className="start-list">
          <span className="field-label">시작 {title}</span>
          {content.start.items.map((it, i) => (
            <div key={i} className="row">
              <RefSelect kind="item" value={it.id} onChange={(id) => update((d) => void (d.start.items[i].id = id))} />
              <NumberInput value={it.count} min={1} width={44} onChange={(v) => update((d) => void (d.start.items[i].count = v ?? 1))} />
              <span className="unit">개</span>
              <IconButton title="삭제" danger onClick={() => update((d) => void d.start.items.splice(i, 1))}>
                ✕
              </IconButton>
            </div>
          ))}
          <button type="button" className="link-btn" onClick={() => update((d) => void d.start.items.push({ id: content.items[0]?.id ?? '', count: 1 }))}>
            + 시작 아이템
          </button>
        </div>
      ) : (
        <div className="start-list">
          <span className="field-label">시작 {title}</span>
          {content.start.traits.map((t, i) => (
            <div key={i} className="row">
              <RefSelect kind="trait" value={t} onChange={(id) => update((d) => void (d.start.traits[i] = id))} />
              <IconButton title="삭제" danger onClick={() => update((d) => void d.start.traits.splice(i, 1))}>
                ✕
              </IconButton>
            </div>
          ))}
          <button type="button" className="link-btn" onClick={() => update((d) => void d.start.traits.push(content.traits[0]?.id ?? ''))}>
            + 시작 능력
          </button>
        </div>
      )}
    </div>
  );
}

function SwatchRow({ value, palette, onChange }: { value: string; palette: Swatch[]; onChange: (v: string) => void }) {
  return (
    <div className="swatches" role="radiogroup">
      {palette.map((s) => (
        <button
          key={s.value}
          type="button"
          role="radio"
          aria-checked={s.value.toLowerCase() === value.toLowerCase()}
          className={`swatch ${s.value.toLowerCase() === value.toLowerCase() ? 'active' : ''}`}
          style={{ background: s.value }}
          title={`${s.label} ${s.value}`}
          onClick={() => onChange(s.value)}
        >
          <span>{s.label}</span>
        </button>
      ))}
    </div>
  );
}

function ThemeSection() {
  const { content, update } = useEditor();
  const { theme } = content;
  const ratio = contrastRatio(theme.background, theme.text);
  return (
    <section className="card">
      <h3 className="card-title">
        테마 <span className="help">이야기의 배경색과 기본 글자색. 플레이어는 메뉴에서 화이트/다크 모드로 바꿀 수도 있습니다.</span>
      </h3>
      <div className="subsection-title">배경색</div>
      <SwatchRow value={theme.background} palette={BACKGROUND_PALETTE} onChange={(v) => update((d) => void (d.theme.background = v))} />
      <div className="subsection-title">글자색</div>
      <SwatchRow value={theme.text} palette={TEXT_PALETTE} onChange={(v) => update((d) => void (d.theme.text = v))} />
      <label className={`check variable-option ${theme.variable ? 'on' : ''}`}>
        <input type="checkbox" checked={theme.variable} onChange={(e) => update((d) => void (d.theme.variable = e.target.checked))} />
        <span>
          <b>가변 색상</b> — 이야기 도중 원하는 시점에 배경색과 글자색을 바꿀 수 있습니다. 켜면 결과/페이지 효과에 <b>"색 변경"</b>이 생깁니다. 위 색은
          시작 색입니다.
        </span>
      </label>
      <div className="theme-preview" style={{ background: theme.background, color: theme.text }}>
        <p>안개 속에서 무언가가 당신의 이름을 부른다.</p>
        <p style={{ opacity: 0.55 }}>— 대답하지 않는다</p>
      </div>
      <p className={ratio < 4.5 ? 'warn-text' : 'help'}>
        명암비 {ratio.toFixed(1)} : 1 {ratio < 3 ? '— 글이 잘 보이지 않습니다' : ratio < 4.5 ? '— 오래 읽기에는 조금 흐립니다' : ''}
      </p>
    </section>
  );
}

export function SettingsPanel() {
  return (
    <div className="panel">
      <GameInfoSection />
      <ParamsSection />
      <HudSection />
      <section className="card">
        <h3 className="card-title">
          소지품 · 능력 <span className="help">끄면 플레이어 화면 하단의 버튼과 획득/상실 알림이 아예 보이지 않습니다.</span>
        </h3>
        <ShelfSection kind="items" title="소지품" />
        <ShelfSection kind="traits" title="능력" />
        <p className="help">플래그 초기값은 "아이템·능력·플래그" 탭에서 정합니다.</p>
      </section>
      <ThemeSection />
    </div>
  );
}
