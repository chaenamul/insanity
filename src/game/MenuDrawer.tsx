import { Drawer } from './Overlays';
import { FONT_SIZES, type Settings } from './settings';

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

export function MenuDrawer({ open, onClose, title, settings, onSettings, onTitle, debug }: Props) {
  const size = FONT_SIZES[settings.fontSize];
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
          안개 속에서 무언가가 당신의 이름을 부른다.
        </p>
      </section>

      <section className="menu-section">
        <button type="button" className="menu-item" onClick={onTitle}>
          타이틀 화면으로
        </button>
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
