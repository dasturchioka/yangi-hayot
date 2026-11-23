# Bot — yupqa adapter, mantiq serverda (ichki HTTP API)

Mavjud bot kodi qo'lda yo'q (M1 kirish huquqi kelmagan), shuning uchun bot `apps/bot`da grammY bilan noldan yozildi. Bot hech narsa hal qilmaydi: har bir shaxsiy chatdagi Telegram update'ni bitta `BotEvent`ga aylantiradi (`start` + payload, `command`, `callback`, `message`), uni `POST /internal/bot/events`ga yuboradi (`Authorization: Bearer <BOT_API_SECRET>`) va javobdagi `BotAction`larni (`send` — matn/media + inline yoki doimiy klaviatura, `copy`) tartib bilan bajaradi. Mijoz, Manba, til, matnlar, administrator huquqlari va tugallanmagan qadamlar serverda (`apps/server/src/bot/`). Shartnoma turlari — `packages/shared/src/bot.ts`.

## Considered Options

- **Umumiy modul (bot server kodini import qilib, bazaga o'zi ulanadi).** Rad etildi: bot va server ikki jarayonda bir xil bazaga yozadi, biznes mantiq ikki joyga tarqaladi, botni alohida masshtablab yoki qayta ishga tushirib bo'lmaydi.
- **Bot ichida mantiq, server faqat CRUD API.** Rad etildi: xatti-harakatni sinash uchun Telegram'ni soxtalashtirish kerak bo'lardi; Mini App bilan bir xil Mijoz/Manba qoidalari ikki marta yoziladi.

## Consequences

- Xatti-harakat server HTTP API orqali sinaladi (`apps/server/test/bot.test.ts`); bot testlari faqat tarjimani tekshiradi.
- Eski bot xatti-harakatini ko'chirish — serverda yangi buyruq/event tarmog'i; botga faqat yangi turdagi update yoki action uchun tegiladi.
- Server ishlamasa, bot Mijozga uzr so'raydi (javobsiz qolmaydi), lekin hech narsa saqlanmaydi.
- Bot o'zi xabar yubora olmaydi (rassilka, dojim, hisobot) — ular serverdagi Messenger adapteri orqali Bot API'ga to'g'ridan-to'g'ri ketadi.
