import { useEffect, useState } from 'react';
import { api } from '../shared/api';
import type { StorySummary } from '../shared/api-types';
import { linkTo } from './router';

export function LibraryPage() {
  const [stories, setStories] = useState<StorySummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ stories: StorySummary[] }>('/stories')
      .then((r) => setStories(r.stories))
      .catch((err) => setError(err.message));
  }, []);

  if (error) return <p className="page-error">{error}</p>;
  if (!stories) return <p className="page-loading">불러오는 중…</p>;

  return (
    <>
      <h2 className="page-title">이야기</h2>
      {stories.length === 0 ? (
        <div className="empty">
          <p>아직 공개된 이야기가 없습니다.</p>
          <a className="btn" href="/create" onClick={linkTo('/create')}>
            제작자 화면에서 첫 이야기 만들기
          </a>
        </div>
      ) : (
        <ul className="story-grid">
          {stories.map((s) => (
            <li key={s.id}>
              <a className="story-card" href={`/play/${s.id}`}>
                <span className="story-title">{s.title}</span>
                {s.subtitle && <span className="story-subtitle">{s.subtitle}</span>}
                <span className="story-meta">
                  {s.authorName}
                  {s.hasSave && <span className="badge accent">이어하기</span>}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
