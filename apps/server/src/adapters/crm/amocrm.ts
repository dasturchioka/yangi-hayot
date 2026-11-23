import {
  CrmAuthError,
  CrmUnavailableError,
  type Crm,
  type CrmBitim,
  type CrmContact,
  type CrmTask,
  type CrmTaskKind,
  type NewCrmBitim,
  type NewCrmContact,
  type NewCrmTask,
} from './crm';

/**
 * amoCRM API v4 adapter (TZ 8-bo'lim). Only this file knows amoCRM's URLs
 * and JSON; the rules (dedupe, one open Bitim, retries) live in the Ariza
 * module.
 *
 * Auth: a long-lived token (simplest, recommended) or OAuth 2.0 with refresh.
 * With OAuth the access token is refreshed shortly before it expires and once
 * more on a 401; new tokens go to `store` (amoCRM rotates the refresh token).
 * A rejected token / refresh → CrmAuthError (admins are alerted).
 */
export interface AmoCrmConfig {
  /** e.g. https://yangihayot.amocrm.ru */
  baseUrl: string;
  auth: AmoAuth;
  /** Bot pipeline and its first stage: new Bitimlar go there. */
  pipelineId: number;
  firstStatusId: number;
  /** Text field «Manba» on leads; unset → the Manba goes only to tags and the note. */
  manbaFieldId?: number;
  /** Text field with the Telegram ID on contacts; unset → contacts are found by phone only. */
  telegramFieldId?: number;
  /** Responsible for new Bitimlar and tasks when the Loyiha has no mas'ul. */
  defaultResponsibleId?: number;
  /** amoCRM task types. Defaults: 1 = «Связаться», 2 = «Встреча» (built in). */
  taskTypes?: Partial<Record<CrmTaskKind, number>>;
  fetch?: typeof fetch;
  now?: () => Date;
  timeoutMs?: number;
}

export type AmoAuth =
  | { kind: 'token'; token: string }
  | { kind: 'oauth'; clientId: string; clientSecret: string; redirectUri: string; store: AmoTokenStore };

export interface AmoTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

export interface AmoTokenStore {
  load(): Promise<AmoTokens | null>;
  save(tokens: AmoTokens): Promise<void>;
}

/** amoCRM's closed stages: «Успешно реализовано», «Закрыто и не реализовано». */
const CLOSED_STATUSES = new Set([142, 143]);
const REFRESH_BEFORE_MS = 5 * 60_000;

interface AmoCustomField {
  field_id?: number;
  field_code?: string | null;
  values?: Array<{ value?: unknown; enum_code?: string }>;
}
interface AmoContact {
  id: number;
  name: string;
  custom_fields_values?: AmoCustomField[] | null;
}
interface AmoLead {
  id: number;
  name: string;
  pipeline_id: number;
  status_id: number;
  responsible_user_id?: number;
  closed_at?: number | null;
  is_deleted?: boolean;
}

export class AmoCrm implements Crm {
  readonly #c: AmoCrmConfig;
  readonly #fetch: typeof fetch;
  readonly #now: () => Date;
  #refreshing: Promise<AmoTokens> | null = null;

  constructor(config: AmoCrmConfig) {
    this.#c = config;
    this.#fetch = config.fetch ?? fetch;
    this.#now = config.now ?? (() => new Date());
  }

  async findContact(by: { phone: string } | { telegramId: string }): Promise<CrmContact | null> {
    if ('phone' in by) {
      const digits = by.phone.replace(/\D/g, '');
      const contacts = await this.#search(digits);
      const found = contacts.find((c) => phonesOf(c).some((p) => p.replace(/\D/g, '').endsWith(digits.slice(-9))));
      return found ? this.#toContact(found) : null;
    }
    const fieldId = this.#c.telegramFieldId;
    if (!fieldId) return null;
    const contacts = await this.#search(by.telegramId);
    const found = contacts.find((c) => fieldValues(c, fieldId).includes(by.telegramId));
    return found ? this.#toContact(found) : null;
  }

