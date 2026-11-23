import {
  LANGS,
  SHAHARLAR,
  type FiltrVariantlariResponse,
  type LoyihaResponse,
  type LoyihalarResponse,
  type PlanirovkaResponse,
  type PlanirovkalarResponse,
  type BlokXonadonlarResponse,
  type XonadonResponse,
} from '@yh/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type pg from 'pg';
import type { Katalog } from '../katalog/katalog';
import { kvizByudjet } from '../kviz/byudjet';

const ListQuery = z.object({
  shahar: z.enum(SHAHARLAR).optional(),
  lang: z.enum(LANGS).default('uz'),
});
const LangQuery = z.object({ lang: z.enum(LANGS).default('uz') });
const Son = z.coerce.number().nonnegative().finite();
const Id = z.coerce.number().int().positive();
/** Filter (#10). Strict: unknown keys (e.g. qavat, ADR 0001) → 400. */
const FiltrQuery = z
  .object({
    lang: z.enum(LANGS).default('uz'),
    shahar: z.enum(SHAHARLAR).optional(),
    loyiha: Id.optional(),
    blok: Id.optional(),
    xonalar: z
      .string()
      .regex(/^[1-9]\d?(,[1-9]\d?)*$/)
      .transform((v) => v.split(',').map(Number))
      .optional(),
    narxDan: Son.optional(),
    narxGacha: Son.optional(),
    maydonDan: Son.optional(),
    maydonGacha: Son.optional(),
    faqatBosh: z.enum(['0', '1', 'true', 'false']).transform((v) => v === '1' || v === 'true').optional(),
  })
  .strict();
const IdParams = z.object({ id: z.coerce.number().int().positive() });

/**
 * Katalog read routes. Mounted twice with different auth: under /api/katalog
 * for the Mini App (initData) and under /ai/katalog for the AI-menejer (API key),
 * so both read the same data the same way.
 */
export async function katalogRoutes(app: FastifyInstance, katalog: Katalog, deps: { db: pg.Pool }) {
  app.get('/planirovkalar', async (req, reply): Promise<PlanirovkalarResponse | void> => {
    const q = FiltrQuery.safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: 'bad_request' });
    const { lang, loyiha, blok, ...rest } = q.data;
    return { planirovkalar: await katalog.planirovkalar({ ...rest, loyihaId: loyiha, blokId: blok }, lang) };
  });

  app.get('/filtr', async (req, reply): Promise<FiltrVariantlariResponse | void> => {
    const q = ListQuery.safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: 'bad_request' });
    return {
      ...(await katalog.filtrVariantlari(q.data.shahar)),
      byudjet: await kvizByudjet(deps.db, katalog, q.data.shahar),
    };
  });

  app.get('/loyihalar', async (req, reply): Promise<LoyihalarResponse | void> => {
    const q = ListQuery.safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: 'bad_request' });
    return { loyihalar: await katalog.loyihalar(q.data) };
  });

  app.get('/loyihalar/:id', async (req, reply): Promise<LoyihaResponse | void> => {
    const p = IdParams.safeParse(req.params);
    const q = LangQuery.safeParse(req.query);
    if (!p.success || !q.success) return reply.code(404).send({ error: 'not_found' });
    const loyiha = await katalog.loyiha(p.data.id, q.data.lang);
    if (!loyiha) return reply.code(404).send({ error: 'not_found' });
    return { loyiha };
  });

  app.get('/planirovkalar/:id', async (req, reply): Promise<PlanirovkaResponse | void> => {
    const p = IdParams.safeParse(req.params);
    const q = LangQuery.safeParse(req.query);
    if (!p.success || !q.success) return reply.code(404).send({ error: 'not_found' });
    const planirovka = await katalog.planirovka(p.data.id, q.data.lang);
    if (!planirovka) return reply.code(404).send({ error: 'not_found' });
    return { planirovka };
  });

  /** Shaxmatka of a Blok (ADR 0003). */
  app.get('/bloklar/:id/xonadonlar', async (req, reply): Promise<BlokXonadonlarResponse | void> => {
    const p = IdParams.safeParse(req.params);
    const out = p.success ? await katalog.blokXonadonlari(p.data.id) : null;
    return out ?? reply.code(404).send({ error: 'not_found' });
  });

  app.get('/xonadonlar/:id', async (req, reply): Promise<XonadonResponse | void> => {
    const p = IdParams.safeParse(req.params);
    const xonadon = p.success ? await katalog.xonadon(p.data.id) : null;
    if (!xonadon) return reply.code(404).send({ error: 'not_found' });
    return { xonadon };
  });
}
