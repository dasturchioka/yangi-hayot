import { LOYIHA_HOLATLARI, SHAHARLAR, XONADON_HOLATLARI, type JurnalDto } from '@yh/shared';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { listJurnal, type Muallif } from '../admin/jurnal';
import {
  createBlok,
  createLoyiha,
  createPlanirovka,
  getLoyiha,
  KatalogAdminError,
  listLoyihalar,
  updateBlok,
  updateLoyiha,
  updatePlanirovka,
} from '../admin/katalog-admin';
import { importQil, ImportXatolari, shablon, tekshir } from '../admin/planirovka-import';
import {
  createXonadon,
  deleteXonadon,
  listBlokXonadonlari,
  setXonadonlarHolati,
  updateXonadon,
} from '../admin/xonadon-admin';
import { onlyRol, requireAdmin } from '../auth/admin-auth';
import type { AppDeps } from '../app';
import { parseVideo, type Katalog } from '../katalog/katalog';

const Lokal = z.object({ ru: z.string().trim().min(1).max(2000), uz: z.string().trim().min(1).max(2000) });
/** Telegram-channel or YouTube link (the only ones the Mini App can open), or null. */
const Video = z
  .string()
  .trim()
  .max(500)
  .refine((u) => parseVideo(u) !== null, 'video must be an https t.me or YouTube link')
  .nullable();
/** Absolute https URL or a path served by the Mini App (/media/...). */
const MediaUrl = z
  .string()
  .trim()
  .max(500)
  .regex(/^(https:\/\/|\/)\S+$/);

const LoyihaFields = z.object({
  slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(64),
  nomi: z.string().trim().min(1).max(100),
  shahar: z.enum(SHAHARLAR),
  holat: z.enum(LOYIHA_HOLATLARI),
  manzil: Lokal,
  qisqaTavsif: Lokal.nullable(),
  tavsif: Lokal.nullable(),
  fotolar: z.array(MediaUrl).max(30),
  video: Video,
  qavatlarSoni: z.number().int().positive().max(200).nullable(),
  xarita: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).nullable(),
  infratuzilma: z
    .array(z.object({ kategoriya: z.string().trim().min(1).max(40), nomi: Lokal, masofa: Lokal.nullable() }))
    .max(50),
  tartib: z.number().int(),
  korsatuvManzili: Lokal.nullable(),
  crmMasulId: z.string().regex(/^[0-9]{1,12}$/).nullable(),
});
const CreateLoyiha = LoyihaFields.partial()
  .required({ nomi: true, shahar: true, holat: true, manzil: true })
  .transform((v) => ({
    qisqaTavsif: null,
    tavsif: null,
    fotolar: [],
    video: null,
    qavatlarSoni: null,
    xarita: null,
    infratuzilma: [],
    tartib: 0,
    korsatuvManzili: null,
    crmMasulId: null,
    ...v,
    slug: v.slug ?? slugify(v.nomi),
  }));

const BlokFields = z.object({ nomi: z.string().trim().min(1).max(20), tartib: z.number().int() });

const PlanirovkaFields = z.object({
  xonalar: z.number().int().min(1).max(20),
  maydon: z.number().positive().max(10_000),
  nomi: Lokal.nullable(),
  chizma: MediaUrl.nullable(),
  video: Video,
  qoldaNarx: z.number().int().positive().max(1e13).nullable(),
  tartib: z.number().int(),
});
const CreatePlanirovka = PlanirovkaFields.partial().required({ xonalar: true, maydon: true });
const UpdatePlanirovka = PlanirovkaFields.partial();

const XonadonFields = z.object({
  planirovkaId: z.number().int().positive(),
  qavat: z.number().int().min(-5).max(200),
  raqam: z.number().int().positive().max(1_000_000),
  narx: z.number().int().positive().max(1e13).nullable(),
  holat: z.enum(XONADON_HOLATLARI),
});
const CreateXonadon = XonadonFields.partial({ narx: true, holat: true });
const UpdateXonadon = XonadonFields.partial();
const XonadonlarHolati = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(1000),
  holat: z.enum(XONADON_HOLATLARI),
});

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const IMPORT_MAX_BYTES = 5 * 1024 * 1024;

