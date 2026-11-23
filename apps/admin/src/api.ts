/**
 * Admin API client. Auth is the HttpOnly session cookie set by
 * POST /admin/api/auth/login (same origin; Vite proxies /admin/api in dev).
 * A 401 anywhere means the session is gone: listeners show the login screen.
 */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(`HTTP ${status}`);
  }
}

const unauthorizedListeners = new Set<() => void>();

/** Called whenever the server answers 401 (session expired, user deactivated). */
export function onUnauthorized(fn: () => void): () => void {
  unauthorizedListeners.add(fn);
  return () => unauthorizedListeners.delete(fn);
}

export async function adminApi<T>(method: 'GET' | 'POST' | 'PATCH' | 'PUT', path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/admin/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: body !== undefined ? { 'content-type': 'application/json' } : {},
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const json = await res.json().catch(() => null);
  if (res.status === 401 && !path.startsWith('/auth/login')) unauthorizedListeners.forEach((fn) => fn());
  if (!res.ok) throw new ApiError(res.status, json);
  return json as T;
}

/**
 * Sends a file as the raw request body (the import endpoints read the bytes,
 * whatever the file name says). Same error handling as `adminApi`.
 */
export async function adminUpload<T>(path: string, file: Blob): Promise<T> {
  const res = await fetch(`/admin/api${path}`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/octet-stream' },
    body: file,
  });
  const json = await res.json().catch(() => null);
  if (res.status === 401) unauthorizedListeners.forEach((fn) => fn());
  if (!res.ok) throw new ApiError(res.status, json);
  return json as T;
}

/** Uzbek message for an API error, for showing in the panel. */
export function errorText(e: unknown): string {
  if (e instanceof ApiError) {
    const code = (e.body as { error?: string } | null)?.error;
    const known: Record<string, string> = {
      unauthorized: 'Sessiya tugadi, qayta kiring',
      invalid_credentials: "Login yoki parol noto'g'ri",
      too_many_attempts: "Ko'p urinish. 15 daqiqadan keyin qayta urinib ko'ring",
      forbidden: "Bu amal uchun ruxsat yo'q",
      bad_request: "Ma'lumot noto'g'ri to'ldirilgan",
      not_found: 'Topilmadi',
      not_enough: "Bu holatda buncha xonadon yo'q",
      jami_too_small: "Jami bron + sotilgandan kam bo'lishi mumkin emas",
      slug_taken: 'Bunday Loyiha allaqachon bor',
      blok_taken: 'Bu Loyihada bunday Blok allaqachon bor',
      login_taken: 'Bu login band',
      import_xatolar: "Faylda xato bor, import qilinmadi",
      cannot_demote_self: "O'zingizni o'chira yoki Menejer qila olmaysiz",
      kelajak: "Ko'rish kuni hali kelmagan",
      bekor: 'Mijoz bu yozilishni bekor qilgan',
    };
    return (code && known[code]) || `Xato (${e.status})`;
  }
  return 'Server bilan aloqa yo‘q';
}
