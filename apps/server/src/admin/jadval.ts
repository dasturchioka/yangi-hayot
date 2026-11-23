import { isZip, JadvalError, readXlsx } from './xlsx';

export { JadvalError };

/**
 * An uploaded table (.xlsx or .csv) as rows of trimmed cell strings. The format
 * is told by the bytes, not the file name. CSV: UTF-8 (with or without BOM) or
 * Windows-1251 (Excel «CSV» on a Russian Windows); separator `;`, `,` or tab,
 * whichever the header row uses.
 */
export function readJadval(buf: Buffer): string[][] {
  const rows = isZip(buf) ? readXlsx(buf) : readCsv(decode(buf));
  return rows.map((r) => r.map((c) => c.replace(/ /g, ' ').trim()));
}

function decode(buf: Buffer): string {
  if (buf.includes(0)) throw new JadvalError('bad_file'); // .xls and other binaries
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    text = new TextDecoder('windows-1251').decode(buf);
  }
  return text.replace(/^﻿/, '');
}

function readCsv(text: string): string[][] {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const sep = [';', '\t', ','].map((s) => [s, firstLine.split(s).length] as const).sort((a, b) => b[1] - a[1])[0]![0];
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === sep) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}
