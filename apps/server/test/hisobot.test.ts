import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setSetting } from '../src/settings/settings';
import { botEvent, sends } from './support/bot';
import { belgilaDojim } from '../src/hodisa/hodisa';
import { adminLogin } from './support/admin';
import { blok, seedLoyiha } from './support/katalog';
import { signInitData, tmaAuth, type TelegramTestUser } from './support/init-data';
import { createTestApp, type TestApp } from './support/test-app';

const ADMIN = { id: 900000001, first_name: 'Rahbar', language_code: 'uz' };
const mijoz = (n: number): TelegramTestUser => ({ id: 700000100 + n, first_name: `Mijoz${n}`, language_code: 'uz' });

let t: TestApp;
beforeEach(async () => {
  t = await createTestApp(); // Monday 2026-11-23 10:00 Tashkent
  await setSetting(t.db, 'admins', [String(ADMIN.id)], t.clock.now());
});
afterEach(async () => {
  await t.close();
});

function auth(user: TelegramTestUser, startParam?: string) {
  return tmaAuth(signInitData(user, { authDate: t.clock.now(), startParam }));
}

async function ariza(user: TelegramTestUser, payload: Record<string, unknown> = {}) {
  const res = await t.app.inject({
    method: 'POST',
    url: '/api/arizalar',
    headers: auth(user),
    payload: { name: user.first_name, phone: `90 ${String(user.id).slice(-3)} 45 67`, ...payload },
  });
  expect(res.statusCode).toBe(201);
}

async function yozilish(user: TelegramTestUser, loyihaId: number, sana: string, vaqt: string) {
  const res = await t.app.inject({
    method: 'POST',
    url: '/api/yozilishlar',
    headers: auth(user),
    payload: { loyihaId, sana, vaqt, name: user.first_name, phone: `+99890${String(user.id).slice(-3)}4567` },
  });
  expect(res.statusCode).toBe(201);
  return res.json().yozilish.id as number;
}

async function report(): Promise<string> {
  const out = sends(await botEvent(t, ADMIN, { type: 'command', name: 'report' }));
  expect(out).toHaveLength(1);
  expect(out[0]!.chatId).toBe(String(ADMIN.id));
  return out[0]!.text;
}

