// 서버 설정. 프로젝트 루트의 .env가 있으면 읽는다 (.env.example 참고).
try {
  process.loadEnvFile();
} catch {
  // .env 없음
}

const production = process.env.NODE_ENV === 'production' || process.argv.includes('--prod');

export const config = {
  databaseUrl: process.env.DATABASE_URL ?? '',
  port: Number(process.env.PORT ?? 3000),
  /** 개발 중엔 Vite가 프록시하므로 이 PC에서만, 배포 시엔 모든 주소에서 받는다 */
  host: process.env.HOST ?? (production ? '0.0.0.0' : '127.0.0.1'),
  production,
  /** HTTPS로 서비스할 때만 true. 배포 환경에서 HTTP로 테스트하면 COOKIE_SECURE=false */
  secureCookies: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : production,
};

export function requireDatabaseUrl(): string {
  if (!config.databaseUrl) {
    throw new Error('DATABASE_URL이 설정되지 않았습니다. .env.example을 복사해 .env를 만들고 PostgreSQL 주소를 넣으세요.');
  }
  return config.databaseUrl;
}
