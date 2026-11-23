import type { TaklifchilarResponse, TaklifQilinganlarResponse } from '@yh/shared';
import type { FastifyInstance } from 'fastify';
import type { Taklif } from '../taklif/taklif';

/**
 * «Do'stingni taklif qil» in the admin-panel (UF-6 qabul): who invited whom
 * and the invited Mijozlar's Bitimlar. Mounted under /admin/api, Administrator only.
 */
export async function adminTaklifRoutes(app: FastifyInstance, taklif: Taklif) {
  app.get('/takliflar', async (): Promise<TaklifchilarResponse> => ({ taklifchilar: await taklif.taklifchilar() }));

  app.get<{ Params: { telegramId: string } }>(
    '/takliflar/:telegramId',
    async (req, reply): Promise<TaklifQilinganlarResponse | void> => {
      const id = req.params.telegramId;
      if (!/^[1-9][0-9]{0,15}$/.test(id)) return reply.code(404).send({ error: 'not_found' });
      const res = await taklif.taklifQilinganlar(id);
      if (!res) return reply.code(404).send({ error: 'not_found' });
      return res;
    },
  );
}
