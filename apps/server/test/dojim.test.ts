import { parseDojimParam } from '@yh/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { MessageButton, OutgoingMessage } from '../src/adapters/messenger/messenger';
import { addDays, tashkentInstant, toTashkent } from '../src/clock';
import { dojimYozilishlari } from '../src/hodisa/hodisa';
import { adminLogin } from './support/admin';
import { botEvent, sends } from './support/bot';
import { blok, seedLoyiha, xonadonOf } from './support/katalog';
import { signInitData, tmaAuth, type TelegramTestUser } from './support/init-data';
import { createTestApp, type TestApp } from './support/test-app';

const aziz = { id: 700001701, first_name: 'Aziz', language_code: 'uz' };
const olga = { id: 700001702, first_name: 'Ольга', language_code: 'ru' };
const AZIZ = String(aziz.id);
const OLGA = String(olga.id);

let t: TestApp;
beforeEach(async () => {
  t = await createTestApp(); // Monday 2026-11-23 10:00 Tashkent
});
afterEach(async () => {
  await t.close();
});

const auth = (user: TelegramTestUser) => tmaAuth(signInitData(user, { authDate: t.clock.now() }));
const miniApp = (user: TelegramTestUser, method: 'GET' | 'POST' | 'PUT', url: string, payload?: object) =>
  t.app.inject({ method, url: `/api${url}`, headers: auth(user), payload });
const admin = (method: 'GET' | 'POST' | 'PATCH' | 'PUT', url: string, headers: { cookie: string }, payload?: object) =>
  t.app.inject({ method, url: `/admin/api${url}`, headers, payload });

/** Moves one Xonadon of the Planirovka from one holat to another through the admin API (ADR 0003). */
async function holat(planirovkaId: number, dan: 'bosh' | 'bron' | 'sotilgan', ga: 'bosh' | 'bron' | 'sotilgan', headers: { cookie: string }) {
  return admin('PATCH', `/katalog/xonadonlar/${await xonadonOf(t.db, planirovkaId, dan)}`, headers, { holat: ga });
}

async function ochdi(user: TelegramTestUser) {
  expect((await miniApp(user, 'GET', '/me')).statusCode).toBe(200); // the Mini App opens with /api/me
}

async function korish(user: TelegramTestUser, planirovkaId: number) {
  await ochdi(user);
  expect((await miniApp(user, 'GET', `/katalog/planirovkalar/${planirovkaId}?lang=uz`)).statusCode).toBe(200);
}

/** Moves the clock and runs the jobs; returns what the bot sent to `chatId` meanwhile. */
async function after(hours: number, chatId: string) {
  const before = t.messenger.deliveredTo(chatId).length;
  t.clock.advance({ hours });
  await t.runJobs();
  return t.messenger.deliveredTo(chatId).slice(before);
}

/** Sets the clock to `days` days from today (Tashkent) at `time`. */
function kun(days: number, time: string) {
  t.clock.set(tashkentInstant(addDays(toTashkent(t.clock.now()).date, days), time));
}
const bugun = () => toTashkent(t.clock.now()).date;

function startapps(buttons: MessageButton[][] | undefined) {
  return (buttons ?? []).flat().flatMap((b) => ('startapp' in b ? [parseDojimParam(b.startapp)] : []));
}
const stopButton = (m: OutgoingMessage) =>
  (m.buttons ?? []).flat().find((b): b is { text: string; callbackData: string } => 'callbackData' in b);

async function yozil(user: TelegramTestUser, loyihaId: number, vaqt: string, extra: object = {}) {
  const res = await miniApp(user, 'POST', '/yozilishlar?lang=uz', {
    loyihaId,
    sana: bugun(),
    vaqt,
    name: user.first_name,
    phone: '901234567',
    ...extra,
  });
  expect(res.statusCode).toBe(201);
  return res.json().yozilish.id as number;
}

