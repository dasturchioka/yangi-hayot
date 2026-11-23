import type { Lang, LoyihaResponse, LoyihalarResponse, PlanirovkaResponse, Shahar } from '@yh/shared';
import { SHAHARLAR } from '@yh/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type pg from 'pg';
import type { Clock } from '../clock';
import type { Katalog } from '../katalog/katalog';
import { recordShaharQiziqish } from '../mijoz/shahar-qiziqish';
import { planirovkaKorildi } from '../hodisa/hodisa';

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
    const planirovka = (payload as Partial<PlanirovkaResponse>).planirovka;
    if (planirovka) await planirovkaKorildi(deps.db, String(req.telegramUser.id), planirovka.id, deps.clock.now());
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
