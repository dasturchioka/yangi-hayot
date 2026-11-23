import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { blok, seedLoyiha, xonadonOf } from './support/katalog';
import { signInitData, tmaAuth, type TelegramTestUser } from './support/init-data';
import { createTestApp, TEST_MINIAPP_LINK, type TestApp } from './support/test-app';

/**
 * Xonadon darajasi (#25, ADR 0003; TZ UF-5, 8-bo'lim): «Ulashish», Ariza
 * and taqqoslash about one Xonadon, not only its Planirovka.
 */

const aziz = { id: 700002501, first_name: 'Aziz', username: 'aziz_k', language_code: 'uz' };
/** Aziz's wife: gets the link in a Telegram chat. */
const dilnoza = { id: 700002502, first_name: 'Dilnoza', language_code: 'uz' };

const SHARED = 'mijoz ulashdi';

let t: TestApp;
beforeEach(async () => {
  t = await createTestApp();
});
afterEach(async () => {
  await t.close();
});

const auth = (user: TelegramTestUser, startParam?: string) =>
  tmaAuth(signInitData(user, { authDate: t.clock.now(), startParam }));

/** Sayhun, Blok A: one 2-xonali Planirovka; Xonadon A-12 on the 5th floor with its own narx. */
async function sayhun() {
  const l = await seedLoyiha(t.db, {
    nomi: 'Sayhun',
    bloklar: [
      blok('A', [
        {
          xonalar: 2,
          maydon: 54.5,
          nomi: { uz: 'Shinam', ru: 'Уютная' },
          boshlangichNarx: 400_000_000,
          xonadonlar: [
            { qavat: 5, raqam: 12, narx: 455_500_000 },
            { qavat: 2, raqam: 3 },
          ],
        },
      ]),
    ],
  });
  const planirovkaId = l.bloklar[0]!.planirovkalar[0]!.id;
  const { rows } = await t.db.query<{ id: number }>('SELECT id FROM xonadon WHERE planirovka_id = $1 AND raqam = 12', [
    planirovkaId,
  ]);
  return { loyihaId: l.id, planirovkaId, xonadonId: rows[0]!.id };
}

async function shareXonadon(user: TelegramTestUser, xonadonId: number): Promise<string> {
  const res = await t.app.inject({ method: 'POST', url: '/api/ulashish', headers: auth(user), payload: { xonadonId } });
  expect(res.statusCode).toBe(200);
  const { url } = res.json() as { url: string };
  expect(url.startsWith(`${TEST_MINIAPP_LINK}?startapp=`)).toBe(true);
  const startParam = new URL(url).searchParams.get('startapp')!;
  expect(startParam).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
  return startParam;
}

async function open(user: TelegramTestUser, startParam?: string) {
  const res = await t.app.inject({ method: 'GET', url: '/api/me', headers: auth(user, startParam) });
  expect(res.statusCode).toBe(200);
  return res.json() as { manba: { first: string; last: string }; start: unknown };
}

