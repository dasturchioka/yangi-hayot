import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { blok, seedLoyiha } from './support/katalog';
import { signInitData, tmaAuth } from './support/init-data';
import { createTestApp, TEST_MINIAPP_LINK, type TestApp } from './support/test-app';

const aziz = { id: 700000301, first_name: 'Aziz', language_code: 'uz' };
/** Aziz's wife: gets the link in a Telegram chat. */
const dilnoza = { id: 700000302, first_name: 'Dilnoza', language_code: 'uz' };

const SHARED = 'mijoz ulashdi';
const DIRECT = "Telegram (to'g'ridan-to'g'ri)";

describe('«Ulashish»', () => {
  let t: TestApp;
  beforeEach(async () => {
    t = await createTestApp();
  });
  afterEach(async () => {
    await t.close();
  });

  const auth = (user: typeof aziz, startParam?: string) =>
    tmaAuth(signInitData(user, { authDate: t.clock.now(), startParam }));

  const ulash = (user: typeof aziz, planirovkaId: number) =>
    t.app.inject({ method: 'POST', url: '/api/ulashish', headers: auth(user), payload: { planirovkaId } });

  /** Opens the Mini App the way Telegram does for a `?startapp=` link: start_param inside signed initData. */
  async function open(user: typeof aziz, startParam?: string) {
    const res = await t.app.inject({ method: 'GET', url: '/api/me', headers: auth(user, startParam) });
    expect(res.statusCode).toBe(200);
    return res.json() as { manba: { first: string; last: string }; start: unknown };
  }

  async function onePlanirovka() {
    const l = await seedLoyiha(t.db, {
      bloklar: [blok('A', [{ xonalar: 2, maydon: 54, boshlangichNarx: 455_500_000 }])],
    });
    return l.bloklar[0]!.planirovkalar[0]!.id;
  }

  async function shareLink(user: typeof aziz, planirovkaId: number) {
    const res = await ulash(user, planirovkaId);
    expect(res.statusCode).toBe(200);
    const { url } = res.json() as { url: string };
    expect(url.startsWith(`${TEST_MINIAPP_LINK}?startapp=`)).toBe(true);
    const startParam = new URL(url).searchParams.get('startapp')!;
    // Telegram accepts only A-Z a-z 0-9 _ - and at most 64 chars in startapp.
    expect(startParam).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
    return startParam;
  }

  it('the link opens the same Planirovka for another Mijoz and brings Manba «mijoz ulashdi»', async () => {
    const id = await onePlanirovka();
    const startParam = await shareLink(aziz, id);

    const me = await open(dilnoza, startParam);

    expect(me.start).toEqual({ ekran: 'planirovka', planirovkaId: id });
    expect(me.manba).toEqual({ first: SHARED, last: SHARED });
    const card = await t.app.inject({
      method: 'GET',
      url: `/api/katalog/planirovkalar/${(me.start as { planirovkaId: number }).planirovkaId}`,
      headers: auth(dilnoza, startParam),
    });
    expect(card.json().planirovka.id).toBe(id);
  });

  it('a known Mijoz keeps the first Manba; the last one becomes «mijoz ulashdi»', async () => {
    const id = await onePlanirovka();
    await open(dilnoza, 'src_instagram');
    const startParam = await shareLink(aziz, id);

    const me = await open(dilnoza, startParam);

    expect(me.manba).toEqual({ first: 'instagram', last: SHARED });
  });

  it('the Mijoz who shared opens his own link without changing his Manba', async () => {
    const id = await onePlanirovka();
    const startParam = await shareLink(aziz, id);

    const me = await open(aziz, startParam);

    expect(me.start).toEqual({ ekran: 'planirovka', planirovkaId: id });
    expect(me.manba).toEqual({ first: DIRECT, last: DIRECT });
  });

  it('a link with a made-up share id still opens the Planirovka but is not «mijoz ulashdi»', async () => {
    const id = await onePlanirovka();

    const me = await open(dilnoza, `pl${id}_u987654`);

    expect(me.start).toEqual({ ekran: 'planirovka', planirovkaId: id });
    expect(me.manba).toEqual({ first: DIRECT, last: DIRECT });
  });

  it('opening without a start parameter has no start screen', async () => {
    expect((await open(dilnoza)).start).toBeNull();
  });

  it('cannot share a Planirovka that is not in the katalog', async () => {
    const res = await ulash(aziz, 999_999);

    expect(res.statusCode).toBe(404);
  });
});
