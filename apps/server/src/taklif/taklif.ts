import { randomBytes } from 'node:crypto';
import {
  parseTaklifParam,
  taklifStartParam,
  type TaklifchiDto,
  type TaklifMijozDto,
  type TaklifQilinganDto,
  type TaklifQilinganlarResponse,
  type TaklifResponse,
} from '@yh/shared';
import type pg from 'pg';
import { TAKLIF_MANBA } from '../mijoz/manba';

/** What a `taklif_<kod>` start parameter means for the Mijoz who opened it. */
export interface TaklifVisit {
  /** Manba of this visit: «mijoz taklif qildi», or null for one's own link. */
  manba: string | null;
  /** The inviter; ensureMijoz stores it only for a Mijoz seen for the first time. */
  taklifQilganId: string | null;
}

/**
 * Resolves a personal taklif link (bot `/start taklif_<kod>` or Mini App
 * `startapp`). Returns null when the parameter is not a taklif link; an
 * unknown code counts as an untagged visit, one's own link changes nothing.
 */
export async function taklifVisit(db: pg.Pool, param: string | undefined | null, telegramId: string): Promise<TaklifVisit | null> {
  const kod = parseTaklifParam(param);
  if (!kod) return null;
  const { rows } = await db.query<{ telegram_id: string }>('SELECT telegram_id::text FROM mijoz WHERE taklif_kod = $1', [kod]);
  const inviter = rows[0]?.telegram_id;
  if (inviter === undefined || inviter === telegramId) return { manba: null, taklifQilganId: null };
  return { manba: TAKLIF_MANBA, taklifQilganId: inviter };
}

/** Note line for the invited Mijoz's Arizalar: who invited them (empty when nobody). */
export async function taklifQilganLines(db: pg.Pool, telegramId: string): Promise<string[]> {
  const { rows } = await db.query<{ name: string; username: string | null; id: string }>(
    `SELECT i.name, i.username, i.telegram_id::text AS id
       FROM mijoz m JOIN mijoz i ON i.telegram_id = m.taklif_qilgan_id
      WHERE m.telegram_id = $1`,
    [telegramId],
  );
  const r = rows[0];
  if (!r) return [];
  return [`Taklif qilgan: ${[r.name, r.username ? `@${r.username}` : null, `ID ${r.id}`].filter(Boolean).join(' · ')}`];
}

/** Bot link (`https://t.me/<bot>`) from the direct Mini App link `https://t.me/<bot>[/<app>]`. */
export function botLinkOf(miniAppLink: string): string {
  const u = new URL(miniAppLink);
  return `${u.origin}/${u.pathname.split('/')[1]}`;
}

function newKod(): string {
  // 10 chars of [a-z0-9]: short enough to read, ~51 bits — not guessable by trying.
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from(randomBytes(10), (b) => alphabet[b % 36]).join('');
}

interface MijozRow {
  telegram_id: string;
  name: string;
  username: string | null;
  phone: string | null;
}

const mijozDto = (r: MijozRow): TaklifMijozDto => ({
  telegramId: String(r.telegram_id),
  name: r.name,
  username: r.username,
  phone: r.phone,
});

/**
 * «Do'stingni taklif qil» (UF-6): every Mijoz's personal bot link, the count
 * of Mijozlar it brought, and the admin lists. No bonuses or money here: the
 * system only records who invited whom (S12).
 */
