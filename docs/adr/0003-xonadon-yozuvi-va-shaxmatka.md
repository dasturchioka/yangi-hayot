# Xonadon yozuvi va shaxmatka qaytadi (gibrid model)

ADR 0001 o'rniga. Buyurtmachi (2026-11-23) TZ v3.0 to'liq bajarilishini talab qildi, jumladan UF-1 shaxmatkasi. Mijozning «planirovka bo'yicha sotamiz» talabi ham saqlanadi. Shuning uchun model gibrid: har bir Xonadon alohida yozuv (Blok, qavat, raqam, Planirovka, narx, holat), Planirovka esa bir xil Xonadonlar turi bo'lib qoladi.

- Xonadon — haqiqat manbai. Planirovkaning bo'sh / bron / sotilgan soni va jami Xonadonlardan hisoblanadi, saqlanmaydi.
- Boshlang'ich narx = Planirovkadagi bo'sh Xonadonlarning eng kichik narxi; hech birida narx bo'lmasa — Planirovkaning qo'lda kiritilgan narxi; u ham bo'lmasa — «Narx so'rov bo'yicha».
- Mini App'da ikkala ko'rinish: Blok shaxmatkasi (qavat × xonadon, rang = holat) va Planirovkalar ro'yxati. Xonadon kartochkasida qavat va raqam ko'rinadi.
- Holat Xonadon darajasida o'zgaradi (Menejer), har o'zgarish jurnalga yoziladi.
- Sevimlilar, taqqoslash, ulashish, Ariza va dojim Xonadonga bog'lanadi; Planirovkadan kelgan Ariza ham qoladi.

## Considered Options

- **Sof TZ** (Planirovka ekrani yo'q). Rad etildi: mijozning sotuv usuli (Planirovka bo'yicha) va qurilgan ekranlar yo'qoladi.
- **ADR 0001 (Xonadon yozuvisiz)**. Rad etildi: shaxmatka, qavat filtri va Xonadon darajasidagi holatni qurib bo'lmaydi.

## Consequences

- Excel shablonida har qator — bitta Xonadon (Blok, qavat, raqam, xonalar, maydon, Planirovka nomi, narx, holat).
- Planirovka jamisini qo'lda tuzatish (ADR 0001 dagi Administrator huquqi) yo'qoladi: jami = Xonadonlar soni.
- Sayhun'ning 6 ta va Jozibali Maskan'ning 3 ta xonadoni Xonadon sifatida ko'chiriladi.
