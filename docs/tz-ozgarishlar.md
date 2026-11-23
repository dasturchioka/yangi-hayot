# TZ v3.0 ga o'zgarishlar («Yangi Mini App»)

Sabab: mijozning yangi talabi — «Xonadonlar planirovka bo'yicha bo'linishi kerak. Qavat va xonadon raqami kerak emas. Misol: Blok A, 27 m² kvartira, xx so'mdan boshlanadi.» Rasmiylashtirish — TZ 10-b., 4-band (o'zgartirish so'rovi).

Bazaviy hajm: 3V — taxminan 40 kishi-kun, 30 kun (UF-4–7siz — 35).
Hisob mijozga savollardagi **default** javoblar bo'yicha (`docs/mijozga-savollar.md`; defaultlar TZ'dan olingan). 2-jadval defaultga kirmaydi — faqat mijoz tanlasa. Boshqa variantlar — 3-jadvalda.
Hajm: «+» — qo'shiladi, «−» — kamayadi, kishi-kun.

## 1. Yangi talabdan kelib chiqadigan o'zgarishlar (majburiy)

Yangi domen modeli: **Loyiha → Blok → Planirovka** (xonalar soni, m², ixtiyoriy nomi, rasm, video, Boshlang'ich narx yoki bo'sh, bo'sh / bron / sotilgan soni; jami o'zgarmaydi, uni faqat administrator tuzatadi). Planirovka holati sonlardan chiqadi: Sotuvda / Band / Sotilgan. Xonadon yozuvi, qavat va raqam yo'q. Loyiha faktlari (blok soni, binoning qavatlari) kartochkada qoladi. Atamalar — `GLOSSARY.md`, qaror — `docs/adr/0001-xonadon-yozuvisiz-katalog.md`. TZ'dagi «korpus», «podyezd» hamma joyda «Blok»ga almashtiriladi.

