import { mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// content/ 폴더 입출력. CLI(npm run content, npm run story:import)가 쓴다.
//   content/game.json              메타/시작 설정/아이템/능력/플래그/엔딩 + 인카운터 순서
//   content/encounters/<id>.json   인카운터 하나당 파일 하나

export const SAFE_ID = /^[A-Za-z0-9_-]+$/;

export interface ContentBundle {
  game: unknown;
  encounters: { id: string }[];
}

function paths(root: string, contentDir = join(root, 'content')) {
  return { contentDir, encounterDir: join(contentDir, 'encounters'), gamePath: join(contentDir, 'game.json') };
}

async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (err) {
    throw new Error(`${path}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** contentDir를 주면 그 폴더(game.json + encounters/)를, 아니면 <root>/content를 읽는다 */
export async function readContentFiles(root: string, contentDir?: string): Promise<ContentBundle> {
  const { encounterDir, gamePath } = paths(root, contentDir);
  await mkdir(encounterDir, { recursive: true });
  const game = await readJson(gamePath).catch(() => ({}));
  const files = (await readdir(encounterDir)).filter((f) => f.endsWith('.json')).sort();
  const encounters = (await Promise.all(files.map((f) => readJson(join(encounterDir, f))))) as { id: string }[];
  return { game, encounters };
}

/** 내용이 같으면 쓰지 않는다 (불필요한 깃 변경 방지) */
async function writeIfChanged(path: string, data: unknown): Promise<boolean> {
  const text = `${JSON.stringify(data, null, 2)}\n`;
  try {
    if ((await readFile(path, 'utf8')) === text) return false;
  } catch {
    // 새 파일
  }
  await writeFile(path, text, 'utf8');
  return true;
}

/** 저장 목록에 없는 인카운터 파일은 삭제한다 (인카운터 삭제/id 변경 반영) */
export async function writeContentFiles(root: string, bundle: ContentBundle): Promise<{ written: number; removed: number }> {
  const { encounterDir, gamePath } = paths(root);
  const ids = bundle.encounters.map((e) => e.id);
  const bad = ids.filter((id) => typeof id !== 'string' || !SAFE_ID.test(id));
  if (bad.length > 0) throw new Error(`파일 이름으로 쓸 수 없는 인카운터 id: ${bad.join(', ') || '(빈 id)'}`);
  if (new Set(ids).size !== ids.length) throw new Error('중복된 인카운터 id가 있습니다');

  await mkdir(encounterDir, { recursive: true });
  let written = 0;
  if (await writeIfChanged(gamePath, bundle.game)) written++;
  for (const enc of bundle.encounters) {
    if (await writeIfChanged(join(encounterDir, `${enc.id}.json`), enc)) written++;
  }
  const keep = new Set(ids.map((id) => `${id}.json`));
  let removed = 0;
  for (const f of await readdir(encounterDir)) {
    if (f.endsWith('.json') && !keep.has(f)) {
      await unlink(join(encounterDir, f));
      removed++;
    }
  }
  return { written, removed };
}
