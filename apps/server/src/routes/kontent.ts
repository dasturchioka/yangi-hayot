import { KONTENT_LIMITLARI, LANGS, type AdminKontentResponse, type KontentBolimi, type KontentResponse } from '@yh/shared';
import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { z } from 'zod';
import type { Clock } from '../clock';
import { kontentFor, readKontent, saveKontentBolimi } from '../kontent/kontent';

const LangQuery = z.object({ lang: z.enum(LANGS).default('uz') });

/** Mini App: GET /api/kontent?lang= (mounted behind requireMiniAppUser). */
export async function kontentRoutes(app: FastifyInstance, deps: { db: pg.Pool }) {
  app.get('/kontent', async (req, reply): Promise<KontentResponse | void> => {
    const q = LangQuery.safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: 'bad_request' });
    return kontentFor(deps.db, q.data.lang);
  });
}

// ---------------------------------------------------------------- admin

const MATN_MAX = 2000;
const matn = (max = MATN_MAX) =>
  z.object({ ru: z.string().trim().min(1).max(max), uz: z.string().trim().min(1).max(max) });
const qisqa = () => matn(200);
/** Absolute https URL or a path served by the Mini App (/media/...). */
const RasmUrl = z.string().trim().max(2048).regex(/^(https:\/\/|\/)\S+$/);

const SotibOlish = z.object({
  sarlavha: qisqa(),
  bosqichlar: z.array(z.object({ nomi: qisqa(), matn: matn() })).min(1).max(KONTENT_LIMITLARI.bosqichlar),
  hujjatlar: z.array(qisqa()).max(KONTENT_LIMITLARI.hujjatlar),
  ipotekaHujjatlari: z.array(qisqa()).max(KONTENT_LIMITLARI.hujjatlar),
  faq: z.array(z.object({ savol: qisqa(), javob: matn() })).max(KONTENT_LIMITLARI.faq),
});

const BizHaqimizda = z.object({
  sarlavha: qisqa(),
  matn: matn(),
  foto: RasmUrl.nullable(),
  raqamlar: z
    .array(z.object({ qiymat: z.string().trim().min(1).max(12), nomi: matn(40) }))
    .max(KONTENT_LIMITLARI.raqamlar),
});

const Kontaktlar = z.object({
  /** «1349» or «+998 71 123 45 67». */
  telefon: z.string().trim().regex(/^\+?[0-9][0-9 ()-]{1,19}$/),
  manzil: qisqa(),
  ishVaqti: qisqa(),
  telegram: z
    .string()
    .trim()
    .transform((s) => s.replace(/^@/, ''))
    .pipe(z.string().regex(/^[A-Za-z0-9_]{5,32}$/))
    .nullable(),
  xarita: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).nullable(),
});

const SCHEMAS = { sotibOlish: SotibOlish, bizHaqimizda: BizHaqimizda, kontaktlar: Kontaktlar } as const;
/** URL segment → section. */
const BOLIM_URL: Record<string, KontentBolimi> = {
  'sotib-olish': 'sotibOlish',
  'biz-haqimizda': 'bizHaqimizda',
  kontaktlar: 'kontaktlar',
};

/**
 * Admin-panel Kontent API (mounted at /admin/api, Administrator only).
 * Saved texts reach the Mini App on its next request (no server cache).
 */
export async function adminKontentRoutes(app: FastifyInstance, deps: { db: pg.Pool; clock: Clock }) {
  app.get('/kontent', async (): Promise<AdminKontentResponse> => readKontent(deps.db));

  app.put<{ Params: { bolim: string } }>('/kontent/:bolim', async (req, reply) => {
    const bolim = BOLIM_URL[req.params.bolim];
    if (!bolim) return reply.code(404).send({ error: 'not_found' });
    const parsed = SCHEMAS[bolim].safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request', issues: parsed.error.issues });
    await saveKontentBolimi(deps.db, bolim, parsed.data as never, deps.clock.now());
    return readKontent(deps.db);
  });
}
