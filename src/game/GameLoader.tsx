import { useEffect, useState } from 'react';
import { isStateCompatible, newRun } from '../engine/run';
import type { GameContent, RunState } from '../engine/types';
import { api, ApiError, idFromPath, redirectToLogin } from '../shared/api';
import type { PlayStoryResponse, SaveResponse } from '../shared/api-types';
import { loadPlaytestContent, readStorage, STORAGE_KEYS } from '../shared/storage';
import { GameApp } from './GameApp';
import { createPlaytestSaver, createRemoteSaver, type PlaytestSave, type RunSaver } from './saver';

// /play/<이야기 id>            서버에서 공개본과 내 저장을 불러온다
// /play/<id>?playtest=<토큰>   에디터가 브라우저에 넘겨준 작업 중 내용으로 테스트 플레이

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; content: GameContent; saver: RunSaver; savedRun: RunState | null; initialRun: RunState | null; isPlaytest: boolean };

export function GameLoader() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    const storyId = idFromPath();
    const params = new URLSearchParams(location.search);
    const token = params.get('playtest');

    if (token != null) {
      const content = loadPlaytestContent();
      if (!content) {
        setState({ status: 'error', message: '테스트할 내용이 없습니다. 에디터에서 ▶ 테스트 플레이를 다시 눌러 주세요.' });
        return;
      }
      // 같은 테스트 탭을 새로고침하면 이어서, 에디터에서 새로 열면 처음부터
      const saved = readStorage<PlaytestSave>(STORAGE_KEYS.playtestRun);
      const resumed = saved && saved.token === token && isStateCompatible(content, saved.state) ? saved.state : null;
      setState({
        status: 'ready',
        content,
        saver: createPlaytestSaver(token),
        savedRun: null,
        initialRun: resumed ?? newRun(content, { startEncounterId: params.get('start') ?? undefined }),
        isPlaytest: true,
      });
      return;
    }

    Promise.all([api<PlayStoryResponse>(`/stories/${storyId}`), api<SaveResponse>(`/stories/${storyId}/save`)])
      .then(([story, save]) => {
        document.title = story.content.meta.title || document.title;
        setState({
          status: 'ready',
          content: story.content,
          saver: createRemoteSaver(storyId),
          savedRun: save.state,
          initialRun: null,
          isPlaytest: false,
        });
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) redirectToLogin();
        else setState({ status: 'error', message: err instanceof Error ? err.message : String(err) });
      });
  }, []);

  if (state.status === 'loading') return <div className="title-screen" />;
  if (state.status === 'error') {
    return (
      <div className="title-screen">
        <div className="title-card">
          <p className="load-error">{state.message}</p>
          <a className="btn" href="/">
            이야기 목록으로
          </a>
        </div>
      </div>
    );
  }
  return (
    <GameApp
      initialContent={state.content}
      saver={state.saver}
      savedRun={state.savedRun}
      initialRun={state.initialRun}
      isPlaytest={state.isPlaytest}
    />
  );
}
