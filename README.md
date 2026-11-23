# Yangi Hayot

Telegram-bot + Mini App + admin-panel. Talablar: `O'zbekcha.pdf` (TZ v3.0) va `docs/tz-ozgarishlar.md`; atamalar — `GLOSSARY.md`; qarorlar — `docs/adr/`.

## Tuzilma

pnpm workspaces monoreposi (Node.js 24, TypeScript):

```
apps/server     API: Fastify + PostgreSQL (pg). Biznes mantiq shu yerda.
  src/app.ts          buildApp(deps) — HTTP ilova; deps: config, db, clock, crm, messenger
  src/main.ts         ishlab chiqarishdagi kirish nuqtasi (env → deps → listen)
  src/routes/         marshrutlar; mini-app.ts — /api/*, initData talab qiladi
  src/auth/           Mini App initData tekshiruvi
  src/db/             migratsiyalar (src/db/migrations/*.ts) va migrator
  src/adapters/       CRM (amoCRM) va Messenger (Telegram) interfeyslari + Recording* fake'lar
  src/clock.ts        inyeksiya qilinadigan soat, Asia/Tashkent
  test/               API testlari (Vitest + Testcontainers PostgreSQL)
apps/miniapp    Mini App: React + Vite, RU/UZ lug'atlar (src/i18n)
apps/admin      Admin-panel (hozircha bo'sh qobiq): React + Vite
packages/shared Server va frontendlar uchun umumiy turlar (API DTO, Lang)
packages/ui     UI kit «Yashil barg» tokenlari (tokens.css)
```

## Ishga tushirish

```sh
corepack enable            # pnpm (versiya package.json "packageManager"da)
pnpm install
cp apps/server/.env.example apps/server/.env   # DATABASE_URL, BOT_TOKEN
pnpm dev:server            # API :3000 (start'da migratsiyalar qo'llanadi)
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

Asosiy seam — server HTTP API (`app.inject`), haqiqiy baza, CRM/Messenger fake'lari va soxta soat bilan. Har bir test o'z bazasini oladi (migratsiya qilingan shablondan klon). UI uchun avtomatik test yo'q. CI (`.github/workflows/ci.yml`) har push'da typecheck, test va build qiladi.
