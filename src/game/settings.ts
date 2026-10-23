import { useCallback, useState } from 'react';
import { readStorage, STORAGE_KEYS, writeStorage } from '../shared/storage';

// 플레이어 설정. 햄버거 메뉴에서 바꾸고 브라우저에 저장된다.

export const FONT_SIZES = [
  { label: '작게', px: 15 },
  { label: '보통', px: 17 },
  { label: '크게', px: 19 },
  { label: '아주 크게', px: 22 },
] as const;

export interface Settings {
  /** FONT_SIZES의 순번 */
  fontSize: number;
}

const DEFAULTS: Settings = { fontSize: 1 };

function load(): Settings {
  const saved = readStorage<Partial<Settings>>(STORAGE_KEYS.settings) ?? {};
  const fontSize = Number.isInteger(saved.fontSize) ? Math.min(FONT_SIZES.length - 1, Math.max(0, saved.fontSize!)) : DEFAULTS.fontSize;
  return { ...DEFAULTS, fontSize };
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
