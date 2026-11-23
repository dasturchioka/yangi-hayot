import type { KontentResponse } from '@yh/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { adminLogin } from './support/admin';
import { signInitData, tmaAuth } from './support/init-data';
import { blok, seedLoyiha } from './support/katalog';
import { createTestApp, type TestApp } from './support/test-app';

const aziz = { id: 700000001, first_name: 'Aziz', language_code: 'uz' };

describe('Kontent: «Qanday sotib olish», FAQ, «Biz haqimizda», kontaktlar', () => {
  let t: TestApp;
  beforeEach(async () => {
    t = await createTestApp();
  });
  afterEach(async () => {
    await t.close();
  });

  const miniApp = (lang: string) =>
    t.app.inject({
      method: 'GET',
      url: `/api/kontent?lang=${lang}`,
      headers: tmaAuth(signInitData(aziz, { authDate: t.clock.now() })),
    });
  const kontent = async (lang: string) => {
    const res = await miniApp(lang);
    expect(res.statusCode).toBe(200);
    return res.json() as KontentResponse;
  };

  it('works out of the box in both languages: 6 stages, documents, ipoteka list, FAQ, 1349', async () => {
    const uz = await kontent('uz');
    const ru = await kontent('ru');

    expect(uz.sotibOlish.bosqichlar).toHaveLength(6);
    expect(uz.sotibOlish.hujjatlar.length).toBeGreaterThan(0);
    expect(uz.sotibOlish.ipotekaHujjatlari.length).toBeGreaterThan(0);
    expect(uz.sotibOlish.faq.length).toBeGreaterThan(0);
    expect(uz.kontaktlar.telefon).toBe('1349');
    expect(uz.sotibOlish.sarlavha).not.toBe(ru.sotibOlish.sarlavha);
    expect(uz.sotibOlish.bosqichlar[0]!.nomi).not.toBe(ru.sotibOlish.bosqichlar[0]!.nomi);
  });

  it('needs Telegram initData', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/api/kontent?lang=uz' });
    expect(res.statusCode).toBe(401);
  });

  describe('edited by the Administrator in the admin-panel', () => {
    const put = (bolim: string, headers: Record<string, string>, payload: unknown) =>
      t.app.inject({ method: 'PUT', url: `/admin/api/kontent/${bolim}`, headers, payload: payload as object });
    const adminGet = async (headers: Record<string, string>) => {
      const res = await t.app.inject({ method: 'GET', url: '/admin/api/kontent', headers });
      expect(res.statusCode).toBe(200);
      return res.json();
    };
    const m = (uz: string, ru: string) => ({ uz, ru });

    it('«Qanday sotib olish» texts saved in RU/UZ show in the Mini App in each language', async () => {
      const admin = await adminLogin(t, 'administrator');
      const current = (await adminGet(admin)).sotibOlish;
      const res = await put('sotib-olish', admin, {
        ...current,
        bosqichlar: [{ nomi: m('Tanlash', 'Выбор'), matn: m('Uy tanlang', 'Выберите квартиру') }],
        faq: [{ savol: m('Kredit bormi?', 'Есть кредит?'), javob: m('Ha', 'Да') }],
      });
      expect(res.statusCode).toBe(200);

      const uz = await kontent('uz');
      const ru = await kontent('ru');
      expect(uz.sotibOlish.bosqichlar).toEqual([{ nomi: 'Tanlash', matn: 'Uy tanlang' }]);
      expect(ru.sotibOlish.bosqichlar).toEqual([{ nomi: 'Выбор', matn: 'Выберите квартиру' }]);
      expect(uz.sotibOlish.faq).toEqual([{ savol: 'Kredit bormi?', javob: 'Ha' }]);
      expect(ru.sotibOlish.faq).toEqual([{ savol: 'Есть кредит?', javob: 'Да' }]);
    });

    it('«Biz haqimizda» numbers and kontaktlar saved show in the Mini App', async () => {
      const admin = await adminLogin(t, 'administrator');
      const current = await adminGet(admin);
      expect(
        (await put('biz-haqimizda', admin, { ...current.bizHaqimizda, raqamlar: [{ qiymat: '12', nomi: m('loyiha', 'проектов') }] }))
          .statusCode,
      ).toBe(200);
      expect(
        (
          await put('kontaktlar', admin, {
            telefon: '1349',
            manzil: m('Toshkent, Amir Temur 1', 'Ташкент, Амир Темур 1'),
            ishVaqti: m('Du–Sha 9:00–19:00', 'Пн–Сб 9:00–19:00'),
            telegram: '@yangi_hayot_official',
            xarita: { lat: 41.31, lng: 69.28 },
          })
        ).statusCode,
      ).toBe(200);

      const ru = await kontent('ru');
      expect(ru.bizHaqimizda.raqamlar).toEqual([{ qiymat: '12', nomi: 'проектов' }]);
      expect(ru.kontaktlar).toEqual({
        telefon: '1349',
        manzil: 'Ташкент, Амир Темур 1',
        ishVaqti: 'Пн–Сб 9:00–19:00',
        telegram: 'yangi_hayot_official',
        xarita: { lat: 41.31, lng: 69.28 },
      });
    });

    it('refuses more than 15 FAQ and a text missing one language', async () => {
      const admin = await adminLogin(t, 'administrator');
      const current = (await adminGet(admin)).sotibOlish;
      const savol = { savol: m('Savol', 'Вопрос'), javob: m('Javob', 'Ответ') };

      expect((await put('sotib-olish', admin, { ...current, faq: Array(16).fill(savol) })).statusCode).toBe(400);
      expect((await put('sotib-olish', admin, { ...current, faq: Array(15).fill(savol) })).statusCode).toBe(200);
      expect(
        (await put('sotib-olish', admin, { ...current, sarlavha: { uz: 'Sarlavha', ru: ' ' } })).statusCode,
      ).toBe(400);
      expect((await kontent('uz')).sotibOlish.faq).toHaveLength(15);
    });

    it('is for the Administrator only: Menejer gets 403, no session 401', async () => {
      const menejer = await adminLogin(t, 'menejer');
      const current = await adminGet(await adminLogin(t, 'administrator', { login: 'boss' }));

      expect((await t.app.inject({ method: 'GET', url: '/admin/api/kontent', headers: menejer })).statusCode).toBe(403);
      expect((await put('kontaktlar', menejer, current.kontaktlar)).statusCode).toBe(403);
      expect((await put('kontaktlar', {}, current.kontaktlar)).statusCode).toBe(401);
    });
  });

  it('«Biz haqimizda» portfolio lists Topshirilgan Loyihalar, which the katalog does not show', async () => {
    const topshirilgan = await seedLoyiha(t.db, {
      nomi: 'Bahor',
      shahar: 'navoiy',
      holat: 'topshirilgan',
      manzil: { uz: 'Navoiy shahri', ru: 'город Навои' },
      fotolar: ['/media/loyiha/navoiy/bahor.webp'],
    });
    await seedLoyiha(t.db, { nomi: 'Jozibali Maskan', bloklar: [blok('A', [{}])] });

    const ru = await kontent('ru');
    expect(ru.bizHaqimizda.portfolio).toEqual([
      {
        id: topshirilgan.id,
        nomi: 'Bahor',
        shahar: 'navoiy',
        manzil: 'город Навои',
        qisqaTavsif: null,
        foto: '/media/loyiha/navoiy/bahor.webp',
      },
    ]);

    const katalog = await t.app.inject({
      method: 'GET',
      url: '/api/katalog/loyihalar?lang=ru',
      headers: tmaAuth(signInitData(aziz, { authDate: t.clock.now() })),
    });
    expect(katalog.json().loyihalar.map((l: { nomi: string }) => l.nomi)).toEqual(['Jozibali Maskan']);
  });
});
