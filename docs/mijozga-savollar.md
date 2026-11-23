# Yangi Hayot — mijozga savollar

Asos: TZ v3.0 (O'zbekcha.pdf), variant «Yangi Mini App»; sotuv strategiyasi (19.11.2026, «Yashil barg»); mijozning yangi talabi:

> «Xonadonlar planirovka bo'yicha bo'linishi kerak. Qavat va xonadon raqami kerak emas. Misol: Blok A, 27 m² kvartira, xx so'mdan boshlanadi.»

TZ 10-bo'lim, 4-band: «Yangi talablar — alohida baho bilan o'zgartirish so'rovi orqali». Shu sababli bu talab va quyidagi javoblar TZ'ga o'zgartirish sifatida rasmiylashtiriladi (`docs/tz-ozgarishlar.md`).

Har bir savolda javob variantlari va bizning tavsiyamiz bor. **Default** — belgilangan kungacha javob bo'lmasa, shu bo'yicha ishlaymiz. Defaultlar TZ'dan olingan; TZ'da javob bo'lmasa — mijoz talabi yoki strategiyadan. TZ va strategiya zid bo'lsa, TZ ustun (TZ — yagona manba). Diqqat: S6, S7, S9, S10 dagi defaultlar taqdimotdagi va'dalarni bajarmaydi — mijozdan aniq javob olish tavsiya etiladi, lekin ish default bo'yicha boshlanadi. Javob kerak bo'lgan muddat — oxirgi ustunda (3V-bo'limdagi 30 kunlik grafik kunlari bilan; 1-kun = kirish huquqlari va oldindan to'lov olingan kun, TZ 3-bo'lim).

---

## 1. Planirovka bo'yicha katalog (yangi talab)

### S1. Xonadonlar shaxmatkasi (UF-1) bilan nima qilamiz?
TZ 3B, UF-1: «Har bir loyiha bo'yicha: korpus / podyezd → «qavat × xonadon» jadvali». Qavat va xonadon raqamisiz shaxmatka bo'lmaydi.

- **a) (tavsiya)** Shaxmatka bekor qilinadi. O'rniga «Blok → planirovkalar» ekrani: blok bo'yicha planirovka kartochkalari (xonalar, m², rasm, «… so'mdan», status).
- b) Mini App'da planirovkalar, admin-panelda esa menejer uchun ichki xonadonlar ro'yxati qoladi (S2-b bilan birga).

Hajm: UF-1 2,5 kishi-kun edi, planirovkalar ekrani ~1 kishi-kun. **Bo'shagan hajm bilan nima qilamiz?**
- **a) (tavsiya)** Strategiyada va'da qilingan, lekin TZ'da yo'q funksiyaga yo'naltiramiz: ko'rish oldidan eslatma (S6).
- b) Shartnoma narxidan chegiramiz.

> **Default:** Shaxmatka Mini App'dan ham, admin'dan ham olib tashlanadi, o'rniga planirovkalar ekrani (S1-a). Bo'shagan hajm hisobdan chiqariladi. Asos: TZ 10-b., 4-band — yangi talab alohida baholanadi; TZ'da eslatma 12-b. bo'yicha hajmdan tashqari.

Javob kerak: **3-kungacha** (dizayn 1–7-kunlar, server 4–10-kunlar).

### S2. Xonadonlar hisobi qaysi darajada yuritiladi?
TZ UF-2: «Rollar: … menejer — xonadon statuslari», UF-1: «status: bo'sh / bron / sotilgan». Talabdan keyin «xonadon» yozuvi kerakmi — sizning sotuv jarayoningizga bog'liq.

- **a) (tavsiya)** Faqat planirovka darajasida: har bir planirovkada «bo'sh / bron / sotilgan» soni. Menejer sonni o'zgartiradi, o'zgarishlar jurnali saqlanadi (UF-2). Raqam va qavat umuman kiritilmaydi.
- b) Har bir xonadon admin'da ichki yozuv sifatida qoladi (ichki ID, status, narx), mijozga ko'rsatilmaydi. Excel'ni xonadonlar bo'yicha to'ldirish kerak bo'ladi.

> **Default:** Faqat planirovka darajasida (S2-a): bo'sh / bron / sotilgan soni. Asos: talabdagi «qavat va xonadon raqami kerak emas». TZ'dan qoladi: UF-1 dagi uchta status, UF-2 dagi «Narx va status o'zgarishlari jurnali» va menejer roli.

