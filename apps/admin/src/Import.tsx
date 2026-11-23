import type {
  AdminLoyihaListItem,
  ImportNatija,
  ImportQator,
  ImportReja,
  ImportTekshirResponse,
  ImportXato,
} from '@yh/shared';
import { useEffect, useRef, useState } from 'react';
import { adminApi, adminUpload, ApiError, errorText } from './api';
import { soum } from './format';

/**
 * «Import» (#6, TZ story 63): a Menejer or Administrator loads a Loyiha's
 * Planirovkalar from the Excel / CSV shablon. The file is checked first
 * (row → reason); only a clean file can be imported, in one transaction.
 */

const USTUNLAR = ['Blok', 'xonalar', 'maydon', 'nomi', "Boshlang'ich narx", "bo'sh", 'bron', 'sotilgan', 'chizma', 'video'];
const OZGARISH_LABEL: Record<string, string> = {
  nomi: 'nomi',
  boshlangichNarx: 'narx',
  bosh: "bo'sh",
  bron: 'bron',
  sotilgan: 'sotilgan',
  chizma: 'chizma',
  video: 'video',
};
const AMAL_LABEL: Record<ImportQator['amal'], string> = {
  yangi: 'Yangi',
  yangilanadi: 'Yangilanadi',
  ozgarishsiz: "O'zgarishsiz",
};

type Holat =
  | { kind: 'kutish' }
  | { kind: 'tekshirilmoqda'; file: File }
  | { kind: 'xatolar'; file: File; xatolar: ImportXato[] }
  | { kind: 'reja'; file: File; reja: ImportReja; importing: boolean }
  | { kind: 'tayyor'; natija: ImportNatija };

function uploadError(e: unknown): string {
  if (e instanceof ApiError && e.status === 413) return 'Fayl 5 MB dan katta';
  return errorText(e);
}

