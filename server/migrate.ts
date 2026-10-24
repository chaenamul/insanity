import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { requireDatabaseUrl } from './config';
import { createDb, type Db } from './db';

// server/migrations/*.sql을 이름 순서대로 한 번씩만 적용한다. 서버가 시작할 때 자동으로 실행된다.

const dir = fileURLToPath(new URL('./migrations', import.meta.url));
const LOCK_ID = 727_372_001;

export async function migrate(db: Db, log: (msg: string) => void = console.log): Promise<void> {
  const client = await db.pool.connect();
  try {
    // 서버 여러 개가 동시에 떠도 한 번만 적용되도록
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_ID]);
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    const applied = new Set((await client.query<{ name: string }>('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
      if (applied.has(file)) continue;
      await client.query('BEGIN');
      try {
        await client.query(readFileSync(`${dir}/${file}`, 'utf8'));
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        log(`DB 마이그레이션 적용: ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`마이그레이션 ${file} 실패: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_ID]).catch(() => {});
    client.release();
  }
}

// npm run db:migrate
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const db = createDb(requireDatabaseUrl());
  migrate(db)
    .then(() => console.log('DB가 최신 상태입니다'))
    .catch((err) => {
      console.error(err instanceof Error ? err.message : err);
      process.exitCode = 1;
    })
    .finally(() => db.close());
}
