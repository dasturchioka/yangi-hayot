# Build everything once; the same image runs server, bot and the static web.
FROM node:24-alpine AS build
WORKDIR /app
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm -r --filter "!@yh/shared" --if-present build
# Production deps only for server and bot.
RUN pnpm deploy --filter @yh/server --prod --legacy /out/server && cp -r apps/server/dist /out/server/dist \
 && pnpm deploy --filter @yh/bot --prod --legacy /out/bot && cp -r apps/bot/dist /out/bot/dist

FROM node:24-alpine AS server
RUN apk add --no-cache postgresql17-client tzdata
ENV TZ=Asia/Tashkent NODE_ENV=production
WORKDIR /app
COPY --from=build /out/server .
CMD ["node", "dist/main.js"]

FROM node:24-alpine AS bot
ENV TZ=Asia/Tashkent NODE_ENV=production
WORKDIR /app
COPY --from=build /out/bot .
CMD ["node", "dist/main.js"]

FROM nginx:1.27-alpine AS web
COPY deploy/nginx-web.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/miniapp/dist /srv/miniapp
COPY --from=build /app/apps/admin/dist /srv/admin
