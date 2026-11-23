import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { oxirgiKvizJavoblari } from '../src/kviz/kviz';
import { adminLogin } from './support/admin';
import { signInitData, tmaAuth, type TelegramTestUser } from './support/init-data';
import { createTestApp, type TestApp } from './support/test-app';

// «Xonadon tanlash» kvizi (#10): answers → bot_quiz Ariza (8-bo'lim), Shaharga qiziqish, filter of matching Planirovkalar.

const aziz = { id: 700000020, first_name: 'Aziz', username: 'aziz_k', language_code: 'uz' };
const mln = (n: number) => n * 1_000_000;

const javoblar = {
  shahar: 'navoiy',
  tur: 'yashash',
  xonalar: [2, 4],
  byudjet: { dan: mln(400), gacha: mln(500) },
  muddat: '1_3_oy',
  tolov: 'ipoteka',
  name: 'Aziz',
  phone: '90 123 45 67',
};

let t: TestApp;
beforeEach(async () => {
  t = await createTestApp();
});
afterEach(async () => {
  await t.close();
});

function postKviz(payload: Record<string, unknown>, user: TelegramTestUser = aziz) {
  return t.app.inject({
    method: 'POST',
    url: '/api/kviz',
    headers: tmaAuth(signInitData(user, { authDate: t.clock.now() })),
    payload,
  });
}

describe('Kviz yakuni → bot_quiz Ariza', () => {
  it('sends a bot_quiz Ariza to amoCRM with the answers in the note and a 15-minute call task', async () => {
    const res = await postKviz(javoblar);

    expect(res.statusCode).toBe(201);
    expect(t.crm.contacts).toEqual([expect.objectContaining({ name: 'Aziz', phone: '+998901234567' })]);
    const bitim = t.crm.bitimlar[0]!;
    expect(bitim.tags).toContain('bot_quiz');
    const note = bitim.notes[0]!;
    expect(note).toContain('Shahar: Navoiy');
    expect(note).toContain('Tur: Yashash uchun');
    expect(note).toContain('Xonalar: 2, 4+');
    expect(note).toContain("Byudjet: 400–500 mln so'm");
    expect(note).toContain('Xarid muddati: 1–3 oy');
    expect(note).toContain("To'lov usuli: Ipoteka");
    expect(t.crm.tasks).toEqual([
      expect.objectContaining({ kind: 'call', dueAt: new Date('2026-11-23T05:15:00Z') }),
    ]);
  });

  it('answers with the filter of matching Planirovkalar (only bo\'sh ones)', async () => {
    const res = await postKviz(javoblar);
    expect(res.json().filtr).toEqual({
      shahar: 'navoiy',
      xonalar: [2, 4],
      narxDan: mln(400),
      narxGacha: mln(500),
      faqatBosh: true,
    });
  });

  it('writes open-ended budgets the way managers read them', async () => {
    await postKviz({ ...javoblar, byudjet: { dan: mln(700), gacha: null } });
    await postKviz({ ...javoblar, byudjet: { dan: null, gacha: mln(500) }, muddat: 'shu_oy' });
    await postKviz({ ...javoblar, byudjet: null, muddat: 'bilmayman' });
    const notes = t.crm.bitimlar[0]!.notes.join('\n');
    expect(notes).toContain("Byudjet: 700 mln so'mdan");
    expect(notes).toContain("Byudjet: 500 mln so'mgacha");
    expect(notes).toContain('Byudjet: aniqlanmagan');
  });

  it('rejects incomplete answers and bad phones', async () => {
    expect((await postKviz({ ...javoblar, xonalar: [] })).statusCode).toBe(400);
    expect((await postKviz({ ...javoblar, tolov: 'naqd' })).statusCode).toBe(400);
    expect((await postKviz({ ...javoblar, shahar: 'samarqand' })).statusCode).toBe(400);
    expect((await postKviz({ ...javoblar, phone: '123' })).json()).toEqual({ error: 'phone' });
    expect(t.crm.bitimlar).toHaveLength(0);
  });

  it('a double tap is one Ariza', async () => {
    const a = await postKviz(javoblar);
    const b = await postKviz(javoblar);
    expect(b.statusCode).toBe(200);
    expect(b.json().id).toBe(a.json().id);
    expect(t.crm.bitimlar[0]!.notes).toHaveLength(1);
  });
});

describe('Kviz javoblari', () => {
  it("update the Mijoz's Shaharga qiziqish", async () => {
    await postKviz(javoblar);
    const res = await t.app.inject({
      method: 'GET',
      url: '/admin/api/rassilka/audiences',
      headers: await adminLogin(t, 'administrator'),
    });
    expect(res.json()).toMatchObject({ navoiy: 1, toshkent: 0 });
  });

  it('are kept for lead scoring: the latest answers of a Mijoz', async () => {
    expect(await oxirgiKvizJavoblari(t.db, String(aziz.id))).toBeNull();
    await postKviz(javoblar);
    t.clock.advance({ minutes: 20 });
    await postKviz({ ...javoblar, shahar: 'toshkent', tolov: 'toliq', byudjet: null });

    expect(await oxirgiKvizJavoblari(t.db, String(aziz.id))).toEqual({
      shahar: 'toshkent',
      tur: 'yashash',
      xonalar: [2, 4],
      byudjet: null,
      muddat: '1_3_oy',
      tolov: 'toliq',
    });
  });
});