  async createContact(input: NewCrmContact): Promise<CrmContact> {
    const fields: AmoCustomField[] = [];
    if (input.phone) fields.push({ field_code: 'PHONE', values: [{ value: input.phone, enum_code: 'MOB' }] });
    if (input.telegramId && this.#c.telegramFieldId) {
      fields.push({ field_id: this.#c.telegramFieldId, values: [{ value: input.telegramId }] });
    }
    const body = [{ name: input.name, ...(fields.length ? { custom_fields_values: fields } : {}) }];
    const res = await this.#request<{ _embedded: { contacts: Array<{ id: number }> } }>('POST', '/api/v4/contacts', body);
    return { id: String(res._embedded.contacts[0]!.id), ...input };
  }

  async findOpenBitim(contactId: string): Promise<CrmBitim | null> {
    const contact = await this.#request<{ _embedded?: { leads?: Array<{ id: number }> } } | null>(
      'GET',
      `/api/v4/contacts/${contactId}?with=leads`,
    );
    const ids = contact?._embedded?.leads?.map((l) => l.id) ?? [];
    if (ids.length === 0) return null;
    const query = ids.map((id) => `filter[id][]=${id}`).join('&');
    const res = await this.#request<{ _embedded: { leads: AmoLead[] } } | null>(
      'GET',
      `/api/v4/leads?${query}&filter[pipeline_id]=${this.#c.pipelineId}&limit=250`,
    );
    const open = (res?._embedded.leads ?? [])
      .filter((l) => l.pipeline_id === this.#c.pipelineId && !CLOSED_STATUSES.has(l.status_id) && !l.closed_at && !l.is_deleted)
      .sort((a, b) => b.id - a.id)[0];
    if (!open) return null;
    return {
      id: String(open.id),
      contactId,
      name: open.name,
      responsibleUserId: open.responsible_user_id === undefined ? undefined : String(open.responsible_user_id),
    };
  }

  async createBitim(input: NewCrmBitim): Promise<CrmBitim> {
    const responsible = this.#responsible(input.responsibleUserId);
    const body = [
      {
        name: input.name,
        pipeline_id: this.#c.pipelineId,
        status_id: this.#c.firstStatusId,
        ...(responsible ? { responsible_user_id: responsible } : {}),
        _embedded: { contacts: [{ id: Number(input.contactId) }] },
      },
    ];
    const res = await this.#request<{ _embedded: { leads: Array<{ id: number }> } }>('POST', '/api/v4/leads', body);
    return {
      id: String(res._embedded.leads[0]!.id),
      contactId: input.contactId,
      name: input.name,
      responsibleUserId: responsible === undefined ? undefined : String(responsible),
    };
  }

  async renameBitim(bitimId: string, name: string): Promise<void> {
    await this.#request('PATCH', `/api/v4/leads/${bitimId}`, { name: name.slice(0, 255) });
  }

  async addNote(bitimId: string, text: string): Promise<void> {
    await this.#request('POST', `/api/v4/leads/${bitimId}/notes`, [{ note_type: 'common', params: { text } }]);
  }

  async addTags(bitimId: string, tags: string[]): Promise<void> {
    if (tags.length === 0) return;
    await this.#request('PATCH', '/api/v4/leads', [
      { id: Number(bitimId), tags_to_add: tags.map((name) => ({ name: name.slice(0, 255) })) },
    ]);
  }

  async removeTags(bitimId: string, tags: string[]): Promise<void> {
    if (tags.length === 0) return;
    await this.#request('PATCH', '/api/v4/leads', [
      { id: Number(bitimId), tags_to_delete: tags.map((name) => ({ name: name.slice(0, 255) })) },
    ]);
  }

  async setManba(bitimId: string, manba: string): Promise<void> {
    const fieldId = this.#c.manbaFieldId;
    if (!fieldId) return;
    await this.#request('PATCH', `/api/v4/leads/${bitimId}`, {
      custom_fields_values: [{ field_id: fieldId, values: [{ value: manba }] }],
    });
  }

  async createTask(input: NewCrmTask): Promise<CrmTask> {
    const responsible = this.#responsible(input.responsibleUserId);
    const body = [
      {
        text: input.text,
        complete_till: Math.floor(input.dueAt.getTime() / 1000),
        entity_id: Number(input.bitimId),
        entity_type: 'leads',
        task_type_id: this.#taskType(input.kind),
        ...(responsible ? { responsible_user_id: responsible } : {}),
      },
    ];
    const res = await this.#request<{ _embedded: { tasks: Array<{ id: number }> } }>('POST', '/api/v4/tasks', body);
    return { id: String(res._embedded.tasks[0]!.id), bitimId: input.bitimId, kind: input.kind, text: input.text, dueAt: input.dueAt };
  }

  async rescheduleTask(taskId: string, dueAt: Date): Promise<void> {
    await this.#request('PATCH', `/api/v4/tasks/${taskId}`, { complete_till: Math.floor(dueAt.getTime() / 1000) });
  }

  async closeTask(taskId: string, result?: string): Promise<void> {
    await this.#request('PATCH', `/api/v4/tasks/${taskId}`, {
      is_completed: true,
      ...(result ? { result: { text: result } } : {}),
    });
  }

  #taskType(kind: CrmTaskKind): number {
    const defaults: Record<CrmTaskKind, number> = { call: 1, contact: 1, meeting: 2 };
    return this.#c.taskTypes?.[kind] ?? defaults[kind];
  }

  #responsible(id: string | undefined): number | undefined {
    if (id !== undefined && /^\d+$/.test(id)) return Number(id);
    return this.#c.defaultResponsibleId;
  }

  #toContact(c: AmoContact): CrmContact {
    const phone = phonesOf(c)[0];
    const telegramId = this.#c.telegramFieldId ? fieldValues(c, this.#c.telegramFieldId)[0] : undefined;
    return { id: String(c.id), name: c.name, ...(phone ? { phone } : {}), ...(telegramId ? { telegramId } : {}) };
  }

  async #search(query: string): Promise<AmoContact[]> {
    const res = await this.#request<{ _embedded: { contacts: AmoContact[] } } | null>(
      'GET',
      `/api/v4/contacts?query=${encodeURIComponent(query)}&limit=50`,
    );
    return res?._embedded.contacts ?? [];
  }

  /** One API call. 204 → null. Maps failures to CrmUnavailableError / CrmAuthError. */
  async #request<T = unknown>(method: string, path: string, body?: unknown, retried = false): Promise<T> {
    const token = await this.#accessToken();
    let res: Response;
    try {
      res = await this.#fetch(`${this.#c.baseUrl}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${token}`,
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(this.#c.timeoutMs ?? 10_000),
      });
    } catch (error) {
      throw new CrmUnavailableError(`amoCRM ${method} ${pathOnly(path)}: ${(error as Error).message}`);
    }
    if (res.status === 401 && this.#c.auth.kind === 'oauth' && !retried) {
      await this.#refresh(token);
      return this.#request<T>(method, path, body, true);
    }
    if (res.status === 401 || res.status === 403) {
      throw new CrmAuthError(`amoCRM ${method} ${pathOnly(path)}: ${res.status}`);
    }
    if (res.status === 429 || res.status >= 500) {
      throw new CrmUnavailableError(`amoCRM ${method} ${pathOnly(path)}: ${res.status}`);
    }
    if (!res.ok) {
      // amoCRM echoes the request in validation errors: no phones in logs.
      const text = (await res.text()).slice(0, 500).replace(/\d{7,}/g, '***');
      throw new Error(`amoCRM ${method} ${pathOnly(path)}: ${res.status} ${text}`);
    }
    if (res.status === 204) return null as T;
    const text = await res.text();
    return (text ? JSON.parse(text) : null) as T;
  }

  async #accessToken(): Promise<string> {
    const auth = this.#c.auth;
    if (auth.kind === 'token') return auth.token;
    const tokens = await auth.store.load();
    if (!tokens) throw new CrmAuthError('amoCRM OAuth: no tokens stored');
    if (tokens.expiresAt.getTime() - this.#now().getTime() < REFRESH_BEFORE_MS) {
      return (await this.#refresh(tokens.accessToken)).accessToken;
    }
    return tokens.accessToken;
  }

  /** Refreshes once even if several requests notice the expiry at the same time. */
  async #refresh(staleAccessToken: string): Promise<AmoTokens> {
    if (this.#refreshing) return this.#refreshing;
    this.#refreshing = (async () => {
      const auth = this.#c.auth;
      if (auth.kind !== 'oauth') throw new Error('not OAuth');
      const current = await auth.store.load();
      if (!current) throw new CrmAuthError('amoCRM OAuth: no tokens stored');
      // Another process / earlier call already refreshed it.
      if (current.accessToken !== staleAccessToken && current.expiresAt.getTime() - this.#now().getTime() >= REFRESH_BEFORE_MS) {
        return current;
      }
      let res: Response;
      try {
        res = await this.#fetch(`${this.#c.baseUrl}/oauth2/access_token`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            client_id: auth.clientId,
            client_secret: auth.clientSecret,
            grant_type: 'refresh_token',
            refresh_token: current.refreshToken,
            redirect_uri: auth.redirectUri,
          }),
          signal: AbortSignal.timeout(this.#c.timeoutMs ?? 10_000),
        });
      } catch (error) {
        throw new CrmUnavailableError(`amoCRM OAuth refresh: ${(error as Error).message}`);
      }
      if (res.status === 429 || res.status >= 500) throw new CrmUnavailableError(`amoCRM OAuth refresh: ${res.status}`);
      if (!res.ok) throw new CrmAuthError(`amoCRM OAuth refresh rejected: ${res.status}`);
      const json = (await res.json()) as { access_token: string; refresh_token: string; expires_in: number };
      const tokens: AmoTokens = {
        accessToken: json.access_token,
        refreshToken: json.refresh_token,
        expiresAt: new Date(this.#now().getTime() + json.expires_in * 1000),
      };
      await auth.store.save(tokens);
      return tokens;
    })();
    try {
      return await this.#refreshing;
    } finally {
      this.#refreshing = null;
    }
  }
}

function phonesOf(c: AmoContact): string[] {
  const field = c.custom_fields_values?.find((f) => f.field_code === 'PHONE');
  return (field?.values ?? []).map((v) => String(v.value ?? '')).filter(Boolean);
}

function fieldValues(c: AmoContact, fieldId: number): string[] {
  const field = c.custom_fields_values?.find((f) => f.field_id === fieldId);
  return (field?.values ?? []).map((v) => String(v.value ?? '')).filter(Boolean);
}

/** Path without the query string: queries contain phones, which must not reach the logs. */
function pathOnly(path: string): string {
  return path.split('?')[0]!;
}