Javob kerak: **3-kungacha**.

### S3. «… so'mdan» narx qanday hisoblanadi?
TZ 0.4: narx «xonadon uchun yoki «m² uchun … dan»»; «Narx maydoni majburiy emas: bo'sh bo'lsa, «Narx so'rov bo'yicha» va ariza tugmasi chiqadi».

- **a) (tavsiya, S2-a bilan)** Admin'da planirovka uchun qo'lda kiritiladi.
- b) (faqat S2-b bilan) Avtomatik: shu planirovkaning bo'sh xonadonlari ichida eng kichik narx.

Shuningdek: narx **butun xonadon uchun** (misoldagi kabi «xx so'mdan») ko'rsatiladimi yoki **1 m² uchun** ham?

> **Default:** Admin'da qo'lda kiritiladi, butun xonadon narxi «… so'mdan» (talabdagi misol). 1 m² narxi ko'rsatilmaydi. Maydon bo'sh bo'lsa, TZ 0.4: «Narx so'rov bo'yicha» va ariza tugmasi.

Javob kerak: **3-kungacha**.

### S4. Planirovkada «XX ta bo'sh» ko'rsatilsinmi?
TZ 3A, 2-ekran loyiha kartochkasida «bo'sh xonadonlar soni»ni allaqachon ko'zda tutadi — loyiha darajasida savol yo'q. Savol faqat planirovka darajasi haqida.

- **a) (tavsiya)** Ha, «5 ta bo'sh» (kam qolganini ko'rsatish sotuvga yordam beradi).
- b) Yo'q, faqat «Sotuvda» / «Sotilgan».

> **Default:** Ha, «XX ta bo'sh» ko'rsatiladi. Asos: TZ 3A, 2-ekran loyiha darajasida «bo'sh xonadonlar soni»ni ko'rsatadi — planirovka darajasi ham shu qoida bilan.

Javob kerak: **7-kungacha** (dizayn kelishish).

---

## 2. Strategiyadagi va'dalar va TZ

### S5. Valyuta va muddatli to'lov
TZ 6-b.: «Hisob valyutasi: USD yoki UZS — Buyurtmachi aniqlaydi»; 12-b. ochiq savol: «Muddatli to'lov va ipoteka qaysi valyutada hisoblanadi». Strategiya («Narxlar so'mda») va sizning talabingiz («xx so'mdan») — UZS.

1. **Tasdiqlang:** narxlar va kalkulyator — faqat UZS. (12-b. dagi «narxlar ko'rsatilsinmi» savoli ham shu bilan yopiladi: «… dan» formati.)
2. Muddatli to'lov (bo'lib to'lash) sizda haqiqatan bormi? TZ 6-b. uni hisoblaydi, strategiyada faqat ipoteka bor. Yo'q bo'lsa, kalkulyatorda faqat ipoteka qoladi (−0,5 kishi-kun).

Banklar: TZ 6-b. «stavka (sozlamalardagi banklar ro'yxatidan yoki qo'lda)» — ro'yxat qo'llab-quvvatlanadi, Xalq banki unda birinchi bo'ladi. Savol emas, faqat stavkalar kerak (materiallar, M7).

> **Default:** 1) UZS (strategiya «Narxlar so'mda» + talabdagi «xx so'mdan»). 2) Muddatli to'lov bor — TZ 6-b. uni hisoblaydi; shartlari M9 dan. Banklar — TZ 6-b. bo'yicha ro'yxat, birinchisi Xalq banki.

Javob kerak: **8-kungacha** (kalkulyator 8–20-kunlar).

### S6. Ko'rishdan 24 va 2 soat oldin eslatma
Strategiya («Ko'rish: Bot 24 va 2 soat oldin eslatadi»; «Menejerning 4 qadami», 02) buni va'da qiladi. TZ 2-b.: «Asosiy hajmda mijozga eslatma yuborilmaydi (Buyurtmachi qarori)»; 12-b.: hajmdan tashqari opsiya; 12-b. ochiq savol: «Ko'rish haqidagi eslatmalar nega o'chirilgan — menejerlar o'zlari qo'ng'iroq qiladimi?»

- **a) (tavsiya)** Qo'shamiz («Boraman» / «Ko'chirish» tugmalari bilan), S1 dan bo'shagan hajm hisobiga. ~1 kishi-kun.
- b) Yo'q — strategiyadagi va'da olib tashlanadi, menejer o'zi qo'ng'iroq qiladi.

