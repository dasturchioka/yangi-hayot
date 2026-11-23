import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { adminLogin } from './support/admin';
import { botEvent } from './support/bot';
import { signInitData, tmaAuth } from './support/init-data';
import { createTestApp, type TestApp } from './support/test-app';

/** Invites his friends. */
const aziz = { id: 700000401, first_name: 'Aziz', last_name: 'Karimov', username: 'aziz_k', language_code: 'uz' };
/** Aziz's friend, new to the bot. */
const bobur = { id: 700000402, first_name: 'Bobur', language_code: 'uz' };
/** Another friend, new to the bot. */
const sardor = { id: 700000403, first_name: 'Sardor', language_code: 'ru' };

type User = { id: number; first_name: string; last_name?: string; username?: string; language_code?: string };

const TAKLIF_MANBA = 'mijoz taklif qildi';

describe('«Do\'stingni taklif qil» (UF-6)', () => {
  let t: TestApp;
  beforeEach(async () => {
    t = await createTestApp();
  });
  afterEach(async () => {
    await t.close();
  });

  const auth = (user: User, startParam?: string) => tmaAuth(signInitData(user, { authDate: t.clock.now(), startParam }));

  async function taklif(user: User) {
    const res = await t.app.inject({ method: 'GET', url: '/api/taklif', headers: auth(user) });
    expect(res.statusCode).toBe(200);
    return res.json() as { url: string; soni: number };
  }

  /** The friend taps the personal link: it opens the bot with `/start <payload>`. */
  async function startFromLink(user: User, url: string) {
    const payload = new URL(url).searchParams.get('start')!;
    await botEvent(t, user, { type: 'start', payload });
    return payload;
  }

  function ariza(user: User, payload: Record<string, unknown>) {
    return t.app.inject({ method: 'POST', url: '/api/arizalar', headers: auth(user), payload });
  }

  it('every Mijoz has one personal bot link, with nobody invited yet', async () => {
    const first = await taklif(aziz);
    const again = await taklif(aziz);

    expect(first.url).toMatch(/^https:\/\/t\.me\/YangiHayotTestBot\?start=[A-Za-z0-9_-]{1,64}$/);
    expect(again.url).toBe(first.url);
    expect(first.soni).toBe(0);
    expect((await taklif(bobur)).url).not.toBe(first.url);
  });

  it("the invited Mijoz's amoCRM Bitim shows who invited them", async () => {
    const { url } = await taklif(aziz);
    await startFromLink(bobur, url);

    const res = await ariza(bobur, { name: 'Bobur', phone: '931112233' });

    expect(res.statusCode).toBe(201);
    const bitim = t.crm.bitimlar[0]!;
    expect(bitim.manba).toBe(TAKLIF_MANBA);
    expect(bitim.tags).toContain(TAKLIF_MANBA);
    expect(bitim.notes[0]).toContain('Taklif qilgan: Aziz Karimov · @aziz_k · ID 700000401');
  });

  it('the inviter stays on every later Ariza of the invited Mijoz, even after another Manba', async () => {
    const { url } = await taklif(aziz);
    await startFromLink(bobur, url);
    await botEvent(t, bobur, { type: 'start', payload: 'src_instagram' });

    await ariza(bobur, { name: 'Bobur', phone: '931112233' });

    const bitim = t.crm.bitimlar[0]!;
    expect(bitim.manba).toBe('instagram');
    expect(bitim.notes[0]).toContain('Taklif qilgan: Aziz Karimov · @aziz_k · ID 700000401');
  });

  it('counts invited Mijozlar for the inviter', async () => {
    const { url } = await taklif(aziz);
    await startFromLink(bobur, url);
    await startFromLink(sardor, url);
    await startFromLink(sardor, url); // twice: still one friend

    expect((await taklif(aziz)).soni).toBe(2);
  });

  it('a Mijoz who already knew the bot is not counted as invited', async () => {
    await botEvent(t, bobur, { type: 'start' });
    const { url } = await taklif(aziz);

    await startFromLink(bobur, url);
    await ariza(bobur, { name: 'Bobur', phone: '931112233' });

    expect((await taklif(aziz)).soni).toBe(0);
    expect(t.crm.bitimlar[0]!.notes[0]).not.toContain('Taklif qilgan');
  });

  it('opening your own link or a made-up one invites nobody', async () => {
    const { url } = await taklif(aziz);
    await startFromLink(aziz, url);
    await botEvent(t, bobur, { type: 'start', payload: 'taklif_nobody0000' });

    expect((await taklif(aziz)).soni).toBe(0);
    const me = await t.app.inject({ method: 'GET', url: '/api/me', headers: auth(bobur) });
    expect(me.json().manba).toEqual({ first: "Telegram (to'g'ridan-to'g'ri)", last: "Telegram (to'g'ridan-to'g'ri)" });
  });

  it('the same link opened as a Mini App start parameter invites too', async () => {
    const { url } = await taklif(aziz);
    const payload = new URL(url).searchParams.get('start')!;

    const me = await t.app.inject({ method: 'GET', url: '/api/me', headers: auth(bobur, payload) });

    expect(me.json().manba.first).toBe(TAKLIF_MANBA);
    expect((await taklif(aziz)).soni).toBe(1);
  });

  describe('admin', () => {
    it('lists inviters, and for each Mijoz the invited ones with their Bitimlar', async () => {
      const { url } = await taklif(aziz);
      await startFromLink(bobur, url);
      await startFromLink(sardor, url);
      await ariza(bobur, { name: 'Bobur', phone: '931112233' });
      const headers = await adminLogin(t, 'administrator');

      const list = await t.app.inject({ method: 'GET', url: '/admin/api/takliflar', headers });
      expect(list.statusCode).toBe(200);
      expect(list.json().taklifchilar).toEqual([
        expect.objectContaining({ telegramId: '700000401', name: 'Aziz Karimov', username: 'aziz_k', soni: 2 }),
      ]);

      const one = await t.app.inject({ method: 'GET', url: '/admin/api/takliflar/700000401', headers });
      expect(one.statusCode).toBe(200);
      const body = one.json();
      expect(body.taklifchi).toEqual(expect.objectContaining({ telegramId: '700000401', name: 'Aziz Karimov' }));
      const bitimId = t.crm.bitimlar[0]!.id;
      expect(body.taklifQilinganlar).toEqual([
        expect.objectContaining({
          telegramId: '700000402',
          name: 'Bobur',
          phone: '+998931112233',
          bitimlar: [expect.objectContaining({ id: bitimId, arizalarSoni: 1 })],
        }),
        expect.objectContaining({ telegramId: '700000403', name: 'Sardor', phone: null, bitimlar: [] }),
      ]);
    });

    it('a Mijoz who invited nobody has an empty list; an unknown one is 404', async () => {
      await taklif(aziz);
      const headers = await adminLogin(t, 'administrator');

      const empty = await t.app.inject({ method: 'GET', url: '/admin/api/takliflar/700000401', headers });
      expect(empty.json().taklifQilinganlar).toEqual([]);
      const missing = await t.app.inject({ method: 'GET', url: '/admin/api/takliflar/1', headers });
      expect(missing.statusCode).toBe(404);
    });

    it('is for the Administrator only', async () => {
      const menejer = await adminLogin(t, 'menejer');
      expect((await t.app.inject({ method: 'GET', url: '/admin/api/takliflar', headers: menejer })).statusCode).toBe(403);
      expect((await t.app.inject({ method: 'GET', url: '/admin/api/takliflar' })).statusCode).toBe(401);
    });
  });
});
