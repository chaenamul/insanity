import type { StoryTheme } from './types';

// 이야기 테마 색. 제작자는 이 팔레트에서 배경/글자 색을 고른다.

export interface Swatch {
  value: string;
  label: string;
}

export const BACKGROUND_PALETTE: Swatch[] = [
  { value: '#0b0d0c', label: '칠흑' },
  { value: '#0a1317', label: '심해' },
  { value: '#170c0d', label: '핏빛 어둠' },
  { value: '#120f19', label: '보랏빛 밤' },
  { value: '#1b1a17', label: '잿빛' },
  { value: '#efe6d1', label: '양피지' },
  { value: '#f7f6f1', label: '종이' },
  { value: '#dde2dd', label: '안개' },
];

export const TEXT_PALETTE: Swatch[] = [
  { value: '#d6d2c4', label: '상아' },
  { value: '#f2efe6', label: '흰 뼈' },
  { value: '#b8d1c3', label: '이끼' },
  { value: '#d8b4a8', label: '마른 피' },
  { value: '#a9a8a0', label: '재' },
  { value: '#2a2824', label: '먹' },
  { value: '#4b3624', label: '세피아' },
  { value: '#1d3340', label: '심청' },
];

export const DEFAULT_THEME: StoryTheme = { background: '#0b0d0c', text: '#d6d2c4', variable: false };

/** 플레이어가 "화이트 / 다크 모드"를 고르면 이야기 색 대신 쓰는 색 */
export const LIGHT_COLORS = { background: '#f6f3ea', text: '#2b2924' };
export const DARK_COLORS = { background: DEFAULT_THEME.background, text: DEFAULT_THEME.text };

const HEX_RE = /^#[0-9a-f]{6}$/i;

export function isColor(v: unknown): v is string {
  return typeof v === 'string' && HEX_RE.test(v);
}

export function swatchLabel(value: string): string {
  return [...BACKGROUND_PALETTE, ...TEXT_PALETTE].find((s) => s.value.toLowerCase() === value.toLowerCase())?.label ?? value;
}

/** WCAG 상대 휘도 (0 = 검정, 1 = 흰색) */
export function luminance(hex: string): number {
  if (!isColor(hex)) return 0;
  const channel = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/** 명암비 (1 ~ 21). 본문은 4.5 이상을 권장 */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export function isLightColor(hex: string): boolean {
  return luminance(hex) > 0.4;
}
