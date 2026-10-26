import { produce, type Draft } from 'immer';
import { createContext, useCallback, useContext, useState } from 'react';
import type { Encounter, GameContent } from '../engine/types';
import type { Issue } from '../engine/validate';

export type Recipe<T> = (draft: Draft<T>) => void;
/** 하위 객체를 고치는 함수. mergeKey가 같은 연속 수정(타이핑 등)은 되돌리기 한 번으로 묶인다 */
export type Edit<T> = (recipe: Recipe<T>, mergeKey?: string) => void;

export type Tab = 'settings' | 'encounters' | 'flow' | 'definitions' | 'endings' | 'issues' | 'simulate' | 'help';

export interface Nav {
  tab: Tab;
  encounterId: string | null;
  /** 이동 후 스크롤할 페이지 */
  nodeId?: string | null;
  /** 같은 위치로 다시 이동해도 스크롤되도록 */
  nonce?: number;
}

interface EditorContextValue {
  content: GameContent;
  update: Edit<GameContent>;
  issues: Issue[];
  nav: Nav;
  navigate: (nav: Partial<Nav>) => void;
  playtest: (startEncounterId?: string) => void;
}

const EditorContext = createContext<EditorContextValue | null>(null);
export const EditorProvider = EditorContext.Provider;

export function useEditor(): EditorContextValue {
  const ctx = useContext(EditorContext);
  if (!ctx) throw new Error('EditorProvider가 필요합니다');
  return ctx;
}

/** 인카운터 하나를 고치는 Edit */
export function useEncounterEdit(encounterId: string): Edit<Encounter> {
  const { update } = useEditor();
  return useCallback(
    (recipe, mergeKey) =>
      update((d) => {
        const enc = d.encounters.find((e) => e.id === encounterId);
        if (enc) recipe(enc);
      }, mergeKey),
    [update, encounterId],
  );
}

/** id로 하위 항목을 찾아 고치는 Edit을 만든다 */
export function child<P, C extends { id: string }>(edit: Edit<P>, list: (p: Draft<P>) => Draft<C>[], id: string): Edit<C> {
  return (recipe, mergeKey) =>
    edit((p) => {
      const item = list(p).find((x) => x.id === id);
      if (item) recipe(item);
    }, mergeKey);
}

// ─── 되돌리기 가능한 상태 ───

interface HistoryState {
  content: GameContent;
  past: GameContent[];
  future: GameContent[];
  lastKey: string;
  lastAt: number;
}

const HISTORY_LIMIT = 200;
const MERGE_WINDOW_MS = 1200;

export function useHistory(initial: GameContent) {
  const [h, setH] = useState<HistoryState>({ content: initial, past: [], future: [], lastKey: '', lastAt: 0 });

  const update: Edit<GameContent> = useCallback((recipe, mergeKey) => {
    setH((s) => {
      const next = produce(s.content, recipe);
      if (next === s.content) return s;
      const now = Date.now();
      const merge = !!mergeKey && mergeKey === s.lastKey && now - s.lastAt < MERGE_WINDOW_MS;
      return {
        content: next,
        past: merge ? s.past : [...s.past.slice(-HISTORY_LIMIT + 1), s.content],
        future: [],
        lastKey: mergeKey ?? '',
        lastAt: now,
      };
    });
  }, []);

  /** 불러오기/가져오기: 되돌리기 가능한 하나의 변경으로 통째 교체 */
  const replace = useCallback((content: GameContent, resetHistory = false) => {
    setH((s) =>
      resetHistory
        ? { content, past: [], future: [], lastKey: '', lastAt: 0 }
        : { content, past: [...s.past.slice(-HISTORY_LIMIT + 1), s.content], future: [], lastKey: '', lastAt: 0 },
    );
  }, []);

  const undo = useCallback(() => {
    setH((s) =>
      s.past.length === 0
        ? s
        : { content: s.past[s.past.length - 1], past: s.past.slice(0, -1), future: [s.content, ...s.future], lastKey: '', lastAt: 0 },
    );
  }, []);

  const redo = useCallback(() => {
    setH((s) =>
      s.future.length === 0
        ? s
        : { content: s.future[0], past: [...s.past, s.content], future: s.future.slice(1), lastKey: '', lastAt: 0 },
    );
  }, []);

  return { content: h.content, update, replace, undo, redo, canUndo: h.past.length > 0, canRedo: h.future.length > 0 };
}
