import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { joinContent, normalizeContent, splitContent } from '../src/engine/content';
import { validateContent } from '../src/engine/validate';
import { EFFECT_TAGS } from '../src/markup/registry';
import { readContentFiles, writeContentFiles } from './content-files';

// npm run content                         content/ 파일을 표준 형식으로 정리(빠진 필드/id 채움)하고 검증 결과 출력
// npm run content:check                   파일은 건드리지 않고 검증만 (오류가 있으면 실패)
// npm run content -- --import 파일.json   에디터 "내보내기"로 받은 파일로 content/ 폴더를 덮어씀

const root = fileURLToPath(new URL('..', import.meta.url));
const checkOnly = process.argv.includes('--check');
const importIndex = process.argv.indexOf('--import');
const importPath = importIndex === -1 ? null : process.argv[importIndex + 1];

async function load() {
  if (importPath) {
    const raw = JSON.parse(await readFile(resolve(process.cwd(), importPath), 'utf8'));
    return raw.game ? joinContent(raw.game, raw.encounters ?? []) : normalizeContent(raw);
  }
  const bundle = await readContentFiles(root);
  return joinContent(bundle.game, bundle.encounters);
}

const content = await load();

if (!checkOnly) {
  const { game, encounters } = splitContent(content);
  const { written, removed } = await writeContentFiles(root, { game, encounters });
  console.log(`정리 완료: ${written}개 파일 갱신, ${removed}개 삭제`);
}

const issues = validateContent(content, { markupTags: EFFECT_TAGS });
const errors = issues.filter((i) => i.severity === 'error');
for (const i of issues) {
  const where = [i.encounterId, i.where].filter(Boolean).join(' › ');
  console.log(`${i.severity === 'error' ? '✖ 오류' : '⚠ 경고'}  ${where ? `[${where}] ` : ''}${i.message}`);
}
console.log(`인카운터 ${content.encounters.length}개 · 오류 ${errors.length}개 · 경고 ${issues.length - errors.length}개`);
if (errors.length > 0) process.exitCode = 1;
