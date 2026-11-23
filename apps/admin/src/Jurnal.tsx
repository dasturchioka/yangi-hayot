import type { AdminLoyihaListItem, JurnalDto } from '@yh/shared';
import { useEffect, useState } from 'react';
import { adminApi, errorText } from './api';
import { qachon } from './format';

const PAGE = 50;

const MAYDON_LABEL: Record<string, string> = {
  boshlangichNarx: "Boshlang'ich narx",
  qoldaNarx: 'Planirovka narxi',
  narx: 'Narx',
  qavat: 'Qavat',
  raqam: 'Raqam',
  planirovkaId: 'Planirovka',
  bosh: "Bo'sh",
  bron: 'Bron',
  sotilgan: 'Sotilgan',
  jami: 'Jami',
  holat: 'Holati',
  xonalar: 'Xonalar',
  maydon: 'Maydon',
};
const AMAL_LABEL: Record<JurnalDto['amal'], string> = {
  yaratildi: 'Yaratildi',
  tahrirlandi: 'Tahrirlandi',
  ochirildi: "O'chirildi",
  kochirildi: "Ko'chirildi",
};

/** «Jurnal»: kim, qachon, nima edi, nima bo'ldi — newest first, by Loyiha. */
export function JurnalScreen() {
  const [loyihalar, setLoyihalar] = useState<AdminLoyihaListItem[]>([]);
  const [loyihaId, setLoyihaId] = useState<number | ''>('');
  const [rows, setRows] = useState<JurnalDto[]>([]);
  const [more, setMore] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    adminApi<{ loyihalar: AdminLoyihaListItem[] }>('GET', '/katalog/loyihalar')
      .then((r) => setLoyihalar(r.loyihalar))
      .catch((e) => setError(errorText(e)));
  }, []);

  async function load(beforeId?: number) {
    const q = new URLSearchParams({ limit: String(PAGE) });
    if (loyihaId !== '') q.set('loyihaId', String(loyihaId));
    if (beforeId) q.set('beforeId', String(beforeId));
    try {
      const { yozuvlar } = await adminApi<{ yozuvlar: JurnalDto[] }>('GET', `/jurnal?${q}`);
      setRows((r) => (beforeId ? [...r, ...yozuvlar] : yozuvlar));
      setMore(yozuvlar.length === PAGE);
      setError('');
    } catch (e) {
      setError(errorText(e));
    }
  }

  useEffect(() => {
    void load();
  }, [loyihaId]);

  return (
    <div className="stack wide">
      <header className="row between">
        <div>
          <h1 className="h2">Jurnal</h1>
          <p className="muted">Narx, holat va katalogdagi har bir o'zgarish</p>
        </div>
        <label className="field">
          <span>Loyiha</span>
          <select value={loyihaId} onChange={(e) => setLoyihaId(e.target.value ? Number(e.target.value) : '')}>
            <option value="">Hammasi</option>
            {loyihalar.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nomi}
              </option>
            ))}
          </select>
        </label>
      </header>
      {error && <p className="error">{error}</p>}
      <section className="card flush">
        <table className="table">
          <thead>
            <tr>
              <th>Qachon</th>
              <th>Kim</th>
              <th>Nima</th>
              <th>Amal</th>
              <th>Nima edi → nima bo'ldi</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="nowrap">{qachon(r.at)}</td>
                <td>{r.admin.nomi}</td>
                <td>{r.tavsif}</td>
                <td>{AMAL_LABEL[r.amal]}</td>
                <td>
                  <Changes r={r} />
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="muted">
                  Hali o'zgarish yo'q
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {more && (
          <p className="pad">
            <button onClick={() => load(rows[rows.length - 1]!.id)}>Yana</button>
          </p>
        )}
      </section>
    </div>
  );
}

function Changes({ r }: { r: JurnalDto }) {
  return (
    <ul className="changes">
      {Object.entries(r.keyin).map(([k, v]) => (
        <li key={k}>
          <span className="muted">{MAYDON_LABEL[k] ?? k}:</span> {r.oldin ? <>{show(r.oldin[k])} → </> : null}
          <strong>{show(v)}</strong>
        </li>
      ))}
    </ul>
  );
}

const QIYMAT_LABEL: Record<string, string> = {
  bosh: "Bo'sh",
  bron: 'Bron',
  sotilgan: 'Sotilgan',
  sotuvda: 'Sotuvda',
  topshirilgan: 'Topshirilgan',
};

function show(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'string' && v in QIYMAT_LABEL) return QIYMAT_LABEL[v]!;
  if (typeof v === 'number') return new Intl.NumberFormat('ru-RU').format(v).replace(/ /g, ' ');
  if (typeof v === 'object' && 'uz' in (v as object)) return String((v as { uz: string }).uz);
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}
