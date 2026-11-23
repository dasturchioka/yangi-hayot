import type {
  AdminLoyihaListItem,
  ImportFayldaYoq,
  ImportNatija,
  ImportQator,
  ImportReja,
  ImportTekshirResponse,
  ImportXato,
  XonadonHolati,
} from '@yh/shared';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Select } from '@yh/ui/select';
import { adminApi, adminUpload, ApiError, errorText } from './api';
import { soum, XONADON_HOLATI_LABEL } from './format';
import { Icon, UploadLargeIcon } from './icons';

/**
 * «Import» (#6, #24, TZ story 63): a Menejer or Administrator loads a Loyiha's
 * Xonadonlar from the Excel / CSV shablon, one row = one Xonadon. The file is
 * checked first (row → reason); only a clean file can be imported, in one
 * transaction. Xonadonlar missing from the file are listed, never deleted.
 */

const USTUNLAR = ['Blok', 'qavat', 'raqam', 'xonalar', 'maydon', 'Planirovka', 'narx', 'holat', 'chizma', 'video'];
const AMAL_LABEL: Record<ImportQator['amal'], string> = {
  yangi: 'Yangi',
  yangilanadi: 'Yangilanadi',
  ozgarishsiz: "O'zgarishsiz",
};
/** Rows shown at once; the rest behind «Yana ko'rsatish». */
const SAHIFA = 100;

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

const maydon = (n: number) => String(n).replace('.', ',');
const xonadonNomi = (blok: string, raqam: number) => `${blok}-${raqam}`;

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
          <p className="muted">Xonadonlarni shablon bo'yicha yuklang: avval tekshiramiz, keyin siz tasdiqlaysiz</p>
        </div>
        <Select
          label="Loyiha"
          value={loyihaId ?? null}
          disabled={busy}
          options={loyihalar.map((l) => ({ value: l.id, label: l.nomi }))}
          onChange={(id) => {
            setLoyihaId(id);
            reset();
          }}
        />
      </header>

      <section className="card import-setup">
        <div className="import-shablon">
          <h2 className="title">Shablon</h2>
          <p className="muted small">
            Har qator — bitta Xonadon. Ustunlar: {USTUNLAR.join(', ')}. Shablonda{' '}
            {loyiha ? `«${loyiha.nomi}»ning` : 'Loyihaning'} hozirgi Xonadonlari bor: holat va narxni o'zgartiring, yangi
            qatorlar qo'shing va faylni qayta yuklang.
          </p>
          <p className="muted small">
            Xonadon Blok, qavat va raqam bo'yicha topiladi. Planirovka Blokdagi xonalar, maydon va nomi bo'yicha; yo'q
            bo'lsa yaratiladi. Faylda yo'q Xonadonlar o'chirilmaydi.
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
          <UploadLargeIcon />
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
              ? "Faylni import qilib bo'lmaydi"
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