describe('«Ulashish» of a Xonadon (UF-5)', () => {
  it('opens the same Xonadon for another Mijoz, and her Ariza comes with Manba «mijoz ulashdi»', async () => {
    const { xonadonId } = await sayhun();
    const startParam = await shareXonadon(aziz, xonadonId);

    const me = await open(dilnoza, startParam);
    expect(me.start).toEqual({ ekran: 'xonadon', xonadonId });
    expect(me.manba.last).toBe(SHARED);
    const card = await t.app.inject({
      method: 'GET',
      url: `/api/katalog/xonadonlar/${xonadonId}`,
      headers: auth(dilnoza, startParam),
    });
    expect(card.json().xonadon.id).toBe(xonadonId);

    const ariza = await t.app.inject({
      method: 'POST',
      url: '/api/arizalar',
      headers: auth(dilnoza, startParam),
      payload: { name: 'Dilnoza', phone: '90 765 43 21', xonadonId },
    });

    expect(ariza.statusCode).toBe(201);
    const bitim = t.crm.bitimlar[0]!;
    expect(bitim.manba).toBe(SHARED);
    expect(bitim.tags).toContain(SHARED);
    expect(bitim.notes[0]).toContain('Ulashgan: Aziz · @aziz_k');
    expect(bitim.notes[0]).toContain('Xonadon A-12');
  });

  it('the sharer opening his own link changes nothing; a forged share id still opens the Xonadon', async () => {
    const { xonadonId } = await sayhun();
    const startParam = await shareXonadon(aziz, xonadonId);

    expect((await open(aziz, startParam)).manba.last).not.toBe(SHARED);
    const forged = await open(dilnoza, `xn${xonadonId}_u987654`);
    expect(forged.start).toEqual({ ekran: 'xonadon', xonadonId });
    expect(forged.manba.last).not.toBe(SHARED);
  });

  it('cannot share a Xonadon that is not in the katalog', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/ulashish',
      headers: auth(aziz),
      payload: { xonadonId: 999_999 },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('Ariza about a Xonadon (8-bo\'lim: «xonadon (tanlangan bo\'lsa)»)', () => {
  it('the CRM note names Blok, qavat, raqam, xonalar, m² and the Xonadon narx', async () => {
    const { xonadonId } = await sayhun();

    const res = await t.app.inject({
      method: 'POST',
      url: '/api/arizalar',
      headers: auth(aziz),
      payload: { name: 'Aziz', phone: '90 123 45 67', xonadonId },
    });

    expect(res.statusCode).toBe(201);
    const note = t.crm.bitimlar[0]!.notes[0]!;
    expect(note).toContain('Loyiha: Sayhun');
    expect(note).toContain(
      "Xonadon A-12: A blok, 5-qavat, 12-xonadon, 2 xonali, 54,5 m², 455 500 000 so'm (planirovka «Shinam»)",
    );
  });

  it('a Xonadon that is not bo\'sh any more is still accepted, and the note says so', async () => {
    const { planirovkaId } = await sayhun();
    const bron = await xonadonOf(t.db, planirovkaId, 'bosh');
    await t.db.query(`UPDATE xonadon SET holat = 'bron' WHERE id = $1`, [bron]);

    const res = await t.app.inject({
      method: 'POST',
      url: '/api/arizalar',
      headers: auth(aziz),
      payload: { name: 'Aziz', phone: '90 123 45 67', xonadonId: bron },
    });

    expect(res.statusCode).toBe(201);
    expect(t.crm.bitimlar[0]!.notes[0]).toContain('hozir bron');
  });

  it('rejects an unknown Xonadon, or one that is not in the Planirovka given', async () => {
    const { xonadonId } = await sayhun();
    const other = await sayhun();

    const unknown = await t.app.inject({
      method: 'POST',
      url: '/api/arizalar',
      headers: auth(aziz),
      payload: { name: 'Aziz', phone: '90 123 45 67', xonadonId: 999_999 },
    });
    const mismatch = await t.app.inject({
      method: 'POST',
      url: '/api/arizalar',
      headers: auth(aziz),
      payload: { name: 'Aziz', phone: '90 123 45 67', xonadonId, planirovkaId: other.planirovkaId },
    });

    expect(unknown.statusCode).toBe(400);
    expect(mismatch.statusCode).toBe(400);
    expect(t.crm.bitimlar).toHaveLength(0);
  });

  it('the Mijoz\'s Arizalar list carries the xonadonId', async () => {
    const { xonadonId, planirovkaId } = await sayhun();
    await t.app.inject({
      method: 'POST',
      url: '/api/arizalar',
      headers: auth(aziz),
      payload: { name: 'Aziz', phone: '90 123 45 67', xonadonId },
    });

    const list = await t.app.inject({ method: 'GET', url: '/api/arizalar', headers: auth(aziz) });
    expect(list.json().arizalar[0]).toMatchObject({ xonadonId, planirovkaId });
  });
});

describe('Ko‘rishga yozilish and kalkulyator from a Xonadon', () => {
  const XONADON_LINE = 'Xonadon A-12: A blok, 5-qavat, 12-xonadon';

  it('a booking carries the Xonadon to the CRM note and to the yozilish', async () => {
    const { loyihaId, planirovkaId, xonadonId } = await sayhun();

    const res = await t.app.inject({
      method: 'POST',
      url: '/api/yozilishlar',
      headers: auth(aziz),
      payload: { loyihaId, xonadonId, sana: '2026-11-25', vaqt: '12:00', name: 'Aziz', phone: '90 123 45 67' },
    });

    expect(res.statusCode).toBe(201);
    expect(t.crm.bitimlar[0]!.notes[0]).toContain(XONADON_LINE);
    const { rows } = await t.db.query('SELECT planirovka_id, xonadon_id FROM yozilish');
    expect(rows).toEqual([{ planirovka_id: planirovkaId, xonadon_id: xonadonId }]);
  });

  it('a booking with a Xonadon of another Loyiha is refused', async () => {
    const { xonadonId } = await sayhun();
    const other = await sayhun();

    const res = await t.app.inject({
      method: 'POST',
      url: '/api/yozilishlar',
      headers: auth(aziz),
      payload: { loyihaId: other.loyihaId, xonadonId, sana: '2026-11-25', vaqt: '12:00', name: 'Aziz', phone: '901234567' },
    });

    expect(res.statusCode).toBe(400);
  });

  it('«Hisobni menejerga yuborish» with the Xonadon narx names the Xonadon in the note', async () => {
    const { xonadonId } = await sayhun();

    const res = await t.app.inject({
      method: 'POST',
      url: '/api/kalkulyator/ariza',
      headers: auth(aziz),
      payload: {
        name: 'Aziz',
        phone: '90 123 45 67',
        xonadonId,
        kirish: { sxema: 'muddatli', narx: 455_500_000, boshlangich: 136_650_000, oylar: 24 },
      },
    });

    expect(res.statusCode).toBe(201);
    const note = t.crm.bitimlar[0]!.notes[0]!;
    expect(note).toContain(XONADON_LINE);
    expect(note).toContain("Narx: 455 500 000 so'm");
  });
});

describe('Sevimli Xonadonlar and taqqoslash (UF-5)', () => {
  const put = (id: number) => t.app.inject({ method: 'PUT', url: `/api/sevimlilar/xonadonlar/${id}`, headers: auth(aziz) });
  const del = (id: number) =>
    t.app.inject({ method: 'DELETE', url: `/api/sevimlilar/xonadonlar/${id}`, headers: auth(aziz) });
  const list = async () => {
    const res = await t.app.inject({ method: 'GET', url: '/api/sevimlilar?lang=uz', headers: auth(aziz) });
    expect(res.statusCode).toBe(200);
    return res.json() as {
      xonadonlar: { xonadon: { id: number; raqam: number }; planirovka: { id: number; nomi: string | null } }[];
      planirovkalar: { id: number }[];
    };
  };
  const taqqosla = (ids: string) =>
    t.app.inject({ method: 'GET', url: `/api/taqqoslash?ids=${ids}&lang=uz`, headers: auth(aziz) });

  it('a Xonadon is favourited on its own, next to sevimli Planirovkalar, newest first', async () => {
    const { xonadonId, planirovkaId } = await sayhun();
    const second = (await sayhun()).xonadonId;

    expect((await put(xonadonId)).statusCode).toBe(204);
    t.clock.advance({ minutes: 1 });
    expect((await put(second)).statusCode).toBe(204);
    await put(second); // twice = once
    await t.app.inject({ method: 'PUT', url: `/api/sevimlilar/${planirovkaId}`, headers: auth(aziz) });

    const s = await list();
    expect(s.xonadonlar.map((x) => x.xonadon.id)).toEqual([second, xonadonId]);
    expect(s.xonadonlar[1]!.planirovka).toMatchObject({ id: planirovkaId, nomi: 'Shinam' });
    expect(s.planirovkalar.map((p) => p.id)).toEqual([planirovkaId]);

    expect((await del(second)).statusCode).toBe(204);
    expect((await list()).xonadonlar.map((x) => x.xonadon.id)).toEqual([xonadonId]);
    expect((await put(999_999)).statusCode).toBe(404);
  });

  it('compares Xonadonlar and Planirovkalar by narx, maydon, qavat and oylik to‘lov', async () => {
    const { xonadonId, planirovkaId } = await sayhun();

    const res = await taqqosla(`x${xonadonId},p${planirovkaId}`);

    expect(res.statusCode).toBe(200);
    expect(res.json().ustunlar).toEqual([
      {
        kalit: `x${xonadonId}`,
        tur: 'xonadon',
        id: xonadonId,
        raqam: 'A-12',
        qavat: { dan: 5, gacha: 5 },
        loyihaNomi: 'Sayhun',
        blokNomi: 'A',
        nomi: 'Shinam',
        xonalar: 2,
        maydon: 54.5,
        boshlangichNarx: 455_500_000,
        kvMetrNarxi: 8_357_798,
        oylikTolov: 13_285_417, // default muddatli: 30%, 24 oy, ustama 0 → 318 850 000 / 24
        holat: 'sotuvda',
      },
      {
        kalit: `p${planirovkaId}`,
        tur: 'planirovka',
        id: planirovkaId,
        raqam: null,
        qavat: { dan: 2, gacha: 5 }, // floors of its bo'sh Xonadonlar
        loyihaNomi: 'Sayhun',
        blokNomi: 'A',
        nomi: 'Shinam',
        xonalar: 2,
        maydon: 54.5,
        boshlangichNarx: 455_500_000, // Boshlang'ich narx: lowest own narx of bo'sh Xonadonlar (ADR 0003)
        kvMetrNarxi: 8_357_798,
        oylikTolov: 13_285_417,
        holat: 'sotuvda',
      },
    ]);
  });

  it('a booked Xonadon shows as band; more than 3 columns is refused', async () => {
    const { xonadonId, planirovkaId } = await sayhun();
    await t.db.query(`UPDATE xonadon SET holat = 'bron' WHERE id = $1`, [xonadonId]);
    const other = await xonadonOf(t.db, planirovkaId, 'bosh');

    const ok = await taqqosla(`x${xonadonId},x${other}`);
    const tooMany = await taqqosla(`x${xonadonId},x${other},p${planirovkaId},x999`);

    expect(ok.json().ustunlar.map((u: { holat: string }) => u.holat)).toEqual(['band', 'sotuvda']);
    expect(tooMany.statusCode).toBe(400);
  });
});
