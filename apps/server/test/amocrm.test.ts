import { describe, expect, it } from 'vitest';
import { AmoCrm, type AmoAuth, type AmoTokens, type AmoTokenStore } from '../src/adapters/crm/amocrm';
import { CrmAuthError, CrmUnavailableError } from '../src/adapters/crm/crm';

/** Records requests and answers them from a handler: a tiny stand-in for amoCRM's HTTP API. */
function fakeAmo(handler: (req: { method: string; path: string; body: any; token: string }) => { status: number; json?: unknown }) {
  const requests: Array<{ method: string; path: string; body: any; token: string }> = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    const u = new URL(url);
    const req = {
      method: init.method ?? 'GET',
      path: decodeURIComponent(u.pathname + u.search),
      body: init.body ? JSON.parse(String(init.body)) : undefined,
      token: String((init.headers as Record<string, string>).authorization ?? '').replace('Bearer ', ''),
    };
    requests.push(req);
    const { status, json } = handler(req);
    return new Response(json === undefined ? null : JSON.stringify(json), { status });
  }) as typeof fetch;
  return { requests, fetchImpl };
}

const NOW = new Date('2026-11-23T05:00:00Z');

function amo(fetchImpl: typeof fetch, auth: AmoAuth = { kind: 'token', token: 'long-lived' }) {
  return new AmoCrm({
    baseUrl: 'https://yh.amocrm.ru',
    auth,
    pipelineId: 10,
    firstStatusId: 100,
    manbaFieldId: 501,
    telegramFieldId: 502,
    fetch: fetchImpl,
    now: () => NOW,
  });
}