export function ImportScreen() {
  const [loyihalar, setLoyihalar] = useState<AdminLoyihaListItem[]>([]);
  const [loyihaId, setLoyihaId] = useState<number | null>(null);
  const [holat, setHolat] = useState<Holat>({ kind: 'kutish' });
  const [error, setError] = useState('');
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    adminApi<{ loyihalar: AdminLoyihaListItem[] }>('GET', '/katalog/loyihalar')
      .then((r) => {
        setLoyihalar(r.loyihalar);
        setLoyihaId((id) => id ?? r.loyihalar.find((l) => l.holat === 'sotuvda')?.id ?? r.loyihalar[0]?.id ?? null);
      })
      .catch((e) => setError(errorText(e)));
  }, []);

  function reset() {
    setHolat({ kind: 'kutish' });
    setError('');
    if (input.current) input.current.value = '';
  }

  async function tekshir(file: File) {
    if (loyihaId === null) return;
    setError('');
    setHolat({ kind: 'tekshirilmoqda', file });
    try {
      const r = await adminUpload<ImportTekshirResponse>(`/katalog/loyihalar/${loyihaId}/import/tekshir`, file);
      setHolat(r.reja ? { kind: 'reja', file, reja: r.reja, importing: false } : { kind: 'xatolar', file, xatolar: r.xatolar });
    } catch (e) {
      setHolat({ kind: 'kutish' });
      setError(uploadError(e));
    }
  }

  async function importQil() {
    if (holat.kind !== 'reja' || loyihaId === null) return;
    setHolat({ ...holat, importing: true });
    try {
      const { natija } = await adminUpload<{ natija: ImportNatija }>(`/katalog/loyihalar/${loyihaId}/import`, holat.file);
      setHolat({ kind: 'tayyor', natija });
    } catch (e) {
      // The katalog changed since the check and the file no longer fits: show why.
      const xatolar = e instanceof ApiError ? (e.body as { xatolar?: ImportXato[] } | null)?.xatolar : undefined;
      if (xatolar) setHolat({ kind: 'xatolar', file: holat.file, xatolar });
      else {
        setHolat({ ...holat, importing: false });
        setError(uploadError(e));
      }
    }
  }

  function pick(files: FileList | null) {
    const file = files?.[0];
    if (file) void tekshir(file);
  }

  const loyiha = loyihalar.find((l) => l.id === loyihaId);
  const busy = holat.kind === 'tekshirilmoqda' || (holat.kind === 'reja' && holat.importing);
  const file = 'file' in holat ? holat.file : null;

  return (
    <div className="stack wide import">
      <header className="row between">
        <div>
          <h1 className="h2">Excel'dan import</h1>
          <p className="muted">Blok Planirovkalarini shablon bo'yicha yuklang: avval tekshiramiz, keyin siz tasdiqlaysiz</p>
        </div>
        <label className="field">
          <span>Loyiha</span>
          <select
            value={loyihaId ?? ''}
            disabled={busy}
            onChange={(e) => {
              setLoyihaId(Number(e.target.value));
              reset();
            }}
          >
            {loyihalar.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nomi}
              </option>
            ))}
          </select>
        </label>
      </header>

      <section className="card import-setup">
        <div className="import-shablon">
          <h2 className="title">Shablon</h2>
          <p className="muted small">
            Ustunlar: {USTUNLAR.join(', ')}. Shablonda {loyiha ? `«${loyiha.nomi}»ning` : 'Loyihaning'} hozirgi
            Planirovkalari bor: sonlar va narxni o'zgartiring, yangi qatorlar qo'shing va faylni qayta yuklang.
          </p>
          <a
            className="button"
            href={loyihaId === null ? undefined : `/admin/api/katalog/loyihalar/${loyihaId}/import/shablon.xlsx`}
            aria-disabled={loyihaId === null}
            download
          >
            Shablonni yuklab olish (.xlsx)
          </a>
        </div>

        <label
          className={['dropzone', drag && 'drag', busy && 'busy'].filter(Boolean).join(' ')}
          aria-busy={busy}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            if (!busy) pick(e.dataTransfer.files);
          }}
        >
          <input
            ref={input}
            type="file"
            accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            disabled={busy || loyihaId === null}
            onChange={(e) => pick(e.target.files)}
          />
          <UploadIcon />
          {holat.kind === 'tekshirilmoqda' ? (
            <strong>Tekshirilmoqda…</strong>
          ) : file ? (
            <strong className="clip">{file.name}</strong>
          ) : (
            <strong>Faylni shu yerga tashlang yoki tanlang</strong>
          )}
          <span className="muted small">{file ? 'Boshqa fayl tanlash uchun bosing' : '.xlsx yoki .csv, 5 MB gacha'}</span>
        </label>
      </section>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {holat.kind === 'xatolar' && <Xatolar xatolar={holat.xatolar} onRetry={() => input.current?.click()} />}
      {holat.kind === 'reja' && (
        <Reja reja={holat.reja} importing={holat.importing} onImport={importQil} onCancel={reset} />
      )}
      {holat.kind === 'tayyor' && <Tayyor natija={holat.natija} onAgain={reset} />}
    </div>
  );
}

