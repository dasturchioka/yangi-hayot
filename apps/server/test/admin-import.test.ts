import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { adminLogin } from './support/admin';
import { signInitData, tmaAuth } from './support/init-data';
import { blok, seedLoyiha } from './support/katalog';
import { createTestApp, type TestApp } from './support/test-app';

const aziz = { id: 700000001, first_name: 'Aziz', language_code: 'uz' };

const HEADER = "Blok;xonalar;maydon;nomi;Boshlang'ich narx;bo'sh;bron;sotilgan;chizma;video";
const csv = (...rows: string[]) => Buffer.from([HEADER, ...rows].join('\n'), 'utf8');

describe("Planirovkalar import from Excel / CSV", () => {
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

  it('lets a Menejer check, then import a new Blok that the Mini App shows at once and the jurnal records', async () => {
    const loyiha = await seedLoyiha(t.db, { nomi: 'Jozibali Maskan', bloklar: [blok('A', [{ xonalar: 1, maydon: 40 }])] });
    await miniApp(`/loyihalar/${loyiha.id}`); // warm the katalog cache
    const file = csv(
      'B;2;54,5;Burchak;455500000;5;1;4;https://example.com/b2.webp;https://t.me/yangihayot/12',
      'B;3;78;;;2;0;0;;',
    );

    const check = await upload(`/loyihalar/${loyiha.id}/import/tekshir`, file);
    expect(check.statusCode).toBe(200);
    expect(check.json()).toMatchObject({ xatolar: [], reja: { yangi: 2, yangilanadi: 0, yangiBloklar: ['B'] } });
    expect((await miniApp(`/loyihalar/${loyiha.id}`)).json().loyiha.bloklar).toHaveLength(1); // checking writes nothing

    const res = await upload(`/loyihalar/${loyiha.id}/import`, file);
    expect(res.statusCode).toBe(200);
    expect(res.json().natija).toMatchObject({ yaratildi: 2, yangilandi: 0 });

    const bloklar = (await miniApp(`/loyihalar/${loyiha.id}?lang=uz`)).json().loyiha.bloklar;
    const b = bloklar.find((x: { nomi: string }) => x.nomi === 'B');
    expect(b.boshXonadonlar).toBe(7);
    const [ikki] = b.guruhlar[0].planirovkalar;
    expect(ikki).toMatchObject({
      xonalar: 2,
      maydon: 54.5,
      nomi: 'Burchak',
      boshlangichNarx: 455_500_000,
      bosh: 5,
      chizma: 'https://example.com/b2.webp',
    });
    expect(b.guruhlar[1].planirovkalar[0]).toMatchObject({ xonalar: 3, maydon: 78, bosh: 2 });
    expect(b.guruhlar[1].planirovkalar[0].boshlangichNarx ?? null).toBeNull();

    const jurnal = (await t.app.inject({ method: 'GET', url: `/admin/api/jurnal?loyihaId=${loyiha.id}`, headers: menejer })).json()
      .yozuvlar;
    expect(jurnal.map((y: { obyekt: string; amal: string; adminNomi?: string }) => [y.obyekt, y.amal])).toEqual([
      ['planirovka', 'yaratildi'],
      ['planirovka', 'yaratildi'],
      ['blok', 'yaratildi'],
    ]);
  });

  it('lists every bad row with its number and reason, and then imports nothing', async () => {
    const loyiha = await seedLoyiha(t.db);
    const file = csv(
      'A;2;54;;400000000;3;0;0;;', // row 2: fine
      ';2;54;;;1;;;;', // row 3: no Blok
      'A;two;-5;;455,5 mln;1;0;0;;https://vimeo.com/1', // row 4: four bad cells
      '',
      'A;2;54;;;1;0;0;;', // row 6: same as row 2
    );

    const check = (await upload(`/loyihalar/${loyiha.id}/import/tekshir`, file)).json();
    expect(check.reja).toBeNull();
    expect(check.xatolar.map((x: { qator: number; ustun?: string }) => [x.qator, x.ustun ?? null])).toEqual([
      [3, 'Blok'],
      [4, 'xonalar'],
      [4, 'maydon'],
      [4, "Boshlang'ich narx"],
      [4, 'video'],
      [6, null],
    ]);
    expect(check.xatolar[5].xabar).toContain('2-qator');

    const res = await upload(`/loyihalar/${loyiha.id}/import`, file);
    expect(res.statusCode).toBe(422);
    expect(res.json().xatolar).toHaveLength(6);
    const tree = (await t.app.inject({ method: 'GET', url: `/admin/api/katalog/loyihalar/${loyiha.id}`, headers: menejer })).json();
    expect(tree.loyiha.bloklar).toEqual([]);
  });

  it('refuses a file without a required column, or that is not a table', async () => {
    const loyiha = await seedLoyiha(t.db);
    const noBosh = Buffer.from('Blok;xonalar;maydon\nA;2;54\n');
    expect((await upload(`/loyihalar/${loyiha.id}/import/tekshir`, noBosh)).json().xatolar).toEqual([
      { qator: 1, ustun: "bo'sh", xabar: "«bo'sh» ustuni yo'q" },
    ]);
    const pdf = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x00, 0x01]);
    const res = await upload(`/loyihalar/${loyiha.id}/import`, pdf, menejer, 'application/octet-stream');
    expect(res.statusCode).toBe(422);
    expect(res.json().xatolar[0]).toMatchObject({ qator: null });
    expect((await upload('/loyihalar/9999/import/tekshir', csv('A;2;54;;;1;0;0;;'))).statusCode).toBe(404);
    expect(
      (await t.app.inject({ method: 'POST', url: `/admin/api/katalog/loyihalar/${loyiha.id}/import`, headers: { 'content-type': 'text/csv' }, payload: csv('A;2;54;;;1;0;0;;') }))
        .statusCode,
    ).toBe(401);
  });
  it('reads an .xlsx saved by a spreadsheet program (LibreOffice: shared strings, number cells)', async () => {
    const loyiha = await seedLoyiha(t.db);
    const file = readFileSync(new URL('./fixtures/import/libreoffice.xlsx', import.meta.url));

    const res = await upload(`/loyihalar/${loyiha.id}/import`, file, menejer, 'application/octet-stream');
    expect(res.statusCode).toBe(200);

    const tree = (await t.app.inject({ method: 'GET', url: `/admin/api/katalog/loyihalar/${loyiha.id}`, headers: menejer })).json();
    const [v] = tree.loyiha.bloklar;
    expect(v.nomi).toBe('V');
    expect(
      v.planirovkalar.map((p: Record<string, unknown>) => [p.xonalar, p.maydon, p.nomi, p.boshlangichNarx, p.bosh, p.bron, p.sotilgan, p.video]),
    ).toEqual([
      [1, 38.2, { uz: "Studiya & ko'l", ru: "Studiya & ko'l" }, 310_000_000, 4, 0, 1, null],
      [2, 61.75, { uz: 'Burchak, quyosh', ru: 'Burchak, quyosh' }, null, 0, 2, 3, 'https://youtu.be/abc123'],
    ]);
  });

  it("gives a shablon filled with the Loyiha's Planirovkalar; uploading it back updates rows in place", async () => {
    const loyiha = await seedLoyiha(t.db, {
      slug: 'jozibali-maskan',
      bloklar: [
        blok('A', [
          { xonalar: 2, maydon: 54.5, boshlangichNarx: 455_500_000, bosh: 5, bron: 1, sotilgan: 4 },
          { xonalar: 3, maydon: 80, bosh: 2 },
        ]),
      ],
    });

    const sh = await t.app.inject({
      method: 'GET',
      url: `/admin/api/katalog/loyihalar/${loyiha.id}/import/shablon.xlsx`,
      headers: menejer,
    });
    expect(sh.statusCode).toBe(200);
    expect(sh.headers['content-type']).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(sh.headers['content-disposition']).toContain('jozibali-maskan-planirovkalar.xlsx');
    const unchanged = (await upload(`/loyihalar/${loyiha.id}/import/tekshir`, sh.rawPayload, menejer, 'application/octet-stream')).json();
    expect(unchanged).toMatchObject({ xatolar: [], reja: { yangi: 0, yangilanadi: 0, ozgarishsiz: 2, fayldaYoq: 0 } });

    // Two sold, one booked, price up; the 3-xona row is left out of the file.
    const file = csv('a;2;54,50;;460 000 000;2;2;6;;');
    const check = (await upload(`/loyihalar/${loyiha.id}/import/tekshir`, file)).json();
    expect(check.reja).toMatchObject({ yangi: 0, yangilanadi: 1, yangiBloklar: [], fayldaYoq: 1 });
    expect(check.reja.qatorlar[0].ozgarishlar).toEqual(['boshlangichNarx', 'bosh', 'bron', 'sotilgan']);
    expect((await upload(`/loyihalar/${loyiha.id}/import`, file)).json().natija).toMatchObject({ yangilandi: 1 });

    const tree = (await t.app.inject({ method: 'GET', url: `/admin/api/katalog/loyihalar/${loyiha.id}`, headers: menejer })).json();
    expect(tree.loyiha.bloklar[0].planirovkalar.map((p: Record<string, unknown>) => [p.xonalar, p.boshlangichNarx, p.bosh, p.bron, p.sotilgan])).toEqual([
      [2, 460_000_000, 2, 2, 6],
      [3, null, 2, 0, 0],
    ]);
    const [yozuv] = (await t.app.inject({ method: 'GET', url: `/admin/api/jurnal?loyihaId=${loyiha.id}`, headers: menejer })).json()
      .yozuvlar;
    expect(yozuv).toMatchObject({
      admin: { nomi: 'Dilnoza' },
      amal: 'tahrirlandi',
      oldin: { boshlangichNarx: 455_500_000, bosh: 5, bron: 1, sotilgan: 4 },
      keyin: { boshlangichNarx: 460_000_000, bosh: 2, bron: 2, sotilgan: 6 },
    });
  });
});
