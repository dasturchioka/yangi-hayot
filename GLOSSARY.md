# Yangi Hayot

Yangi Hayot quruvchi kompaniyasining Telegram-boti, Mini App va sotuv bo'limi admin-paneli: xaridorga uylarni ko'rsatish, murojaatlarni yig'ish va ularni sotuv bo'limiga yetkazish.

## Katalog

**Loyiha**:
Yangi Hayot quradigan yoki qurgan turar-joy majmuasi (masalan, Jozibali Maskan, Sayhun).
_Avoid_: ЖК, obyekt, kompleks

**Loyiha holati**:
Sotuvda (katalogda ko'rinadi) yoki Topshirilgan (faqat kompaniya portfoliosida).
_Avoid_: Tugallangan, arxiv

**Blok**:
Loyiha ichidagi bitta bino yoki podyezd; mijozga ko'rinadigan eng kichik joylashuv birligi.
_Avoid_: Korpus, podyezd, bino

**Planirovka**:
Bitta Blok ichidagi bir xil xonadonlar turi: xonalar soni, maydon va chizma. Boshqa blokdagi xuddi shunday xonadon — boshqa Planirovka.
_Avoid_: Xonadon turi, layout, kvartira

**Xonadon**:
Blok ichidagi bitta sotiladigan uy: qavat, raqam, Planirovka, narx va holat bilan alohida yozuv (ADR 0003).
_Avoid_: Kvartira (tizim matnlarida), uy

**Xonadon holati**:
Har bir Xonadon bo'sh, bron yoki sotilgan. Planirovkaning bo'sh / bron / sotilgan soni va jami Xonadonlardan hisoblanadi.
_Avoid_: Svobodno, zanyato

**Shaxmatka**:
Blok bo'yicha «qavat × xonadon» jadvali: katak rangi = Xonadon holati, katakda xonalar va maydon (TZ UF-1).
_Avoid_: Shaxmatkа (kirill), chessboard

**Planirovka holati**:
Xonadonlar sonidan kelib chiqadi: Sotuvda (bo'sh bor), Band (bo'sh yo'q, bron bor), Sotilgan (hammasi sotilgan).
_Avoid_: Status (qo'lda qo'yiladigan)

**Boshlang'ich narx**:
Planirovkadagi bo'sh Xonadonlarning eng kichik narxi, mijozga «… so'mdan» ko'rinishida; Xonadonlarda narx bo'lmasa — Planirovkaning qo'lda kiritilgan narxi; u ham bo'lmasa — «Narx so'rov bo'yicha».
_Avoid_: Dan narx, minimal narx, start narx

## Mijoz va sotuv

**Mijoz**:
Botga kirgan odam (bitta Telegram akkaunti).
_Avoid_: Lid, foydalanuvchi, xaridor

**Manba**:
Mijoz qaysi reklama yoki kanaldan kelgani: `?start=src_<nomi>` belgisidagi nom, belgisiz — «Telegram (to'g'ridan-to'g'ri)», boshqa Mijozning «Ulashish» havolasi orqali — «mijoz ulashdi», shaxsiy Taklif havolasi orqali — «mijoz taklif qildi». Har Mijozda birinchi (o'zgarmaydi) va oxirgi Manba.
_Avoid_: Istochnik, source (tizim matnlarida), UTM

**Taklif**:
Mijozning shaxsiy havolasi (`?start=taklif_<kod>`) orqali botga birinchi marta kelgan boshqa Mijoz. Taklif qilgan Mijoz bir marta yoziladi va o'zgarmaydi; avval botni bilgan Mijoz taklif qilingan hisoblanmaydi. Bonus va «uy oldi» tizimda yo'q.
_Avoid_: Referal, invite

**Ariza**:
Mijozning bitta murojaati: forma, kviz, ko'rishga yozilish, kalkulyator hisobi, AI suhbati yoki «Menejer kerak».
_Avoid_: Lid, zayavka, so'rov

**Bitim**:
amoCRM'dagi sotuv kartochkasi; bitta Mijozga botdan ko'pi bilan bitta ochiq Bitim.
_Avoid_: Sdelka, deal, lid

**Rassilka**:
Administrator botdagi /broadcast yoki admin-paneldan auditoriyaga (hammasi, RU, UZ, Toshkentga qiziqish, Navoiyga qiziqish) yuboradigan bitta xabar: matn, ixtiyoriy foto/video va bitta tugma. Botni bloklagan Mijozlarga bormaydi.
_Avoid_: Broadcast, mailing, xabarnoma

**Dojim**:
Bot Mijozga o'zi yuboradigan muloyim eslatma: Planirovkani ko'rib Ariza qoldirmadi, sevimli Planirovka band bo'ldi, ko'rishga kelmadi yoki keldi. Bitta Mijozga 7 kunda ko'pi bilan bitta; «Yubormang» bosilsa, boshqa hech qachon yuborilmaydi.
_Avoid_: Napominanie, reminder, follow-up (tizim matnlarida)

**Shaharga qiziqish**:
Mijoz shahar Loyihalarini ochgan, kvizda shu shaharni tanlagan yoki uning Loyihasiga Ariza qoldirgan; bitta Mijoz ikkala shaharga ham qiziqishi mumkin.
_Avoid_: Segment, shahar tanlovi

**Daraja**:
Mijozning xaridga tayyorligi bahosi: issiq, iliq yoki sovuq. Mijozga tegishli; Bitim uni faqat nusxa sifatida ko'rsatadi.
_Avoid_: Skor, lid turi