async function davomat(id: number, value: 'keldi' | 'kelmadi', headers: { cookie: string }) {
  expect((await admin('PATCH', `/yozilishlar/${id}/davomat`, headers, { davomat: value })).statusCode).toBe(200);
}

/** Sayhun: A blok — 2 xonali 54,5 m² (1 bo'sh), 2 xonali 52 m², 3 xonali 54 m²; B blok — 2 xonali 80 m², 2 xonali 50 m² (band). Navoiy: 2 xonali 55 m². */
async function katalog() {
  const sayhun = await seedLoyiha(t.db, {
    nomi: 'Sayhun',
    bloklar: [
      blok('A', [
        { xonalar: 2, maydon: 54.5, boshlangichNarx: 455_500_000, bosh: 1 },
        { xonalar: 2, maydon: 52, bosh: 3 },
        { xonalar: 3, maydon: 54, bosh: 2 },
      ]),
      blok('B', [
        { xonalar: 2, maydon: 80, bosh: 5 },
        { xonalar: 2, maydon: 50, bosh: 0, bron: 2 },
      ]),
    ],
  });
  const navoiy = await seedLoyiha(t.db, { nomi: 'Navoiy Bahor', shahar: 'navoiy', bloklar: [blok('1', [{ xonalar: 2, maydon: 55 }])] });
  const [a] = sayhun.bloklar;
  return {
    loyihaId: sayhun.id as number,
    planirovkaId: a!.planirovkalar[0]!.id as number,
    oxshash52: a!.planirovkalar[1]!.id as number,
    navoiy55: navoiy.bloklar[0]!.planirovkalar[0]!.id as number,
  };
}

describe("dojim: ko'rdi yoki hisobladi, Ariza qoldirmadi", () => {
  it("24 hours after viewing a Planirovka the Mijoz gets it back with «Ko'rishga yozilish»", async () => {
    const { loyihaId, planirovkaId } = await katalog();
    await korish(aziz, planirovkaId);

    expect(await after(23, AZIZ)).toEqual([]);
    const [msg, ...rest] = await after(1, AZIZ);

    expect(rest).toEqual([]);
    expect(msg!.text).toContain('Sayhun');
    expect(msg!.text).toContain('2 xonali, 54,5 m²');
    expect(startapps(msg!.buttons).map((p) => p!.ekran)).toEqual([
      { ekran: 'planirovka', planirovkaId },
      { ekran: 'yozilish', loyihaId, planirovkaId },
    ]);
    expect(stopButton(msg!)).toEqual({ text: '🔕 Yubormang', callbackData: 'dojim:stop' });
    expect(await after(24, AZIZ)).toEqual([]); // once
  });

  it('calculating counts as well; an Ariza within the 24 hours means no reminder', async () => {
    const { planirovkaId } = await katalog();
    await korish(olga, planirovkaId);
    await korish(aziz, planirovkaId);
    t.clock.advance({ hours: 20 });
    const hisob = await miniApp(olga, 'POST', '/kalkulyator/hisob', {
      planirovkaId,
      kirish: { sxema: 'muddatli', narx: 455_500_000, boshlangich: 150_000_000, oylar: 12 },
    });
    expect(hisob.statusCode).toBe(204);
    expect((await miniApp(aziz, 'POST', '/arizalar', { name: 'Aziz', phone: '901234567', planirovkaId })).statusCode).toBe(201);

    expect(await after(4, OLGA)).toEqual([]); // the hisob moved Olga's reminder: 24 h from the calculation
    expect(await after(20, OLGA)).toEqual([]); // due Wednesday 06:00 Tashkent: no messages at night
    const [olgaMsg] = await after(3, OLGA); // 09:00
    expect(olgaMsg!.text).toContain('2-комн., 54,5 м²'); // in her language
    expect(t.messenger.deliveredTo(AZIZ)).toEqual([]);
  });
});

