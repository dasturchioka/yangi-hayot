import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { adminLogin } from './support/admin';
import { createTestApp, type TestApp } from './support/test-app';

/** A 1×1 PNG. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

describe('Rasm: admin uploads an image, the Mini App shows it', () => {
  let t: TestApp;
  beforeEach(async () => {
    t = await createTestApp();
  });
  afterEach(async () => {
    await t.close();
  });

  const upload = (headers: Record<string, string>, payload: Buffer, type = 'image/png') =>
    t.app.inject({ method: 'POST', url: '/admin/api/rasm', headers: { ...headers, 'content-type': type }, payload });

  it('stores the upload and serves it publicly at the returned URL', async () => {
    const admin = await adminLogin(t, 'administrator');

    const res = await upload(admin, PNG);

    expect(res.statusCode).toBe(200);
    const { url } = res.json();
    expect(url).toMatch(/^\/api\/rasm\/[0-9a-f]{32}\.png$/);
    const img = await t.app.inject({ method: 'GET', url });
    expect(img.statusCode).toBe(200);
    expect(img.headers['content-type']).toBe('image/png');
    expect(img.headers['cache-control']).toContain('immutable');
    expect(img.rawPayload.equals(PNG)).toBe(true);
  });

  it('gives the same URL for the same file', async () => {
    const admin = await adminLogin(t, 'administrator');

    const a = (await upload(admin, PNG)).json().url;
    const b = (await upload(admin, PNG)).json().url;

    expect(a).toBe(b);
  });

  it('uses the real file type, not the claimed one', async () => {
    const admin = await adminLogin(t, 'administrator');

    const res = await upload(admin, PNG, 'image/jpeg');
    const notImage = await upload(admin, Buffer.from('<svg onload=alert(1)>'), 'image/png');

    expect(res.json().url).toMatch(/\.png$/);
    expect(notImage.statusCode).toBe(415);
  });

  it('lets only the Administrator upload', async () => {
    const menejer = await adminLogin(t, 'menejer');

    expect((await upload({}, PNG)).statusCode).toBe(401);
    expect((await upload(menejer, PNG)).statusCode).toBe(403);
  });

  it('answers 404 for an unknown or malformed id', async () => {
    expect((await t.app.inject({ method: 'GET', url: `/api/rasm/${'0'.repeat(32)}.png` })).statusCode).toBe(404);
    expect((await t.app.inject({ method: 'GET', url: '/api/rasm/..%2Fetc.png' })).statusCode).toBe(404);
  });
});