describe('/report', () => {
  it("counts today's Arizalar from the bot database: CRM notes + those that did not reach amoCRM", async () => {
    await ariza(mijoz(1));
    await ariza(mijoz(2));
    await ariza(mijoz(2), { phone: '93 000 00 01' }); // same Mijoz → same Bitim, second note
    t.crm.fail('unavailable');
    await ariza(mijoz(3));

    const crmCalls = t.crm.calls.length;
    const text = await report(); // amoCRM is still down

    expect(t.crm.calls.length).toBe(crmCalls); // the report never asks amoCRM
    const notes = t.crm.bitimlar.reduce((n, b) => n + b.notes.length, 0);
    expect(notes).toBe(3);
    expect(text).toContain(`📝 Arizalar: ${notes + 1}`);
    expect(text).toContain("amoCRM'ga yetib bormagan: 1");
  });

  it("shows new Mijozlar by Manba, Arizalar by type, Loyiha and Manba, tomorrow's yozilishlar", async () => {
    const { id: loyihaId } = await seedLoyiha(t.db, { nomi: 'Navoiy Park' });
    await botEvent(t, mijoz(1), { type: 'start', payload: 'src_instagram' });
    await botEvent(t, mijoz(2), { type: 'start', payload: 'src_instagram' });
    await botEvent(t, mijoz(3), { type: 'start' });
    await ariza(mijoz(1), { loyihaId });
    await yozilish(mijoz(2), loyihaId, '2026-11-24', '11:00');
    await yozilish(mijoz(3), loyihaId, '2026-11-25', '11:00'); // not tomorrow
    t.clock.advance({ days: 1 });
    await ariza(mijoz(3)); // tomorrow's Ariza: not in today's report
    t.clock.advance({ days: -1 });

    const text = await report();

    expect(text).toContain('📊 Kunlik hisobot — 23.11.2026 (dushanba)');
    expect(text).toContain("👤 Yangi Mijozlar: 3\n• instagram: 2\n• Telegram (to'g'ridan-to'g'ri): 1");
    expect(text).toContain('📝 Arizalar: 3');
    expect(text).toContain("Turlar bo'yicha:\n• Ko'rishga yozilish: 2\n• Ariza formasi: 1");
    expect(text).toContain("Loyihalar bo'yicha:\n• Navoiy Park: 3");
    expect(text).toContain("Manbalar bo'yicha:\n• instagram: 2\n• Telegram (to'g'ridan-to'g'ri): 1");
    expect(text).toContain('📅 Ertangi yozilishlar (24.11.2026 (seshanba)): 1\n• 11:00 — Navoiy Park — Mijoz2, +998');
  });

  it('lists the Arizalar of the last 7 days that have not reached amoCRM', async () => {
    t.crm.fail('unavailable');
    await ariza(mijoz(1));
    t.clock.advance({ days: 2 });
    await t.runJobs(); // 24 h of retries are over → failed

    const text = await report();

    expect(text).toContain('📝 Arizalar: 0');
    expect(text).toMatch(/⚠️ amoCRM'ga yetib bormagan Arizalar \(7 kun\): 1\n• #\d+ Ariza formasi — Mijoz1, \+998\d+ \(23\.11, yuborilmadi\)/);
  });

  it('is only for administrators', async () => {
    await ariza(mijoz(1));
    const out = sends(await botEvent(t, mijoz(1), { type: 'command', name: 'report' }));
    expect(out.map((a) => a.text).join('\n')).not.toContain('Arizalar');
  });
});

const GROUP = '-1001234567890';
const at = (iso: string) => t.clock.set(new Date(iso));
const reports = (kind: '📊 Kunlik' | '📈 Haftalik', chatId = GROUP) =>
  t.messenger
    .deliveredTo(chatId)
    .map((m) => m.text ?? '')
    .filter((s) => s.startsWith(kind));

describe('daily report at 19:30 Tashkent', () => {
  const kunlik = (chatId = GROUP) => reports('📊 Kunlik', chatId);

  beforeEach(async () => {
    await setSetting(t.db, 'managersGroupId', GROUP, t.clock.now());
  });

  it('goes to the managers group once a day at 19:30, also across restarts', async () => {
    at('2026-11-23T14:29:00Z'); // 19:29
    await t.runJobs();
    expect(kunlik()).toEqual([]);

    at('2026-11-23T14:30:00Z'); // 19:30
    await t.runJobs();
    await t.runJobs();
    await t.restart();
    await t.runJobs();
    expect(kunlik()).toHaveLength(1);
    expect(kunlik()[0]).toContain('📊 Kunlik hisobot — 23.11.2026 (dushanba)');

    at('2026-11-24T14:30:00Z');
    await t.runJobs();
    expect(kunlik()).toHaveLength(2);
    expect(kunlik()[1]).toContain('24.11.2026 (seshanba)');
  });

  it('is still sent later that evening if the server was down at 19:30, but not the next morning', async () => {
    at('2026-11-23T18:00:00Z'); // 23:00
    await t.runJobs();
    expect(kunlik()).toHaveLength(1);

    at('2026-11-25T04:00:00Z'); // Wed 09:00: Tuesday's report was missed
    await t.runJobs();
    expect(kunlik()).toHaveLength(1);
  });

  it('goes to the recipients set in the settings instead of the group', async () => {
    await setSetting(t.db, 'hisobot', { qabulQiluvchilar: ['111', '-100222'] }, t.clock.now());
    at('2026-11-23T14:30:00Z');
    await t.runJobs();

    expect(kunlik()).toEqual([]);
    expect(kunlik('111')).toHaveLength(1);
    expect(kunlik('-100222')).toHaveLength(1);
  });

  it('on Monday is followed by the weekly summary; not on other days', async () => {
    at('2026-11-23T14:30:00Z'); // Monday 19:30
    await t.runJobs();
    await t.runJobs();
    expect(reports('📈 Haftalik')).toHaveLength(1);
    expect(reports('📈 Haftalik')[0]).toContain('📈 Haftalik xulosa — 16.11.2026 – 22.11.2026');

    at('2026-11-24T14:30:00Z'); // Tuesday
    await t.runJobs();
    expect(reports('📈 Haftalik')).toHaveLength(1);
  });

  it('retries on the next tick when Telegram did not take it', async () => {
    at('2026-11-23T14:30:00Z');
    t.messenger.fail('error');
    await t.runJobs();
    t.messenger.recover();
    await t.runJobs();
    await t.runJobs();

    expect(kunlik()).toHaveLength(1);
  });
});

describe('admin: where the report goes', () => {
  it('the Administrator reads and sets the recipients; the Menejer cannot', async () => {
    const headers = await adminLogin(t, 'administrator');
    const url = '/admin/api/hisobot-sozlamalari';

    expect((await t.app.inject({ method: 'GET', url, headers })).json()).toEqual({ qabulQiluvchilar: [] });
    const put = await t.app.inject({ method: 'PUT', url, headers, payload: { qabulQiluvchilar: [' 111 ', '-100222', '111'] } });
    expect(put.statusCode).toBe(200);
    expect(put.json()).toEqual({ qabulQiluvchilar: ['111', '-100222'] });
    expect((await t.app.inject({ method: 'PUT', url, headers, payload: { qabulQiluvchilar: ['@rahbar'] } })).statusCode).toBe(400);

    at('2026-11-23T14:30:00Z');
    await t.runJobs();
    expect(reports('📊 Kunlik', '111')).toHaveLength(1);

    const menejer = await adminLogin(t, 'menejer');
    expect((await t.app.inject({ method: 'GET', url, headers: menejer })).statusCode).toBe(403);
  });
});

describe('weekly summary', () => {
  async function weekly(): Promise<string> {
    await setSetting(t.db, 'managersGroupId', GROUP, t.clock.now());
    at('2026-11-23T14:30:00Z');
    await t.runJobs();
    return reports('📈 Haftalik')[0]!;
  }

  async function korish(user: TelegramTestUser, planirovkaId: number) {
    const res = await t.app.inject({ method: 'GET', url: `/api/katalog/planirovkalar/${planirovkaId}`, headers: auth(user) });
    expect(res.statusCode).toBe(200);
  }

  async function davomat(yozilishId: number, value: 'keldi' | 'kelmadi') {
    const res = await t.app.inject({
      method: 'PATCH',
      url: `/admin/api/yozilishlar/${yozilishId}/davomat`,
      headers: await adminLogin(t, 'menejer'),
      payload: { davomat: value },
    });
    expect(res.statusCode).toBe(200);
  }

  it('compares the last week with the week before, with the funnel and dojim bookings', async () => {
    const l = await seedLoyiha(t.db, { nomi: 'Navoiy Park', bloklar: [blok('A', [{}])] });
    const planirovkaId = l.bloklar[0]!.planirovkalar[0]!.id;

    at('2026-11-10T05:00:00Z'); // the week before
    await botEvent(t, mijoz(4), { type: 'start', payload: 'src_olx' });
    await ariza(mijoz(4));

    at('2026-11-17T05:00:00Z'); // last week, Tuesday 10:00
    await botEvent(t, mijoz(1), { type: 'start', payload: 'src_instagram' });
    await korish(mijoz(1), planirovkaId);
    await korish(mijoz(1), planirovkaId); // the same Mijoz twice = once in the funnel
    await ariza(mijoz(1), { planirovkaId });
    await botEvent(t, mijoz(2), { type: 'start' });
    await korish(mijoz(2), planirovkaId);
    const y2 = await yozilish(mijoz(2), l.id, '2026-11-18', '11:00');
    await belgilaDojim(t.db, y2); // #17: this booking came from a dojim message
    await botEvent(t, mijoz(3), { type: 'start' });
    const y3 = await yozilish(mijoz(3), l.id, '2026-11-18', '12:00');
    at('2026-11-18T09:00:00Z');
    await davomat(y2, 'keldi');
    await davomat(y3, 'keldi');
    await davomat(y3, 'kelmadi'); // corrected: not counted

    const text = await weekly();

    expect(text).toContain(
      [
        '📈 Haftalik xulosa — 16.11.2026 – 22.11.2026',
        '(qavsda — oldingi hafta, 09.11.2026 – 15.11.2026)',
        '',
        '👤 Yangi Mijozlar: 3 (1, +2)',
        '📝 Arizalar: 3 (1, +2)',
        '📅 Yozilishlar: 2 (0, +2)',
        '✅ Keldi: 1 (0, +1)',
        '🔔 Dojimdan kelgan yozilishlar: 1 (0, +1)',
        '',
        'Voronka (Mijozlar):',
        '• Botga kirdi: 3 (1)',
        "• Planirovkalarni ko'rdi: 2 (0)",
        '• Ariza qoldirdi: 3 (1)',
        '• Ko\'rishga yozildi: 2 (0)',
        '• Keldi: 1 (0)',
      ].join('\n'),
    );
  });
});
