import {
  XONADON_HOLATLARI,
  type AdminDto,
  type AdminLoyihaDto,
  type AdminLoyihaListItem,
  type AdminPlanirovkaDto,
  type PlanirovkaHolati,
  type XonadonHolati,
} from '@yh/shared';
import { Fragment, useCallback, useEffect, useState } from 'react';
import { adminApi, errorText } from './api';
import { parseNumber, PLANIROVKA_HOLATI_LABEL, qachon, soum, XONADON_HOLATI_LABEL } from './format';
import { Select } from '@yh/ui/select';

/**
 * «Xonadonlar» (UI kit, admin page 2), Planirovka level (ADR 0001): no № and
 * qavat columns. Each row is a Planirovka with its bo'sh / bron / sotilgan
 * counts. Menejer moves Xonadonlar between them; Administrator also edits the
 * price and jami.
 */
export function XonadonlarScreen({ admin }: { admin: AdminDto }) {
  const isAdmin = admin.rol === 'administrator';
  const [loyihalar, setLoyihalar] = useState<AdminLoyihaListItem[]>([]);
  const [loyihaId, setLoyihaId] = useState<number | null>(null);
  const [loyiha, setLoyiha] = useState<AdminLoyihaDto | null>(null);
  const [blokId, setBlokId] = useState<number | null>(null);
  const [filter, setFilter] = useState<'' | PlanirovkaHolati>('');
  const [error, setError] = useState('');

  useEffect(() => {
    adminApi<{ loyihalar: AdminLoyihaListItem[] }>('GET', '/katalog/loyihalar')
      .then((r) => {
        setLoyihalar(r.loyihalar);
        setLoyihaId((id) => id ?? r.loyihalar.find((l) => l.holat === 'sotuvda')?.id ?? r.loyihalar[0]?.id ?? null);
      })
      .catch((e) => setError(errorText(e)));
  }, []);

  const reload = useCallback(async () => {
    if (loyihaId === null) return;
    try {
      const { loyiha } = await adminApi<{ loyiha: AdminLoyihaDto }>('GET', `/katalog/loyihalar/${loyihaId}`);
      setLoyiha(loyiha);
      setBlokId((id) => (loyiha.bloklar.some((b) => b.id === id) ? id : (loyiha.bloklar[0]?.id ?? null)));
      setError('');
    } catch (e) {
      setError(errorText(e));
    }
  }, [loyihaId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  /** Puts the changed Planirovka into the tree without reloading. */
  function replace(p: AdminPlanirovkaDto) {
    setLoyiha((l) =>
      l && {
        ...l,
        bloklar: l.bloklar.map((b) => ({
          ...b,
          planirovkalar: b.planirovkalar.map((x) => (x.id === p.id ? p : x)),
        })),
      },
    );
  }

  const all = loyiha?.bloklar.flatMap((b) => b.planirovkalar) ?? [];
  const sum = (k: 'bosh' | 'bron' | 'sotilgan' | 'jami') => all.reduce((s, p) => s + p[k], 0);
  const blok = loyiha?.bloklar.find((b) => b.id === blokId);
  const rows = (blok?.planirovkalar ?? []).filter((p) => !filter || p.holat === filter);

  return (
    <div className="stack wide">
      <header className="row between">
        <div>
          <h1 className="h2">Xonadonlar</h1>
          <p className="muted">Holat va narx o'zgarishi Mini App'da 1 daqiqada ko'rinadi</p>
        </div>
        <Select
          label="Loyiha"
          value={loyihaId ?? null}
          options={loyihalar.map((l) => ({
            value: l.id,
            label: l.nomi,
            hint: l.holat === 'topshirilgan' ? 'Topshirilgan' : undefined,
          }))}
          onChange={setLoyihaId}
        />
      </header>

      {error && <p className="error">{error}</p>}

      <div className="stats">
        <Stat label="Jami" value={sum('jami')} />
        <Stat label="Bo'sh" value={sum('bosh')} tone="free" />
        <Stat label="Bron" value={sum('bron')} tone="reserved" />
        <Stat label="Sotilgan" value={sum('sotilgan')} tone="sold" />
      </div>

      <section className="card flush">
        <div className="row toolbar">
          <div className="tabs" role="tablist">
            {loyiha?.bloklar.map((b) => (
              <button
                key={b.id}
                role="tab"
                aria-selected={b.id === blokId}
                className={b.id === blokId ? 'tab active' : 'tab'}
                onClick={() => setBlokId(b.id)}
              >
                {b.nomi} blok
              </button>
            ))}
          </div>
          <Select<'' | PlanirovkaHolati>
            aria-label="Holat"
            value={filter}
            options={[
              { value: '', label: 'Holat: hammasi' },
              ...(['sotuvda', 'band', 'sotilgan'] as const).map((h) => ({ value: h, label: PLANIROVKA_HOLATI_LABEL[h] })),
            ]}
            onChange={setFilter}
          />
        </div>

        {loyiha && loyiha.bloklar.length === 0 && (
          <p className="muted pad">Bu Loyihada hali Blok yo'q. «Loyihalar» bo'limida qo'shing.</p>
        )}

        {rows.length > 0 && (
          <table className="table">
            <thead>
              <tr>
                <th>Xonalar</th>
                <th>Maydon</th>
                <th>Nomi</th>
                <th>Narx, so'm</th>
                <th className="num">Bo'sh</th>
                <th className="num">Bron</th>
                <th className="num">Sotilgan</th>
                <th className="num">Jami</th>
                <th>Holat</th>
                <th>Oxirgi o'zgarish</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <PlanirovkaRow key={p.id} p={p} isAdmin={isAdmin} onChanged={replace} onError={setError} />
              ))}
            </tbody>
          </table>
        )}
        {blok && (
          <p className="muted small pad">
            {blok.nomi} blok · {blok.planirovkalar.length} ta Planirovka ·{' '}
            {blok.planirovkalar.reduce((s, p) => s + p.jami, 0)} ta xonadon
          </p>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'free' | 'reserved' | 'sold' }) {
  return (
    <div className="card stat">
      <span className={tone ? `stat-label ${tone}` : 'stat-label'}>{label}</span>
      <strong className="stat-value">{value}</strong>
    </div>
  );
}

function PlanirovkaRow({
  p,
  isAdmin,
  onChanged,
  onError,
}: {
  p: AdminPlanirovkaDto;
  isAdmin: boolean;
  onChanged: (p: AdminPlanirovkaDto) => void;
  onError: (e: string) => void;
}) {
  const [moving, setMoving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [narx, setNarx] = useState('');
  const [jami, setJami] = useState('');
  const [dan, setDan] = useState<XonadonHolati>('bosh');
  const [ga, setGa] = useState<XonadonHolati>('bron');
  const [soni, setSoni] = useState('1');
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<{ planirovka: AdminPlanirovkaDto }>) {
    setBusy(true);
    try {
      onChanged((await fn()).planirovka);
      onError('');
      setMoving(false);
      setEditing(false);
    } catch (e) {
      onError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  function startEdit() {
    setNarx(p.boshlangichNarx === null ? '' : String(p.boshlangichNarx));
    setJami(String(p.jami));
    setEditing(true);
  }

  function saveEdit() {
    const n = parseNumber(narx);
    const j = parseNumber(jami);
    if (Number.isNaN(n) || j === null || Number.isNaN(j)) return onError("Narx va jami raqam bo'lishi kerak");
    void run(() =>
      adminApi('PATCH', `/katalog/planirovkalar/${p.id}`, { boshlangichNarx: n === null ? null : Math.round(n), jami: j }),
    );
  }

  function move() {
    const n = Number(soni);
    if (!Number.isInteger(n) || n < 1 || dan === ga) return onError('Soni va holatlarni tekshiring');
    void run(() => adminApi('POST', `/katalog/planirovkalar/${p.id}/kochirish`, { dan, ga, soni: n }));
  }

  return (
    <Fragment>
      <tr className={p.holat === 'sotilgan' ? 'dim' : undefined}>
        <td>{p.xonalar} xona</td>
        <td>{p.maydon} m²</td>
        <td>{p.nomi?.uz ?? '—'}</td>
        <td>
          {editing ? (
            <input
              className="cell-input"
              inputMode="numeric"
              placeholder="So'rov bo'yicha"
              value={narx}
              onChange={(e) => setNarx(e.target.value)}
            />
          ) : (
            soum(p.boshlangichNarx)
          )}
        </td>
        <td className="num">{p.bosh}</td>
        <td className="num">{p.bron}</td>
        <td className="num">{p.sotilgan}</td>
        <td className="num">
          {editing ? (
            <input className="cell-input short" inputMode="numeric" value={jami} onChange={(e) => setJami(e.target.value)} />
          ) : (
            p.jami
          )}
        </td>
        <td>
          <span className={`badge ${p.holat}`}>{PLANIROVKA_HOLATI_LABEL[p.holat]}</span>
        </td>
        <td className="muted small">{p.oxirgiOzgarish ? `${p.oxirgiOzgarish.nomi} · ${qachon(p.oxirgiOzgarish.at)}` : '—'}</td>
        <td className="actions">
          {editing ? (
            <>
              <button className="link" disabled={busy} onClick={saveEdit}>
                Saqlash
              </button>
              <button className="link muted" onClick={() => setEditing(false)}>
                Bekor
              </button>
            </>
          ) : (
            <>
              <button className="link" onClick={() => setMoving((m) => !m)}>
                Ko'chirish
              </button>
              {isAdmin && (
                <button className="link" onClick={startEdit}>
                  Narx / jami
                </button>
              )}
            </>
          )}
        </td>
      </tr>
      {moving && (
        <tr className="sub">
          <td colSpan={11}>
            <div className="row">
              <input
                className="cell-input short"
                type="number"
                min={1}
                aria-label="Soni"
                value={soni}
                onChange={(e) => setSoni(e.target.value)}
              />
              <span>ta xonadon</span>
              <Select
                size="sm"
                aria-label="Qaysi holatdan"
                value={dan}
                options={XONADON_HOLATLARI.map((h) => ({ value: h, label: `${XONADON_HOLATI_LABEL[h]} (${p[h]})` }))}
                onChange={setDan}
              />
              <span>→</span>
              <Select
                size="sm"
                aria-label="Qaysi holatga"
                value={ga}
                options={XONADON_HOLATLARI.map((h) => ({ value: h, label: XONADON_HOLATI_LABEL[h] }))}
                onChange={setGa}
              />
              <button className="primary small" disabled={busy} onClick={move}>
                Saqlash
              </button>
              <span className="muted small">Jami o'zgarmaydi: {p.jami}</span>
            </div>
          </td>
        </tr>
      )}
    </Fragment>
  );
}
