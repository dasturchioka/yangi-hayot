import type { KalkulyatorSozlamalari } from '@yh/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { oxirgiHisob } from '../src/kalkulyator/kalkulyator';
import { adminLogin } from './support/admin';
import { blok, seedLoyiha } from './support/katalog';
import { signInitData, tmaAuth, type TelegramTestUser } from './support/init-data';
import { createTestApp, type TestApp } from './support/test-app';

const aziz = { id: 700001201, first_name: 'Aziz', language_code: 'uz' };

let t: TestApp;
beforeEach(async () => {
  t = await createTestApp();
});
afterEach(async () => {
  await t.close();
});

function auth(user: TelegramTestUser = aziz) {
  return tmaAuth(signInitData(user, { authDate: t.clock.now() }));
}

const sozlama: KalkulyatorSozlamalari = {
  muddatli: { yoqilgan: true, minBoshlangichFoiz: 20, maxMuddatOy: 36, ustamaFoiz: 5 },
  banklar: [
    { id: 'xalq', nomi: 'Xalq banki', stavka: 17, minBoshlangichFoiz: 25, muddatlarYil: [10, 15, 20] },
    { id: 'ipoteka', nomi: 'Ipoteka-bank', stavka: 19.5, minBoshlangichFoiz: 20, muddatlarYil: [5, 10] },
  ],
};

async function setSozlama(s: KalkulyatorSozlamalari = sozlama) {
  const headers = await adminLogin(t, 'administrator');
  return t.app.inject({ method: 'PUT', url: '/admin/api/kalkulyator', headers, payload: s });
}

describe('kalkulyator settings', () => {
  it('the Mini App reads the defaults: muddatli to‘lov on, Xalq banki first', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/api/kalkulyator', headers: auth() });
    expect(res.statusCode).toBe(200);
    const { sozlama } = res.json();
    expect(sozlama.muddatli.yoqilgan).toBe(true);
    expect(sozlama.banklar[0].nomi).toBe('Xalq banki');
  });

  it('the Administrator changes them in the admin-panel; the Mini App sees the change', async () => {
    expect((await setSozlama()).statusCode).toBe(200);

    const headers = await adminLogin(t, 'administrator');
    expect((await t.app.inject({ method: 'GET', url: '/admin/api/kalkulyator', headers })).json()).toEqual({ sozlama });
    const res = await t.app.inject({ method: 'GET', url: '/api/kalkulyator', headers: auth() });
    expect(res.json()).toEqual({ sozlama });
  });

  it('a Menejer cannot change them', async () => {
    const headers = await adminLogin(t, 'menejer');
    const res = await t.app.inject({ method: 'PUT', url: '/admin/api/kalkulyator', headers, payload: sozlama });
    expect(res.statusCode).toBe(403);
  });

  it('rejects nonsense: no banks, a bank without muddatlar, duplicate ids, percentages over 100', async () => {
    const bad: object[] = [
      { ...sozlama, banklar: [] },
      { ...sozlama, banklar: [{ ...sozlama.banklar[0], muddatlarYil: [] }] },
      { ...sozlama, banklar: [sozlama.banklar[0], sozlama.banklar[0]] },
      { ...sozlama, muddatli: { ...sozlama.muddatli, minBoshlangichFoiz: 101 } },
    ];
    const headers = await adminLogin(t, 'administrator');
    for (const payload of bad) {
      const res = await t.app.inject({ method: 'PUT', url: '/admin/api/kalkulyator', headers, payload });
      expect(res.statusCode).toBe(400);
    }
  });
});