> **Default:** TZ bo'yicha. Taqdimotdagi va'da bajarilmaydi, buni mijozga alohida aytamiz; javob kelsa, 2-jadval bo'yicha qo'shamiz. Eslatma yo'q. Asos: TZ 2-b. «Asosiy hajmda mijozga eslatma yuborilmaydi (Buyurtmachi qarori)»; 12-b. — hajmdan tashqari opsiya. Dizayndagi «Bot sizga 24 va 2 soat oldin eslatma yuboradi» satri olib tashlanadi, strategiyadagi va'da TZ'ga moslanadi.

Javob kerak: **10-kungacha** (2-b. yozilish 4–14-kunlar).

### S7. Sovuq lidga 3, 7 va 14-kunlarda xabar
Strategiya: «4-bekatda sovuq chiqqan lidga bot 3, 7 va 14-kunlari yangi xabar yuboradi». TZ UF-3: «Bitta mijozga 7 kunda ko'pi bilan 1 ta shunday xabar, doim «Yubormang» tugmasi bilan». 3- va 7-kunlar orasi 4 kun — qoida buziladi. Bundan tashqari, «sovuq» tegi UF-4 skoringidan keladi; UF-4 TZ bo'yicha chiqarib tashlanishi mumkin (3B).

- **a) (tavsiya)** Sovuq lid seriyasi uchun limit istisno: 3 ta xabar 14 kun ichida, «Yubormang» saqlanadi, boshqa dojim xabarlari bu davrda yuborilmaydi. ~1 kishi-kun, UF-4 bo'lsa.
- b) Seriya limitga moslanadi: 3, 10, 17-kunlar.
- c) Seriya qilinmaydi, sovuq lidlarga faqat rassilka (3-b.).

Diqqat: strategiyadagi xabar mazmuni «yangi qavat» — yangi talabdan keyin «yangi planirovka / yangi blok» bo'ladi. Matnlar admin-panelda (UF-3), ularni siz yozasiz.

> **Default:** TZ bo'yicha. Taqdimotdagi va'da bajarilmaydi, buni mijozga alohida aytamiz; javob kelsa, 2-jadval bo'yicha qo'shamiz. Alohida seriya yo'q (S7-c). Asos: TZ UF-3 da faqat to'rtta ssenariy bor va «Bitta mijozga 7 kunda ko'pi bilan 1 ta shunday xabar». Sovuq lidlarga xabar — 3-b. rassilkasi orqali. Seriya kerak bo'lsa, limitga mos variant — S7-b (3, 10, 17-kunlar).

Javob kerak: **14-kungacha** (UF-3 15–22-kunlar).

### S8. AI-menejer shartnomasi (8-b.) va lid saralash
Strategiya: «AI har lidni uch guruhga ajratadi», «Reveo AI … byudjet, xonalar soni va muddatni so'rab, lidni saralaydi». TZ UF-4: teg «Kviz va kalkulyator javoblari … hamda xatti-harakat» bo'yicha, ball qoidalari asosida qo'yiladi; TZ 3-bo'lim: «AI-menejer (8-b.) alohida shartnoma bilan rasmiylashtiriladi».

1. 8-b. bo'yicha alohida shartnoma tuzilganmi yoki tuziladimi? Yo'q bo'lsa, saralash faqat kviz, kalkulyator va xatti-harakat bo'yicha ishlaydi, AI suhbati skoringga kirmaydi.
2. UF-4–7 hajmda qoladimi? (3V: UF-4–7siz — 35 kishi-kun.) Strategiyadagi saralash va sovuq lid seriyasi (S7) UF-4'ga tayanadi.

Ball jadvalini kim kelishishi TZ'da bor (UF-4 «Qabul»: «sotuv bo'limi rahbari bilan kelishilgan ball jadvali») — muddati M14 da.

> **Default:** 1) 8-b. shartnomasi hozircha yo'q deb hisoblaymiz (TZ 3-b.: «alohida shartnoma bilan rasmiylashtiriladi»): saralash faqat UF-4 qoidalari bo'yicha — kviz, kalkulyator, xatti-harakat. 2) UF-4–7 hajmda qoladi — TZ 3V dagi asosiy hisob (~40 kishi-kun) ular bilan.

