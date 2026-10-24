import pg from 'pg';

export interface Db {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  /** 하나의 트랜잭션 안에서 실행 (예외가 나면 롤백) */
  tx<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T>;
  pool: pg.Pool;
  close(): Promise<void>;
}

export function createDb(connectionString: string): Db {
  const pool = new pg.Pool({ connectionString, max: 10 });
  return {
    pool,
    async query(sql, params = []) {
      const res = await pool.query(sql, params);
      return res.rows;
    },
    async tx(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}