type Filtr = 'ozgaradi' | 'hammasi' | 'ozgarishsiz' | 'fayldaYoq';

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
  const tabs: { key: Filtr; label: string; soni: number }[] = [
    { key: 'ozgaradi', label: "O'zgaradi", soni: ozgaradi },
    { key: 'ozgarishsiz', label: "O'zgarishsiz", soni: reja.ozgarishsiz },
    { key: 'fayldaYoq', label: "Faylda yo'q", soni: reja.fayldaYoq },
    { key: 'hammasi', label: 'Fayldagi hammasi', soni: reja.qatorlar.length },
  ];
  const [filtr, setFiltr] = useState<Filtr>(ozgaradi > 0 ? 'ozgaradi' : 'hammasi');
  const [korinadi, setKorinadi] = useState(SAHIFA);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  function select(f: Filtr) {
    setFiltr(f);
    setKorinadi(SAHIFA);
  }
  function onTabKey(e: KeyboardEvent, i: number) {
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const next = (i + d + tabs.length) % tabs.length;
    select(tabs[next]!.key);
    tabRefs.current[next]?.focus();
  }

  const qatorlar = reja.qatorlar.filter((q) =>
    filtr === 'hammasi' ? true : filtr === 'ozgarishsiz' ? q.amal === 'ozgarishsiz' : q.amal !== 'ozgarishsiz',
  );
  const izoh = [
    reja.yangiBloklar.length > 0 && `Yangi Blok: ${reja.yangiBloklar.join(', ')}`,
    reja.yangiPlanirovkalar > 0 && `${reja.yangiPlanirovkalar} ta yangi Planirovka`,
    reja.yangilanadiganPlanirovkalar > 0 && `${reja.yangilanadiganPlanirovkalar} ta Planirovkaning chizma / videosi yangilanadi`,
  ].filter(Boolean);

  return (
    <section className="card flush reveal" aria-live="polite">
      <div className="row toolbar">
        <div>
          <h2 className="title">Xato yo'q. Import nima qiladi:</h2>
          {izoh.length > 0 && <p className="muted small">{izoh.join(' · ')}.</p>}
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
        <Stat label="Yangi Xonadon" value={reja.yangi} tone="free" />
        <Stat label="Yangilanadi" value={reja.yangilanadi} tone="primary" />
        <Stat label="O'zgarishsiz" value={reja.ozgarishsiz} />
        <Stat label="Faylda yo'q" value={reja.fayldaYoq} hint="o'chirilmaydi" />
      </div>

      <div className="import-filter">
        <div className="tabs" role="tablist" aria-label="Qatorlar">
          {tabs.map((t, i) => (
            <button
              key={t.key}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              role="tab"
              id={`import-tab-${t.key}`}
              aria-selected={filtr === t.key}
              aria-controls="import-panel"
              tabIndex={filtr === t.key ? 0 : -1}
              className={filtr === t.key ? 'tab active' : 'tab'}
              onClick={() => select(t.key)}
              onKeyDown={(e) => onTabKey(e, i)}
            >
              {t.label} <span className="tab-count">{t.soni}</span>
            </button>
          ))}
        </div>
      </div>

      <div id="import-panel" role="tabpanel" aria-labelledby={`import-tab-${filtr}`}>
        {filtr === 'fayldaYoq' ? (
          <FayldaYoq reja={reja} />
        ) : qatorlar.length === 0 ? (
          <p className="pad muted">Bu yerda qator yo'q.</p>
        ) : (
          <>
            <table className="table import-rows import-changes">
              <thead>
                <tr>
                  <th className="num">Qator</th>
                  <th>Xonadon</th>
                  <th className="num">Qavat</th>
                  <th>Planirovka</th>
                  <th className="num">Narx, so'm</th>
                  <th>Holat</th>
                  <th>Amal</th>
                </tr>
              </thead>
              <tbody>
                {qatorlar.slice(0, korinadi).map((q) => (
                  <QatorRow key={q.qator} q={q} />
                ))}
              </tbody>
            </table>
            {qatorlar.length > korinadi && (
              <div className="import-more">
                <button onClick={() => setKorinadi((n) => n + SAHIFA)}>
                  Yana {Math.min(SAHIFA, qatorlar.length - korinadi)} ta ko'rsatish
                </button>
                <span className="muted small">
                  {korinadi} / {qatorlar.length}
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}

function QatorRow({ q }: { q: ImportQator }) {
  const o = q.ozgarishlar ?? [];
  return (
    <tr className={q.amal === 'ozgarishsiz' ? 'dim' : undefined}>
      <td className="num c-qator">{q.qator}</td>
      <td className="nowrap strong c-xonadon">
        {xonadonNomi(q.blok, q.raqam)}
        <span className="c-qavat-inline muted"> · {q.qavat}-qavat · {q.qator}-qator</span>
      </td>
      <td className="num c-qavat">{q.qavat}</td>
      <td className="c-pl">
        <Oldin show={o.includes('planirovka')} value={q.oldin?.planirovka} />
        <span className={o.includes('planirovka') ? 'changed' : undefined}>
          {q.xonalar} xona · {maydon(q.maydon)} m²{q.nomi ? ` · ${q.nomi}` : ''}
        </span>
        {q.yangiPlanirovka && <span className="badge amal-yangi tag">yangi</span>}
      </td>
      <td className="num nowrap c-narx">
        <Oldin show={o.includes('narx')} value={q.oldin?.narx === undefined ? undefined : narx(q.oldin.narx)} />
        <span className={o.includes('narx') ? 'changed' : undefined}>{narx(q.narx)}</span>
      </td>
      <td className="nowrap c-holat">
        {o.includes('holat') && q.oldin?.holat && (
          <>
            <HolatBadge holat={q.oldin.holat} />
            <span className="arrow">
              <Icon name="arrowRight" size={14} />
            </span>
          </>
        )}
        <HolatBadge holat={q.holat} />
      </td>
      <td className="c-amal">
        <span className={`badge amal-${q.amal}`}>{AMAL_LABEL[q.amal]}</span>
      </td>
    </tr>
  );
}

/** The value before the change, struck through, above the new one. */
function Oldin({ show, value }: { show: boolean; value: string | undefined }) {
  if (!show || value === undefined) return null;
  return (
    <s className="oldin">
      <span className="sr-only">edi: </span>
      {value}
    </s>
  );
}

/** A Xonadon without its own price shows the Planirovka's. */
const narx = (n: number | null) => (n === null ? 'Planirovka narxi' : soum(n));

function HolatBadge({ holat }: { holat: XonadonHolati }) {
  return <span className={`badge holat-${holat}`}>{XONADON_HOLATI_LABEL[holat]}</span>;
}

function FayldaYoq({ reja }: { reja: ImportReja }) {
  if (reja.fayldaYoq === 0)
    return <p className="pad muted">Loyihaning hamma Xonadonlari faylda bor.</p>;
  const rest = reja.fayldaYoq - reja.fayldaYoqlar.length;
  return (
    <>
      <p className="pad muted small">
        Bu Xonadonlar faylda yo'q. Import ularni o'zgartirmaydi va o'chirmaydi: kerak bo'lsa, «Xonadonlar» ekranida
        o'chiring.
      </p>
      <table className="table import-rows import-missing">
        <thead>
          <tr>
            <th>Xonadon</th>
            <th className="num">Qavat</th>
            <th>Holat</th>
          </tr>
        </thead>
        <tbody>
          {reja.fayldaYoqlar.map((x: ImportFayldaYoq) => (
            <tr key={`${x.blok}|${x.qavat}|${x.raqam}`}>
              <td className="nowrap strong">{xonadonNomi(x.blok, x.raqam)}</td>
              <td className="num">{x.qavat}</td>
              <td>
                <HolatBadge holat={x.holat} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rest > 0 && <p className="pad muted small">Yana {rest} ta Xonadon faylda yo'q.</p>}
    </>
  );
}

function Tayyor({ natija, onAgain }: { natija: ImportNatija; onAgain: () => void }) {
  const parts = [
    natija.yaratildi && `${natija.yaratildi} ta yangi Xonadon`,
    natija.yangilandi && `${natija.yangilandi} ta Xonadon yangilandi`,
    natija.yangiPlanirovkalar && `${natija.yangiPlanirovkalar} ta yangi Planirovka`,
    natija.yangiBloklar.length && `Blok: ${natija.yangiBloklar.join(', ')}`,
  ].filter(Boolean);
  return (
    <section className="card success reveal" role="status">
      <div>
        <h2 className="title">Import qilindi</h2>
        <p className="small">{parts.join(' · ')}. Mini App'da hozir ko'rinadi; har bir o'zgarish Jurnalda.</p>
      </div>
      <button onClick={onAgain}>Yana fayl yuklash</button>
    </section>
  );
}

function Stat({ label, value, tone, hint }: { label: string; value: number; tone?: 'free' | 'primary'; hint?: string }) {
  return (
    <div className="stat">
      <span className={tone ? `stat-label ${tone}` : 'stat-label'}>{label}</span>
      <strong className="stat-value">{value}</strong>
      {hint && <span className="muted small">{hint}</span>}
    </div>
  );
}