export function createTaklif(deps: { db: pg.Pool; miniAppLink?: string; crmBaseUrl?: string }) {
  const { db } = deps;

  async function kodOf(telegramId: string): Promise<string> {
    for (let attempt = 1; ; attempt++) {
      try {
        const { rows } = await db.query<{ taklif_kod: string }>(
          `UPDATE mijoz SET taklif_kod = coalesce(taklif_kod, $2) WHERE telegram_id = $1 RETURNING taklif_kod`,
          [telegramId, newKod()],
        );
        if (!rows[0]) throw new Error(`taklif link for unknown Mijoz ${telegramId}`);
        return rows[0].taklif_kod;
      } catch (e) {
        // Another Mijoz already has this code (practically never): draw again.
        if ((e as { code?: string }).code !== '23505' || attempt >= 5) throw e;
      }
    }
  }

  return {
    /** The Mijoz (must exist) personal link; throws when MINIAPP_LINK is unset. */
    async link(telegramId: string): Promise<TaklifResponse> {
      if (!deps.miniAppLink) throw new Error('MINIAPP_LINK is not configured');
      const kod = await kodOf(telegramId);
      const { rows } = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM mijoz WHERE taklif_qilgan_id = $1', [
        telegramId,
      ]);
      return { url: `${botLinkOf(deps.miniAppLink)}?start=${taklifStartParam(kod)}`, soni: rows[0]!.n };
    },

    /** Mijozlar who invited someone, most invitations first. */
    async taklifchilar(): Promise<TaklifchiDto[]> {
      const { rows } = await db.query<MijozRow & { soni: number; oxirgi_at: Date }>(
        `SELECT i.telegram_id::text, i.name, i.username, i.phone, count(*)::int AS soni, max(m.created_at) AS oxirgi_at
           FROM mijoz m JOIN mijoz i ON i.telegram_id = m.taklif_qilgan_id
          GROUP BY i.telegram_id
          ORDER BY soni DESC, oxirgi_at DESC`,
      );
      return rows.map((r) => ({ ...mijozDto(r), soni: r.soni, oxirgiAt: r.oxirgi_at.toISOString() }));
    },

    /** Mijozlar invited by `telegramId` with their amoCRM Bitimlar; null when no such Mijoz. */
    async taklifQilinganlar(telegramId: string): Promise<TaklifQilinganlarResponse | null> {
      const who = await db.query<MijozRow>(
        'SELECT telegram_id::text, name, username, phone FROM mijoz WHERE telegram_id = $1',
        [telegramId],
      );
      if (!who.rows[0]) return null;
      const { rows } = await db.query<MijozRow & { created_at: Date; arizalar: number; kutilayotgan: number }>(
        `SELECT m.telegram_id::text, m.name, m.username, m.phone, m.created_at,
                count(a.id)::int AS arizalar,
                count(a.id) FILTER (WHERE a.crm_status <> 'sent')::int AS kutilayotgan
           FROM mijoz m LEFT JOIN ariza a ON a.mijoz_id = m.telegram_id
          WHERE m.taklif_qilgan_id = $1
          GROUP BY m.telegram_id
          ORDER BY m.created_at, m.telegram_id`,
        [telegramId],
      );
      const bitimlar = await db.query<{ mijoz_id: string; bitim_id: string; n: number; oxirgi: Date }>(
        `SELECT a.mijoz_id::text, a.crm_bitim_id AS bitim_id, count(*)::int AS n, max(a.created_at) AS oxirgi
           FROM ariza a JOIN mijoz m ON m.telegram_id = a.mijoz_id
          WHERE m.taklif_qilgan_id = $1 AND a.crm_bitim_id IS NOT NULL
          GROUP BY a.mijoz_id, a.crm_bitim_id
          ORDER BY oxirgi DESC`,
        [telegramId],
      );
      const base = deps.crmBaseUrl?.replace(/\/+$/, '');
      const taklifQilinganlar: TaklifQilinganDto[] = rows.map((r) => ({
        ...mijozDto(r),
        kelganAt: r.created_at.toISOString(),
        arizalarSoni: r.arizalar,
        kutilayotganArizalar: r.kutilayotgan,
        bitimlar: bitimlar.rows
          .filter((b) => b.mijoz_id === String(r.telegram_id))
          .map((b) => ({
            id: b.bitim_id,
            url: base ? `${base}/leads/detail/${b.bitim_id}` : null,
            arizalarSoni: b.n,
            oxirgiArizaAt: b.oxirgi.toISOString(),
          })),
      }));
      return { taklifchi: mijozDto(who.rows[0]), taklifQilinganlar };
    },
  };
}

export type Taklif = ReturnType<typeof createTaklif>;