Javob kerak: **5-kungacha**.

### S9. «Bron» bosqichi va ipoteka hujjatlari
Strategiya: 7-bekat «Bron — Xonadon mijozga band qilinadi», 8-bekat «Ipoteka hujjatlarini bot so'raydi», menejer 4-qadami «Ipoteka hujjatlari ro'yxatini bot mijozga yuboradi». TZ'da: bron — admin'dagi status (UF-1, UF-2); 5-b. «Xaridor hujjatlari; ipoteka uchun alohida ro'yxat» — Mini App'dagi ma'lumot. Bot hujjat so'rashi yoki bron bosqichida o'zi yuborishi TZ'da yo'q.

1. «Bron» — faqat menejer admin'da qo'yadigan status (TZ'da bor), yoki mijoz Mini App'dan onlayn band qilishi kerakmi? **Tavsiya:** faqat status; onlayn bron (to'lov, muddat, bekor qilish) — alohida loyiha.
2. Ipoteka hujjatlari:
   - **a) (tavsiya)** Bot ro'yxatni yuboradi: 5-b. dagi ro'yxat + menejerlar guruhidagi «Hujjatlar ro'yxatini yuborish» tugmasi. ~0,5 kishi-kun.
   - b) amoCRM'da bitim «Bron» bosqichiga o'tganda avtomatik. amoCRM'dan o'qishni talab qiladi (S10 bilan umumiy, +1,5 kishi-kun).
   - c) Bot hujjat fayllarini qabul qiladi — tavsiya qilmaymiz: pasport va daromad ma'lumotlari (9-bo'lim, «Shaxsiy ma'lumotlar»; hozirgi VPS O'zbekistondan tashqarida).

> **Default:** TZ bo'yicha. Taqdimotdagi va'da bajarilmaydi, buni mijozga alohida aytamiz; javob kelsa, 2-jadval bo'yicha qo'shamiz. 1) Bron — faqat admin'dagi status (TZ UF-1, UF-2); onlayn bron yo'q. 2) Ipoteka hujjatlari ro'yxati — faqat Mini App'dagi «Qanday sotib olish» bo'limida (TZ 5-b.: «Xaridor hujjatlari; ipoteka uchun alohida ro'yxat»). Bot hujjat yubormaydi va so'ramaydi.

Javob kerak: **10-kungacha**.

### S10. Oylik 5 ta KPI kim yig'adi?
Strategiya («Hisobot»): javob tezligi, lid → ko'rish, ko'rish → bron, kelmaganlar, kanal samarasi (lid va bron narxi); «Hammasi amoCRM'dan avtomatik yig'iladi». TZ 4-b.: «Ma'lumotlar — bot bazasidan»; 8-bo'lim: bot amoCRM'ga faqat yozadi.

TZ bo'yicha allaqachon bor: lid → ko'rish va kelmaganlar (UF-7 voronka, UF-2 «keldi / kelmadi» belgisi). Yo'q: javob tezligi, ko'rish → bron (amoCRM bosqichlari kerak), kanal narxi (reklama xarajatlari kerak).

- **a)** Bu 3 ta ko'rsatkich amoCRM'ning o'z hisobotlarida, reklama xarajatini marketing hisoblaydi. Bizdan: bitimga manba tegi (1-b. da bor) + amoCRM hisobotini sozlash bo'yicha yo'riqnoma. +0,5 kishi-kun.
- **b)** Biz yig'amiz: amoCRM'dan bosqich o'zgarishini o'qish (webhook), admin'da kanal bo'yicha oylik reklama xarajatini kiritish, 5 ta KPI'li oylik hisobot. ~3 kishi-kun.

> **Default:** TZ bo'yicha. Taqdimotdagi va'da bajarilmaydi, buni mijozga alohida aytamiz; javob kelsa, 2-jadval bo'yicha qo'shamiz. S10-a, qo'shimcha ishsiz. TZ bo'yicha: lid → ko'rish va kelmaganlar — UF-7 va UF-2 («keldi / kelmadi»); hisobot bot bazasidan (4-b.), bot amoCRM'ga faqat yozadi (8-bo'lim). Javob tezligi, ko'rish → bron va kanal narxi — amoCRM'ning o'z hisobotlarida, Yangi Hayot o'zi yuritadi (TZ 8-bo'lim: «muddati o'tgan vazifalar sotuv bo'limi rahbariga amoCRM'da ko'rinadi»).