| Bo'lim | Nima o'zgaradi | Hajm |
|---|---|---|
| 1-bo'lim, 3A «Server» | Katalog sxemasi: `korpus → xonadon` o'rniga `blok → planirovka` (status hisoblagichlari bilan). Hodisalar planirovkaga bog'lanadi | +0,25 |
| 3A, ekranlar 2 | Loyiha kartochkasi: «bo'sh xonadonlar soni» = planirovkalar bo'yicha yig'indi | 0 |
| 3A, ekranlar 3 | «Loyiha shaxmatkasi (UF-1)» → «Blok va planirovkalar» | UF-1 da |
| 3A, ekranlar 4 | Filtrlardan «qavat» olib tashlanadi: shahar, blok, xonalar, narx, maydon. «Faqat bo'sh» Band va Sotilgan planirovkalarni yashiradi. Kviz — filtrlarning qadamma-qadam shakli: javoblar filtrlarni to'ldiradi, oxirida kontakt → bot_quiz Ariza (8-bo'lim) va mos planirovkalar ro'yxati | 0 |
| 3A, ekranlar 5 | «Xonadon kartochkasi» → «Planirovka kartochkasi»: blok, nomi (bo'lsa), xonalar, maydon, «… so'mdan» yoki «so'rov bo'yicha», «XX ta bo'sh» (bron va sotilgan soni mijozga ko'rinmaydi), video, tugmalar o'sha. Band — «Hozircha band» belgisi, faol, ariza tugmasi bilan. Qavat yo'q | 0 |
| 3A, «Qabul» | «200 xonadonli shaxmatka 2 soniyada» → «loyiha planirovkalari ekrani 4G'da 2 soniyada ochiladi» | 0 |
| 3A, dizayn (1–7-kunlar) | UI-kit komponentlari qayta chiziladi: xonadon qatori («B blok · 7-qavat · № XX»), filtrdagi «Qavat», taqqoslashdagi «Blok, qavat», admin «Xonadonlar» jadvali (№, qavat ustunlari), Excel import ekrani. Yozilish tasdig'idagi «Bot sizga 24 va 2 soat oldin eslatma yuboradi» satri olib tashlanadi (S6 default, TZ 2-b.) | +0,5 |
| 3B, UF-1 | Shaxmatka bekor qilinadi. O'rniga: blok tablari → xonalar bo'yicha guruhlangan planirovka kartochkalari, status rangi, filtr mos kartochkalarni ajratadi, sotilgan planirovka ko'rinadi, faol emas. «Qabul»: admin'dagi o'zgarish 1 daqiqada aks etadi — saqlanadi | 2,5 → 1 (−1,5) |
| 3B, UF-2 | Admin: loyiha (holati: Sotuvda / Topshirilgan) → blok → planirovka CRUD; menejer xonadonlarni holatlar orasida ko'chiradi, jami saqlanadi (jurnal saqlanadi). Excel shabloni: `blok, xonalar, maydon, narx_dan, bo'sh, bron, sotilgan, rasm, video`. «Qabul»: «korpusni Excel'dan yuklaydi» → «blok planirovkalarini Excel'dan yuklaydi» | 0 |
| 3B, UF-3 | «Sevimlilardagi xonadon «bron»ga o'tdi» → «sevimlilardagi planirovkada bo'sh qolmadi → o'xshash planirovkalar (shu xonalar soni, yaqin maydon)». «Xonadonni ko'rgan…» → «planirovkani ko'rgan…» | 0 |
| 3B, UF-4 | O'zgarishsiz (skoring xonadonga bog'liq emas) | 0 |
| 3B, UF-5 | Sevimlilar va taqqoslash — planirovkalar; taqqoslash maydonlari: narx, maydon, xonalar, blok, to'lov («qavat» yo'q). «Ulashish» havolasi planirovkani ochadi | 0 |
| 3B, UF-7 | «Eng ko'p ko'rilgan xonadonlar va planirovkalar» → «eng ko'p ko'rilgan planirovkalar»; voronka «xonadonlarni ko'rdi» → «planirovkalarni ko'rdi» | 0 |
| 3V, taqqoslash jadvali | «Xonadon statuslari: Shaxmatka, 1 daqiqada yangilanadi» → «Planirovkalar holati, 1 daqiqada yangilanadi» | 0 |
| 0.3 | Arizada ixtiyoriy Planirovka havolasi (planirovka kartochkasi va kalkulyatordan kelganda) | 0 |
| 0.4 | «Narx so'rov bo'yicha» planirovka darajasida; narx formati — «… so'mdan» | 0 |
| 2-b. | «Ko'rishga yozilish» tugmasi «xonadon ekranida» → «planirovka ekranida»; yozilish o'zi Loyiha bo'yicha — o'zgarishsiz | 0 |
| 6-b. | Kirish «xonadon ekranidan» → «planirovka ekranidan». Kalkulyatorga planirovkaning «… dan» narxi qo'yiladi, mijoz o'zgartira oladi; izoh: «boshlang'ich narx bo'yicha taxminiy hisob» | 0 |
| 8-bo'lim, izohlar jadvali | bot_form: «Loyiha, xonadon (tanlangan bo'lsa)» → «Loyiha, blok, planirovka (xonalar, m², «… dan» narx)»; bot_calc — shuningdek planirovka | 0 |
| 8-b., 9-b. | AI planirovka darajasidagi status va narxni o'qiydi; tugmalar — planirovka ekraniga (startapp) | 0 |
| 11-bo'lim, 4-qator | «bo'sh xonadonlar (xonalar, qavat, maydon, planirovka)» → «bloklar bo'yicha planirovkalar (xonalar, maydon, rasm, «… dan» narx, bo'sh soni)»; 30 kunlik izohda «Excel'dagi xonadonlar ro'yxati» → «planirovkalar ro'yxati» | 0 |
| 12-bo'lim, ochiq savollar | «Narxlar ko'rsatilsinmi» — yopiladi: «… so'mdan». «Valyuta» — UZS (S5 tasdig'idan keyin yopiladi) | 0 |
| **Jami** | | **−0,75** |

## 2. Strategiya bilan moslashtirish (mijoz tanlasa)

Defaultga kirmaydi (default — TZ bo'yicha, hech biri yo'q). S6, S7, S9, S10 taqdimotda va'da qilingan: mijoz tanlasa, shu jadval bo'yicha qo'shiladi.

| Bo'lim | Nima o'zgaradi | Savol | Hajm |
|---|---|---|---|
| 2-b., 12-b. | Ko'rishdan 24 va 2 soat oldin eslatma «Boraman» / «Ko'chirish» bilan; «eslatma yuborilmaydi» jumlasi olib tashlanadi, 12-b. opsiyalaridan chiqadi | S6-a | +1 |
| UF-3 | Sovuq lid seriyasi 3/7/14-kun, «7 kunda 1 ta» limitidan istisno, «Yubormang» saqlanadi; UF-4 ga bog'liq | S7-a | +1 |
| 5-b. / bot | Menejerlar guruhida «Ipoteka hujjatlari ro'yxatini yuborish» tugmasi | S9-2a | +0,5 |
| UF-6 | Admin'da «uy oldi» belgisi, bonus hisobi uchun | S12-a | +0,25 |
| 4-b. / UF-7 | KPI: amoCRM hisobotini sozlash yo'riqnomasi (bot amoCRM'ga faqat yozadi — o'zgarishsiz) | S10-a | +0,5 |
| UF-4 | Kvizga «To'lov usuli» savoli — TZ UF-4 talab qiladi, UF-4 hajmida | S13 | 0 |
| 6-b. | Muddatli to'lov bo'lmasa — kalkulyatorda faqat ipoteka | S5-2 | −0,5 |
| 12-b. | Onlayn bron va hujjat fayllarini qabul qilish — hajmdan tashqari ro'yxatiga qo'shiladi | S9-1, S9-2c | 0 |

## 3. Muqobil javoblar ta'siri

| Javob | 1-jadvalga nisbatan |
|---|---|
| S1-b / S2-b: admin'da ichki xonadonlar ro'yxati qoladi | +0,75 (xonadon yozuvi, statuslar, planirovka hisoblagichlari xonadonlardan) |
| S3-b: «… dan» narx avtomatik (bo'sh xonadonlar minimumi) | +0,25 (faqat S2-b bilan) |
| S7-b: seriya 3/10/17-kun (limit istisnosi kerak emas) | −0,25 |
| S9-2b yoki S10-b yoki S12-b: amoCRM'dan o'qish (webhook, bosqichlar) | +1,5 (umumiy, bir marta) |
| S10-b: kanal bo'yicha reklama xarajati + 5 KPI hisobot | +1,5 (amoCRM'dan o'qishdan tashqari) |
| S1: bo'shagan hajm narxdan chegiriladi | eslatma (+1) yo'q |

## 4. Xulosa

| Ssenariy | Hajm | Muddat |
|---|---|---|
| Bazaviy (3V) | ~40 | 30 kun |
| **Default** — faqat yangi talab (1-jadval) | ~39,25 | 30 kun |
| Yangi talab + tavsiyalar (1 + 2-jadval, muddatli to'lov bor) | ~42,5 | 30 kun (planirovkalar ekrani UF-1 oynasida 11–20-kun, eslatma 2-b. bilan 4–14-kun; qo'shimchalar 15–24-kun oynasiga sig'adi) |
| + amoCRM'dan o'qish va 5 KPI (S10-b o'rniga S10-a) | ~45 | 30 kun, agar M2 da amoCRM webhook huquqi bo'lsa; aks holda +2 kun |

Ochiq savollar javobi kelgach (`docs/mijozga-savollar.md`) jadvallar yangilanadi va 0.2 auditdan keyingi baho bilan birga tasdiqlanadi (3-bo'lim: «ko'pi bilan 15% ga»).

## 5. TZ qamrovi: hech narsa tushib qolmadi

TZ «Yangi Mini App» variantining har bir funksiyasi va «Qabul» bandi. **O'zgarishsiz** — TZ'dagidek; **Moslashtirildi** — 1-jadvaldagi o'zgarish bilan, funksiya saqlanadi; **TZ bo'yicha tashqarida** — TZ'ning o'zi hajmdan chiqargan. Yangi talab birorta funksiyani olib tashlamaydi: faqat qavat, xonadon raqami va shaxmatka jadvali (qavat × xonadon) yo'qoladi.

| TZ | Funksiya / qabul | Holat |
|---|---|---|
| 1-b. Maqsadlar | 3 ta maqsad va metrikalar; joriy ko'rsatkichlar (baza) | O'zgarishsiz (material M3) |
| 2-b. K1 | Bot javob bermaydi → 0.1 | O'zgarishsiz |
| 2-b. K2 | Narx yo'q, Navoiyda xonadon yo'q → katalog + materiallar | Moslashtirildi: Planirovka va Boshlang'ich narx (M5, M6) |
| 2-b. K3 | Ma'lumotlar HTML'da → admin + baza | O'zgarishsiz |
| 2-b. K4 | «Powered by Netlify» → 12-b. | O'zgarishsiz |
| 2-b. K5 | «Biz haqimizda» raqamlari | O'zgarishsiz (M12); Topshirilgan loyihalar — portfolio |
| 2-b. K6 | Kviz va formada manba → 1-b. | O'zgarishsiz |
| 2-b. K7 | leads.jsonl → baza (0.3) | O'zgarishsiz |
| 2-b. «Saqlanadi» | RU/UZ, «Biz haqimizda», Loyihalar (Toshkent/Navoiy), «Xonadon tanlash», 1349, sotuv bo'limi manzili, «Ariza qoldirish», kattalashtiriladigan planirovkalar, qayta urinish bilan yuborish | O'zgarishsiz |
| 3A | React + Vite, Node.js + PostgreSQL, admin rollari, grammY bot, AI katalogni bazadan o'qiydi | O'zgarishsiz (sxema — 1-jadval) |
| 3A ekran 1 | Til, bosh sahifa, qidiruv, shaharlar, tezkor tugmalar | O'zgarishsiz |
| 3A ekran 2 | Loyihalar, kartochka: foto, video, manzil, infratuzilma, bo'sh soni | O'zgarishsiz (bo'sh soni — planirovkalar yig'indisi) |
| 3A ekran 3 | Shaxmatka | Moslashtirildi: «Blok → planirovkalar» |
| 3A ekran 4 | Filtrlar + kviz | Moslashtirildi: «qavat» filtri yo'q, kviz saqlanadi |
| 3A ekran 5 | Kartochka: planirovka, maydon, narx / «so'rov bo'yicha», video, 4 tugma | Moslashtirildi: Planirovka kartochkasi, 4 tugma o'sha |
| 3A ekran 6 | Sevimlilar va taqqoslash | Moslashtirildi: planirovkalar |
| 3A ekran 7 | Yozilish, kalkulyator, «Qanday sotib olish», «Biz haqimizda», kontaktlar, xarita | O'zgarishsiz |
| 3A ekran 8 | «Do'stingni taklif qil», «Mening arizalarim va yozilishlarim» | O'zgarishsiz |
| 3A qabul | RU/UZ, iOS/Android/Desktop; ma'lumotlar yo'qotishsiz; 4G'da 2 soniya | O'zgarishsiz |
| UF-1 | Status rangi, filtr ajratadi, bosilganda kartochka, sotilgan ko'rinadi/faol emas; 1 daqiqada aks etadi; 2 soniyada ochiladi | Moslashtirildi: hammasi planirovka darajasida saqlanadi |
| UF-2 | CRUD, Excel/CSV import, matnlar, muddatli to'lov va bank stavkalari, ko'rsatuv kunlari va slotlari, yozilishlar «keldi/kelmadi», admin'dan rassilka, 2 rol, jurnal | Moslashtirildi: import shabloni va holatlar — planirovka bo'yicha; qolgani o'zgarishsiz |
| UF-3 | 4 ssenariy: ko'rdi/hisobladi → 24 soat; sevimli band bo'ldi; kelmadi; ko'rishdan keyin. 7 kunda 1 ta, «Yubormang», matnlar admin'da, hisobotda dojim yozilishlari | Moslashtirildi: 1–2-ssenariy planirovka bo'yicha; qolgani o'zgarishsiz |
| UF-4 | Kviz + kalkulyator + xatti-harakat → teg; ball qoidalari sozlamalarda; issiq → 5 daqiqa vazifa va guruhda belgi | O'zgarishsiz |
| UF-5 | Sevimlilar, 3 tagacha taqqoslash, «Ulashish» manba bilan | Moslashtirildi: planirovka; taqqoslashda qavat yo'q |
| UF-6 | Shaxsiy havola, amoCRM'da taklif qilgan, admin'da ro'yxat va bitimlar | O'zgarishsiz |
| UF-7 | Voronka manba va loyiha bo'yicha, eng ko'p ko'rilganlar, istalgan davr, haftalik hisobotda | Moslashtirildi: «planirovkalarni ko'rdi», eng ko'p ko'rilgan planirovkalar |
| 3V | Huquqlar: litsenziya, manba kodiga kirish | O'zgarishsiz |
| 0.1 | Botni tiklash, monitoring 5 daqiqa; qabul 3 soniya | O'zgarishsiz |
| 0.2 | Kod auditi, 2 betgacha hisobot, baho ±15% | O'zgarishsiz |
| 0.3 | Bazaga ko'chirish, saqlanadigan maydonlar, kunlik zaxira 14 kun | Moslashtirildi: Arizada ixtiyoriy Planirovka |
| 0.4 | Katalog fayli, narx ixtiyoriy → «so'rov bo'yicha» | Moslashtirildi: «Yangi Mini App»da baza + admin (3V jadvali), qoida planirovka darajasida |
| 1-b. | src_ belgisi, birinchi/oxirgi manba, barcha kirish nuqtalari, amoCRM teg/maydon/izoh | O'zgarishsiz |
| 2-b. | 5 joyda tugma, qadamlar, 14 kun, 9:00–18:00, bayramlar, cheklovsiz, bitim/vazifa, tasdiq + 3 tugma, ko'chirish/bekor, guruhga xabar | Moslashtirildi: «xonadon ekrani» → «planirovka ekrani»; eslatma — S6 |
| 3-b. | /broadcast, media + tugma, 5 auditoriya, tasdiq, 25/s, navbat bazada, hisobot, bloklaganlar | O'zgarishsiz |
| 4-b. | 19:30 hisobot, mazmuni, dushanba haftalik, /report, amoCRM'siz ishlaydi | O'zgarishsiz |
| 5-b. | Plitka, 6 bosqich, hujjatlar + ipoteka ro'yxati, FAQ 15 ta, 3 tugma, RU/UZ | O'zgarishsiz |
| 6-b. | 3 kirish, narx avtomatik, valyuta, muddatli to'lov formulasi, ipoteka annuitet/differensial, banklar ro'yxati, natija, «menejerga yuborish», Excel bilan 3 misol | Moslashtirildi: planirovka ekranidan, Boshlang'ich narx; valyuta — S5 |
| 7-b. | Planirovka va loyiha videosi, havolasiz yashirish, Telegram/YouTube, ostida yozilish | O'zgarishsiz |
| 8-b. | AI-menejer | Alohida shartnoma (TZ 3-b.); katalog API undan qat'i nazar quriladi |
| 9-b. | Bitta bot, ovozli xabarlar, 8-b.gacha zaxira javob, Mini App tugmalari, mijoz ma'lumotlari, dublikatsiz | O'zgarishsiz |
| 10-b. | Salomlashish, /welcome | O'zgarishsiz |
| 11-b. | /restart va doimiy tugma | O'zgarishsiz |
| 8-bo'lim | 5 qoida, 6 ariza turi va teglari, vazifalar, 15 daqiqa, avtorizatsiya xatosi | Moslashtirildi: izohda Blok va Planirovka |
| 9-bo'lim, 12-b. | Domen, SSL, api subdomeni, PM2 | O'zgarishsiz |
| 9-bo'lim NFT | Uzluksizlik, tezlik, tillar, xavfsizlik, zaxira, monitoring, loglar, shaxsiy ma'lumotlar, hujjatlar | O'zgarishsiz |
| 10-bo'lim | Test bot va voronka, chek-list + video, 1 ish kuni, 2 raund, kafolat 30 kun | O'zgarishsiz |
| 11-bo'lim | Materiallar | Moslashtirildi: 4-qator planirovkalar; muddatlar — mijozga-savollar.md, 5-bo'lim |
| 12-bo'lim | Eslatma, operator rejimi, Standart uchun admin, kechiktirilgan rassilka, qo'llab-quvvatlash | TZ bo'yicha tashqarida (eslatma — S6) |
