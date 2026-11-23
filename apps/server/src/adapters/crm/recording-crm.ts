import {
  CrmAuthError,
  CrmUnavailableError,
  type Crm,
  type CrmBitim,
  type CrmContact,
  type CrmTask,
  type NewCrmBitim,
  type NewCrmContact,
  type NewCrmTask,
} from './crm';

export type CrmCall = {
  [M in keyof Crm]: { method: M; args: Parameters<Crm[M]> };
}[keyof Crm];

export type CrmFailureMode = 'unavailable' | 'auth';

/**
 * In-memory CRM for tests and local dev. Behaves like a tiny amoCRM, records
 * every call and can be switched into a failure mode.
 *
 *   crm.fail('unavailable')  // every call throws CrmUnavailableError
 *   crm.fail('auth')         // every call throws CrmAuthError
 *   crm.recover()            // back to normal
 *
 * Calls made while failing are recorded too (`ok: false`), so tests can assert
 * on attempts as well as on the resulting state.
 */
export class RecordingCrm implements Crm {
  readonly calls: Array<CrmCall & { ok: boolean }> = [];
  readonly contacts: CrmContact[] = [];
  readonly bitimlar: Array<CrmBitim & { open: boolean; tags: string[]; notes: string[] }> = [];
  readonly tasks: Array<CrmTask & { closed: boolean; result?: string }> = [];

  #failure: CrmFailureMode | null = null;
  #seq = 0;

  fail(mode: CrmFailureMode): void {
    this.#failure = mode;
  }

  recover(): void {
    this.#failure = null;
  }

  /** Calls of one method, in order. */
  callsOf<M extends keyof Crm>(method: M): Array<Parameters<Crm[M]>> {
    return this.calls.filter((c) => c.method === method && c.ok).map((c) => c.args as Parameters<Crm[M]>);
  }

  async findContact(by: { phone: string } | { telegramId: string }): Promise<CrmContact | null> {
    this.#enter('findContact', [by]);
    const found =
      'phone' in by
        ? this.contacts.find((c) => c.phone === by.phone)
        : this.contacts.find((c) => c.telegramId === by.telegramId);
    return found ? { ...found } : null;
  }

  async createContact(input: NewCrmContact): Promise<CrmContact> {
    this.#enter('createContact', [input]);
    const contact = { id: this.#id('contact'), ...input };
    this.contacts.push(contact);
    return { ...contact };
  }

  async findOpenBitim(contactId: string): Promise<CrmBitim | null> {
    this.#enter('findOpenBitim', [contactId]);
    const b = this.bitimlar.find((x) => x.contactId === contactId && x.open);
    return b ? pickBitim(b) : null;
  }

  async createBitim(input: NewCrmBitim): Promise<CrmBitim> {
    this.#enter('createBitim', [input]);
    const b = { id: this.#id('bitim'), ...input, open: true, tags: [], notes: [] };
    this.bitimlar.push(b);
    return pickBitim(b);
  }

  async addNote(bitimId: string, text: string): Promise<void> {
    this.#enter('addNote', [bitimId, text]);
    this.#bitim(bitimId).notes.push(text);
  }

  async addTags(bitimId: string, tags: string[]): Promise<void> {
    this.#enter('addTags', [bitimId, tags]);
    const b = this.#bitim(bitimId);
    for (const t of tags) if (!b.tags.includes(t)) b.tags.push(t);
  }

  async createTask(input: NewCrmTask): Promise<CrmTask> {
    this.#enter('createTask', [input]);
    this.#bitim(input.bitimId);
    const task = { id: this.#id('task'), bitimId: input.bitimId, kind: input.kind, text: input.text, dueAt: input.dueAt };
    this.tasks.push({ ...task, closed: false });
    return task;
  }

  async rescheduleTask(taskId: string, dueAt: Date): Promise<void> {
    this.#enter('rescheduleTask', [taskId, dueAt]);
    this.#task(taskId).dueAt = dueAt;
  }

  async closeTask(taskId: string, result?: string): Promise<void> {
    this.#enter('closeTask', [taskId, result]);
    const t = this.#task(taskId);
    t.closed = true;
    t.result = result;
  }

  #enter<M extends keyof Crm>(method: M, args: Parameters<Crm[M]>): void {
    const ok = this.#failure === null;
    this.calls.push({ method, args, ok } as CrmCall & { ok: boolean });
    if (this.#failure === 'unavailable') throw new CrmUnavailableError(`CRM unavailable (fake): ${method}`);
    if (this.#failure === 'auth') throw new CrmAuthError(`CRM auth rejected (fake): ${method}`);
  }

  #id(prefix: string): string {
    return `${prefix}-${++this.#seq}`;
  }

  #bitim(id: string) {
    const b = this.bitimlar.find((x) => x.id === id);
    if (!b) throw new Error(`RecordingCrm: unknown Bitim ${id}`);
    return b;
  }

  #task(id: string) {
    const t = this.tasks.find((x) => x.id === id);
    if (!t) throw new Error(`RecordingCrm: unknown task ${id}`);
    return t;
  }
}

function pickBitim(b: CrmBitim): CrmBitim {
  return { id: b.id, contactId: b.contactId, name: b.name, responsibleUserId: b.responsibleUserId };
}