function Xatolar({ xatolar, onRetry }: { xatolar: ImportXato[]; onRetry: () => void }) {
  const qatorlar = new Set(xatolar.map((x) => x.qator)).size;
  return (
    <section className="card flush reveal" aria-live="polite">
      <div className="row toolbar">
        <div>
          <h2 className="title error-title">
            {xatolar.some((x) => x.qator === null || x.qator === 1)
              ? 'Faylni import qilib bo\'lmaydi'
              : `${qatorlar} ta qatorda xato: fayl import qilinmaydi`}
          </h2>
          <p className="muted small">Excel'da tuzating va faylni qayta yuklang. Hech narsa o'zgarmadi.</p>
        </div>
        <button className="primary" onClick={onRetry}>
          Tuzatilgan faylni yuklash
        </button>
      </div>
      <table className="table">
        <thead>
          <tr>
            <th className="num qator">Qator</th>
            <th className="ustun">Ustun</th>
            <th>Sabab</th>
          </tr>
        </thead>
        <tbody>
          {xatolar.map((x, i) => (
            <tr key={i}>
              <td className="num">{x.qator ?? '—'}</td>
              <td className="nowrap">{x.ustun ?? '—'}</td>
              <td>{x.xabar}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Reja({
  reja,
  importing,
  onImport,
  onCancel,
}: {
  reja: ImportReja;
  importing: boolean;
  onImport: () => void;
  onCancel: () => void;
}) {
  const ozgaradi = reja.yangi + reja.yangilanadi;
  const changed = (q: ImportQator, k: string) => (q.ozgarishlar?.includes(k) ? 'num changed' : 'num');
  return (
    <section className="card flush reveal" aria-live="polite">
      <div className="row toolbar">
        <div>
          <h2 className="title">Xato yo'q. Import nima qiladi:</h2>
          {(reja.yangiBloklar.length > 0 || reja.fayldaYoq > 0) && (
            <p className="muted small">
              {reja.yangiBloklar.length > 0 && <>Yangi Blok yaratiladi: {reja.yangiBloklar.join(', ')}. </>}
              {reja.fayldaYoq > 0 && <>Faylda yo'q {reja.fayldaYoq} ta Planirovka o'zgarmaydi.</>}
            </p>
          )}
        </div>
        <div className="row tight">
          <button onClick={onCancel} disabled={importing}>
            Bekor qilish
          </button>
          <button className="primary" onClick={onImport} disabled={importing || ozgaradi === 0}>
            {importing ? 'Import qilinmoqda…' : ozgaradi === 0 ? "O'zgarish yo'q" : `Import qilish (${ozgaradi})`}
          </button>
        </div>
      </div>
      <div className="import-stats">
        <Stat label="Yangi" value={reja.yangi} tone="free" />
        <Stat label="Yangilanadi" value={reja.yangilanadi} tone="primary" />
        <Stat label="O'zgarishsiz" value={reja.ozgarishsiz} />
      </div>
      <table className="table">
        <thead>
          <tr>
            <th className="num">Qator</th>
            <th>Blok</th>
            <th className="num">Xona</th>
            <th className="num">m²</th>
            <th>Nomi</th>
            <th className="num">Narx, so'm</th>
            <th className="num">Bo'sh</th>
            <th className="num">Bron</th>
            <th className="num">Sotilgan</th>
            <th>Amal</th>
          </tr>
        </thead>
        <tbody>
          {reja.qatorlar.map((q) => (
            <tr key={q.qator} className={q.amal === 'ozgarishsiz' ? 'dim' : undefined}>
              <td className="num">{q.qator}</td>
              <td>{q.blok}</td>
              <td className="num">{q.xonalar}</td>
              <td className="num">{q.maydon}</td>
              <td className={q.ozgarishlar?.includes('nomi') ? 'changed' : undefined}>{q.nomi ?? '—'}</td>
              <td className={`${changed(q, 'boshlangichNarx')} nowrap`}>{soum(q.boshlangichNarx)}</td>
              <td className={changed(q, 'bosh')}>{q.bosh}</td>
              <td className={changed(q, 'bron')}>{q.bron}</td>
              <td className={changed(q, 'sotilgan')}>{q.sotilgan}</td>
              <td>
                <span className={`badge amal-${q.amal}`}>{AMAL_LABEL[q.amal]}</span>
                {q.ozgarishlar && (
                  <span className="muted small amal-fields">
                    {q.ozgarishlar.map((k) => OZGARISH_LABEL[k] ?? k).join(', ')}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Tayyor({ natija, onAgain }: { natija: ImportNatija; onAgain: () => void }) {
  const parts = [
    natija.yaratildi && `${natija.yaratildi} ta yangi Planirovka`,
    natija.yangilandi && `${natija.yangilandi} ta yangilandi`,
    natija.yangiBloklar.length && `Blok: ${natija.yangiBloklar.join(', ')}`,
  ].filter(Boolean);
  return (
    <section className="card success reveal" role="status">
      <div>
        <h2 className="title">Import qilindi</h2>
        <p className="small">
          {parts.join(' · ')}. Mini App'da hozir ko'rinadi; har bir o'zgarish Jurnalda.
        </p>
      </div>
      <button onClick={onAgain}>Yana fayl yuklash</button>
    </section>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'free' | 'primary' }) {
  return (
    <div className="stat">
      <span className={tone ? `stat-label ${tone}` : 'stat-label'}>{label}</span>
      <strong className="stat-value">{value}</strong>
    </div>
  );
}

function UploadIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 15V4m0 0L8 8m4-4 4 4M5 14v3a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3v-3"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
