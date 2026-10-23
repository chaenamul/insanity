import { joinContent } from '../engine/content';
import type { GameContent } from '../engine/types';

// 빌드에 포함된 content/ 폴더. 게임 전용 — 에디터가 이 모듈을 가져오면
// 에디터 저장 때마다 에디터 페이지까지 새로고침되므로 에디터에서는 쓰지 않는다.
const game = import.meta.glob('/content/game.json', { eager: true, import: 'default' });
const encounters = import.meta.glob('/content/encounters/*.json', { eager: true, import: 'default' });

export function loadBundledContent(): GameContent {
  return joinContent(Object.values(game)[0] ?? {}, Object.values(encounters));
}