describe("dojim: sevimli Planirovkada bo'sh qolmadi", () => {
  it("offers o'xshash Planirovkalar: same xonalar, near maydon, Sotuvda — the same Loyiha first", async () => {
    const { planirovkaId, oxshash52, navoiy55 } = await katalog();
    await ochdi(aziz);
    await ochdi(olga);
    expect((await miniApp(aziz, 'PUT', `/sevimlilar/${planirovkaId}`)).statusCode).toBe(204);
    const menejer = await adminLogin(t, 'menejer');

    expect((await holat(planirovkaId, 'bosh', 'bron', menejer)).statusCode).toBe(200);
    const [msg, ...rest] = await after(0.5, AZIZ);

    expect(rest).toEqual([]);
    expect(msg!.text).toContain('2 xonali, 54,5 m²');
    expect(startapps(msg!.buttons).map((p) => p!.ekran)).toEqual([
      { ekran: 'planirovka', planirovkaId: oxshash52 }, // not 3 xonali, not 80 m², not the band 50 m²
      { ekran: 'planirovka', planirovkaId: navoiy55 },
    ]);
    expect(t.messenger.deliveredTo(OLGA)).toEqual([]); // not her sevimli
  });

  it('is not sent when the Planirovka is back on sale before the morning', async () => {
    const { planirovkaId } = await katalog();
    await ochdi(aziz);
    await miniApp(aziz, 'PUT', `/sevimlilar/${planirovkaId}`);
    const administrator = await adminLogin(t, 'administrator');

    t.clock.set(tashkentInstant(bugun(), '22:00')); // night: waits for the morning
    expect((await holat(planirovkaId, 'bosh', 'sotilgan', administrator)).statusCode).toBe(200);
    expect((await holat(planirovkaId, 'sotilgan', 'bosh', administrator)).statusCode).toBe(200);

    expect(await after(12, AZIZ)).toEqual([]);
  });
});

/**
 * Xonadon level (#25, TZ UF-3: «Sevimlilardagi xonadon bronga o'tdi»).
 * Sayhun A: 2 xonali 54,5 m² — A-12 (5-qavat), A-13 (5-qavat), A-20 (7-qavat, sotilgan);
 * 2 xonali 52 m² — A-30 (3-qavat); 3 xonali 54 m² — A-40. Navoiy 1: 2 xonali 55 m² — 1-7.
 */
async function xonadonlar() {
  const sayhun = await seedLoyiha(t.db, {
    nomi: 'Sayhun',
    bloklar: [
      blok('A', [
        {
          xonalar: 2,
          maydon: 54.5,
          xonadonlar: [
            { qavat: 5, raqam: 12, narx: 455_500_000 },
            { qavat: 5, raqam: 13 },
            { qavat: 7, raqam: 20, holat: 'sotilgan' },
          ],
        },
        { xonalar: 2, maydon: 52, xonadonlar: [{ qavat: 3, raqam: 30 }] },
        { xonalar: 3, maydon: 54, xonadonlar: [{ qavat: 4, raqam: 40 }] },
      ]),
    ],
  });
  await seedLoyiha(t.db, {
    nomi: 'Navoiy Bahor',
    shahar: 'navoiy',
    bloklar: [blok('1', [{ xonalar: 2, maydon: 55, xonadonlar: [{ qavat: 2, raqam: 7 }] }])],
  });
  const { rows } = await t.db.query<{ id: number; nom: string; loyiha_id: number; planirovka_id: number }>(
    `SELECT x.id, b.nomi || '-' || x.raqam AS nom, b.loyiha_id, x.planirovka_id FROM xonadon x JOIN blok b ON b.id = x.blok_id`,
  );
  const id = (nom: string) => rows.find((r) => r.nom === nom)!.id;
  return { id, loyihaId: sayhun.id as number, planirovkaOf: (nom: string) => rows.find((r) => r.nom === nom)!.planirovka_id };
}

