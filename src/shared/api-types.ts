import type { GameContent, RunState } from '../engine/types';

// 서버 API 응답 형식 (server/와 브라우저가 함께 쓴다)

export interface User {
  id: string;
  email: string;
  displayName: string;
}

/** 플레이어 목록에 보이는 공개 이야기 */
export interface StorySummary {
  id: string;
  title: string;
  subtitle: string;
  authorName: string;
  publishedAt: string;
  /** 진행 중인 저장이 있는지 */
  hasSave: boolean;
}

/** 제작자 목록에 보이는 내 이야기 */
export interface MyStorySummary {
  id: string;
  title: string;
  subtitle: string;
  encounterCount: number;
  isPublished: boolean;
  /** 공개한 뒤에 초안이 또 바뀌었는지 */
  hasUnpublishedChanges: boolean;
  updatedAt: string;
  publishedAt: string | null;
}

export interface PlayStoryResponse {
  story: { id: string; title: string; authorName: string };
  content: GameContent;
}

export interface EditStoryInfo {
  id: string;
  version: number;
  isPublished: boolean;
  hasUnpublishedChanges: boolean;
  updatedAt: string;
  publishedAt: string | null;
}

export interface EditStoryResponse {
  story: EditStoryInfo;
  content: GameContent;
}

export interface SaveResponse {
  state: RunState | null;
}

export interface ApiErrorBody {
  error: string;
  /** 공개 불가 사유 등 */
  issues?: string[];
  /** 저장 충돌 시 서버의 현재 버전 */
  version?: number;
}
