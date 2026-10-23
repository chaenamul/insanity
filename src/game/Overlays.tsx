import type { ReactNode } from 'react';

// 화면 위에 겹쳐 열리는 패널. 닫혀 있을 때도 그려 두고 CSS 전환으로 여닫는다.

/** 아래에서 위로 올라오는 시트 */
export function Sheet({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className={`overlay sheet-layer ${open ? 'open' : ''}`} aria-hidden={!open}>
      <div className="overlay-backdrop" onClick={onClose} />
      <section className="sheet" role="dialog" aria-label={title}>
        <button type="button" className="sheet-grip" aria-label="닫기" onClick={onClose} />
        <header className="sheet-head">
          <h2>{title}</h2>
          <button type="button" className="overlay-close" aria-label="닫기" onClick={onClose}>
            ✕
          </button>
        </header>
        <div className="sheet-body">{children}</div>
      </section>
    </div>
  );
}

/** 왼쪽에서 열리는 메뉴 */
export function Drawer({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className={`overlay drawer-layer ${open ? 'open' : ''}`} aria-hidden={!open}>
      <div className="overlay-backdrop" onClick={onClose} />
      <nav className="drawer" aria-label={title}>
        <header className="drawer-head">
          <h2>{title}</h2>
          <button type="button" className="overlay-close" aria-label="닫기" onClick={onClose}>
            ✕
          </button>
        </header>
        <div className="drawer-body">{children}</div>
      </nav>
    </div>
  );
}
