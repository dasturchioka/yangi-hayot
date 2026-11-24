import { createHash } from 'node:crypto';
import { RASM_MAX_BAYT, type RasmTuri, type RasmYuklashResponse } from '@yh/shared';
import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import type { Clock } from '../clock';

const KENGAYTMA: Record<RasmTuri, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/** The real type from the file's first bytes; the Content-Type header is only a claim. */
export function rasmTuri(b: Buffer): RasmTuri | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (b.length >= 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (b.length >= 6 && /^GIF8[79]a$/.test(b.toString('ascii', 0, 6))) return 'image/gif';
  return null;
}

const ID = /^[0-9a-f]{32}\.(jpg|png|webp|gif)$/;

/**
 * POST /rasm (under /admin/api, Administrator): the raw image as the body.
 * Stored by content hash, so uploading the same file again returns the same URL.
 */
export async function adminRasmRoutes(app: FastifyInstance, deps: { db: pg.Pool; clock: Clock }) {
  app.addContentTypeParser(/^image\//, { parseAs: 'buffer', bodyLimit: RASM_MAX_BAYT }, (_req, body, done) => done(null, body));

  app.post('/rasm', { bodyLimit: RASM_MAX_BAYT }, async (req, reply): Promise<RasmYuklashResponse | void> => {
    const data = req.body;
    if (!Buffer.isBuffer(data) || data.length === 0) return reply.code(400).send({ error: 'rasm_kerak' });
    const mime = rasmTuri(data);
    if (!mime) return reply.code(415).send({ error: 'rasm_turi' });
    const id = `${createHash('sha256').update(data).digest('hex').slice(0, 32)}.${KENGAYTMA[mime]}`;
    await deps.db.query(
      'INSERT INTO rasm (id, mime, data, created_at) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING',
      [id, mime, data, deps.clock.now()],
    );
    return { url: `/api/rasm/${id}` };
  });
}

/** GET /rasm/:id (under /api, public: <img> cannot send credentials). Content never changes for an id. */
export async function rasmRoutes(app: FastifyInstance, deps: { db: pg.Pool }) {
  app.get<{ Params: { id: string } }>('/rasm/:id', async (req, reply) => {
    if (!ID.test(req.params.id)) return reply.code(404).send({ error: 'not_found' });
    const { rows } = await deps.db.query<{ mime: string; data: Buffer }>('SELECT mime, data FROM rasm WHERE id = $1', [req.params.id]);
    const r = rows[0];
    if (!r) return reply.code(404).send({ error: 'not_found' });
    return reply
      .header('content-type', r.mime)
      .header('cache-control', 'public, max-age=31536000, immutable')
      .header('x-content-type-options', 'nosniff')
      .send(r.data);
  });
}
