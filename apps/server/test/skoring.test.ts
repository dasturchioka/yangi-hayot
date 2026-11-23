import { DEFAULT_SKORING, type SkoringQoidalari } from '@yh/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setSetting } from '../src/settings/settings';
import { adminLogin } from './support/admin';
import { botEvent } from './support/bot';
import { blok, seedLoyiha } from './support/katalog';
import { signInitData, tmaAuth, type TelegramTestUser } from './support/init-data';
import { createTestApp, type TestApp } from './support/test-app';

// Lead skoringi (UF-4, #18): Daraja of the Mijoz → tag on the open Bitim; issiq → 5-minute
// «Qo'ng'iroq qilish» and a mark in the managers group. Rules in settings (Administrator).

const aziz = { id: 700001801, first_name: 'Aziz', username: 'aziz_k', language_code: 'uz' };
const AZIZ = String(aziz.id);
const GROUP = '-100500';
const mln = (n: number) => n * 1_000_000;

let t: TestApp;
beforeEach(async () => {
  t = await createTestApp();
  await setSetting(t.db, 'managersGroupId', GROUP, t.clock.now());
});
afterEach(async () => {
  await t.close();
});

function auth(user: TelegramTestUser = aziz) {
  return tmaAuth(signInitData(user, { authDate: t.clock.now() }));
}

function postKviz(over: Record<string, unknown> = {}) {
  return t.app.inject({
    method: 'POST',
    url: '/api/kviz',
    headers: auth(),
    payload: {
      shahar: 'navoiy',
      tur: 'yashash',
      xonalar: [2],
      byudjet: { dan: mln(400), gacha: mln(500) },
      muddat: '3_6_oy',
      tolov: 'ipoteka',
      name: 'Aziz',
      phone: '90 123 45 67',
      ...over,
    },
  });
}

function postHisob() {
  return t.app.inject({
    method: 'POST',
    url: '/api/kalkulyator/hisob',
    headers: auth(),
    payload: { kirish: { sxema: 'muddatli', narx: mln(500), boshlangich: mln(150), oylar: 24 } },
  });
}

function postForm() {
  return t.app.inject({ method: 'POST', url: '/api/arizalar', headers: auth(), payload: { name: 'Aziz', phone: '901234567' } });
}

const groupMarks = () => t.messenger.deliveredTo(GROUP).filter((m) => m.text?.includes('Issiq Mijoz'));
const darajaTags = (i = 0) => t.crm.bitimlar[i]!.tags.filter((x) => ['issiq', 'iliq', 'sovuq'].includes(x));

describe('Daraja on an Ariza', () => {
  it('an issiq Mijoz: Bitim tag «issiq», the call task due in 5 minutes, a mark in the managers group', async () => {
    const res = await postKviz({ muddat: 'shu_oy', tolov: 'toliq' }); // 30 + 25 + 10 = 65

    expect(res.statusCode).toBe(201);
    expect(darajaTags()).toEqual(['issiq']);
    expect(t.crm.tasks).toEqual([
      expect.objectContaining({ kind: 'call', dueAt: new Date('2026-11-23T05:05:00Z') }),
    ]);
    const marks = groupMarks();
    expect(marks).toHaveLength(1);
    expect(marks[0]!.text).toContain('🔥');
    expect(marks[0]!.text).toContain('Aziz');
    expect(marks[0]!.text).toContain('+998901234567');
    expect(marks[0]!.text).toContain('65 ball');
    expect(marks[0]!.text).toContain('Xarid muddati: shu oy +30');
  });

  it('a sovuq Mijoz: tag «sovuq», the usual 15-minute task, no mark', async () => {
    await postKviz({ muddat: 'bilmayman', tolov: 'muddatli', byudjet: null }); // 15

    expect(darajaTags()).toEqual(['sovuq']);
    expect(t.crm.tasks[0]!.dueAt).toEqual(new Date('2026-11-23T05:15:00Z'));
    expect(groupMarks()).toEqual([]);
  });

  it('a later Ariza replaces the Daraja tag on the same Bitim', async () => {
    await postKviz(); // 3–6 oy 10 + ipoteka 15 + byudjet 10 = 35 → iliq
    expect(darajaTags()).toEqual(['iliq']);

    await t.app.arizalar.create({ tur: 'visit', telegramId: AZIZ, name: 'Aziz', taskDueAt: new Date('2026-11-25T06:00:00Z') }); // +30 = 65

    expect(t.crm.bitimlar).toHaveLength(1);
    expect(darajaTags()).toEqual(['issiq']);
    // Booking has its own «Uchrashuv» task; becoming issiq adds the 5-minute call.
    expect(t.crm.tasks.map((x) => [x.kind, x.dueAt.toISOString()])).toEqual([
      ['call', '2026-11-23T05:15:00.000Z'],
      ['meeting', '2026-11-25T06:00:00.000Z'],
      ['call', '2026-11-23T05:05:00.000Z'],
    ]);
    expect(groupMarks()).toHaveLength(1);
  });

  it('an already issiq Mijoz: every new call task is due in 5 minutes, but the group is marked only once', async () => {
    await postKviz({ muddat: 'shu_oy', tolov: 'toliq' });
    t.clock.advance({ minutes: 30 });
    await postForm();

    expect(t.crm.tasks.map((x) => x.dueAt.toISOString())).toEqual([
      '2026-11-23T05:05:00.000Z',
      '2026-11-23T05:35:00.000Z',
    ]);
    expect(groupMarks()).toHaveLength(1);
  });

  it('a new Bitim takes the Daraja the Mijoz already has', async () => {
    await postKviz({ muddat: 'shu_oy', tolov: 'toliq' });
    t.crm.bitimlar[0]!.open = false; // managers closed it
    t.clock.advance({ hours: 2 });

    await postForm();

    expect(t.crm.bitimlar).toHaveLength(2);
    expect(darajaTags(1)).toEqual(['issiq']);
  });

  it('a Daraja tag that could not reach amoCRM is written by the retry', async () => {
    t.crm.fail('unavailable');
    await postKviz({ muddat: 'shu_oy', tolov: 'toliq' });
    t.crm.recover();

    t.clock.advance({ minutes: 5 });
    await t.runJobs();

    expect(darajaTags()).toEqual(['issiq']);
    expect(t.crm.tasks).toHaveLength(1);
  });
});

