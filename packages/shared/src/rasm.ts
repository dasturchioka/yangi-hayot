/** Image types the admin-panel may upload (POST /admin/api/rasm, raw body). */
export const RASM_TURLARI = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
export type RasmTuri = (typeof RASM_TURLARI)[number];

/** Upload limit; the admin-panel shrinks photos before sending, so this is a safety net. */
export const RASM_MAX_BAYT = 8 * 1024 * 1024;

/** POST /admin/api/rasm → where the image is served (same-origin path, usable wherever a /media/... path is). */
export interface RasmYuklashResponse {
  url: string;
}