Javob kerak: **15-kungacha** (UF-7 15–24-kunlar).

---

## 3. TZ ichidagi noaniqliklar

### S11. Loyihalar ro'yxati
TZ K2: «13 ta loyihadan faqat ikkitasida xonadonlar bor», «Navoiydagi sotuvdagi 5 ta loyihada xonadon yo'q»; K5: «ro'yxatda 13 loyiha, Navoiyda topshirilgani — 5 ta». Bizga berilgan materiallar: Navoiy — 10 ta, Toshkent — 2 ta (jami 12).

1. 13 ta loyihaning to'liq ro'yxati: nomi, shahar, holati (sotuvda / topshirilgan).
2. Topshirilgan (sotuvda yo'q) loyihalar qayerda ko'rinadi?
   - **a) (tavsiya)** «Biz haqimizda»da portfolio sifatida, katalogda emas.
   - b) Katalogda «Sotuvda yo'q» belgisi bilan.

Sotuvdagi, lekin planirovkasi hali yo'q loyiha — TZ 0.4 qoidasi bilan: «Narx so'rov bo'yicha» va ariza tugmasi (savol emas).

> **Default:** Katalogda faqat sotuvdagi loyihalar: Toshkent — 2, Navoiy — 5 (TZ K2: «Navoiydagi sotuvdagi 5 ta loyiha»). Topshirilganlar — «Biz haqimizda»da portfolio. Planirovkasi yo'q loyiha — TZ 0.4: «Narx so'rov bo'yicha» va ariza. Qaysi 5 tasi sotuvda ekanini baribir M5 da aytish kerak.

Javob kerak: **5-kungacha** (katalog bilan birga).

### S12. «Do'stingni taklif qil» (UF-6): «uy oldi»ni kim belgilaydi?
TZ UF-6: «amoCRM'da taklif qilinganning bitimida kim taklif qilgani ko'rsatiladi»; «tizim faqat takliflarni hisobga oladi». Bonus «uy oldi» faktiga bog'liq, lekin uni qayd etish TZ'da yo'q.

- **a) (tavsiya)** Menejer admin'da qo'lda belgilaydi. +0,25 kishi-kun.
- b) amoCRM'da bitim «Muvaffaqiyatli» bo'lganda avtomatik — faqat S10-b yoki S9-b tanlansa.

> **Default:** «Uy oldi» belgisi yo'q. Asos: TZ UF-6 «tizim faqat takliflarni hisobga oladi, pul operatsiyalari yo'q»; «Qabul»: admin-panelda «taklif qilinganlar ro'yxati va ularning bitimlari ko'rinadi». Bonus uchun bitim holatini menejer amoCRM'da ko'radi.

Javob kerak: **15-kungacha**.

### S13. Kviz savollari
TZ 3A-4: «Xonadon tanlash» kvizi saqlanadi; 8-bo'lim (bot_quiz izohi): «shahar, tur, xonalar, byudjet, muddat»; UF-4: «byudjet, xarid muddati, to'lov usuli».

Kvizga «To'lov usuli» (to'liq / muddatli / ipoteka) savolini qo'shamiz — UF-4 uchun kerak. Sizdan: **byudjet oraliqlari** (so'mda) va **xarid muddati** variantlari (masalan: shu oy / 3 oy ichida / keyinroq). «Tur» savoli (yangi / tayyor) kerakmi — strategiyada hammasi «Tayyor uylar».

> **Default:** Kviz savollari — TZ 8-bo'lim (bot_quiz) va UF-4 bo'yicha: shahar, tur, xonalar, byudjet, xarid muddati, to'lov usuli. Variantlar: tur — «Yashash uchun / Ijaraga berish (investitsiya)» (strategiyadagi «Kimga sotamiz»); xonalar — 1 / 2 / 3 / 4+; byudjet — M6 dagi «… dan» narxlarning minimumidan maksimumigacha 4 ta teng oraliq; muddat — «Shu oy / 1–3 oy / 3–6 oy / Hali bilmayman»; to'lov usuli — «To'liq / Muddatli / Ipoteka».

Javob kerak: **8-kungacha**.

