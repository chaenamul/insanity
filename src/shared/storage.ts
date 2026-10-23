import { normalizeContent } from '../engine/content';
import type { GameContent } from '../engine/types';

// localStorage 키와 안전한 읽기/쓰기 (사생활 보호 모드 등에서 실패해도 동작하도록)

export const STORAGE_KEYS = {
  /** 에디터 → 테스트 플레이로 넘기는 작업 중 콘텐츠 */
  playtestContent: 'insanity.playtest.content',
  /** 일반 플레이 저장 */
  run: 'insanity.run',
  /** 테스트 플레이 저장 */
  playtestRun: 'insanity.playtest.run',
  /** 에디터 자동 백업 */
  editorDraft: 'insanity.editor.draft',
} as const;

export function readStorage<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeStorage(key: string, value: unknown): void {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 저장 공간 부족 등은 무시
  }
}

export function loadPlaytestContent(): GameContent | null {
  const raw = readStorage<unknown>(STORAGE_KEYS.playtestContent);
  return raw ? normalizeContent(raw) : null;
}