const IdParams = z.object({ id: z.coerce.number().int().positive() });
const JurnalQuery = z.object({
  loyihaId: z.coerce.number().int().positive().optional(),
  obyekt: z.enum(['loyiha', 'blok', 'planirovka', 'xonadon']).optional(),
  obyektId: z.coerce.number().int().positive().optional(),
  beforeId: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

/** Latin slug from a Loyiha nomi ("Jozibali Maskan" → "jozibali-maskan"). */
export function slugify(nomi: string): string {
  const s = nomi
    .toLowerCase()
    .replace(/[ʻʼ'`‘’]/g, '')
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/, '');
  return s || 'loyiha';
}

/**
 * /admin/api/katalog (behind `requireAdmin`). Reads: both roles. Loyiha / Blok /
 * Planirovka / Xonadon create and edit (incl. narx): Administrator. Xonadon
 * holati: both roles (TZ UF-2: Menejer — xonadon statuslari). Every write goes
 * to the jurnal and invalidates the Mini App / AI katalog cache.
 */
export async function adminKatalogRoutes(app: FastifyInstance, deps: AppDeps, katalog: Katalog) {
  requireAdmin(app, deps);
  const administrator = { preHandler: onlyRol('administrator') };
  const by = (req: { admin: Muallif['admin'] }): Muallif => ({ admin: req.admin, at: deps.clock.now() });

  /** Runs a write; maps domain errors to HTTP and refreshes the public katalog on success. */
  async function write<T>(reply: FastifyReply, fn: () => Promise<T>): Promise<T | void> {
    try {
      const out = await fn();
      katalog.invalidate();
      return out;
    } catch (err) {
      if (err instanceof KatalogAdminError) return reply.code(err.status).send({ error: err.code });
      throw err;
    }
  }
  const bad = (reply: FastifyReply) => reply.code(400).send({ error: 'bad_request' });

  app.get('/katalog/loyihalar', async () => ({ loyihalar: await listLoyihalar(deps.db) }));

  app.get('/katalog/loyihalar/:id', async (req, reply) => {
    const p = IdParams.safeParse(req.params);
    const loyiha = p.success ? await getLoyiha(deps.db, p.data.id) : null;
    if (!loyiha) return reply.code(404).send({ error: 'not_found' });
    return { loyiha };
  });

  app.post('/katalog/loyihalar', administrator, async (req, reply) => {
    const body = CreateLoyiha.safeParse(req.body);
    if (!body.success) return bad(reply);
    return write(reply, async () => ({ loyiha: await createLoyiha(deps.db, by(req), body.data) }));
  });

  app.patch('/katalog/loyihalar/:id', administrator, async (req, reply) => {
    const p = IdParams.safeParse(req.params);
    const body = LoyihaFields.partial().safeParse(req.body);
    if (!p.success || !body.success) return bad(reply);
    return write(reply, async () => ({ loyiha: await updateLoyiha(deps.db, by(req), p.data.id, body.data) }));
  });

  app.post('/katalog/loyihalar/:id/bloklar', administrator, async (req, reply) => {
    const p = IdParams.safeParse(req.params);
    const body = BlokFields.partial({ tartib: true }).safeParse(req.body);
    if (!p.success || !body.success) return bad(reply);
    return write(reply, async () => ({ blok: await createBlok(deps.db, by(req), p.data.id, body.data) }));
  });

  app.patch('/katalog/bloklar/:id', administrator, async (req, reply) => {
    const p = IdParams.safeParse(req.params);
    const body = BlokFields.partial().safeParse(req.body);
    if (!p.success || !body.success) return bad(reply);
    return write(reply, async () => ({ blok: await updateBlok(deps.db, by(req), p.data.id, body.data) }));
  });

  app.post('/katalog/bloklar/:id/planirovkalar', administrator, async (req, reply) => {
    const p = IdParams.safeParse(req.params);
    const body = CreatePlanirovka.safeParse(req.body);
    if (!p.success || !body.success) return bad(reply);
    return write(reply, async () => ({ planirovka: await createPlanirovka(deps.db, by(req), p.data.id, body.data) }));
  });

  app.patch('/katalog/planirovkalar/:id', administrator, async (req, reply) => {
    const p = IdParams.safeParse(req.params);
    const body = UpdatePlanirovka.safeParse(req.body);
    if (!p.success || !body.success) return bad(reply);
    return write(reply, async () => ({ planirovka: await updatePlanirovka(deps.db, by(req), p.data.id, body.data) }));
  });

  // ---- Xonadonlar (ADR 0003) ----

  app.get('/katalog/bloklar/:id/xonadonlar', async (req, reply) => {
    const p = IdParams.safeParse(req.params);
    const out = p.success ? await listBlokXonadonlari(deps.db, p.data.id) : null;
    return out ?? reply.code(404).send({ error: 'not_found' });
  });

  app.post('/katalog/bloklar/:id/xonadonlar', administrator, async (req, reply) => {
    const p = IdParams.safeParse(req.params);
    const body = CreateXonadon.safeParse(req.body);
    if (!p.success || !body.success) return bad(reply);
    return write(reply, async () => ({ xonadon: await createXonadon(deps.db, by(req), p.data.id, body.data) }));
  });

  /** Menejer: holat only (any other field → 403); Administrator: all. */
  app.patch('/katalog/xonadonlar/:id', async (req, reply) => {
    const p = IdParams.safeParse(req.params);
    const body = UpdateXonadon.safeParse(req.body);
    if (!p.success || !body.success) return bad(reply);
    if (req.admin.rol !== 'administrator' && Object.keys(body.data).some((k) => k !== 'holat')) {
      return reply.code(403).send({ error: 'forbidden' });
    }
    return write(reply, async () => ({ xonadon: await updateXonadon(deps.db, by(req), p.data.id, body.data) }));
  });

  /** One holat for several Xonadonlar (both roles). */
  app.post('/katalog/xonadonlar/holat', async (req, reply) => {
    const body = XonadonlarHolati.safeParse(req.body);
    if (!body.success) return bad(reply);
    return write(reply, async () => ({
      xonadonlar: await setXonadonlarHolati(deps.db, by(req), body.data.ids, body.data.holat),
    }));
  });

  app.delete('/katalog/xonadonlar/:id', administrator, async (req, reply) => {
    const p = IdParams.safeParse(req.params);
    if (!p.success) return bad(reply);
    return write(reply, async () => {
      await deleteXonadon(deps.db, by(req), p.data.id);
      return { ok: true };
    });
  });

  // ---- Excel / CSV import (#6): both roles (TZ story 63) ----

  /** The file comes as the raw request body; its format is told by its bytes. */
  app.addContentTypeParser(
    ['application/octet-stream', 'text/csv', XLSX_MIME, 'application/vnd.ms-excel'],
    { parseAs: 'buffer', bodyLimit: IMPORT_MAX_BYTES },
    (_req, body, done) => done(null, body),
  );
  const fileOf = (body: unknown) => (Buffer.isBuffer(body) && body.length > 0 ? body : null);

  app.get('/katalog/loyihalar/:id/import/shablon.xlsx', async (req, reply) => {
    const p = IdParams.safeParse(req.params);
    const out = p.success ? await shablon(deps.db, p.data.id) : null;
    if (!out) return reply.code(404).send({ error: 'not_found' });
    return reply
      .header('content-type', XLSX_MIME)
      .header('content-disposition', `attachment; filename="${out.nomi}"`)
      .send(out.fayl);
  });

  app.post('/katalog/loyihalar/:id/import/tekshir', async (req, reply) => {
    const p = IdParams.safeParse(req.params);
    const file = fileOf(req.body);
    if (!p.success || !file) return bad(reply);
    const out = await tekshir(deps.db, p.data.id, file);
    return out ?? reply.code(404).send({ error: 'not_found' });
  });

  app.post('/katalog/loyihalar/:id/import', async (req, reply) => {
    const p = IdParams.safeParse(req.params);
    const file = fileOf(req.body);
    if (!p.success || !file) return bad(reply);
    try {
      return await write(reply, async () => ({ natija: await importQil(deps.db, by(req), p.data.id, file) }));
    } catch (err) {
      if (err instanceof ImportXatolari) return reply.code(422).send({ error: 'import_xatolar', xatolar: err.xatolar });
      throw err;
    }
  });

  app.get('/jurnal', async (req, reply): Promise<{ yozuvlar: JurnalDto[] } | void> => {
    const q = JurnalQuery.safeParse(req.query);
    if (!q.success) return bad(reply);
    return { yozuvlar: await listJurnal(deps.db, q.data) };
  });
}