const xonadonHolati = (id: number, holat: 'bosh' | 'bron' | 'sotilgan', headers: { cookie: string }) =>
  admin('PATCH', `/katalog/xonadonlar/${id}`, headers, { holat });

describe("dojim: sevimli Xonadon bronga o'tdi (#25)", () => {
  it("offers o'xshash bo'sh Xonadonlar: same xonalar, near maydon — the same Blok and Loyiha first", async () => {
    const { id } = await xonadonlar();
    await ochdi(aziz);
    expect((await miniApp(aziz, 'PUT', `/sevimlilar/xonadonlar/${id('A-12')}`)).statusCode).toBe(204);
    const menejer = await adminLogin(t, 'menejer');

    expect((await xonadonHolati(id('A-12'), 'bron', menejer)).statusCode).toBe(200);
    const [msg, ...rest] = await after(0.5, AZIZ);

    expect(rest).toEqual([]);
    expect(msg!.text).toContain('Sayhun');
    expect(msg!.text).toContain('A-12, 2 xonali, 54,5 m²');
    expect(startapps(msg!.buttons).map((p) => p!.ekran)).toEqual([
      { ekran: 'xonadon', xonadonId: id('A-13') }, // same Planirovka
      { ekran: 'xonadon', xonadonId: id('A-30') }, // 52 m², same Blok
      { ekran: 'xonadon', xonadonId: id('1-7') }, // another Loyiha; not A-20 (sotilgan), not A-40 (3 xonali)
    ]);
    expect(stopButton(msg!)).toEqual({ text: '🔕 Yubormang', callbackData: 'dojim:stop' });
  });

  it('is not sent when the Xonadon is back to bo‘sh before the morning, nor for a Xonadon no longer sevimli', async () => {
    const { id } = await xonadonlar();
    await ochdi(aziz);
    await miniApp(aziz, 'PUT', `/sevimlilar/xonadonlar/${id('A-12')}`);
    await miniApp(aziz, 'PUT', `/sevimlilar/xonadonlar/${id('A-13')}`);
    const administrator = await adminLogin(t, 'administrator');

    t.clock.set(tashkentInstant(bugun(), '22:00')); // night: waits for the morning
    expect((await xonadonHolati(id('A-12'), 'sotilgan', administrator)).statusCode).toBe(200);
    expect((await xonadonHolati(id('A-12'), 'bosh', administrator)).statusCode).toBe(200);
    expect((await xonadonHolati(id('A-13'), 'bron', administrator)).statusCode).toBe(200);
    await t.app.inject({ method: 'DELETE', url: `/api/sevimlilar/xonadonlar/${id('A-13')}`, headers: auth(aziz) });

    expect(await after(12, AZIZ)).toEqual([]);
  });

  it('keeps «7 kunda 1 ta» and «Yubormang»', async () => {
    const { id } = await xonadonlar();
    for (const u of [aziz, olga]) {
      await ochdi(u);
      for (const nom of ['A-12', 'A-13']) await miniApp(u, 'PUT', `/sevimlilar/xonadonlar/${id(nom)}`);
    }
    await botEvent(t, aziz, { type: 'callback', data: 'dojim:stop' });
    const menejer = await adminLogin(t, 'menejer');

    await xonadonHolati(id('A-12'), 'bron', menejer);
    expect(await after(1, OLGA)).toHaveLength(1);
    kun(3, '10:00');
    await xonadonHolati(id('A-13'), 'bron', await adminLogin(t, 'menejer'));
    expect(await after(1, OLGA)).toEqual([]); // 3 days after the last one

    expect(t.messenger.deliveredTo(AZIZ)).toEqual([]);
  });

  it("24 hours after viewing a Xonadon kartochkasi the reminder opens that Xonadon", async () => {
    const { id, loyihaId, planirovkaOf } = await xonadonlar();
    await ochdi(aziz);
    expect((await miniApp(aziz, 'GET', `/katalog/xonadonlar/${id('A-12')}?lang=uz`)).statusCode).toBe(200);

    const [msg] = await after(24, AZIZ);

    expect(msg!.text).toContain('A-12, 2 xonali, 54,5 m²');
    expect(startapps(msg!.buttons).map((p) => p!.ekran)).toEqual([
      { ekran: 'xonadon', xonadonId: id('A-12') },
      { ekran: 'yozilish', loyihaId, planirovkaId: planirovkaOf('A-12') },
    ]);
  });
});

