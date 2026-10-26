import { useCallback, useState } from 'react';
import { readStorage, STORAGE_KEYS, writeStorage } from '../shared/storage';

// 플레이어 설정. 햄버거 메뉴에서 바꾸고 브라우저에 저장된다.

export const FONT_SIZES = [
  { label: '작게', px: 15 },
  { label: '보통', px: 17 },
  { label: '크게', px: 19 },
  { label: '아주 크게', px: 22 },
] as const;

/** 본문 글자가 나오는 속도 (초당 글자 수). 0 = 한 번에 */
export const TYPING_SPEEDS = [
  { label: '느리게', cps: 18 },
  { label: '보통', cps: 36 },
  { label: '빠르게', cps: 72 },
  { label: '즉시', cps: 0 },
] as const;

/** story: 이야기에서 정한 색 / light: 화이트 모드 / dark: 다크 모드 */
export type ThemeMode = 'story' | 'light' | 'dark';

export const THEME_MODES: { value: ThemeMode; label: string }[] = [
  { value: 'story', label: '이야기 설정' },
  { value: 'light', label: '화이트' },
  { value: 'dark', label: '다크' },
];

export interface Settings {
  /** FONT_SIZES의 순번 */
  fontSize: number;
  /** TYPING_SPEEDS의 순번 */
  typing: number;
  theme: ThemeMode;
}

const DEFAULTS: Settings = { fontSize: 1, typing: 1, theme: 'story' };

function index(v: unknown, length: number, fallback: number): number {
  return Number.isInteger(v) ? Math.min(length - 1, Math.max(0, v as number)) : fallback;
}

function load(): Settings {
  const saved = readStorage<Partial<Settings>>(STORAGE_KEYS.settings) ?? {};
  return {
    fontSize: index(saved.fontSize, FONT_SIZES.length, DEFAULTS.fontSize),
    typing: index(saved.typing, TYPING_SPEEDS.length, DEFAULTS.typing),
    theme: THEME_MODES.some((m) => m.value === saved.theme) ? saved.theme! : DEFAULTS.theme,
  };
}

export function useSettings(): [Settings, (patch: Partial<Settings>) => void] {
  const [settings, setSettings] = useState(load);
  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((s) => {
      const next = { ...s, ...patch };
      writeStorage(STORAGE_KEYS.settings, next);
      return next;
    });
  }, []);
  return [settings, update];
}