### S14. Filtr va kviz: amalga oshirishdagi tanlovlar (#10)
#10 tiketini qurishda TZ va UI kit javob bermagan joylar. Hammasi defaultga ko'ra qilingan; javob kelsa, o'zgartiriladi.

1. Kvizdagi byudjet savoliga «Hali aniq emas» varianti qo'shildi (S13 ro'yxatida yo'q).
2. Byudjet oraliqlari avtomatik — har shahar uchun alohida; Administrator kiritgan oraliqlar esa ikkala shaharga bir xil qo'llanadi.
3. Shaharga qiziqish (rassilka auditoriyasi) faqat kviz tugaganda yoziladi; natijalarni shahar bo'yicha filtrlash hisoblanmaydi.
4. Natija qatorida sevimlilar (♡) tugmasi yo'q: qatorning o'zi havola. Sevimlilarga Planirovka ekranidan qo'shiladi.
5. «Arzonroq avval» saralash tugmasi yo'q: natijalar doim arzonidan boshlab chiqadi.

> **Default:** 1–5 bandlar yuqorida yozilganidek qoladi.

Javob kerak: **15-kungacha**.

---

## 4. TZ javob beradigan joylar (savol berilmaydi)

| Mavzu | TZ iqtibosi | Qaror |
|---|---|---|
| Planirovka to'liq sotilsa | UF-1: «Sotilgan xonadonlar ko'rinadi, lekin faol emas: mijoz uy sotilayotganini ko'radi» | Planirovka «Sotilgan» belgisi bilan ko'rinadi, faol emas |
| Narx yo'q planirovka | 0.4: «bo'sh bo'lsa, «Narx so'rov bo'yicha» va ariza tugmasi chiqadi» | Planirovka darajasida xuddi shunday |
| Kalkulyatordagi narx | 6-b.: «Xonadonning narxi bo'lsa, o'zi qo'yiladi; aks holda mijoz o'zi kiritadi» | Planirovkaning «… dan» narxi qo'yiladi, mijoz o'zgartira oladi |
| Bank bittami | 6-b.: «sozlamalardagi banklar ro'yxatidan yoki qo'lda» | Ro'yxat; Xalq banki birinchi |
| Ko'rsatuv slotlari | 2-b.: «9:00 dan 18:00 gacha soatbay slotlar», «Bir vaqtga yozilishlar soni cheklanmaydi»; UF-2: «ko'rsatuv kunlari va slotlari» admin'da | 2-b. qiymatlari — standart; admin'da o'zgartiriladi. Cheklov yo'q |
| Loyiha kartochkasida bo'sh soni | 3A, 2-ekran: «bo'sh xonadonlar soni» | Saqlanadi (planirovkalar yig'indisi) |
| Ball jadvalini kim beradi | UF-4 «Qabul»: «sotuv bo'limi rahbari bilan kelishilgan ball jadvali» | Sotuv bo'limi rahbari |
| Video planirovkaga bog'liq | 7-b.: «Planirovka ekranida «Videoni ko'rish» tugmasi» | O'zgarishsiz |

---

## 5. Materiallar: nima, qaysi kungacha, bloklaydimi

TZ 11-bo'lim: «Material har bir kun kechiksa, bog'liq bandni topshirish bir kunga suriladi»; «Yangi Mini App» variantida «materiallar muddati 30 kunlik grafikka moslashtiriladi; Excel'dagi xonadonlar ro'yxati 5-kungacha beriladi».

**Bloklovchi** = kechiksa ish to'xtaydi va muddat suriladi. **Bloklamaydi** = vaqtinchalik matn bilan ishlaymiz, lekin qabul (10-bo'lim) material kelgandan keyin.

