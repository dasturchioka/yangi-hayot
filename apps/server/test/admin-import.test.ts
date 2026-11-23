import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { adminLogin } from './support/admin';
import { signInitData, tmaAuth } from './support/init-data';
import { blok, seedLoyiha } from './support/katalog';
import { createTestApp, type TestApp } from './support/test-app';

const aziz = { id: 700000001, first_name: 'Aziz', language_code: 'uz' };

const HEADER = 'Blok;qavat;raqam;xonalar;maydon;Planirovka;narx;holat;chizma;video';
const csv = (...rows: string[]) => Buffer.from([HEADER, ...rows].join('\n'), 'utf8');

type Row = Record<string, unknown>;

describe('Xonadonlar import from Excel / CSV (one row = one Xonadon)', () => {
  let t: TestApp;
  let menejer: { cookie: string };
  beforeEach(async () => {
    t = await createTestApp();
    menejer = await adminLogin(t, 'menejer', { nomi: 'Dilnoza' });
  });
  afterEach(async () => {
    await t.close();
  });

  const upload = (url: string, file: Buffer, headers = menejer, contentType = 'text/csv') =>
    t.app.inject({
      method: 'POST',
      url: `/admin/api/katalog${url}`,
      headers: { ...headers, 'content-type': contentType },
      payload: file,
    });
  const miniApp = (url: string) =>
    t.app.inject({ method: 'GET', url: `/api/katalog${url}`, headers: tmaAuth(signInitData(aziz, { authDate: t.clock.now() })) });
  const admin = async (url: string) =>
    (await t.app.inject({ method: 'GET', url: `/admin/api${url}`, headers: menejer })).json();
  const tree = async (loyihaId: number) => (await admin(`/katalog/loyihalar/${loyihaId}`)).loyiha;
  const xonadonlar = async (blokId: number) =>
    ((await admin(`/katalog/bloklar/${blokId}/xonadonlar`)).xonadonlar as Row[]).map((x) => [x.qavat, x.raqam, x.holat, x.narx]);

  it('lets a Menejer check, then import a new Blok of Xonadonlar that the Mini App shows at once and the jurnal records', async () => {
    const loyiha = await seedLoyiha(t.db, { nomi: 'Jozibali Maskan', bloklar: [blok('A', [{ xonalar: 1, maydon: 40 }])] });
    await miniApp(`/loyihalar/${loyiha.id}`); // warm the katalog cache
    const file = csv(
      "B;1;1;2;54,5;Burchak;455 500 000;bo'sh;https://example.com/b2.webp;https://t.me/yangihayot/12",
      'B;1;2;3;78;;;sotilgan;;',
      'B;2;3;2;54,5;Burchak;460000000;bron;;',
      'B;2;4;2;54,5;burchak;;;;', // empty holat → bo'sh; the same Planirovka (nomi case does not matter)
    );

    const check = await upload(`/loyihalar/${loyiha.id}/import/tekshir`, file);
    expect(check.statusCode).toBe(200);
    expect(check.json()).toMatchObject({
      xatolar: [],
      reja: { yangi: 4, yangilanadi: 0, ozgarishsiz: 0, yangiBloklar: ['B'], yangiPlanirovkalar: 2, fayldaYoq: 1 },
    });
    expect((await miniApp(`/loyihalar/${loyiha.id}`)).json().loyiha.bloklar).toHaveLength(1); // checking writes nothing

    const res = await upload(`/loyihalar/${loyiha.id}/import`, file);
    expect(res.statusCode).toBe(200);
    expect(res.json().natija).toMatchObject({ yaratildi: 4, yangilandi: 0, yangiBloklar: ['B'], yangiPlanirovkalar: 2 });

    const b = (await miniApp(`/loyihalar/${loyiha.id}?lang=uz`)).json().loyiha.bloklar.find((x: Row) => x.nomi === 'B');
    expect(b.boshXonadonlar).toBe(2);
    expect(b.guruhlar[0].planirovkalar[0]).toMatchObject({
      xonalar: 2,
      maydon: 54.5,
      nomi: 'Burchak',
      boshlangichNarx: 455_500_000, // the cheapest bo'sh Xonadon
      bosh: 2,
      chizma: 'https://example.com/b2.webp',
    });
    const shaxmatka = (await miniApp(`/bloklar/${b.id}/xonadonlar`)).json().xonadonlar;
    expect(shaxmatka.map((x: Row) => [x.qavat, x.raqam, x.xonalar, x.holat])).toEqual([
      [1, 1, 2, 'bosh'],
      [1, 2, 3, 'sotilgan'],
      [2, 3, 2, 'bron'],
      [2, 4, 2, 'bosh'],
    ]);

    const jurnal = (await admin(`/jurnal?loyihaId=${loyiha.id}`)).yozuvlar as Row[];
    expect(jurnal.map((y) => [y.obyekt, y.amal]).reverse()).toEqual([
      ['blok', 'yaratildi'],
      ['planirovka', 'yaratildi'],
      ['xonadon', 'yaratildi'],
      ['planirovka', 'yaratildi'],
      ['xonadon', 'yaratildi'],
      ['xonadon', 'yaratildi'],
      ['xonadon', 'yaratildi'],
    ]);
    expect(jurnal[0]).toMatchObject({ admin: { nomi: 'Dilnoza' } });
  });

  it('keeps the invariant: imported Xonadonlar = the sum of the Planirovkalar jami', async () => {
    const loyiha = await seedLoyiha(t.db);
    const rows = Array.from({ length: 30 }, (_, i) => {
      const [xonalar, maydon] = [[1, 38], [2, 54], [3, 80]][i % 3]!;
      return `A;${Math.floor(i / 6) + 1};${i + 1};${xonalar};${maydon};;;${['bosh', 'bron', 'sotilgan'][i % 4 === 0 ? 2 : i % 5 === 0 ? 1 : 0]};;`;
    });
    expect((await upload(`/loyihalar/${loyiha.id}/import`, csv(...rows))).statusCode).toBe(200);

    const { bloklar } = await tree(loyiha.id);
    const jami = (bloklar as { planirovkalar: { jami: number }[] }[])
      .flatMap((x) => x.planirovkalar)
      .reduce((s, p) => s + p.jami, 0);
    expect(jami).toBe(30);
    expect(bloklar[0].planirovkalar).toHaveLength(3);
    expect(await xonadonlar(bloklar[0].id)).toHaveLength(30);
  });

  it('lists every bad row with its number and reason (a repeated Blok, qavat, raqam too), and then imports nothing', async () => {
    const loyiha = await seedLoyiha(t.db);
    const file = csv(
      "A;1;1;2;54;;400000000;bo'sh;;", // row 2: fine
      ';1;2;2;54;;;;;', // row 3: no Blok
      'A;bir;0;two;-5;;455,5 mln;sotuvda;;https://vimeo.com/1', // row 4: six bad cells
      '',
      'a;1;1;3;80;;;;;', // row 6: same place as row 2 (Blok name case does not matter)
    );

    const check = (await upload(`/loyihalar/${loyiha.id}/import/tekshir`, file)).json();
    expect(check.reja).toBeNull();
    expect(check.xatolar.map((x: { qator: number; ustun?: string }) => [x.qator, x.ustun ?? null])).toEqual([
      [3, 'Blok'],
      [4, 'qavat'],
      [4, 'raqam'],
      [4, 'xonalar'],
      [4, 'maydon'],
      [4, 'narx'],
      [4, 'holat'],
      [4, 'video'],
      [6, null],
    ]);
    expect(check.xatolar[8].xabar).toContain('2-qator');

    const res = await upload(`/loyihalar/${loyiha.id}/import`, file);
    expect(res.statusCode).toBe(422);
    expect(res.json().xatolar).toHaveLength(9);
    expect((await tree(loyiha.id)).bloklar).toEqual([]);
  });

  it('refuses a file without a required column, or that is not a table', async () => {
    const loyiha = await seedLoyiha(t.db);
    const noRaqam = Buffer.from('Blok;qavat;xonalar;maydon\nA;1;2;54\n');
    expect((await upload(`/loyihalar/${loyiha.id}/import/tekshir`, noRaqam)).json().xatolar).toEqual([
      { qator: 1, ustun: 'raqam', xabar: "«raqam» ustuni yo'q" },
    ]);
    const pdf = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x00, 0x01]);
    const res = await upload(`/loyihalar/${loyiha.id}/import`, pdf, menejer, 'application/octet-stream');
    expect(res.statusCode).toBe(422);
    expect(res.json().xatolar[0]).toMatchObject({ qator: null });
    expect((await upload('/loyihalar/9999/import/tekshir', csv('A;1;1;2;54;;;;;'))).statusCode).toBe(404);
    expect(
      (
        await t.app.inject({
          method: 'POST',
          url: `/admin/api/katalog/loyihalar/${loyiha.id}/import`,
          headers: { 'content-type': 'text/csv' },
          payload: csv('A;1;1;2;54;;;;;'),
        })
      ).statusCode,
    ).toBe(401);
  });

  it('reads an .xlsx saved by a spreadsheet program (LibreOffice: shared strings, number cells)', async () => {
    const loyiha = await seedLoyiha(t.db);
    const file = readFileSync(new URL('./fixtures/import/libreoffice.xlsx', import.meta.url));

    const res = await upload(`/loyihalar/${loyiha.id}/import`, file, menejer, 'application/octet-stream');
    expect(res.statusCode).toBe(200);

    const [v] = (await tree(loyiha.id)).bloklar;
    expect(v.nomi).toBe('V');
    expect(v.planirovkalar.map((p: Row) => [p.xonalar, p.maydon, p.nomi, p.boshlangichNarx, p.bosh, p.bron, p.sotilgan, p.video])).toEqual([
      [1, 38.2, { uz: "Studiya & ko'l", ru: "Studiya & ko'l" }, 310_000_000, 1, 0, 1, null],
      [2, 61.75, { uz: 'Burchak, quyosh', ru: 'Burchak, quyosh' }, null, 0, 1, 1, 'https://youtu.be/abc123'],
    ]);
    expect(await xonadonlar(v.id)).toEqual([
      [3, 7, 'bosh', 310_000_000],
      [3, 8, 'sotilgan', 315_000_000],
      [4, 9, 'bron', null],
      [4, 10, 'sotilgan', null],
    ]);
  });

  it("gives a shablon filled with the Loyiha's Xonadonlar; uploading it back changes Xonadonlar in place and keeps the rest", async () => {
    const loyiha = await seedLoyiha(t.db, {
      slug: 'jozibali-maskan',
      bloklar: [
        blok('A', [
          {
            xonalar: 2,
            maydon: 54.5,
            boshlangichNarx: 450_000_000,
            xonadonlar: [
              { qavat: 1, raqam: 1, narx: 455_500_000 },
              { qavat: 1, raqam: 2, holat: 'sotilgan' },
            ],
          },
          { xonalar: 3, maydon: 80, xonadonlar: [{ qavat: 2, raqam: 3 }] },
        ]),
      ],
    });
    const [a] = (await tree(loyiha.id)).bloklar;

    const sh = await t.app.inject({ method: 'GET', url: `/admin/api/katalog/loyihalar/${loyiha.id}/import/shablon.xlsx`, headers: menejer });
    expect(sh.statusCode).toBe(200);
    expect(sh.headers['content-type']).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(sh.headers['content-disposition']).toContain('jozibali-maskan-xonadonlar.xlsx');
    const unchanged = (await upload(`/loyihalar/${loyiha.id}/import/tekshir`, sh.rawPayload, menejer, 'application/octet-stream')).json();
    expect(unchanged).toMatchObject({ xatolar: [], reja: { yangi: 0, yangilanadi: 0, ozgarishsiz: 3, fayldaYoq: 0, yangiPlanirovkalar: 0 } });

    // No 1: booked, price up. No 2: now the 3-xona Planirovka. No 3 is left out of the file.
    const file = csv('A;1;1;2;54,50;;460 000 000;bron;;', 'A;1;2;3;80;;;sotilgan;;');
    const { reja } = (await upload(`/loyihalar/${loyiha.id}/import/tekshir`, file)).json();
    expect(reja).toMatchObject({ yangi: 0, yangilanadi: 2, ozgarishsiz: 0, yangiPlanirovkalar: 0, fayldaYoq: 1 });
    expect(reja.fayldaYoqlar).toEqual([{ blok: 'A', qavat: 2, raqam: 3, holat: 'bosh' }]);
    expect(reja.qatorlar.map((q: Row) => [q.raqam, q.ozgarishlar, q.oldin])).toEqual([
      [1, ['narx', 'holat'], { narx: 455_500_000, holat: 'bosh' }],
      [2, ['planirovka'], { planirovka: '2 xona, 54.5 m²' }],
    ]);
    expect((await upload(`/loyihalar/${loyiha.id}/import`, file)).json().natija).toMatchObject({ yangilandi: 2 });

    expect(await xonadonlar(a.id)).toEqual([
      [1, 1, 'bron', 460_000_000],
      [1, 2, 'sotilgan', null],
      [2, 3, 'bosh', null], // not in the file: kept
    ]);
    const [yozuv] = (await admin(`/jurnal?loyihaId=${loyiha.id}&obyekt=xonadon`)).yozuvlar;
    expect(yozuv).toMatchObject({ admin: { nomi: 'Dilnoza' }, amal: 'tahrirlandi', oldin: { planirovkaId: a.planirovkalar[0].id } });
  });

  it("tells the dojim when the import books the last bo'sh Xonadon of a sevimli Planirovka", async () => {
    const loyiha = await seedLoyiha(t.db, {
      bloklar: [blok('A', [{ xonalar: 2, maydon: 54, xonadonlar: [{ qavat: 1, raqam: 1 }] }])],
    });
    const planirovkaId = loyiha.bloklar[0]!.planirovkalar[0]!.id;
    const put = await t.app.inject({
      method: 'PUT',
      url: `/api/sevimlilar/${planirovkaId}`,
      headers: tmaAuth(signInitData(aziz, { authDate: t.clock.now() })),
    });
    expect(put.statusCode).toBe(204);

    expect((await upload(`/loyihalar/${loyiha.id}/import`, csv('A;1;1;2;54;;;bron;;'))).statusCode).toBe(200);

    const { rows } = await t.db.query("SELECT mijoz_id FROM dojim WHERE ssenariy = 'sevimliBand' AND planirovka_id = $1", [planirovkaId]);
    expect(rows.map((r) => String(r.mijoz_id))).toEqual([String(aziz.id)]);
  });
});
