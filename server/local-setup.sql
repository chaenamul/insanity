-- 이미 설치된 PostgreSQL에 이 프로젝트용 계정과 DB를 만든다 (Docker를 쓰지 않을 때).
-- 관리자(postgres) 계정으로 실행:
--   psql -U postgres -h localhost -f server/local-setup.sql
-- 계정/비밀번호/DB 이름은 .env.example과 같다. 이미 있는 것은 건너뛰므로 여러 번 실행해도 된다.

SELECT 'CREATE ROLE insanity LOGIN PASSWORD ''insanity'''
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'insanity')\gexec

SELECT 'CREATE DATABASE insanity OWNER insanity ENCODING ''UTF8'' TEMPLATE template0'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'insanity')\gexec

-- 테스트용 DB (npm test). 이 DB의 데이터는 테스트 때마다 지워진다
SELECT 'CREATE DATABASE insanity_test OWNER insanity ENCODING ''UTF8'' TEMPLATE template0'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'insanity_test')\gexec
