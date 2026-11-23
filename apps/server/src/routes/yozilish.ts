import type { YozilishSlotlarResponse } from '@yh/shared';
import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import type { Clock } from '../clock';
import { getSetting } from '../settings/settings';
import { slotlar } from '../yozilish/slotlar';

/** Mini App: «Ko'rishga yozilish» (TZ 2-b.). Mounted under /api inside an initData scope. */
export async function yozilishRoutes(app: FastifyInstance, deps: { db: pg.Pool; clock: Clock }) {
  app.get('/yozilish/slotlar', async (): Promise<YozilishSlotlarResponse> => ({
    kunlar: slotlar(deps.clock.now(), await getSetting(deps.db, 'yozilish')),
  }));
}
