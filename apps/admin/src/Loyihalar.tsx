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
import { Select } from '@yh/ui/select';
import { RasmlarYuklash, RasmYuklash } from './RasmYuklash';
import { SaveBar, useDirty, type SaveState } from './controls';
import { Icon } from './icons';
import { Modal, ModalForm } from './Modal';

/**
 * «Loyihalar» (Administrator): create and edit Loyiha (holati Sotuvda /
 * Topshirilgan), its Bloklar and Planirovkalar. Counts of a new Planirovka
 * are set here; later moves happen in «Xonadonlar».
 */
export function LoyihalarScreen() {
  const [list, setList] = useState<AdminLoyihaListItem[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
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
        <button className="primary with-icon" onClick={() => setCreating(true)}>
          <Icon name="plus" size={18} />
          Loyiha
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

      <Modal open={creating} onClose={() => setCreating(false)} title="Yangi Loyiha" size="lg">
        <LoyihaForm
          onSaved={(l) => {
            void reloadList();
            setCreating(false);
            setSelected(l.id);
          }}
        />
      </Modal>
      {selected !== null && <LoyihaEditor key={selected} id={selected} onChanged={reloadList} />}
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
          <button className="with-icon">
            <Icon name="plus" size={16} />
            Blok
          </button>
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
  const [fotolar, setFotolar] = useState<string[]>(loyiha?.fotolar ?? []);
  const [video, setVideo] = useState(loyiha?.video ?? '');
  const [qavatlar, setQavatlar] = useState(loyiha?.qavatlarSoni?.toString() ?? '');
  const [xarita, setXarita] = useState(loyiha?.xarita ? `${loyiha.xarita.lat}, ${loyiha.xarita.lng}` : '');
  const [tartib, setTartib] = useState(String(loyiha?.tartib ?? 0));
  const [korsatuv, setKorsatuv] = useState<LokalDto>(loyiha?.korsatuvManzili ?? emptyLokal);
  const [masul, setMasul] = useState(loyiha?.crmMasulId ?? '');
  const [state, setState] = useState<SaveState>({ kind: 'idle' });
  const { dirty, rebase } = useDirty([nomi, shahar, holat, manzil, qisqa, tavsif, fotolar, video, qavatlar, xarita, tartib, korsatuv, masul]);
  const setError = (text: string) => setState({ kind: 'error', text });

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
      fotolar,
      video: video.trim() || null,
      qavatlarSoni: qavatlar.trim() ? Number(qavatlar) : null,
      xarita: coords ? { lat: coords[0]!, lng: coords[1]! } : null,
      tartib: Number(tartib) || 0,
      korsatuvManzili: lokalOrNull(korsatuv),
      crmMasulId: masul.trim() || null,
    };
    setState({ kind: 'saving' });
    try {
      const res = loyiha
        ? await adminApi<{ loyiha: AdminLoyihaDto }>('PATCH', `/katalog/loyihalar/${loyiha.id}`, body)
        : await adminApi<{ loyiha: AdminLoyihaDto }>('POST', '/katalog/loyihalar', body);
      rebase();
      setState({ kind: 'saved' });
      onSaved(res.loyiha);
    } catch (err) {
      setError(errorText(err));
    }
  }

  const fields = (
    <>
      <div className="row">
        <label className="field grow">
          <span>Nomi</span>
          <input value={nomi} onChange={(e) => setNomi(e.target.value)} required maxLength={100} />
        </label>
        <Select
          label="Shahar"
          value={shahar}
          options={SHAHARLAR.map((s) => ({ value: s, label: SHAHAR_LABEL[s] }))}
          onChange={setShahar}
        />
        <Select<LoyihaHolati>
          label="Holati"
          value={holat}
          options={[
            { value: 'sotuvda', label: 'Sotuvda' },
            { value: 'topshirilgan', label: 'Topshirilgan' },
          ]}
          onChange={setHolat}
        />
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
      <RasmlarYuklash label="Fotolar" value={fotolar} onChange={setFotolar} />
    </>
  );

  // New Loyiha: in a modal. Existing one: the editor card under the list, saved with the common save bar.
  if (!loyiha) {
    return (
      <ModalForm
        onSubmit={submit}
        busy={state.kind === 'saving'}
        error={state.kind === 'error' ? state.text : undefined}
        submitLabel="Yaratish"
      >
        {fields}
      </ModalForm>
    );
  }
  return (
    <form className="card stack" onSubmit={submit} onChange={() => setState((s) => (s.kind === 'saved' ? { kind: 'idle' } : s))}>
      <h2 className="title">{loyiha.nomi}</h2>
      {fields}
      <SaveBar state={state} dirty={dirty} />
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
  // The modal keeps showing its Planirovka while it closes (editing is already null then).
  const [shownId, setShownId] = useState<number | 'new' | null>(null);
  if (editing !== null && editing !== shownId) setShownId(editing);
  const shown = typeof shownId === 'number' ? blok.planirovkalar.find((p) => p.id === shownId) : undefined;
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
        <button className="with-icon" onClick={() => setEditing('new')}>
          <Icon name="plus" size={16} />
          Planirovka
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="cards">
        {blok.planirovkalar.map((p) => (
          <PlanirovkaCard key={p.id} p={p} onEdit={() => setEditing(p.id)} />
        ))}
      </div>
      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' || !shown ? 'Yangi Planirovka' : planirovkaTitle(shown)}
        description={`${blok.nomi} blok`}
      >
        <PlanirovkaForm
          blokId={blok.id}
          planirovka={shown}
          onDone={() => {
            setEditing(null);
            onChanged();
          }}
        />
      </Modal>
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

const planirovkaTitle = (p: AdminPlanirovkaDto) => `${p.xonalar} xona · ${p.maydon} m²${p.nomi ? ` · ${p.nomi.uz}` : ''}`;

/** Add (no planirovka) or edit a Planirovka; rendered inside a <Modal>. */
function PlanirovkaForm({
  blokId,
  planirovka: p,
  onDone,
}: {
  blokId: number;
  planirovka?: AdminPlanirovkaDto;
  onDone: () => void;
}) {
  const [xonalar, setXonalar] = useState(String(p?.xonalar ?? 1));
  const [maydon, setMaydon] = useState(String(p?.maydon ?? ''));
  const [nomi, setNomi] = useState<LokalDto>(p?.nomi ?? emptyLokal);
  const [chizma, setChizma] = useState<string | null>(p?.chizma ?? null);
  const [video, setVideo] = useState(p?.video ?? '');
  const [narx, setNarx] = useState(p?.qoldaNarx?.toString() ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    const n = parseNumber(narx);
    const m = parseNumber(maydon);
    if (Number.isNaN(n) || m === null || Number.isNaN(m)) return setError("Maydon va narx raqam bo'lishi kerak");
    const fields = {
      xonalar: Number(xonalar),
      maydon: m,
      nomi: lokalOrNull(nomi),
      chizma,
      video: video.trim() || null,
      qoldaNarx: n === null ? null : Math.round(n),
    };
    setBusy(true);
    try {
      if (p) await adminApi('PATCH', `/katalog/planirovkalar/${p.id}`, fields);
      else await adminApi('POST', `/katalog/bloklar/${blokId}/planirovkalar`, fields);
      setBusy(false);
      onDone();
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <ModalForm onSubmit={submit} busy={busy} error={error || undefined} submitLabel={p ? 'Saqlash' : "Qo'shish"}>
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
          <span>Planirovka narxi, so'm — Xonadonlarda narx bo'lmasa ko'rinadi</span>
          <input inputMode="numeric" value={narx} onChange={(e) => setNarx(e.target.value)} />
        </label>
      </div>
      <LokalField label="Nomi (ixtiyoriy, masalan «Burchak»)" value={nomi} onChange={setNomi} />
      <RasmYuklash label="Chizma" value={chizma} onChange={setChizma} />
      <div className="row">
        <label className="field grow">
          <span>Video (t.me yoki YouTube)</span>
          <input value={video} onChange={(e) => setVideo(e.target.value)} />
        </label>
      </div>
      <p className="muted small">
        Bo'sh / bron / sotilgan soni Xonadonlardan hisoblanadi: ularni «Xonadonlar» bo'limida qo'shing va o'zgartiring.
      </p>
    </ModalForm>
  );
}
