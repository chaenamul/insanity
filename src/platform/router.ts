import { useEffect, useState, type MouseEvent } from 'react';

// 플랫폼 화면(/, /create, /login) 안에서의 이동. 게임(/play)과 에디터(/edit)는 별도 페이지라 일반 링크로 이동한다.

const EVENT = 'insanity:navigate';

export function navigate(to: string, replace = false): void {
  if (replace) history.replaceState(null, '', to);
  else history.pushState(null, '', to);
  window.dispatchEvent(new Event(EVENT));
}

export function usePath(): string {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => {
    const update = () => setPath(location.pathname);
    window.addEventListener('popstate', update);
    window.addEventListener(EVENT, update);
    return () => {
      window.removeEventListener('popstate', update);
      window.removeEventListener(EVENT, update);
    };
  }, []);
  return path;
}

/** <a onClick={linkTo('/create')}> — 새 탭 열기(Ctrl/⌘ 클릭)는 그대로 둔다 */
export function linkTo(to: string) {
  return (e: MouseEvent) => {
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    navigate(to);
  };
}

export function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return '방금';
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}일 전`;
  return new Date(iso).toLocaleDateString();
}
