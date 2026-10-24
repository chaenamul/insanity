import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';

// 스크롤 영역 + "더 있음" 표시. 스크롤이 남은 쪽(위/아래)에 페이드 그라데이션과 작은 화살표가 나타난다.
// 화살표를 누르면 그쪽으로 한 화면 가까이 스크롤한다.

export function ScrollArea({
  className,
  scrollRef,
  children,
}: {
  className: string;
  /** 바깥에서 스크롤 위치를 조절해야 할 때 */
  scrollRef?: RefObject<HTMLDivElement | null>;
  children: ReactNode;
}) {
  const ownRef = useRef<HTMLDivElement>(null);
  const ref = scrollRef ?? ownRef;
  const contentRef = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState({ up: false, down: false });

  useLayoutEffect(() => {
    const el = ref.current;
    const content = contentRef.current;
    if (!el || !content) return;
    const update = () => {
      const up = el.scrollTop > 2;
      const down = el.scrollTop + el.clientHeight < el.scrollHeight - 2;
      setMore((m) => (m.up === up && m.down === down ? m : { up, down }));
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    // 영역 크기(화면 회전, 선택지 수 변화)나 내용 길이가 바뀔 때도 다시 계산
    const ro = new ResizeObserver(update);
    ro.observe(el);
    ro.observe(content);
    return () => {
      el.removeEventListener('scroll', update);
      ro.disconnect();
    };
  }, [ref]);

  const scrollBy = (dir: 1 | -1) => {
    const el = ref.current;
    if (el) el.scrollBy({ top: dir * el.clientHeight * 0.75, behavior: 'smooth' });
  };

  return (
    <div className={`scroll-frame ${className}-frame`}>
      <div ref={ref} className={`scroll-area ${className}`}>
        <div ref={contentRef}>{children}</div>
      </div>
      <div className={`scroll-hint up ${more.up ? 'show' : ''}`} aria-hidden>
        <button type="button" tabIndex={-1} onClick={() => scrollBy(-1)} />
      </div>
      <div className={`scroll-hint down ${more.down ? 'show' : ''}`} aria-hidden>
        <button type="button" tabIndex={-1} onClick={() => scrollBy(1)} />
      </div>
    </div>
  );
}
