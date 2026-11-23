import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { blok, seedLoyiha } from './support/katalog';
import { signInitData, tmaAuth } from './support/init-data';
import { createTestApp, type TestApp } from './support/test-app';

const aziz = { id: 700000101, first_name: 'Aziz', language_code: 'uz' };
const olga = { id: 700000102, first_name: 'Ольга', language_code: 'ru' };

describe('Sevimlilar', () => {
  let t: TestApp;
  beforeEach(async () => {
    t = await createTestApp();
  });
  afterEach(async () => {
    await t.close();
  });

  /** A fresh initData each call: as if the Mijoz opened the Mini App on another device. */
  const auth = (user: typeof aziz) => tmaAuth(signInitData(user, { authDate: t.clock.now() }));
  const add = (user: typeof aziz, id: number) =>
    t.app.inject({ method: 'PUT', url: `/api/sevimlilar/${id}`, headers: auth(user) });
  const remove = (user: typeof aziz, id: number) =>
    t.app.inject({ method: 'DELETE', url: `/api/sevimlilar/${id}`, headers: auth(user) });
  const list = async (user: typeof aziz, lang = 'uz') => {
    const res = await t.app.inject({ method: 'GET', url: `/api/sevimlilar?lang=${lang}`, headers: auth(user) });
    expect(res.statusCode).toBe(200);
    return res.json().planirovkalar as { id: number; xonalar: number; blokNomi: string }[];
  };

  async function twoPlanirovkalar() {
    const l = await seedLoyiha(t.db, {
      bloklar: [blok('A', [{ xonalar: 2, maydon: 54, boshlangichNarx: 455_500_000 }, { xonalar: 3, maydon: 78 }])],
    });
    return l.bloklar[0]!.planirovkalar.map((p) => p.id) as [number, number];
  }

  it('keeps the Mijoz’s sevimli Planirovkalar across devices, newest first', async () => {
    const [p2, p3] = await twoPlanirovkalar();

    expect((await add(aziz, p2)).statusCode).toBe(204);
    t.clock.advance({ minutes: 1 });
    expect((await add(aziz, p3)).statusCode).toBe(204);

    const sevimlilar = await list(aziz);
    expect(sevimlilar.map((p) => [p.id, p.xonalar, p.blokNomi])).toEqual([
      [p3, 3, 'A'],
      [p2, 2, 'A'],
    ]);
  });

  it('belong to one Mijoz only', async () => {
    const [p2] = await twoPlanirovkalar();
    await add(aziz, p2);

    expect(await list(olga)).toEqual([]);
  });

  it('adding twice keeps one entry; removing takes it out', async () => {
    const [p2, p3] = await twoPlanirovkalar();
    await add(aziz, p2);
    await add(aziz, p2);
    await add(aziz, p3);

    expect((await list(aziz)).map((p) => p.id)).toEqual([p3, p2]);

    expect((await remove(aziz, p3)).statusCode).toBe(204);
    expect((await remove(aziz, p3)).statusCode).toBe(204);
    expect((await list(aziz)).map((p) => p.id)).toEqual([p2]);
  });

  it('cannot add a Planirovka that is not in the katalog', async () => {
    const res = await add(aziz, 999_999);

    expect(res.statusCode).toBe(404);
    expect(await list(aziz)).toEqual([]);
  });

  it('hides a sevimli whose Loyiha left the katalog (Topshirilgan)', async () => {
    const [p2] = await twoPlanirovkalar();
    await add(aziz, p2);
    await t.db.query(`UPDATE loyiha SET holat = 'topshirilgan'`);
    t.clock.advance({ minutes: 1 });

    expect(await list(aziz)).toEqual([]);
  });

  it('requires initData', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/api/sevimlilar' });

    expect(res.statusCode).toBe(401);
  });
});
