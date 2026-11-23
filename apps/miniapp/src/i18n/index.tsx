import type { Lang } from '@yh/shared';
import { createContext, useContext, type ReactNode } from 'react';
import { ru, type Dictionary, type MessageKey } from './ru';
import { uz } from './uz';

const dictionaries: Record<Lang, Dictionary> = { ru, uz };

export type Translate = (key: MessageKey, params?: Record<string, string | number>) => string;

/** Looks up `key` in the language's dictionary and fills `{param}` placeholders. */
export function translate(lang: Lang, key: MessageKey, params?: Record<string, string | number>): string {
  const template = dictionaries[lang][key];
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (m, name: string) => (name in params ? String(params[name]) : m));
}

const LangContext = createContext<Lang>('uz');

export function I18nProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>;
}

/** `const t = useT(); t('greeting.hello', { name })` */
export function useT(): Translate {
  const lang = useContext(LangContext);
  return (key, params) => translate(lang, key, params);
}

export function useLang(): Lang {
  return useContext(LangContext);
}

export type { MessageKey };