describe("dojim: ko'rishga keldi / kelmadi", () => {
  it('«kelmadi» → offers a new time an hour later; «keldi» → «Qanday bo\'ldi?» with the calculator', async () => {
    const { loyihaId } = await katalog();
    const yA = await yozil(aziz, loyihaId, '11:00');
    const yO = await yozil(olga, loyihaId, '12:00');
    const menejer = await adminLogin(t, 'menejer');
    t.clock.set(tashkentInstant(bugun(), '13:00'));
    await davomat(yA, 'kelmadi', menejer);
    await davomat(yO, 'keldi', menejer);

    expect(await after(0.5, AZIZ)).toEqual([]);
    const [kelmadi] = await after(0.5, AZIZ);
    expect(kelmadi!.text).toContain('Sayhun');
    expect(startapps(kelmadi!.buttons).map((p) => p!.ekran)).toEqual([{ ekran: 'yozilish', loyihaId }]);
    const [keldi] = t.messenger.deliveredTo(OLGA);
    expect(keldi!.text).toMatch(/Как вам\?/);
    expect(startapps(keldi!.buttons).map((p) => p!.ekran)).toEqual([{ ekran: 'kalkulyator' }]);
  });

  it('a corrected mark sends the right one only', async () => {
    const { loyihaId } = await katalog();
    const y = await yozil(aziz, loyihaId, '11:00');
    const menejer = await adminLogin(t, 'menejer');
    t.clock.set(tashkentInstant(bugun(), '12:00'));
    await davomat(y, 'kelmadi', menejer);
    t.clock.advance({ minutes: 20 });
    await davomat(y, 'keldi', menejer);

    const sent = await after(2, AZIZ);
    expect(sent).toHaveLength(1);
    expect(startapps(sent[0]!.buttons).map((p) => p!.ekran.ekran)).toEqual(['kalkulyator']);
  });
});

describe('dojim: ≤ 1 per 7 days, «Yubormang», blocked bot', () => {
  it('sends at most one dojim per Mijoz in 7 days', async () => {
    const { planirovkaId } = await katalog();
    await korish(aziz, planirovkaId);
    expect(await after(24, AZIZ)).toHaveLength(1); // Tuesday

    kun(2, '10:00');
    await korish(aziz, planirovkaId);
    expect(await after(24, AZIZ)).toEqual([]); // Friday: 3 days after the last one

    kun(3, '10:00');
    await korish(aziz, planirovkaId);
    expect(await after(24, AZIZ)).toHaveLength(1); // next Wednesday: 8 days after
  });

  it('«Yubormang» stops every ssenariy for good', async () => {
    const { loyihaId, planirovkaId } = await katalog();
    await ochdi(aziz);
    const reply = await botEvent(t, aziz, { type: 'callback', data: 'dojim:stop' });
    expect(sends(reply)[0]!.text).toContain('boshqa yubormaymiz');

    // Olga does the same things and is the control: one dojim in each 8-day phase.
    // 1) ko'rdi
    for (const u of [aziz, olga]) await korish(u, planirovkaId);
    expect(await after(24, OLGA)).toHaveLength(1);
    // 2) sevimli band bo'ldi
    kun(8, '10:00');
    for (const u of [aziz, olga]) await miniApp(u, 'PUT', `/sevimlilar/${planirovkaId}`);
    expect((await holat(planirovkaId, 'bosh', 'bron', await adminLogin(t, 'menejer'))).statusCode).toBe(200);
    expect(await after(1, OLGA)).toHaveLength(1);
    // 3) kelmadi, 4) keldi
    for (const mark of ['kelmadi', 'keldi'] as const) {
      kun(8, '10:00');
      const ids = [await yozil(aziz, loyihaId, '11:00'), await yozil(olga, loyihaId, '11:00')];
      t.clock.set(tashkentInstant(bugun(), '12:00'));
      const menejer = await adminLogin(t, 'menejer'); // sessions expire: log in each phase
      for (const id of ids) await davomat(id, mark, menejer);
      expect(await after(2, OLGA)).toHaveLength(1);
    }

    expect(t.messenger.deliveredTo(AZIZ)).toEqual([]);
  });

  it('skips a Mijoz who blocked the bot and marks them blocked', async () => {
    const { planirovkaId } = await katalog();
    await korish(aziz, planirovkaId);
    t.messenger.blockBy(AZIZ);

    await after(24, AZIZ);

    const { rows } = await t.db.query('SELECT bot_blocked FROM mijoz WHERE telegram_id = $1', [AZIZ]);
    expect(rows[0].bot_blocked).toBe(true);
    expect(await after(24 * 8, AZIZ)).toEqual([]);
  });
});

