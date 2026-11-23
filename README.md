# Yangi Hayot

Telegram-bot + Mini App + admin-panel. Talablar: `O'zbekcha.pdf` (TZ v3.0) va `docs/tz-ozgarishlar.md`; atamalar — `GLOSSARY.md`; qarorlar — `docs/adr/`.

## Tuzilma

pnpm workspaces monoreposi (Node.js 24, TypeScript):

```
apps/server     API: Fastify + PostgreSQL (pg). Biznes mantiq shu yerda.
  src/app.ts          buildApp(deps) — HTTP ilova; deps: config, db, clock, crm, messenger
  src/main.ts         ishlab chiqarishdagi kirish nuqtasi (env → deps → listen)
  src/routes/         marshrutlar; mini-app.ts — /api/*, initData talab qiladi;
                      bot-internal.ts — /internal/bot/events, BOT_API_SECRET talab qiladi
  src/bot/            bot xatti-harakati: /start, til, salomlashish, /welcome, /restart, zaxira javob
  src/mijoz/          Mijoz va Manba (birinchi/oxirgi)
  src/settings/       sozlamalar (administratorlar, menejerlar guruhi, salomlashish)
  src/auth/           Mini App initData tekshiruvi
  src/db/             migratsiyalar (src/db/migrations/*.ts) va migrator
  src/adapters/       CRM (amoCRM) va Messenger (Telegram) interfeyslari + Recording* fake'lar
  src/clock.ts        inyeksiya qilinadigan soat, Asia/Tashkent
  test/               API testlari (Vitest + Testcontainers PostgreSQL)
apps/bot        Telegram-bot (grammY): yupqa adapter, update → serverga event → action'lar (ADR 0002)
apps/miniapp    Mini App: React + Vite, RU/UZ lug'atlar (src/i18n)
apps/admin      Admin-panel: React + Vite — Loyihalar va Xonadonlar, Excel import, Yozilishlar,
                Rassilka, Matnlar (kontent, dojim, kviz, kalkulyator), Skoring, Voronka, Jurnal, foydalanuvchilar
packages/shared Server va frontendlar uchun umumiy turlar (API DTO, Lang)
packages/ui     UI kit «Yashil barg»: tokenlar (tokens.css), umumiy Select (@yh/ui/select + select.css)
```

## Ishga tushirish

```sh
corepack enable            # pnpm (versiya package.json "packageManager"da)
pnpm install
cp apps/server/.env.example apps/server/.env   # DATABASE_URL, BOT_TOKEN, BOT_API_SECRET, ADMIN_TELEGRAM_IDS
cp apps/bot/.env.example apps/bot/.env         # BOT_TOKEN, SERVER_URL, BOT_API_SECRET (o'sha), MINIAPP_URL
pnpm dev:server            # API :3000 (start'da migratsiyalar qo'llanadi)
pnpm --filter @yh/server seed:demo   # DEMO katalog (narxlar, chizmalar — namuna; import:legacy bilan aralashtirmang)
pnpm dev:bot               # bot, long polling (server ishlab turishi kerak)
pnpm dev:miniapp           # Mini App :5173, /api → :3000
pnpm dev:admin             # admin-panel :5174
```

Telegram'dan tashqarida Mini App'ni sinash uchun `apps/miniapp/.env.local`ga imzolangan `VITE_DEV_INIT_DATA=...` qo'ying.

## Testlar

Docker kerak: server testlari Testcontainers orqali haqiqiy PostgreSQL ko'taradi.

```sh
pnpm test         # barcha testlar
pnpm typecheck
pnpm build
pnpm --filter @yh/server test:watch
```

Asosiy seam — server HTTP API (`app.inject`), haqiqiy baza, CRM/Messenger fake'lari va soxta soat bilan. Har bir test o'z bazasini oladi (migratsiya qilingan shablondan klon). Bu qoidadan ruxsat etilgan istisnolar — test infratuzilmasining o'z testlari: soat (`test/clock.test.ts`), fake'lar (`test/fakes.test.ts`) va adapter kontrakt testlari (`*.contract.test.ts`). UI uchun avtomatik test yo'q. CI (`.github/workflows/ci.yml`) har push'da typecheck, test va build qiladi.

## Deploy

`deploy/` — bitta serverda Docker Compose (`deploy/docker-compose.yml`, bitta `Dockerfile`dan uch image):

| Servis | Nima |
| --- | --- |
| `postgres` | PostgreSQL 17, ma'lumotlar `pgdata` volume'da |
| `server` | API (`node dist/main.js`); start'da migratsiyalar; kunlik zaxira `deploy/backups/`ga |
| `bot` | Telegram-bot (long polling); `bot` profili bilan yoqiladi |
| `web` | nginx: Mini App va admin-panel statikasi (`admin.` bilan boshlanuvchi Host → admin), `/api`, `/admin/api`, `/ai`, `/internal`, `/health` → `server`. `127.0.0.1:4380`da tinglaydi; TLS — tashqi nginx'da |

Env fayllar (`deploy/` ichida, git'ga qo'shilmaydi, sirlar faqat serverda):

- `.env` — compose o'zgaruvchilari: `POSTGRES_PASSWORD`;
- `server.env` — `apps/server/.env.example`dagi o'zgaruvchilar (`DATABASE_URL`, `HOST`, `PORT`, `BACKUP_DIR` compose'da beriladi);
- `bot.env` — `apps/bot/.env.example`dagi o'zgaruvchilar (`SERVER_URL` compose'da beriladi).

```sh
cd deploy
docker compose --profile bot up -d --build      # hammasi, bot bilan
docker compose up -d --build                    # botsiz (masalan, eski bot hali ishlayotganda)
docker compose exec server node dist/katalog/seed-cli.js                 # boshlang'ich Katalog
docker compose exec -it server node dist/admin/create-admin-cli.js <login> administrator "<Ism>"   # birinchi admin (parol so'raladi)
docker compose exec server node dist/db/migrate-cli.js                   # migratsiyalar (start'da ham qo'llanadi)
```
