/**
 * CRM adapter (amoCRM in production, TZ section 8). Business code depends on
 * this interface only. The real amoCRM client and RecordingCrm (tests, local
 * dev) both implement it.
 *
 * Rules the callers enforce, not the adapter: one Mijoz = one contact; at most
 * one open Bitim from the bot per contact; contact lookup by phone first, then
 * by Telegram ID.
 */
export interface Crm {
  /** Finds a contact by phone (+998XXXXXXXXX) or Telegram ID. */
  findContact(by: { phone: string } | { telegramId: string }): Promise<CrmContact | null>;
  createContact(input: NewCrmContact): Promise<CrmContact>;

  /** The open Bitim in the bot pipeline for this contact, if any. */
  findOpenBitim(contactId: string): Promise<CrmBitim | null>;
  /** Creates a Bitim in the first stage of the bot pipeline. */
  createBitim(input: NewCrmBitim): Promise<CrmBitim>;

  addNote(bitimId: string, text: string): Promise<void>;
  /** Adds tags (`bot_form`, `bot_quiz`, …, Manba, Daraja) to a Bitim. */
  addTags(bitimId: string, tags: string[]): Promise<void>;
  /** Writes the (last) Manba into the Bitim's «Manba» field, if the CRM has one. */
  setManba(bitimId: string, manba: string): Promise<void>;

  createTask(input: NewCrmTask): Promise<CrmTask>;
  rescheduleTask(taskId: string, dueAt: Date): Promise<void>;
  closeTask(taskId: string, result?: string): Promise<void>;
}

export interface CrmContact {
  id: string;
  name: string;
  phone?: string;
  telegramId?: string;
}

export interface NewCrmContact {
  name: string;
  phone?: string;
  telegramId?: string;
}

export interface CrmBitim {
  id: string;
  contactId: string;
  name: string;
  responsibleUserId?: string;
}

export interface NewCrmBitim {
  contactId: string;
  name: string;
  /** Loyiha mas'uli (amoCRM user id). */
  responsibleUserId?: string;
}

export type CrmTaskKind = 'call' | 'contact' | 'meeting';

export interface CrmTask {
  id: string;
  bitimId: string;
  kind: CrmTaskKind;
  text: string;
  dueAt: Date;
}

export interface NewCrmTask {
  bitimId: string;
  kind: CrmTaskKind;
  text: string;
  dueAt: Date;
  responsibleUserId?: string;
}

/** CRM is down, times out or returns 5xx. The caller queues a retry. */
export class CrmUnavailableError extends Error {
  override name = 'CrmUnavailableError';
}

/** Token rejected (401/403). Retrying will not help; the admin is alerted. */
export class CrmAuthError extends Error {
  override name = 'CrmAuthError';
}
