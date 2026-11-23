import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { recordShaharQiziqish } from '../src/mijoz/shahar-qiziqish';
import { drainRassilkaQueue } from '../src/rassilka/worker';
import { botEvent } from './support/bot';
import { createTestApp, TEST_ADMIN_TOKEN, type TestApp } from './support/test-app';

let t: TestApp;
let nextId = 720000000;
beforeEach(async () => {
  t = await createTestApp();
});
afterEach(async () => {
  await t.close();
});

async function newMijoz(lang: 'ru' | 'uz') {
  const user = { id: ++nextId, first_name: `M${nextId}` };
  await botEvent(t, user, { type: 'start' });
  await botEvent(t, user, { type: 'callback', data: `lang:${lang}` });
  return String(user.id);
}

function api(method: 'GET' | 'POST', url: string, payload?: object, token = TEST_ADMIN_TOKEN) {
  return t.app.inject({
    method,
    url: `/admin/api${url}`,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    ...(payload ? { payload } : {}),
  });
}

async function drain() {
  await drainRassilkaQueue(t, { sleep: async (ms) => t.clock.advance({ seconds: ms / 1000 }) });
}

describe('admin-panel Rassilka API', () => {
  it('requires the admin token', async () => {
    expect((await api('GET', '/rassilka', undefined, '')).statusCode).toBe(401);
    expect((await api('GET', '/rassilka', undefined, 'wrong')).statusCode).toBe(401);
  });

  it('shows audience sizes', async () => {
    const ru = await newMijoz('ru');
    await newMijoz('uz');
    await recordShaharQiziqish(t.db, ru, 'navoiy', 'loyiha', t.clock.now());

    const res = await api('GET', '/rassilka/audiences');
    expect(res.json()).toEqual({ all: 2, ru: 1, uz: 1, toshkent: 0, navoiy: 1 });
  });

  it('draft → confirm → sent to the audience, with the report', async () => {
    const ru = await newMijoz('ru');
    const blocker = await newMijoz('ru');
    const uz = await newMijoz('uz');
    t.messenger.blockBy(blocker);

    const created = await api('POST', '/rassilka', {
      audience: 'ru',
      content: {
        text: 'Yangi narxlar',
        media: { kind: 'photo', fileId: 'https://cdn.example.uz/a.jpg' },
        button: { text: 'Ochish', startapp: '' },
      },
    });
    expect(created.statusCode).toBe(201);
    const draft = created.json();
    expect(draft).toMatchObject({ status: 'draft', audience: 'ru', recipients: 2 });
    await drain();
    expect(t.messenger.sent).toEqual([]); // nothing before confirmation

    const confirmed = await api('POST', `/rassilka/${draft.id}/confirm`);
    expect(confirmed.statusCode).toBe(200);
    expect((await api('POST', `/rassilka/${draft.id}/confirm`)).statusCode).toBe(409);
    await drain();

    expect(t.messenger.deliveredTo(ru)).toEqual([
      {
        chatId: ru,
        text: 'Yangi narxlar',
        media: { kind: 'photo', fileId: 'https://cdn.example.uz/a.jpg' },
        buttons: [[{ text: 'Ochish', startapp: '' }]],
      },
    ]);
    expect(t.messenger.deliveredTo(uz)).toEqual([]);

    const report = (await api('GET', `/rassilka/${draft.id}`)).json();
    expect(report).toMatchObject({
      status: 'done',
      stats: { total: 2, pending: 0, delivered: 1, blocked: 1, error: 0 },
    });
    const list = (await api('GET', '/rassilka')).json();
    expect(list.items.map((r: { id: string }) => r.id)).toEqual([draft.id]);
  });

  it('cancels a draft', async () => {
    await newMijoz('ru');
    const draft = (await api('POST', '/rassilka', { audience: 'all', content: { text: 'X' } })).json();
    expect((await api('POST', `/rassilka/${draft.id}/cancel`)).statusCode).toBe(200);
    expect((await api('POST', `/rassilka/${draft.id}/confirm`)).statusCode).toBe(409);
    expect((await api('GET', `/rassilka/${draft.id}`)).json().status).toBe('cancelled');
    expect((await api('GET', '/rassilka/999')).statusCode).toBe(404);
  });

  it('rejects invalid content', async () => {
    const bad = [
      { audience: 'all', content: { text: '' } },
      { audience: 'everyone', content: { text: 'X' } },
      { audience: 'all', content: { text: 'X', button: { text: 'B', url: 'javascript:alert(1)' } } },
      { audience: 'all', content: { text: 'x'.repeat(1025), media: { kind: 'photo', fileId: 'F' } } },
    ];
    for (const payload of bad) expect((await api('POST', '/rassilka', payload)).statusCode).toBe(400);
  });
});
