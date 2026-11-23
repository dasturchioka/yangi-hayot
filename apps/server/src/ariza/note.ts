import type { ArizaTuri } from '@yh/shared';
import { ARIZA_TURI } from './turlar';

/** Catalog context of an Ariza, frozen when it is created. */
export interface ArizaKontekst {
  loyiha: { id: number; nomi: string; responsibleId: string | null };
  blok: string | null;
  planirovka: { id: number; xonalar: number; maydon: number; nomi: string | null; narx: number | null } | null;
}

export interface NoteSource {
  id: number;
  tur: ArizaTuri;
  name: string;
  phone: string | null;
  mijoz_id: string;
  username: string | null;
  lang: string;
  first_manba: string;
  manba: string;
  kontekst: ArizaKontekst | null;
  izoh: string[];
}

/** «455 500 000» — thin groups of three, plain spaces (amoCRM and Telegram show them as is). */
export function formatSom(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function formatMaydon(m: number): string {
  return String(Number(m.toFixed(2))).replace('.', ',');
}

/**
 * The CRM note (8-bo'lim): who, Loyiha / Blok / Planirovka (xonalar, m²,
 * Boshlang'ich narx) when known, both Manbalar and the language, then the
 * type-specific lines. Same text goes to the managers group when the CRM is down.
 */
export function arizaNote(a: NoteSource): string {
  const lines = [
    `Ariza: ${ARIZA_TURI[a.tur].nomi} (${ARIZA_TURI[a.tur].tag}) · #${a.id}`,
    `Ism: ${a.name}`,
    a.phone ? `Telefon: ${a.phone}` : null,
    `Telegram: ${[a.username ? `@${a.username}` : null, `ID ${a.mijoz_id}`].filter(Boolean).join(' · ')}`,
    `Til: ${a.lang.toUpperCase()}`,
  ];
  const k = a.kontekst;
  if (k) {
    lines.push(`Loyiha: ${k.loyiha.nomi}`);
    if (k.blok) lines.push(`Blok: ${k.blok}`);
    if (k.planirovka) {
      const p = k.planirovka;
      lines.push(
        `Planirovka: ${[
          `${p.xonalar} xonali`,
          `${formatMaydon(p.maydon)} m²`,
          p.nomi,
          p.narx === null ? "Narx so'rov bo'yicha" : `${formatSom(p.narx)} so'mdan`,
        ]
          .filter(Boolean)
          .join(', ')}`,
      );
    }
  }
  lines.push(`Manba: birinchi — ${a.first_manba}; oxirgi — ${a.manba}`);
  lines.push(...a.izoh);
  return lines.filter((l): l is string => l !== null).join('\n');
}