| № | Material | TZ | Qaysi ish (3V kunlari) | Kerak | Bloklovchi |
|---|---|---|---|---|---|
| M1 | Kirish: VPS, Netlify, bot va Mini App manba kodi, BotFather | 11-b. 1 | 0-bosqich (1–3) | **1-kundan oldin** | Ha — muddat shu kundan boshlanadi |
| M2 | amoCRM: integratsiya tokeni, voronka va bosqichlar ID, test voronkasi, «Manba» maydoni | 11-b. 2 | 0-bosqich, 1-b. (1–14) | **1-kundan oldin** | Ha |
| M3 | Joriy ko'rsatkichlar (oyiga arizalar, yozilishlar, kelganlar) | 1-b., 11-b. 3 | 3 oydan keyingi baholash | **1-kundan oldin** | Ishni emas, natijani o'lchashni bloklaydi |
| M4 | Vektor logo (SVG/PDF) | 11-b. da yo'q — qo'shiladi | Dizayn (1–7) | **2-kun** | Ha (dizayn uchun); assets'da faqat PNG |
| M5 | Loyihalar ro'yxati va holati (S11), Navoiy loyihalari ma'lumotlari (manzil, infratuzilma, foto) | 11-b. 4 | Server katalog (4–10) | **5-kun** | Ha |
| M6 | Planirovkalar Excel'da: blok, xonalar, m², rasm, «… dan» narx, bo'sh soni (S2 ga ko'ra); Sayhun bloklari (readme bo'sh) | 11-b. 4 (o'zgartirilgan) | Katalog, planirovkalar ekrani (4–20) | **5-kun** | Ha |
| M7 | Ko'rsatuv manzili va mas'ul har bir loyiha bo'yicha; ko'rsatuv bo'lmaydigan kunlar (bayramlar); loyiha bo'yicha amoCRM mas'ullari | 11-b. 5, 8-b. 3-qoida | 2-b. yozilish (4–14) | **4-kun** | Ha |
| M8 | Administratorlarning Telegram ID'lari, menejerlar guruhi ID, hisobot qayerga | 11-b. 6 | 3-b., 4-b. (4–14) | **4-kun** | Ha |
| M9 | Bank shartlari (stavka, sxema, banklar), muddatli to'lov shartlari, valyuta (S5) | 11-b. 7 | 6-b. kalkulyator (8–20) | **8-kun** | Ha |
| M10 | Kalkulyator uchun Excel'da har sxemaga 3 ta misol | 6-b. «Qabul», 11-b. 7 | Qabul (25–30) | **20-kun** | Faqat qabulni |
| M11 | Telefon, ofis manzili, ish vaqti | 3A, 7-ekran | Mini App ekranlari (8–20) | **8-kun** | Yo'q (1349 raqami ma'lum — 2-bo'lim) |
| M12 | «Biz haqimizda» to'g'ri raqamlari | K5, 11-b. 4 | Mini App ekranlari (8–20) | **8-kun** | Yo'q |
| M13 | Matnlar RU/UZ: «Qanday sotib olish», hujjatlar ro'yxati, FAQ (15 tagacha) | 5-b., 11-b. 8 | Mini App ekranlari (8–20) | **12-kun** | Yo'q, qabul uchun shart |
| M14 | Ball jadvali (UF-4), dojim va sovuq lid matnlari | UF-4, UF-3 | UF-3–4 (15–24) | **15-kun** | Ha, UF-4 qolsa |
| M15 | Bron shartlari (5-b. matni uchun) va bonus shartlari (UF-6) | 5-b., UF-6 | 5-b. (8–20), UF-6 (15–24) | **15-kun** | Yo'q |
| M16 | Salomlashish matni RU/UZ, foto yoki video | 10-b., 11-b. 10 | Botdagi muloqot (15–22) | **15-kun** | Yo'q |
| M17 | Planirovka va obyekt videolari havolalari | 7-b., 11-b. 9 | Mini App (8–20) | **15-kun** | Yo'q (havola yo'q — tugma yashiriladi) |
| M18 | Domen va DNS'ga kirish | 12-b., 11-b. 11 | Ishga tushirish (25–27) | **20-kun** | Ha — SSL va DNS tarqalishiga vaqt kerak |
| M19 | Menejerlar ro'yxati (admin loginlari uchun) | UF-2 | O'qitish (25–30) | **22-kun** | Ha, o'qitish uchun |
| M20 | Reklama xarajatlari kanal bo'yicha | strategiya «Hisobot» | Faqat S10-b | Har oy, ishga tushgandan keyin | Ishga ta'sir qilmaydi |
| M21 | 8-b.: bilimlar bazasi, 30 ta nazorat savoli | 11-b. 12 | 8-b. shartnomasi | 8-b. shartnomasi bo'yicha | — |

Hozir assets'da bor: PNG logo, 10 ta Navoiy loyiha fotosi, Jozibali Maskan (foto, joylashuv tahlili, bloklar bo'yicha xonadonlar soni), Sayhun (foto, dron videolari, joylashuv tahlili). Boshqa materiallar yo'q.
