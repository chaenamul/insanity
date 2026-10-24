import type { ApiErrorBody } from './api-types';

// 서버 API 호출. 실패하면 ApiError를 던진다.

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body: Partial<ApiErrorBody> = {},
  ) {
    super(message);
  }
}

export async function api<T>(path: string, options: { method?: string; body?: unknown; keepalive?: boolean } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: options.method ?? 'GET',
      headers: options.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      credentials: 'same-origin',
      keepalive: options.keepalive,
    });
  } catch {
    throw new ApiError(0, '서버에 연결할 수 없습니다');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? `요청 실패 (${res.status})`, data);
  return data as T;
}

/** 로그인 화면으로 보내고, 로그인 후 지금 페이지로 돌아오게 한다 */
export function redirectToLogin(): void {
  location.href = `/login?next=${encodeURIComponent(location.pathname + location.search)}`;
}

/** 주소의 두 번째 조각 (/play/<id>, /edit/<id>) */
export function idFromPath(): string {
  return location.pathname.split('/')[2] ?? '';
}
