import { useMemo, useState } from 'react';
import { RichText } from '../markup/render';
import { Drawer } from './Overlays';
import { FONT_SIZES, THEME_MODES, TYPING_SPEEDS, type Settings } from './settings';
import { textCosts, useTypewriter } from './typing';

const SAMPLE = '안개 속에서 무언가가 당신의 이름을 부른다.';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  settings: Settings;
  onSettings: (patch: Partial<Settings>) => void;
  onTitle: () => void;
  /** 테스트 플레이/디버그 모드에서만 */
  debug?: { open: boolean; toggle: () => void };
}

/** 속도를 바꿀 때마다 예시 문장을 다시 타이핑해 보여준다 */
function TypingSample({ speed, replay }: { speed: number; replay: number }) {
  const costs = useMemo(() => textCosts(SAMPLE), []);
  const { shown, done } = useTypewriter(costs, TYPING_SPEEDS[speed].cps, `sample:${speed}:${replay}`);
  return <RichText className="font-sample" text={SAMPLE} reveal={done ? undefined : shown} />;
}

export function MenuDrawer({ open, onClose, title, settings, onSettings, onTitle, debug }: Props) {
  const size = FONT_SIZES[settings.fontSize];
  const speed = TYPING_SPEEDS[settings.typing];
  const [replay, setReplay] = useState(0);
  return (
    <Drawer open={open} title={title} onClose={onClose}>
      <section className="menu-section">
        <label className="menu-label" htmlFor="font-size">
          본문 글꼴 크기 <span className="menu-value">{size.label}</span>
        </label>
        <input
          id="font-size"
          className="menu-range"
          type="range"
          min={0}
          max={FONT_SIZES.length - 1}
          step={1}
          value={settings.fontSize}
          onChange={(e) => onSettings({ fontSize: Number(e.target.value) })}
        />
        <div className="range-ticks" aria-hidden>
          {FONT_SIZES.map((f, i) => (
            <span key={f.label} className={i === settings.fontSize ? 'active' : ''}>
              {f.label}
            </span>
          ))}
        </div>
        <p className="font-sample" style={{ fontSize: size.px }}>
          {SAMPLE}
        </p>
      </section>

      <section className="menu-section">
        <label className="menu-label" htmlFor="typing-speed">
          글자 나오는 속도 <span className="menu-value">{speed.label}</span>
        </label>
        <input
          id="typing-speed"
          className="menu-range"
          type="range"
          min={0}
          max={TYPING_SPEEDS.length - 1}
          step={1}
          value={settings.typing}
          onChange={(e) => onSettings({ typing: Number(e.target.value) })}
        />
        <div className="range-ticks" aria-hidden>
          {TYPING_SPEEDS.map((t, i) => (
            <span key={t.label} className={i === settings.typing ? 'active' : ''}>
              {t.label}
            </span>
          ))}
        </div>
        {open && (
          <div className="typing-sample" style={{ fontSize: size.px }}>
            <TypingSample speed={settings.typing} replay={replay} />
            <button type="button" className="replay-btn" onClick={() => setReplay((n) => n + 1)} title="다시 보기" aria-label="예시 다시 보기">
              ↻
            </button>
          </div>
        )}
        <p className="menu-hint-text">글이 나오는 중에 화면을 누르면 바로 모두 보입니다.</p>
      </section>

      <section className="menu-section">
        <div className="menu-label">화면 테마</div>
        <div className="menu-segmented" role="radiogroup" aria-label="화면 테마">
          {THEME_MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              role="radio"
              aria-checked={settings.theme === m.value}
              className={settings.theme === m.value ? 'active' : ''}
              onClick={() => onSettings({ theme: m.value })}
            >
              {m.label}
            </button>
          ))}
        </div>
      </section>

      <section className="menu-section">
        <button type="button" className="menu-item" onClick={onTitle}>
          타이틀 화면으로
        </button>
        <a className="menu-item" href="/">
          이야기 목록으로
        </a>
        {debug && (
          <button type="button" className="menu-item" onClick={debug.toggle}>
            디버그 패널 {debug.open ? '닫기' : '열기'} <span className="menu-hint">` 키</span>
          </button>
        )}
      </section>
      <p className="menu-note">진행 상황은 자동으로 저장됩니다.</p>
    </Drawer>
  );
}
