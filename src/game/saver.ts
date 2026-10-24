import type { RunState } from '../engine/types';
import { api } from '../shared/api';
import { STORAGE_KEYS, writeStorage } from '../shared/storage';

// 진행 저장. 일반 플레이는 서버(DB)에, 테스트 플레이는 브라우저에 저장한다.
// null을 저장하면 저장을 지운다 (엔딩 = 영구 죽음).

export interface RunSaver {
  save(state: RunState | null): void;
}

/** 서버 저장: 선택할 때마다 보내지 않고 잠깐 모았다가 보내며, 페이지를 떠날 때는 남은 것을 바로 보낸다 */
export function createRemoteSaver(storyId: string): RunSaver {
  let pending: RunState | null | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const flush = (keepalive = false) => {
    clearTimeout(timer);
    if (pending === undefined) return;
    const state = pending;
    pending = undefined;
    const request =
      state === null
        ? api(`/stories/${storyId}/save`, { method: 'DELETE', keepalive })
        : api(`/stories/${storyId}/save`, { method: 'PUT', body: { state }, keepalive });
    request.catch((err) => console.warn('진행 저장 실패:', err));
  };
  window.addEventListener('pagehide', () => flush(true));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush(true);
  });

  return {
    save(state) {
      pending = state;
      clearTimeout(timer);
      timer = setTimeout(() => flush(), state === null ? 0 : 700);
    },
  };
}

export interface PlaytestSave {
  /** 에디터에서 테스트 플레이를 새로 열 때마다 바뀌는 값 */
  token: string;
  state: RunState;
}

export function createPlaytestSaver(token: string): RunSaver {
  return {
    save(state) {
      writeStorage(STORAGE_KEYS.playtestRun, state ? ({ token, state } satisfies PlaytestSave) : null);
    },
  };
}
