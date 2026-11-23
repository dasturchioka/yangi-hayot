import {
  SHAHARLAR,
  type AdminBlokDto,
  type AdminLoyihaDto,
  type AdminLoyihaListItem,
  type AdminPlanirovkaDto,
  type LokalDto,
  type LoyihaHolati,
  type Shahar,
} from '@yh/shared';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { adminApi, errorText } from './api';
import { parseNumber, PLANIROVKA_HOLATI_LABEL, soum } from './format';

/**
 * «Loyihalar» (Administrator): create and edit Loyiha (holati Sotuvda /
 * Topshirilgan), its Bloklar and Planirovkalar. Counts of a new Planirovka
 * are set here; later moves happen in «Xonadonlar».
 */
export function LoyihalarScreen() {
  const [list, setList] = useState<AdminLoyihaListItem[]>([]);
  const [selected, setSelected] = useState<number | 'new' | null>(null);
  const [error, setError] = useState('');

  const reloadList = useCallback(async () => {
    try {
      setList((await adminApi<{ loyihalar: AdminLoyihaListItem[] }>('GET', '/katalog/loyihalar')).loyihalar);
    } catch (e) {
      setError(errorText(e));
    }
  }, []);

  useEffect(() => {
    void reloadList();
  }, [reloadList]);

  return (
    <div className="stack wide">
      <header className="row between">
        <div>
          <h1 className="h2">Loyihalar</h1>
          <p className="muted">Topshirilgan Loyihalar Mini App katalogida ko'rinmaydi</p>
        </div>
        <button className="primary" onClick={() => setSelected('new')}>
          + Loyiha
        </button>
      </header>
      {error && <p className="error">{error}</p>}

      <section className="card flush">
        <table className="table">
          <thead>
            <tr>
              <th>Nomi</th>
              <th>Shahar</th>
              <th>Holati</th>
              <th className="num">Bloklar</th>
              <th className="num">Planirovkalar</th>
              <th className="num">Bo'sh / jami</th>
            </tr>
          </thead>
          <tbody>
            {list.map((l) => (
              <tr key={l.id} className={selected === l.id ? 'selected clickable' : 'clickable'} onClick={() => setSelected(l.id)}>
                <td>
                  <strong>{l.nomi}</strong>
                </td>
                <td>{SHAHAR_LABEL[l.shahar]}</td>
                <td>
                  <span className={`badge ${l.holat === 'sotuvda' ? 'sotuvda' : 'sotilgan'}`}>{HOLAT_LABEL[l.holat]}</span>
                </td>
                <td className="num">{l.bloklarSoni}</td>
                <td className="num">{l.planirovkalarSoni}</td>
                <td className="num">
                  {l.bosh} / {l.jami}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {selected === 'new' && (
        <LoyihaForm
          onSaved={(l) => {
            void reloadList();
            setSelected(l.id);
          }}
        />
      )}
      {typeof selected === 'number' && <LoyihaEditor key={selected} id={selected} onChanged={reloadList} />}
    </div>
  );
}

const SHAHAR_LABEL: Record<Shahar, string> = { toshkent: 'Toshkent', navoiy: 'Navoiy' };
const HOLAT_LABEL: Record<LoyihaHolati, string> = { sotuvda: 'Sotuvda', topshirilgan: 'Topshirilgan' };

function LoyihaEditor({ id, onChanged }: { id: number; onChanged: () => void }) {
  const [loyiha, setLoyiha] = useState<AdminLoyihaDto | null>(null);
  const [error, setError] = useState('');
  const [blokNomi, setBlokNomi] = useState('');

  const reload = useCallback(async () => {
    try {
      setLoyiha((await adminApi<{ loyiha: AdminLoyihaDto }>('GET', `/katalog/loyihalar/${id}`)).loyiha);
    } catch (e) {
      setError(errorText(e));
    }
  }, [id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function addBlok(e: FormEvent) {
    e.preventDefault();
    try {
      await adminApi('POST', `/katalog/loyihalar/${id}/bloklar`, { nomi: blokNomi.trim() });
      setBlokNomi('');
      setError('');
      await reload();
      onChanged();
    } catch (err) {
      setError(errorText(err));
    }
  }

  if (!loyiha) return error ? <p className="error">{error}</p> : null;
  return (
    <>
      <LoyihaForm
        loyiha={loyiha}
        onSaved={(l) => {
          setLoyiha(l);
          onChanged();
        }}
      />
      <section className="card stack">
        <h2 className="title">Bloklar va Planirovkalar</h2>
        {error && <p className="error">{error}</p>}
        {loyiha.bloklar.map((b) => (
          <BlokEditor
            key={b.id}
            blok={b}
            onChanged={() => {
              void reload();
              onChanged();
            }}
          />
        ))}
        <form className="row" onSubmit={addBlok}>
          <label className="field">
            <span>Yangi Blok</span>
            <input placeholder="masalan, A" value={blokNomi} maxLength={20} onChange={(e) => setBlokNomi(e.target.value)} required />
          </label>
          <button>+ Blok</button>
        </form>
      </section>
    </>
  );
}

// ---- Loyiha form ----

const emptyLokal: LokalDto = { ru: '', uz: '' };
const lokalOrNull = (l: LokalDto) => (l.ru.trim() && l.uz.trim() ? { ru: l.ru.trim(), uz: l.uz.trim() } : null);

function LoyihaForm({ loyiha, onSaved }: { loyiha?: AdminLoyihaDto; onSaved: (l: AdminLoyihaDto) => void }) {
  const [nomi, setNomi] = useState(loyiha?.nomi ?? '');
  const [shahar, setShahar] = useState<Shahar>(loyiha?.shahar ?? 'toshkent');
  const [holat, setHolat] = useState<LoyihaHolati>(loyiha?.holat ?? 'sotuvda');
  const [manzil, setManzil] = useState<LokalDto>(loyiha?.manzil ?? emptyLokal);
  const [qisqa, setQisqa] = useState<LokalDto>(loyiha?.qisqaTavsif ?? emptyLokal);
  const [tavsif, setTavsif] = useState<LokalDto>(loyiha?.tavsif ?? emptyLokal);
  const [fotolar, setFotolar] = useState((loyiha?.fotolar ?? []).join('\n'));
  const [video, setVideo] = useState(loyiha?.video ?? '');
  const [qavatlar, setQavatlar] = useState(loyiha?.qavatlarSoni?.toString() ?? '');
  const [xarita, setXarita] = useState(loyiha?.xarita ? `${loyiha.xarita.lat}, ${loyiha.xarita.lng}` : '');
  const [tartib, setTartib] = useState(String(loyiha?.tartib ?? 0));
  const [korsatuv, setKorsatuv] = useState<LokalDto>(loyiha?.korsatuvManzili ?? emptyLokal);
  const [masul, setMasul] = useState(loyiha?.crmMasulId ?? '');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const coords = xarita.trim() ? xarita.split(',').map((s) => Number(s.trim())) : null;
    if (coords && (coords.length !== 2 || coords.some(Number.isNaN))) return setError('Xarita: "41.31, 69.27" ko\'rinishida');
    if (masul.trim() && !/^[0-9]{1,12}$/.test(masul.trim())) return setError("amoCRM mas'ul: foydalanuvchi ID raqami (faqat raqamlar)");
    const body = {
      nomi: nomi.trim(),
      shahar,
      holat,
      manzil: { ru: manzil.ru.trim(), uz: manzil.uz.trim() },
      qisqaTavsif: lokalOrNull(qisqa),
      tavsif: lokalOrNull(tavsif),
      fotolar: fotolar
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean),
      video: video.trim() || null,
      qavatlarSoni: qavatlar.trim() ? Number(qavatlar) : null,
      xarita: coords ? { lat: coords[0]!, lng: coords[1]! } : null,
      tartib: Number(tartib) || 0,
      korsatuvManzili: lokalOrNull(korsatuv),
      crmMasulId: masul.trim() || null,
    };
    try {
      const res = loyiha
        ? await adminApi<{ loyiha: AdminLoyihaDto }>('PATCH', `/katalog/loyihalar/${loyiha.id}`, body)
        : await adminApi<{ loyiha: AdminLoyihaDto }>('POST', '/katalog/loyihalar', body);
      setError('');
      setSaved(true);
      onSaved(res.loyiha);
    } catch (err) {
      setError(errorText(err));
      setSaved(false);
    }
  }

  return (
    <form className="card stack" onSubmit={submit} onChange={() => setSaved(false)}>
      <h2 className="title">{loyiha ? loyiha.nomi : 'Yangi Loyiha'}</h2>
      <div className="row">
        <label className="field grow">
          <span>Nomi</span>
          <input value={nomi} onChange={(e) => setNomi(e.target.value)} required maxLength={100} />
        </label>
        <label className="field">
          <span>Shahar</span>
          <select value={shahar} onChange={(e) => setShahar(e.target.value as Shahar)}>
            {SHAHARLAR.map((s) => (
              <option key={s} value={s}>
                {SHAHAR_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Holati</span>
          <select value={holat} onChange={(e) => setHolat(e.target.value as LoyihaHolati)}>
            <option value="sotuvda">Sotuvda</option>
            <option value="topshirilgan">Topshirilgan</option>
          </select>
        </label>
      </div>
      <LokalField label="Manzil" value={manzil} onChange={setManzil} required />
      <LokalField label="Qisqa tavsif" value={qisqa} onChange={setQisqa} />
      <LokalField label="Tavsif" value={tavsif} onChange={setTavsif} multiline />
      <div className="row">
        <label className="field grow">
          <span>Video (t.me yoki YouTube havolasi)</span>
          <input value={video} onChange={(e) => setVideo(e.target.value)} placeholder="https://t.me/..." />
        </label>
        <label className="field">
          <span>Qavatlar soni</span>
          <input inputMode="numeric" value={qavatlar} onChange={(e) => setQavatlar(e.target.value)} />
        </label>
        <label className="field">
          <span>Xarita (lat, lng)</span>
          <input value={xarita} onChange={(e) => setXarita(e.target.value)} placeholder="41.31, 69.27" />
        </label>
        <label className="field">
          <span>Tartib</span>
          <input inputMode="numeric" value={tartib} onChange={(e) => setTartib(e.target.value)} />
        </label>
      </div>
      <LokalField
        label="Ko'rsatuv manzili (bo'sh bo'lsa — Loyiha manzili; ko'rishga yozilganlarga shu ko'rsatiladi)"
        value={korsatuv}
        onChange={setKorsatuv}
      />
      <label className="field">
        <span>amoCRM'dagi Loyiha mas'uli (foydalanuvchi ID). Yangi Bitim va «Uchrashuv» vazifasi shunga tushadi</span>
        <input inputMode="numeric" value={masul} onChange={(e) => setMasul(e.target.value)} placeholder="Masalan, 8123456" />
      </label>
      <label className="field">
        <span>Fotolar (har qatorda bitta havola yoki /media/... yo'l)</span>
        <textarea rows={3} value={fotolar} onChange={(e) => setFotolar(e.target.value)} />
      </label>
      {error && <p className="error">{error}</p>}
      <div className="row">
        <button className="primary">{loyiha ? 'Saqlash' : 'Yaratish'}</button>
        {saved && <span className="muted">Saqlandi</span>}
      </div>
    </form>
  );
}

function LokalField({
  label,
  value,
  onChange,
  required,
  multiline,
}: {
  label: string;
  value: LokalDto;
  onChange: (v: LokalDto) => void;
  required?: boolean;
  multiline?: boolean;
}) {
  return (
    <div className="row">
      {(['uz', 'ru'] as const).map((lang) => (
        <label key={lang} className="field grow">
          <span>
            {label} ({lang.toUpperCase()})
          </span>
          {multiline ? (
            <textarea rows={3} value={value[lang]} onChange={(e) => onChange({ ...value, [lang]: e.target.value })} />
          ) : (
            <input value={value[lang]} required={required} onChange={(e) => onChange({ ...value, [lang]: e.target.value })} />
          )}
        </label>
      ))}
    </div>
  );
}

// ---- Blok and its Planirovkalar ----

function BlokEditor({ blok, onChanged }: { blok: AdminBlokDto; onChanged: () => void }) {
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const [nomi, setNomi] = useState(blok.nomi);
  const [error, setError] = useState('');

  async function rename() {
    if (nomi.trim() === blok.nomi) return;
    try {
      await adminApi('PATCH', `/katalog/bloklar/${blok.id}`, { nomi: nomi.trim() });
      setError('');
      onChanged();
    } catch (e) {
      setError(errorText(e));
    }
  }

  return (
    <div className="blok stack">
      <div className="row">
        <label className="field">
          <span>Blok</span>
          <input className="short" value={nomi} maxLength={20} onChange={(e) => setNomi(e.target.value)} onBlur={rename} />
        </label>
        <button onClick={() => setEditing('new')}>+ Planirovka</button>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="cards">
        {blok.planirovkalar.map((p) =>
          editing === p.id ? (
            <PlanirovkaForm
              key={p.id}
              blokId={blok.id}
              planirovka={p}
              onDone={() => {
                setEditing(null);
                onChanged();
              }}
              onCancel={() => setEditing(null)}
            />
          ) : (
            <PlanirovkaCard key={p.id} p={p} onEdit={() => setEditing(p.id)} />
          ),
        )}
        {editing === 'new' && (
          <PlanirovkaForm
            blokId={blok.id}
            onDone={() => {
              setEditing(null);
              onChanged();
            }}
            onCancel={() => setEditing(null)}
          />
        )}
      </div>
    </div>
  );
}

/** Planirovka card as in the UI kit (no qavat / xonadon raqami). */
function PlanirovkaCard({ p, onEdit }: { p: AdminPlanirovkaDto; onEdit: () => void }) {
  return (
    <button className={`pcard ${p.holat}`} onClick={onEdit} title="Tahrirlash">
      {p.chizma ? <img src={p.chizma} alt="" loading="lazy" /> : <span className="pcard-noimg">Chizma yo'q</span>}
      <span className="pcard-body">
        <span className="pcard-title">
          {p.xonalar} xona · {p.maydon} m²{p.nomi ? ` · ${p.nomi.uz}` : ''}
        </span>
        <span className="pcard-price">
          {p.boshlangichNarx === null ? "Narx so'rov bo'yicha" : `${soum(p.boshlangichNarx)} so'mdan`}
        </span>
        <span className="row tight">
          <span className={`badge ${p.holat}`}>{PLANIROVKA_HOLATI_LABEL[p.holat]}</span>
          <span className="muted small">
            {p.bosh} bo'sh · {p.bron} bron · {p.sotilgan} sotilgan · jami {p.jami}
          </span>
        </span>
        {p.video && <span className="muted small">Video bor</span>}
      </span>
    </button>
  );
}

function PlanirovkaForm({
  blokId,
  planirovka: p,
  onDone,
  onCancel,
}: {
  blokId: number;
  planirovka?: AdminPlanirovkaDto;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [xonalar, setXonalar] = useState(String(p?.xonalar ?? 1));
  const [maydon, setMaydon] = useState(String(p?.maydon ?? ''));
  const [nomi, setNomi] = useState<LokalDto>(p?.nomi ?? emptyLokal);
  const [chizma, setChizma] = useState(p?.chizma ?? '');
  const [video, setVideo] = useState(p?.video ?? '');
  const [narx, setNarx] = useState(p?.boshlangichNarx?.toString() ?? '');
  const [bosh, setBosh] = useState('0');
  const [bron, setBron] = useState('0');
  const [sotilgan, setSotilgan] = useState('0');
  const [jami, setJami] = useState(String(p?.jami ?? 0));
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    const n = parseNumber(narx);
    const m = parseNumber(maydon);
    if (Number.isNaN(n) || m === null || Number.isNaN(m)) return setError("Maydon va narx raqam bo'lishi kerak");
    const fields = {
      xonalar: Number(xonalar),
      maydon: m,
      nomi: lokalOrNull(nomi),
      chizma: chizma.trim() || null,
      video: video.trim() || null,
      boshlangichNarx: n === null ? null : Math.round(n),
    };
    try {
      if (p) await adminApi('PATCH', `/katalog/planirovkalar/${p.id}`, { ...fields, jami: Number(jami) });
      else
        await adminApi('POST', `/katalog/bloklar/${blokId}/planirovkalar`, {
          ...fields,
          bosh: Number(bosh),
          bron: Number(bron),
          sotilgan: Number(sotilgan),
        });
      onDone();
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <form className="card stack pform" onSubmit={submit}>
      <div className="row">
        <label className="field">
          <span>Xonalar</span>
          <input className="short" type="number" min={1} max={20} value={xonalar} onChange={(e) => setXonalar(e.target.value)} required />
        </label>
        <label className="field">
          <span>Maydon, m²</span>
          <input className="short" inputMode="decimal" value={maydon} onChange={(e) => setMaydon(e.target.value)} required />
        </label>
        <label className="field grow">
          <span>Boshlang'ich narx, so'm (bo'sh = so'rov bo'yicha)</span>
          <input inputMode="numeric" value={narx} onChange={(e) => setNarx(e.target.value)} />
        </label>
      </div>
      <LokalField label="Nomi (ixtiyoriy, masalan «Burchak»)" value={nomi} onChange={setNomi} />
      <div className="row">
        <label className="field grow">
          <span>Chizma (havola yoki /media/... yo'l)</span>
          <input value={chizma} onChange={(e) => setChizma(e.target.value)} />
        </label>
        <label className="field grow">
          <span>Video (t.me yoki YouTube)</span>
          <input value={video} onChange={(e) => setVideo(e.target.value)} />
        </label>
      </div>
      {p ? (
        <label className="field">
          <span>Jami (bo'sh soni farqqa o'zgaradi)</span>
          <input className="short" type="number" min={0} value={jami} onChange={(e) => setJami(e.target.value)} />
        </label>
      ) : (
        <div className="row">
          {(
            [
              ["Bo'sh", bosh, setBosh],
              ['Bron', bron, setBron],
              ['Sotilgan', sotilgan, setSotilgan],
            ] as const
          ).map(([label, v, set]) => (
            <label key={label} className="field">
              <span>{label}</span>
              <input className="short" type="number" min={0} value={v} onChange={(e) => set(e.target.value)} />
            </label>
          ))}
        </div>
      )}
      {error && <p className="error">{error}</p>}
      <div className="row">
        <button className="primary">{p ? 'Saqlash' : "Qo'shish"}</button>
        <button type="button" onClick={onCancel}>
          Bekor
        </button>
      </div>
    </form>
  );
}
