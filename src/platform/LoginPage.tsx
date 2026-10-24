import { useState, type FormEvent } from 'react';
import { api } from '../shared/api';
import type { User } from '../shared/api-types';
import { PLATFORM_NAME } from './brand';

export function LoginPage({ onLogin }: { onLogin: (user: User) => void }) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ user: User }>(mode === 'login' ? '/auth/login' : '/auth/signup', {
        method: 'POST',
        body: mode === 'login' ? { email, password } : { email, password, displayName },
      });
      onLogin(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={submit}>
        <h1>{PLATFORM_NAME}</h1>
        <p className="login-sub">선택이 이야기가 되는 곳</p>
        <div className="login-tabs">
          <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>
            로그인
          </button>
          <button type="button" className={mode === 'signup' ? 'active' : ''} onClick={() => setMode('signup')}>
            회원가입
          </button>
        </div>
        <label>
          이메일
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        {mode === 'signup' && (
          <label>
            이름 <span className="hint">다른 사람에게 보이는 작가 이름</span>
            <input autoComplete="nickname" required maxLength={30} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </label>
        )}
        <label>
          비밀번호 {mode === 'signup' && <span className="hint">8자 이상</span>}
          <input
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            required
            minLength={mode === 'signup' ? 8 : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && <p className="form-error">{error}</p>}
        <button type="submit" className="btn primary wide" disabled={busy}>
          {busy ? '…' : mode === 'login' ? '로그인' : '가입하고 시작하기'}
        </button>
      </form>
    </div>
  );
}