describe('AmoCrm adapter', () => {
  it('finds a contact by phone among search results, ignoring formatting', async () => {
    const { requests, fetchImpl } = fakeAmo(() => ({
      status: 200,
      json: {
        _embedded: {
          contacts: [
            { id: 1, name: 'Boshqa', custom_fields_values: [{ field_code: 'PHONE', values: [{ value: '+998 90 000 00 00' }] }] },
            {
              id: 2,
              name: 'Aziz',
              custom_fields_values: [
                { field_code: 'PHONE', values: [{ value: '+998 (90) 123-45-67' }] },
                { field_id: 502, values: [{ value: '700000001' }] },
              ],
            },
          ],
        },
      },
    }));

    const found = await amo(fetchImpl).findContact({ phone: '+998901234567' });

    expect(found).toEqual({ id: '2', name: 'Aziz', phone: '+998 (90) 123-45-67', telegramId: '700000001' });
    expect(requests[0]).toMatchObject({ method: 'GET', path: '/api/v4/contacts?query=998901234567&limit=50', token: 'long-lived' });
  });

  it('returns null on 204 (nothing found)', async () => {
    const { fetchImpl } = fakeAmo(() => ({ status: 204 }));
    expect(await amo(fetchImpl).findContact({ telegramId: '700000001' })).toBeNull();
  });

  it('picks the open Bitim of the bot pipeline only', async () => {
    const { fetchImpl } = fakeAmo((req) =>
      req.path.startsWith('/api/v4/contacts/7')
        ? { status: 200, json: { _embedded: { leads: [{ id: 1 }, { id: 2 }, { id: 3 }] } } }
        : {
            status: 200,
            json: {
              _embedded: {
                leads: [
                  { id: 1, name: 'eski', pipeline_id: 10, status_id: 143, closed_at: 1 },
                  { id: 2, name: 'boshqa voronka', pipeline_id: 99, status_id: 5 },
                  { id: 3, name: 'ochiq', pipeline_id: 10, status_id: 100, responsible_user_id: 42 },
                ],
              },
            },
          },
    );

    expect(await amo(fetchImpl).findOpenBitim('7')).toEqual({ id: '3', contactId: '7', name: 'ochiq', responsibleUserId: '42' });
  });

  it('creates a Bitim in the first stage of the bot pipeline, linked to the contact', async () => {
    const { requests, fetchImpl } = fakeAmo(() => ({ status: 200, json: { _embedded: { leads: [{ id: 55 }] } } }));

    const bitim = await amo(fetchImpl).createBitim({ contactId: '7', name: 'Aziz — Jozibali', responsibleUserId: '42' });

    expect(bitim).toEqual({ id: '55', contactId: '7', name: 'Aziz — Jozibali', responsibleUserId: '42' });
    expect(requests[0]!.body).toEqual([
      { name: 'Aziz — Jozibali', pipeline_id: 10, status_id: 100, responsible_user_id: 42, _embedded: { contacts: [{ id: 7 }] } },
    ]);
  });

  it('adds tags, the Manba field, a note and a call task', async () => {
    const { requests, fetchImpl } = fakeAmo(() => ({ status: 200, json: { _embedded: { tasks: [{ id: 9 }] } } }));
    const crm = amo(fetchImpl);

    await crm.addTags('55', ['bot_form', 'insta']);
    await crm.setManba('55', 'insta');
    await crm.addNote('55', 'Ariza');
    await crm.createTask({ bitimId: '55', kind: 'call', text: "Qo'ng'iroq qilish", dueAt: new Date('2026-11-23T05:15:00Z') });

    expect(requests.map((r) => [r.method, r.path, r.body])).toEqual([
      ['PATCH', '/api/v4/leads', [{ id: 55, tags_to_add: [{ name: 'bot_form' }, { name: 'insta' }] }]],
      ['PATCH', '/api/v4/leads/55', { custom_fields_values: [{ field_id: 501, values: [{ value: 'insta' }] }] }],
      ['POST', '/api/v4/leads/55/notes', [{ note_type: 'common', params: { text: 'Ariza' } }]],
      [
        'POST',
        '/api/v4/tasks',
        [{ text: "Qo'ng'iroq qilish", complete_till: 1795410900, entity_id: 55, entity_type: 'leads', task_type_id: 1 }],
      ],
    ]);
  });

  it('removes tags (another Daraja) from a Bitim', async () => {
    const { requests, fetchImpl } = fakeAmo(() => ({ status: 200, json: {} }));
    await amo(fetchImpl).removeTags('55', ['iliq', 'sovuq']);
    expect(requests.map((r) => [r.method, r.path, r.body])).toEqual([
      ['PATCH', '/api/v4/leads', [{ id: 55, tags_to_delete: [{ name: 'iliq' }, { name: 'sovuq' }] }]],
    ]);
  });

  it('maps 5xx / 429 / network errors to CrmUnavailableError and 401 / 403 to CrmAuthError', async () => {
    for (const [status, error] of [
      [503, CrmUnavailableError],
      [429, CrmUnavailableError],
      [401, CrmAuthError],
      [403, CrmAuthError],
    ] as const) {
      const { fetchImpl } = fakeAmo(() => ({ status }));
      await expect(amo(fetchImpl).addNote('1', 'x')).rejects.toBeInstanceOf(error);
    }
    const down = (async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    await expect(amo(down).addNote('1', 'x')).rejects.toBeInstanceOf(CrmUnavailableError);
  });

  describe('OAuth', () => {
    function memoryStore(initial: AmoTokens) {
      const saved: AmoTokens[] = [];
      let current = initial;
      return {
        saved,
        store: {
          load: async () => current,
          save: async (t: AmoTokens) => {
            current = t;
            saved.push(t);
          },
        },
      };
    }
    const oauth = (store: AmoTokenStore): AmoAuth => ({
      kind: 'oauth',
      clientId: 'cid',
      clientSecret: 'secret',
      redirectUri: 'https://example.uz/amo',
      store,
    });

    it('refreshes on 401, stores the new tokens and repeats the request', async () => {
      const { saved, store } = memoryStore({ accessToken: 'old', refreshToken: 'r1', expiresAt: new Date('2026-11-24T00:00:00Z') });
      const { requests, fetchImpl } = fakeAmo((req) => {
        if (req.path === '/oauth2/access_token') {
          return { status: 200, json: { access_token: 'new', refresh_token: 'r2', expires_in: 86400 } };
        }
        return req.token === 'new' ? { status: 200, json: {} } : { status: 401 };
      });

      await amo(fetchImpl, oauth(store)).addNote('1', 'x');

      expect(requests.find((r) => r.path === '/oauth2/access_token')!.body).toMatchObject({
        grant_type: 'refresh_token',
        refresh_token: 'r1',
      });
      expect(saved).toEqual([{ accessToken: 'new', refreshToken: 'r2', expiresAt: new Date('2026-11-24T05:00:00Z') }]);
      expect(requests.at(-1)!.token).toBe('new');
    });

    it('refreshes before the token expires', async () => {
      const { store } = memoryStore({ accessToken: 'old', refreshToken: 'r1', expiresAt: new Date('2026-11-23T05:01:00Z') });
      const { requests, fetchImpl } = fakeAmo((req) =>
        req.path === '/oauth2/access_token'
          ? { status: 200, json: { access_token: 'new', refresh_token: 'r2', expires_in: 86400 } }
          : { status: 200, json: {} },
      );

      await amo(fetchImpl, oauth(store)).addNote('1', 'x');

      expect(requests.map((r) => r.path)).toEqual(['/oauth2/access_token', '/api/v4/leads/1/notes']);
      expect(requests[1]!.token).toBe('new');
    });

    it('a rejected refresh is an auth error', async () => {
      const { store } = memoryStore({ accessToken: 'old', refreshToken: 'r1', expiresAt: new Date('2026-11-24T00:00:00Z') });
      const { fetchImpl } = fakeAmo(() => ({ status: 401 }));

      await expect(amo(fetchImpl, oauth(store)).addNote('1', 'x')).rejects.toBeInstanceOf(CrmAuthError);
    });
  });
});
