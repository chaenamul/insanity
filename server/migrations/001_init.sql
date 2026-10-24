-- 사용자, 로그인 세션, 이야기(초안/공개본), 플레이 저장

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL UNIQUE,          -- 소문자로 저장
  display_name  text NOT NULL,
  password_hash text NOT NULL,                 -- scrypt
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  token_hash text PRIMARY KEY,                 -- 쿠키 토큰의 sha256 (원문은 저장하지 않음)
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX sessions_user_idx ON sessions (user_id);

CREATE TABLE stories (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  draft         jsonb NOT NULL,                -- 제작자가 편집 중인 내용 (GameContent)
  draft_version integer NOT NULL DEFAULT 1,    -- 동시 저장 충돌 감지용
  published     jsonb,                         -- 플레이어에게 보이는 공개본. NULL이면 비공개
  published_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX stories_author_idx ON stories (author_id, updated_at DESC);
CREATE INDEX stories_published_idx ON stories (published_at DESC) WHERE published IS NOT NULL;

CREATE TABLE saves (
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  story_id   uuid NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  state      jsonb NOT NULL,                   -- 진행 중인 판 (RunState)
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, story_id)
);
