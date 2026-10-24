import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { joinContent, normalizeContent } from '../src/engine/content';
import { validateContent } from '../src/engine/validate';
import { requireDatabaseUrl } from '../server/config';
import { createDb } from '../server/db';
import { migrate } from '../server/migrate';
import { readContentFiles } from './content-files';

// 파일로 된 이야기를 DB에 넣는다.
//   npm run story:import -- --owner 이메일 [--from content] [--publish] [--story 기존이야기id]
//
//   --owner    이야기 주인 (먼저 회원가입해 둔 계정의 이메일)
//   --from     content/ 형식의 폴더 또는 에디터 "내보내기" JSON 파일 (기본: content)
//   --publish  넣은 뒤 바로 공개
//   --story    새로 만들지 않고 이 이야기의 초안을 덮어쓴다

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

const owner = arg('owner')?.toLowerCase();
const from = resolve(process.cwd(), arg('from') ?? 'content');
const storyId = arg('story');
const publish = process.argv.includes('--publish');

if (!owner) {
  console.error('사용법: npm run story:import -- --owner 이메일 [--from content|파일.json] [--publish] [--story id]');
  process.exit(1);
}

async function load() {
  if ((await stat(from)).isDirectory()) {
    const bundle = await readContentFiles(resolve(from, '..'), from);
    return joinContent(bundle.game, bundle.encounters);
  }
  const raw = JSON.parse(await readFile(from, 'utf8'));
  return raw.game ? joinContent(raw.game, raw.encounters ?? []) : normalizeContent(raw);
}

const db = createDb(requireDatabaseUrl());
try {
  await migrate(db);
  const users = await db.query<{ id: string }>('SELECT id FROM users WHERE email = $1', [owner]);
  if (!users[0]) throw new Error(`'${owner}' 계정이 없습니다. 먼저 사이트에서 회원가입하세요.`);
  const content = await load();
  const errors = validateContent(content).filter((i) => i.severity === 'error');
  if (publish && errors.length) throw new Error(`검증 오류 ${errors.length}개가 있어 공개할 수 없습니다 (npm run content:check로 확인)`);

  const json = JSON.stringify(content);
  let id = storyId;
  if (id) {
    const rows = await db.query(
      'UPDATE stories SET draft = $1::jsonb, draft_version = draft_version + 1, updated_at = now() WHERE id = $2 AND author_id = $3 RETURNING id',
      [json, id, users[0].id],
    );
    if (!rows[0]) throw new Error(`${owner}의 이야기 중 ${id}가 없습니다`);
  } else {
    id = (await db.query<{ id: string }>('INSERT INTO stories (author_id, draft) VALUES ($1, $2::jsonb) RETURNING id', [users[0].id, json]))[0].id;
  }
  if (publish) await db.query('UPDATE stories SET published = draft, published_at = now() WHERE id = $1', [id]);
  console.log(`'${content.meta.title}' (인카운터 ${content.encounters.length}개) → 이야기 ${id}${publish ? ' (공개됨)' : ' (초안)'}`);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await db.close();
}