describe('Daraja on an action without an Ariza', () => {
  it('kalkulyator and coming back the next day make the Mijoz issiq: tag replaced, 5-minute call task, mark', async () => {
    await postKviz({ muddat: '1_3_oy' }); // 20 + 15 + 10 = 45 → iliq
    await postHisob(); // +10 = 55 → iliq, nothing to send
    expect(t.crm.callsOf('addTags')).toHaveLength(1);

    t.clock.advance({ days: 1 });
    await botEvent(t, aziz, { type: 'start' }); // +5 = 60 → issiq

    expect(t.crm.bitimlar).toHaveLength(1);
    expect(darajaTags()).toEqual(['issiq']);
    const call = t.crm.tasks.at(-1)!;
    expect(call).toMatchObject({ kind: 'call', bitimId: t.crm.bitimlar[0]!.id, dueAt: new Date('2026-11-24T05:05:00Z') });
    expect(call.text).toContain("Qo'ng'iroq qilish");
    expect(call.text).toContain('Issiq');
    expect(groupMarks()).toHaveLength(1);
    expect(groupMarks()[0]!.text).toContain('Qayta kirishlar: 1 +5');
  });

  it('a Mijoz without a Bitim yet: no CRM calls; the first Ariza carries the Daraja', async () => {
    await postHisob(); // 10 + byudjet 10 + muddatli 15 = 35 → iliq
    expect(t.crm.calls).toEqual([]);

    await postForm();
    expect(darajaTags()).toEqual(['iliq']);
  });

  it('several /start on one day count as one re-entry', async () => {
    await postKviz({ muddat: '1_3_oy', tolov: 'ipoteka' }); // 45
    await postHisob(); // 55
    await botEvent(t, aziz, { type: 'start' }); // same day as the first visit: no re-entry
    t.clock.advance({ days: 1 });
    await botEvent(t, aziz, { type: 'start' });
    await botEvent(t, aziz, { type: 'start' });
    await t.app.inject({ method: 'GET', url: '/api/me', headers: auth() }); // the Mini App counts too, same day

    expect(darajaTags()).toEqual(['issiq']); // 55 + 5
    expect(groupMarks()).toHaveLength(1);
  });

  it('opening the Mini App on another day is a re-entry too', async () => {
    await postKviz({ muddat: '1_3_oy' }); // 45
    await postHisob(); // 55
    t.clock.advance({ days: 1 });
    const me = await t.app.inject({ method: 'GET', url: '/api/me', headers: auth() });

    expect(me.statusCode).toBe(200);
    expect(darajaTags()).toEqual(['issiq']);
  });

  it('amoCRM down: the action still succeeds and the 5-minute call is created with the next Ariza delivery', async () => {
    await postKviz({ muddat: '1_3_oy' }); // 45
    t.crm.fail('unavailable');
    await postHisob();
    t.clock.advance({ days: 1 });
    const actions = await botEvent(t, aziz, { type: 'start' }); // → issiq, CRM down
    expect(actions.length).toBeGreaterThan(0);
    expect(groupMarks()).toHaveLength(1);
    t.crm.recover();

    await postForm();

    expect(darajaTags()).toEqual(['issiq']);
    const dues = t.crm.tasks.map((x) => x.dueAt.toISOString());
    expect(dues).toEqual(['2026-11-23T05:15:00.000Z', '2026-11-24T05:05:00.000Z']);
  });

  it('the hook other modules call after a change (#11 booking cancel, #17): recomputes and updates the Bitim', async () => {
    await postKviz({ muddat: '1_3_oy' }); // 45 → iliq
    await setSetting(t.db, 'skoring', { ...DEFAULT_SKORING, chegara: { iliq: 50, issiq: 80 } }, t.clock.now());

    const daraja = await t.app.skoring.harakat(AZIZ);

    expect(daraja).toBe('sovuq');
    expect(darajaTags()).toEqual(['sovuq']);
  });
});

