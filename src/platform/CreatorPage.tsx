import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '../shared/api';
import type { EditStoryInfo, MyStorySummary } from '../shared/api-types';
import { timeAgo } from './router';

function status(s: MyStorySummary): { label: string; tone: string } {
  if (!s.isPublished) return { label: '초안', tone: '' };
  if (s.hasUnpublishedChanges) return { label: '공개 중 · 미반영 수정 있음', tone: 'warn' };
  return { label: '공개 중', tone: 'accent' };
}

export function CreatorPage() {
  const [stories, setStories] = useState<MyStorySummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () =>
    api<{ stories: MyStorySummary[] }>('/my/stories')
      .then((r) => setStories(r.stories))
      .catch((err) => setError(err.message));
  useEffect(() => {
    load();
  }, []);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { id } = await api<{ id: string }>('/my/stories', { method: 'POST', body: { title } });
      location.href = `/edit/${id}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  const act = async (s: MyStorySummary, action: 'publish' | 'unpublish' | 'delete') => {
    if (action === 'delete' && !window.confirm(`'${s.title}'을(를) 삭제할까요? 되돌릴 수 없고, 플레이어들의 진행 저장도 함께 지워집니다.`)) return;
    if (action === 'unpublish' && !window.confirm(`'${s.title}'을(를) 비공개로 돌릴까요? 플레이어 목록에서 사라집니다.`)) return;
    try {
      if (action === 'delete') await api(`/my/stories/${s.id}`, { method: 'DELETE' });
      else await api<{ story: EditStoryInfo }>(`/my/stories/${s.id}/${action}`, { method: 'POST' });
      await load();
    } catch (err) {
      const issues = err instanceof ApiError && err.body.issues ? `\n\n${err.body.issues.join('\n')}` : '';
      window.alert(`${err instanceof Error ? err.message : String(err)}${issues}`);
    }
  };

  if (error) return <p className="page-error">{error}</p>;
  if (!stories) return <p className="page-loading">불러오는 중…</p>;

  return (
    <>
      <h2 className="page-title">내 이야기</h2>
      <form className="new-story" onSubmit={create}>
        <input placeholder="새 이야기 제목" maxLength={100} value={title} onChange={(e) => setTitle(e.target.value)} />
        <button type="submit" className="btn primary" disabled={busy}>
          + 새 이야기
        </button>
      </form>
      {stories.length === 0 ? (
        <div className="empty">
          <p>아직 만든 이야기가 없습니다. 제목을 정하고 새 이야기를 만들어 보세요.</p>
        </div>
      ) : (
        <ul className="my-stories">
          {stories.map((s) => {
            const st = status(s);
            return (
              <li key={s.id} className="my-story">
                <a className="my-story-main" href={`/edit/${s.id}`}>
                  <span className="story-title">{s.title}</span>
                  {s.subtitle && <span className="story-subtitle">{s.subtitle}</span>}
                  <span className="story-meta">
                    <span className={`badge ${st.tone}`}>{st.label}</span>
                    인카운터 {s.encounterCount}개 · {timeAgo(s.updatedAt)} 수정
                  </span>
                </a>
                <div className="my-story-actions">
                  <a className="btn primary" href={`/edit/${s.id}`}>
                    편집
                  </a>
                  {(!s.isPublished || s.hasUnpublishedChanges) && (
                    <button type="button" className="btn" onClick={() => act(s, 'publish')}>
                      {s.isPublished ? '수정 사항 공개' : '공개하기'}
                    </button>
                  )}
                  {s.isPublished && (
                    <>
                      <a className="btn" href={`/play/${s.id}`}>
                        플레이
                      </a>
                      <button type="button" className="btn" onClick={() => act(s, 'unpublish')}>
                        비공개로
                      </button>
                    </>
                  )}
                  <button type="button" className="btn danger" onClick={() => act(s, 'delete')}>
                    삭제
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