describe('«hisobladi» is recorded for dojim (#17) and Daraja (#18)', () => {
  const hisob = (payload: Record<string, unknown>) =>
    t.app.inject({ method: 'POST', url: '/api/kalkulyator/hisob', headers: auth(), payload });

  it('keeps the latest hisob with its Planirovka, input and result', async () => {
    const { bloklar } = await seedLoyiha(t.db, { bloklar: [blok('A', [{ boshlangichNarx: 455_500_000 }])] });
    const planirovkaId = bloklar[0]!.planirovkalar[0]!.id;
    expect(await oxirgiHisob(t.db, String(aziz.id))).toBeNull();

    const kirish = { sxema: 'muddatli', narx: 455_500_000, boshlangich: 136_650_000, oylar: 24 };
    expect((await hisob({ kirish, planirovkaId })).statusCode).toBe(204);
    t.clock.advance({ minutes: 1 });
    const later = { sxema: 'annuitet', narx: 455_500_000, boshlangich: 136_650_000, yillar: 15, bankId: 'xalq' };
    expect((await hisob({ kirish: later, planirovkaId })).statusCode).toBe(204);

    expect(await oxirgiHisob(t.db, String(aziz.id))).toEqual({
      id: expect.any(Number),
      planirovkaId,
      sxema: 'annuitet',
      kirish: later,
      natija: expect.objectContaining({ sxema: 'annuitet', bank: 'Xalq banki', oylik: expect.any(Number) }),
      arizaId: null,
      at: t.clock.now(),
    });
  });

  it('does not record an input outside the settings', async () => {
    const res = await hisob({ kirish: { sxema: 'muddatli', narx: 100_000_000, boshlangich: 0, oylar: 12 } });
    expect(res.statusCode).toBe(400);
    expect(await oxirgiHisob(t.db, String(aziz.id))).toBeNull();
  });

  it('a hisob sent to the manager is linked to its Ariza', async () => {
    const res = await postAriza({
      name: 'Aziz',
      phone: '901234567',
      kirish: { sxema: 'muddatli', narx: 600_000_000, boshlangich: 300_000_000, oylar: 12 },
    });
    expect((await oxirgiHisob(t.db, String(aziz.id)))?.arizaId).toBe(res.json().id);
  });
});

describe('taqqoslash: oylik to‘lov', () => {
  async function taqqosla() {
    const { bloklar } = await seedLoyiha(t.db, {
      bloklar: [blok('A', [{ boshlangichNarx: 400_000_000 }, { boshlangichNarx: null }])],
    });
    const ids = bloklar[0]!.planirovkalar.map((p) => p.id);
    const res = await t.app.inject({ method: 'GET', url: `/api/taqqoslash?ids=${ids.join(',')}`, headers: auth() });
    return res.json().ustunlar.map((p: { oylikTolov: number | null }) => p.oylikTolov);
  }

  it('muddatli to‘lov with the minimal boshlang‘ich to‘lov over the maximal muddat; no price → null', async () => {
    await setSozlama(); // 20%, 36 oy, ustama 5%: 320 000 000 · 1,05 / 36
    expect(await taqqosla()).toEqual([9_333_333, null]);
  });

  it('muddatli to‘lov switched off → annuitet of the first bank over its longest muddat', async () => {
    await setSozlama({ ...sozlama, muddatli: { ...sozlama.muddatli, yoqilgan: false } });
    // Xalq banki: 25% → P = 300 000 000, 17%, 20 yil
    expect(await taqqosla()).toEqual([4_400_402, null]);
  });
});

function postAriza(payload: Record<string, unknown>, user: TelegramTestUser = aziz) {
  return t.app.inject({ method: 'POST', url: '/api/kalkulyator/ariza', headers: auth(user), payload });
}

