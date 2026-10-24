import { useEffect, useState } from 'react';
import { api } from '../shared/api';
import type { User } from '../shared/api-types';
import { CreatorPage } from './CreatorPage';
import { LibraryPage } from './LibraryPage';
import { PLATFORM_NAME } from './brand';
import { LoginPage } from './LoginPage';
import { linkTo, navigate, usePath } from './router';

// /          플레이어: 공개된 이야기 목록
// /create    제작자: 내 이야기 목록
// /login     로그인/회원가입 (로그인하지 않았으면 어느 주소든 여기로)

export function PlatformApp() {
  const path = usePath();
  const [user, setUser] = useState<User | null | undefined>(undefined);

  useEffect(() => {
    api<{ user: User | null }>('/auth/me')
      .then((r) => setUser(r.user))
      .catch(() => setUser(null));
  }, []);

  useEffect(() => {
    if (user === null && path !== '/login') {
      navigate(`/login?next=${encodeURIComponent(location.pathname + location.search)}`, true);
    }
  }, [user, path]);

  const onLogin = (u: User) => {
    setUser(u);
    const next = new URLSearchParams(location.search).get('next');
    // 다른 사이트로 넘어가지 않도록 같은 사이트 경로만
    const target = next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
    if (target.startsWith('/play/') || target.startsWith('/edit/')) location.href = target;
    else navigate(target, true);
  };

  const logout = async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    setUser(null);
  };

  if (user === undefined) return <div className="boot" />;
  if (!user) return <LoginPage onLogin={onLogin} />;

  const creator = path.startsWith('/create');
  return (
    <div className="platform">
      <header className="top">
        <a className="brand" href="/" onClick={linkTo('/')}>
          {PLATFORM_NAME}
        </a>
        <span className="mode">{creator ? '제작자' : '플레이어'}</span>
        <span className="spacer" />
        {creator ? (
          <a className="btn" href="/" onClick={linkTo('/')}>
            플레이어 화면
          </a>
        ) : (
          <a className="btn" href="/create" onClick={linkTo('/create')}>
            제작자 화면
          </a>
        )}
        <details className="account">
          <summary aria-label="계정">{user.displayName.slice(0, 1)}</summary>
          <div className="account-menu">
            <div className="account-name">{user.displayName}</div>
            <div className="account-email">{user.email}</div>
            <button type="button" className="btn" onClick={logout}>
              로그아웃
            </button>
          </div>
        </details>
      </header>
      <main className="content">{creator ? <CreatorPage /> : <LibraryPage />}</main>
    </div>
  );
}