describe("Ko'rishga yozilish (#11)", () => {
  async function yozil() {
    const l = await seedLoyiha(t.db, { nomi: 'Jozibali Maskan', bloklar: [blok('B', [{ xonalar: 2, maydon: 54.5 }])] });
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/yozilishlar?lang=uz',
      headers: auth(),
      payload: { loyihaId: l.id, sana: '2026-11-25', vaqt: '12:00', name: 'Aziz', phone: '90 123 45 67' },
    });
    expect(res.statusCode).toBe(201);
    return res.json().yozilish.id as number;
  }

  it('a booking makes the Mijoz warmer; cancelling it takes the ball back and replaces the tag', async () => {
    await postKviz({ muddat: '1_3_oy' }); // 45 → iliq
    const id = await yozil(); // +30 = 75 → issiq
    expect(darajaTags()).toEqual(['issiq']);
    expect(groupMarks()).toHaveLength(1);

    const res = await t.app.inject({ method: 'POST', url: `/api/yozilishlar/${id}/bekor`, headers: auth() });

    expect(res.statusCode).toBe(200);
    expect(darajaTags()).toEqual(['iliq']);
  });

  it('the admin «Yozilishlar» list shows the Daraja of each Mijoz', async () => {
    await postKviz({ muddat: 'shu_oy', tolov: 'toliq' }); // 65 → issiq
    await yozil();
    const headers = await adminLogin(t, 'menejer');

    const res = await t.app.inject({ method: 'GET', url: '/admin/api/yozilishlar?dan=2026-11-25&gacha=2026-11-25', headers });

    expect(res.json().yozilishlar).toEqual([expect.objectContaining({ daraja: 'issiq' })]);
  });
});

describe('ball qoidalari in the admin-panel', () => {
  const qoidalar: SkoringQoidalari = {
    ...DEFAULT_SKORING,
    muddat: { shu_oy: 50, '1_3_oy': 30, '3_6_oy': 10, bilmayman: -10 },
    chegara: { iliq: 20, issiq: 50 },
    issiqVazifaDaqiqa: 10,
  };

  it('the Administrator reads the defaults and saves own rules; the next Ariza is scored by them', async () => {
    const headers = await adminLogin(t, 'administrator');
    const get = await t.app.inject({ method: 'GET', url: '/admin/api/skoring', headers });
    expect(get.statusCode).toBe(200);
    expect(get.json()).toEqual({ qoidalar: DEFAULT_SKORING });

    const put = await t.app.inject({ method: 'PUT', url: '/admin/api/skoring', headers, payload: qoidalar });
    expect(put.statusCode).toBe(200);
    expect(put.json()).toEqual({ qoidalar });

    await postKviz({ muddat: 'shu_oy', tolov: 'muddatli', byudjet: null }); // 50 + 15 = 65 ≥ 50
    expect(darajaTags()).toEqual(['issiq']);
    expect(t.crm.tasks[0]!.dueAt).toEqual(new Date('2026-11-23T05:10:00Z'));
  });

  it('refuses thresholds where iliq is not below issiq, and a Menejer cannot touch the rules', async () => {
    const headers = await adminLogin(t, 'administrator');
    const bad = await t.app.inject({
      method: 'PUT',
      url: '/admin/api/skoring',
      headers,
      payload: { ...qoidalar, chegara: { iliq: 60, issiq: 60 } },
    });
    expect(bad.statusCode).toBe(400);

    const menejer = await adminLogin(t, 'menejer');
    expect((await t.app.inject({ method: 'GET', url: '/admin/api/skoring', headers: menejer })).statusCode).toBe(403);
    expect((await t.app.inject({ method: 'PUT', url: '/admin/api/skoring', headers: menejer, payload: qoidalar })).statusCode).toBe(403);
  });
});
