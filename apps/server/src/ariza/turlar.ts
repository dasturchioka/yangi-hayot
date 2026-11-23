import type { ArizaTuri } from '@yh/shared';
import type { CrmTaskKind } from '../adapters/crm/crm';

/** Per Ariza type (TZ 8-bo'lim table): Bitim tag, CRM task kind, name managers see. */
export const ARIZA_TURI: Record<ArizaTuri, { tag: string; task: CrmTaskKind; nomi: string }> = {
  form: { tag: 'bot_form', task: 'call', nomi: 'Ariza formasi' },
  quiz: { tag: 'bot_quiz', task: 'call', nomi: '«Xonadon tanlash» kvizi' },
  visit: { tag: 'bot_visit', task: 'meeting', nomi: "Ko'rishga yozilish" },
  calc: { tag: 'bot_calc', task: 'call', nomi: 'Kalkulyator' },
  ai: { tag: 'bot_ai', task: 'call', nomi: 'AI-menejer' },
  human: { tag: 'bot_human', task: 'contact', nomi: 'Menejer kerak' },
};

export const TASK_TEXT: Record<CrmTaskKind, string> = {
  call: "Qo'ng'iroq qilish",
  contact: "Bog'lanish",
  meeting: 'Uchrashuv',
};
