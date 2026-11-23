import type { Lang, LoyihaResponse, LoyihalarResponse, PlanirovkaResponse, Shahar } from '@yh/shared';
import { SHAHARLAR } from '@yh/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type pg from 'pg';
import type { Clock } from '../clock';
import type { Katalog } from '../katalog/katalog';
import type { Dojim } from '../dojim/dojim';
import { recordShaharQiziqish } from '../mijoz/shahar-qiziqish';

/**
 * Mini App catalog hook (preSerialization on /api/katalog): a Mijoz who
 * opened a city's Loyihalar list, a Loyiha or a Planirovka is interested in
 * that city (Rassilka audiences). Not mounted for the AI-menejer.
 */
export function katalogQiziqishHook(deps: { db: pg.Pool; clock: Clock }, katalog: Katalog) {
  return async (req: FastifyRequest, reply: FastifyReply, payload: unknown) => {
    if (reply.statusCode !== 200 || !req.telegramUser) return payload;
    const shahar = await shaharOf(req, payload, katalog);
    if (shahar) await recordShaharQiziqish(deps.db, String(req.telegramUser.id), shahar, 'loyiha', deps.clock.now());
    return payload;
  };
}

/**
 * Mini App catalog hook: opening a Planirovka is «Planirovkani ko'rdi» for
 * dojim (#17; reminder in 24 h without an Ariza). The only record of views
 * so far: #15's analytics may take this over and call `dojim.faollik` too.
 */
export function dojimKorishHook(deps: { clock: Clock }, dojim: Pick<Dojim, 'faollik'>) {
  return async (req: FastifyRequest, reply: FastifyReply, payload: unknown) => {
    const p = (payload as Partial<PlanirovkaResponse>).planirovka;
    if (reply.statusCode === 200 && req.telegramUser && p && req.routeOptions.url?.endsWith('/planirovkalar/:id')) {
      await dojim.faollik(String(req.telegramUser.id), p.id, deps.clock.now());
    }
    return payload;
  };
}

async function shaharOf(req: FastifyRequest, payload: unknown, katalog: Katalog): Promise<Shahar | null> {
  const p = payload as Partial<LoyihalarResponse & LoyihaResponse & PlanirovkaResponse>;
  if (p.loyihalar) {
    const q = (req.query as { shahar?: string }).shahar;
    return SHAHARLAR.find((s) => s === q) ?? null;
  }
  if (p.loyiha) return p.loyiha.shahar;
  if (p.planirovka) {
    const lang = ((req.query as { lang?: Lang }).lang ?? 'uz') as Lang;
    return (await katalog.loyiha(p.planirovka.loyihaId, lang))?.shahar ?? null;
  }
  return null;
}