describe('«Hisobni menejerga yuborish» → bot_calc Ariza', () => {
  it('sends the scheme, narx, boshlang‘ich to‘lov, muddat, ustama and the payment in the note', async () => {
    await setSozlama();
    const { bloklar } = await seedLoyiha(t.db, {
      nomi: 'Jozibali Maskan',
      bloklar: [blok('A', [{ xonalar: 2, maydon: 54.5, boshlangichNarx: 455_500_000 }])],
    });
    const planirovkaId = bloklar[0]!.planirovkalar[0]!.id;

    const res = await postAriza({
      name: 'Aziz',
      phone: '90 123 45 67',
      planirovkaId,
      // the Mijoz changed the price the Planirovka put in
      kirish: { sxema: 'muddatli', narx: 600_000_000, boshlangich: 180_000_000, oylar: 12 },
    });

    expect(res.statusCode).toBe(201);
    const bitim = t.crm.bitimlar[0]!;
    expect(bitim.tags).toContain('bot_calc');
    const note = bitim.notes[0]!;
    expect(note).toContain('Jozibali Maskan');
    expect(note).toContain("Sxema: Muddatli to'lov");
    expect(note).toContain("Narx: 600 000 000 so'm");
    expect(note).toContain("Boshlang'ich to'lov: 180 000 000 so'm (30%)");
    expect(note).toContain('Muddat: 12 oy');
    expect(note).toContain('Ustama: 5%');
    expect(note).toContain("Oylik to'lov: 36 750 000 so'm");
    expect(note).toContain("Ortiqcha to'lov: 21 000 000 so'm");
    expect(note).toContain("Umumiy summa: 621 000 000 so'm");
    expect(t.crm.tasks[0]).toMatchObject({ kind: 'call' });
  });

  it('ipoteka from a bank: stavka and bank; differensial: first and last payment', async () => {
    await setSozlama();
    await postAriza({
      name: 'Aziz',
      phone: '901234567',
      kirish: { sxema: 'differensial', narx: 600_000_000, boshlangich: 150_000_000, yillar: 20, bankId: 'xalq' },
    });
    const note = t.crm.bitimlar[0]!.notes[0]!;
    expect(note).toContain('Sxema: Ipoteka, differensial');
    expect(note).toContain('Muddat: 20 yil');
    expect(note).toContain('Stavka: 17% (Xalq banki)');
    expect(note).toMatch(/Birinchi to'lov: [\d ]+ so'm/);
    expect(note).toMatch(/Oxirgi to'lov: [\d ]+ so'm/);
  });

  it('ipoteka with a hand-typed stavka', async () => {
    await postAriza({
      name: 'Aziz',
      phone: '901234567',
      kirish: { sxema: 'annuitet', narx: 455_500_000, boshlangich: 136_650_000, yillar: 15, stavka: 18 },
    });
    const note = t.crm.bitimlar[0]!.notes[0]!;
    expect(note).toContain('Sxema: Ipoteka, annuitet');
    expect(note).toContain("Stavka: 18% (qo'lda)");
    expect(note).toContain("Oylik to'lov: 5 134 827 so'm");
  });

  it('refuses an input outside the settings (below the minimal boshlang‘ich to‘lov, too long)', async () => {
    await setSozlama();
    const res = await postAriza({
      name: 'Aziz',
      phone: '901234567',
      kirish: { sxema: 'muddatli', narx: 600_000_000, boshlangich: 100_000_000, oylar: 48 },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'kirish', xatolar: ['boshlangich_kam', 'muddat_kop'] });
    expect(t.crm.bitimlar).toHaveLength(0);
  });

  it('refuses a bad phone', async () => {
    const res = await postAriza({
      name: 'Aziz',
      phone: '12',
      kirish: { sxema: 'muddatli', narx: 600_000_000, boshlangich: 300_000_000, oylar: 12 },
    });
    expect(res.statusCode).toBe(400);
  });

  it('shows in the Mijoz‘s own Arizalar as a kalkulyator Ariza', async () => {
    await postAriza({
      name: 'Aziz',
      phone: '901234567',
      kirish: { sxema: 'muddatli', narx: 600_000_000, boshlangich: 300_000_000, oylar: 12 },
    });
    const res = await t.app.inject({ method: 'GET', url: '/api/arizalar', headers: auth() });
    expect(res.json().arizalar).toEqual([expect.objectContaining({ tur: 'calc' })]);
  });
});