describe('dojim → ko\'rishga yozilish (hisobot)', () => {
  it("counts a booking made from a dojim button; someone else's dojim id is ignored", async () => {
    const { loyihaId, planirovkaId } = await katalog();
    await korish(aziz, planirovkaId);
    const [msg] = await after(24, AZIZ);
    const dojimId = startapps(msg!.buttons)[1]!.dojimId;

    await ochdi(olga);
    await yozil(olga, loyihaId, '15:00', { planirovkaId, dojimId }); // forged
    await yozil(aziz, loyihaId, '16:00', { planirovkaId, dojimId });

    const kecha = new Date(t.clock.now().getTime() - 86_400_000);
    expect(await dojimYozilishlari(t.db, kecha, new Date(t.clock.now().getTime() + 1))).toBe(1);
  });
});

describe('dojim: matnlar in the admin-panel', () => {
  it('the Administrator edits the RU/UZ texts and turns a ssenariy off; the Menejer cannot', async () => {
    const { planirovkaId } = await katalog();
    const administrator = await adminLogin(t, 'administrator');
    const menejer = await adminLogin(t, 'menejer');
    const res = await admin('GET', '/dojim', administrator);
    expect(res.statusCode).toBe(200);
    const sozlama = res.json();
    expect(Object.keys(sozlama)).toEqual(['korish', 'sevimliBand', 'kelmadi', 'keldi']);

    sozlama.korish.matn = { uz: 'Salom! {planirovka} sizni kutmoqda ({loyiha}).', ru: 'Привет! {planirovka} ждёт вас ({loyiha}).' };
    expect((await admin('PUT', '/dojim', menejer, sozlama)).statusCode).toBe(403);
    expect((await admin('PUT', '/dojim', administrator, { ...sozlama, keldi: { yoqilgan: true, matn: { uz: '', ru: 'x' } } })).statusCode).toBe(400);
    const saved = await admin('PUT', '/dojim', administrator, sozlama);
    expect(saved.statusCode).toBe(200);
    expect((await admin('GET', '/dojim', administrator)).json().korish.matn.uz).toBe(sozlama.korish.matn.uz);

    await korish(aziz, planirovkaId);
    const [msg] = await after(24, AZIZ);
    expect(msg!.text).toBe('Salom! 2 xonali, 54,5 m² sizni kutmoqda (Sayhun).');

    sozlama.korish.yoqilgan = false;
    await admin('PUT', '/dojim', administrator, sozlama);
    kun(8, '10:00');
    await korish(aziz, planirovkaId);
    expect(await after(24, AZIZ)).toEqual([]);
  });
});
