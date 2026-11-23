import {
  XONADON_HOLATLARI,
  type AdminBlokXonadonlarResponse,
  type AdminDto,
  type AdminLoyihaDto,
  type AdminLoyihaListItem,
  type AdminPlanirovkaDto,
  type AdminXonadonDto,
  type XonadonHolati,
} from '@yh/shared';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { adminApi, errorText } from './api';
import { parseNumber, qachon, soum, XONADON_HOLATI_LABEL } from './format';
import { Icon } from './icons';
import { Select, type SelectOption } from '@yh/ui/select';
import '@yh/ui/select.css';
import './xonadonlar.css';

/**
 * «Xonadonlar» (UI kit, admin page 2; ADR 0003). One Blok at a time, one
 * qavat at a time (search and the holat filter look through the whole Blok).
 * The left column is the Blok's shaxmatka in miniature: every Xonadon a dot in
 * its holat colour, every row a qavat — it shows the state at a glance and
 * picks the qavat.
 *
 * Menejer changes holat (one, or several ticked at once). Administrator also
 * adds, edits (qavat, raqam, Planirovka, narx) and removes Xonadonlar.
 */
export function XonadonlarScreen({ admin, onImport }: { admin: AdminDto; onImport?: () => void }) {
  const isAdmin = admin.rol === 'administrator';
  const [loyihalar, setLoyihalar] = useState<AdminLoyihaListItem[]>([]);
  const [loyihaId, setLoyihaId] = useState<number | null>(null);
  const [loyiha, setLoyiha] = useState<AdminLoyihaDto | null>(null);
  const [blokId, setBlokId] = useState<number | null>(null);
  const [data, setData] = useState<AdminBlokXonadonlarResponse | null>(null);
  const [qavat, setQavat] = useState<number | null>(null);
  const [qidiruv, setQidiruv] = useState('');
  const [filtr, setFiltr] = useState<'' | XonadonHolati>('');
  const [tanlangan, setTanlangan] = useState<Set<number>>(new Set());
  const [qoshish, setQoshish] = useState(false);
  const [error, setError] = useState('');
  /** Last status change, undoable for a few seconds (a wrong tap between calls is easy). */
  const [oxirgi, setOxirgi] = useState<{ matn: string; oldin: Map<number, XonadonHolati>; key: number } | null>(null);

  useEffect(() => {
    if (!oxirgi) return;
    const t = setTimeout(() => setOxirgi(null), 6000);
    return () => clearTimeout(t);
  }, [oxirgi]);

  const loadLoyihalar = useCallback(async () => {
    const r = await adminApi<{ loyihalar: AdminLoyihaListItem[] }>('GET', '/katalog/loyihalar');
    setLoyihalar(r.loyihalar);
    setLoyihaId((id) => id ?? r.loyihalar.find((l) => l.holat === 'sotuvda')?.id ?? r.loyihalar[0]?.id ?? null);
  }, []);

  useEffect(() => {
    loadLoyihalar().catch((e) => setError(errorText(e)));
  }, [loadLoyihalar]);

  useEffect(() => {
    if (loyihaId === null) return;
    adminApi<{ loyiha: AdminLoyihaDto }>('GET', `/katalog/loyihalar/${loyihaId}`)
      .then(({ loyiha }) => {
        setLoyiha(loyiha);
        setBlokId((id) => (loyiha.bloklar.some((b) => b.id === id) ? id : (loyiha.bloklar[0]?.id ?? null)));
      })
      .catch((e) => setError(errorText(e)));
  }, [loyihaId]);

  const loadBlok = useCallback(async () => {
    if (blokId === null) return setData(null);
    const r = await adminApi<AdminBlokXonadonlarResponse>('GET', `/katalog/bloklar/${blokId}/xonadonlar`);
    setData(r);
    setQavat((q) => (q !== null && r.xonadonlar.some((x) => x.qavat === q) ? q : (r.xonadonlar[0]?.qavat ?? null)));
  }, [blokId]);

  useEffect(() => {
    setTanlangan(new Set());
    setQoshish(false);
    loadBlok().catch((e) => setError(errorText(e)));
  }, [loadBlok]);

  /** After a write: the changed rows in place, then counts and «oxirgi o'zgarish» fresh from the server. */
  async function applied(changed: AdminXonadonDto[]) {
    setData((d) => d && { ...d, xonadonlar: d.xonadonlar.map((x) => changed.find((c) => c.id === x.id) ?? x) });
    setError('');
    await Promise.all([loadBlok(), loadLoyihalar()]).catch((e) => setError(errorText(e)));
  }

  async function setHolat(ids: number[], holat: XonadonHolati, undo = false) {
    const oldin = new Map(all.filter((x) => ids.includes(x.id)).map((x) => [x.id, x.holat]));
    try {
      const { xonadonlar } = await adminApi<{ xonadonlar: AdminXonadonDto[] }>('POST', '/katalog/xonadonlar/holat', {
        ids,
        holat,
      });
      setTanlangan(new Set());
      const nomi = ids.length === 1 ? `${blokNomi}-${all.find((x) => x.id === ids[0])?.raqam}` : `${ids.length} ta xonadon`;
      setOxirgi(undo ? null : { matn: `${nomi} → ${XONADON_HOLATI_LABEL[holat]}`, oldin, key: Date.now() });
      await applied(xonadonlar);
    } catch (e) {
      setError(errorText(e));
    }
  }

  async function qaytar() {
    if (!oxirgi) return;
    const guruh = new Map<XonadonHolati, number[]>();
    for (const [id, h] of oxirgi.oldin) guruh.set(h, [...(guruh.get(h) ?? []), id]);
    setOxirgi(null);
    for (const [h, ids] of guruh) await setHolat(ids, h, true);
  }

  const blok = loyiha?.bloklar.find((b) => b.id === blokId);
  const blokNomi = data?.blok.nomi ?? blok?.nomi ?? '';
  const planirovkalar = data?.planirovkalar ?? [];
  const planirovkaById = useMemo(() => new Map(planirovkalar.map((p) => [p.id, p])), [planirovkalar]);
  const all = data?.xonadonlar ?? [];
  const qavatlar = useMemo(() => [...new Set(all.map((x) => x.qavat))].sort((a, b) => b - a), [all]);
  const izlash = qidiruv.trim() !== '' || filtr !== '';
  const rows = all.filter((x) =>
    izlash
      ? (!filtr || x.holat === filtr) && raqamMos(x.raqam, blokNomi, qidiruv)
      : x.qavat === qavat,
  );
  const stats = loyihalar.find((l) => l.id === loyihaId);
  const ticked = rows.filter((x) => tanlangan.has(x.id));
  const qavatIndex = qavat === null ? -1 : qavatlar.indexOf(qavat);

  function toggleAll() {
    setTanlangan(ticked.length === rows.length ? new Set() : new Set(rows.map((x) => x.id)));
  }

  return (
    <div className="stack wide xon">
      <header className="xon-head">
        <div>
          <h1 className="h2">Xonadonlar</h1>
          <p className="muted">Status va narx o'zgarishi Mini App va AI-menejerda 1 daqiqada ko'rinadi</p>
        </div>
        <div className="xon-actions">
          <Select
            aria-label="Loyiha"
            className="xon-loyiha"
            value={loyihaId}
            options={loyihalar.map((l) => ({
              value: l.id,
              textValue: l.nomi,
              label: (
                <span className="lb-two">
                  {l.nomi}
                  {l.holat === 'topshirilgan' && <span className="muted small">topshirilgan</span>}
                </span>
              ),
            }))}
            onChange={(id) => setLoyihaId(id)}
          />
          {onImport && (
            <button type="button" className="xon-btn" onClick={onImport}>
              <Icon name="upload" size={18} />
              Excel'dan import
            </button>
          )}
          {isAdmin && (
            <button
              type="button"
              className="primary xon-btn"
              disabled={!data || planirovkalar.length === 0}
              title={data && planirovkalar.length === 0 ? "Avval bu Blokka Planirovka qo'shing" : undefined}
              onClick={() => setQoshish(true)}
            >
              <Icon name="plus" size={18} />
              Xonadon
            </button>
          )}
        </div>
      </header>

      {error && (
        <p className="error xon-error" role="alert">
          {error}
          <button type="button" className="icon-btn" aria-label="Yopish" onClick={() => setError('')}>
            <Icon name="x" size={16} />
          </button>
        </p>
      )}

      <div className="stats">
        <Stat label="Jami" value={stats?.jami} />
        <Stat label="Bo'sh" value={stats?.bosh} tone="free" />
        <Stat label="Bron" value={stats?.bron} tone="reserved" />
        <Stat label="Sotilgan" value={stats?.sotilgan} tone="sold" />
      </div>

      <section className="card flush xon-card">
        <div className="xon-toolbar">
          <div className="tabs" role="tablist" aria-label="Blok">
            {loyiha?.bloklar.map((b, i) => (
              <button
                key={b.id}
                type="button"
                role="tab"
                aria-selected={b.id === blokId}
                tabIndex={b.id === blokId ? 0 : -1}
                className={b.id === blokId ? 'tab active' : 'tab'}
                onClick={() => setBlokId(b.id)}
                onKeyDown={(e) => {
                  const bl = loyiha.bloklar;
                  const j = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : -1;
                  if (j < 0 || j >= bl.length) return;
                  e.preventDefault();
                  setBlokId(bl[j]!.id);
                  (e.currentTarget.parentElement?.children[j] as HTMLElement | undefined)?.focus();
                }}
              >
                {i === 0 || b.id === blokId ? `${b.nomi} blok` : b.nomi}
              </button>
            ))}
          </div>
          <label className="xon-search">
            <Icon name="search" size={18} />
            <input
              type="search"
              placeholder="Xonadon raqami"
              aria-label="Xonadon raqami bo'yicha qidirish"
              value={qidiruv}
              onChange={(e) => setQidiruv(e.target.value)}
            />
          </label>
          <Select
            aria-label="Status"
            className="xon-filtr"
            value={filtr}
            options={[
              { value: '' as const, label: 'hammasi' },
              ...XONADON_HOLATLARI.map((h) => ({ value: h, label: <HolatDot holat={h} text />, textValue: XONADON_HOLATI_LABEL[h] })),
            ]}
            onChange={setFiltr}
          />
        </div>

        {loyiha && loyiha.bloklar.length === 0 && (
          <Empty>Bu Loyihada hali Blok yo'q. Uni «Loyihalar» bo'limida qo'shing.</Empty>
        )}
        {data && planirovkalar.length === 0 && (
          <Empty>
            {blokNomi} blokda hali Planirovka yo'q. Avval «Loyihalar» bo'limida Planirovka qo'shing — Xonadon unga bog'lanadi.
          </Empty>
        )}

        {data && planirovkalar.length > 0 && (
          <div className="xon-body">
            {qavatlar.length > 0 && (
              <nav className="mini" aria-label="Qavatlar">
                <p className="mini-title">Shaxmatka</p>
                <p className="mini-legend" aria-hidden="true">
                  {XONADON_HOLATLARI.map((h) => (
                    <HolatDot key={h} holat={h} text />
                  ))}
                </p>
                <ol>
                  {qavatlar.map((q) => (
                    <li key={q}>
                      <button
                        type="button"
                        className={!izlash && q === qavat ? 'mini-row active' : 'mini-row'}
                        aria-current={!izlash && q === qavat ? 'true' : undefined}
                        tabIndex={-1}
                        aria-label={`${q}-qavat: ${qavatXulosa(all.filter((x) => x.qavat === q))}`}
                        onClick={() => {
                          setQavat(q);
                          setQidiruv('');
                          setFiltr('');
                        }}
                      >
                        <span className="mini-q">{q}</span>
                        <span className="mini-cells">
                          {all
                            .filter((x) => x.qavat === q)
                            .map((x) => (
                              <span
                                key={x.id}
                                title={`${blokNomi}-${x.raqam} · ${XONADON_HOLATI_LABEL[x.holat]}`}
                                className={`mini-cell ${x.holat}${filtr && x.holat !== filtr ? ' faded' : ''}`}
                              />
                            ))}
                        </span>
                      </button>
                    </li>
                  ))}
                </ol>
              </nav>
            )}

            <div className="xon-main">
              {ticked.length > 0 && (
                <div className="bulk" role="region" aria-label="Tanlangan xonadonlar">
                  <strong>{ticked.length} ta tanlandi</strong>
                  <span className="muted">Status:</span>
                  {XONADON_HOLATLARI.map((h) => (
                    <button key={h} type="button" className={`pill ${h}`} onClick={() => setHolat(ticked.map((x) => x.id), h)}>
                      {XONADON_HOLATI_LABEL[h]}
                    </button>
                  ))}
                  <button type="button" className="link-btn" onClick={() => setTanlangan(new Set())}>
                    Bekor qilish
                  </button>
                </div>
              )}

              <div className="xon-scroll">
                <table className="table xon-table">
                  <colgroup>
                    <col className="c-check" />
                    <col className="c-no" />
                    <col className="c-qavat" />
                    <col className="c-xonalar" />
                    <col className="c-maydon" />
                    <col className="c-narx" />
                    <col className="c-holat" />
                    <col />
                    {isAdmin && <col className="c-amal" />}
                  </colgroup>
                  <thead>
                    <tr>
                      <th className="check">
                        <input
                          type="checkbox"
                          aria-label="Hammasini tanlash"
                          checked={rows.length > 0 && ticked.length === rows.length}
                          ref={(el) => {
                            if (el) el.indeterminate = ticked.length > 0 && ticked.length < rows.length;
                          }}
                          onChange={toggleAll}
                          disabled={rows.length === 0}
                        />
                      </th>
                      <th>№</th>
                      <th className="num">Qavat</th>
                      <th className="num">Xonalar</th>
                      <th className="num">Maydon</th>
                      <th className="num">Narx, so'm</th>
                      <th>Status</th>
                      <th>Oxirgi o'zgarish</th>
                      {isAdmin && <th aria-label="Amallar" />}
                    </tr>
                  </thead>
                  <tbody>
                    {qoshish && (
                      <XonadonForm
                        blokId={blokId!}
                        blokNomi={blokNomi}
                        planirovkalar={planirovkalar}
                        initial={{
                          qavat: qavat ?? 1,
                          raqam: Math.max(0, ...all.map((x) => x.raqam)) + 1,
                          planirovkaId: planirovkalar[0]!.id,
                          narx: null,
                          holat: 'bosh',
                        }}
                        onDone={async (x, keyingisi) => {
                          if (!keyingisi) setQoshish(false);
                          setQavat(x.qavat);
                          setQidiruv('');
                          setFiltr('');
                          await applied([x]);
                        }}
                        onCancel={() => setQoshish(false)}
                        onError={setError}
                      />
                    )}
                    {rows.map((x) => (
                      <XonadonRow
                        key={x.id}
                        x={x}
                        blokNomi={blokNomi}
                        planirovka={planirovkaById.get(x.planirovkaId)}
                        planirovkalar={planirovkalar}
                        isAdmin={isAdmin}
                        ticked={tanlangan.has(x.id)}
                        onTick={(on) =>
                          setTanlangan((s) => {
                            const n = new Set(s);
                            if (on) n.add(x.id);
                            else n.delete(x.id);
                            return n;
                          })
                        }
                        onHolat={(h) => setHolat([x.id], h)}
                        onChanged={applied}
                        onRemoved={async () => {
                          setTanlangan((s) => {
                            const n = new Set(s);
                            n.delete(x.id);
                            return n;
                          });
                          await applied([]);
                        }}
                        onError={setError}
                      />
                    ))}
                  </tbody>
                </table>
                {rows.length === 0 && !qoshish && (
                  <Empty>
                    {izlash
                      ? "Bunday xonadon topilmadi. Qidiruv yoki status filtrini o'zgartiring."
                      : isAdmin
                        ? `${blokNomi} blokda hali Xonadon yo'q. «+ Xonadon» bilan qo'shing yoki Excel'dan import qiling.`
                        : `${blokNomi} blokda hali Xonadon yo'q.`}
                  </Empty>
                )}
              </div>

              <footer className="xon-foot">
                <span className="muted">
                  {izlash
                    ? `${blokNomi} blok · ${rows.length} ta topildi`
                    : qavat !== null
                      ? `${blokNomi} blok, ${qavat}-qavat · ${rows.length} ta xonadon`
                      : `${blokNomi} blok`}
                </span>
                {qavatlar.length > 0 && !izlash && (
                  <span className="pager">
                    <span className="muted">
                      {qavatlar[qavatlar.length - 1]}–{qavatlar[0]} qavat
                    </span>
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label="Pastki qavat"
                      disabled={qavatIndex >= qavatlar.length - 1}
                      onClick={() => setQavat(qavatlar[qavatIndex + 1]!)}
                    >
                      <Icon name="chevronLeft" size={18} />
                    </button>
                    <strong className="pager-now">{qavat}</strong>
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label="Yuqori qavat"
                      disabled={qavatIndex <= 0}
                      onClick={() => setQavat(qavatlar[qavatIndex - 1]!)}
                    >
                      <Icon name="chevronRight" size={18} />
                    </button>
                  </span>
                )}
              </footer>
            </div>
          </div>
        )}
      </section>

      <div className="toast-slot" role="status" aria-live="polite">
        {oxirgi && (
          <div className="toast" key={oxirgi.key}>
            <span>{oxirgi.matn}</span>
            <button type="button" className="link-btn" onClick={qaytar}>
              Bekor qilish
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function qavatXulosa(xs: AdminXonadonDto[]): string {
  return XONADON_HOLATLARI.map((h) => `${xs.filter((x) => x.holat === h).length} ${XONADON_HOLATI_LABEL[h].toLowerCase()}`).join(', ');
}

/** «12», «A-12» or «a12» finds A-12, A-120…: the raqam starts with what was typed (the Blok prefix is optional). */
function raqamMos(raqam: number, blokNomi: string, q: string): boolean {
  const t = q.trim().toLowerCase().replace(/\s+/g, '');
  if (!t) return true;
  const prefix = blokNomi.toLowerCase();
  const n = t.startsWith(`${prefix}-`) ? t.slice(prefix.length + 1) : t.startsWith(prefix) ? t.slice(prefix.length) : t;
  return String(raqam).startsWith(n.replace(/^-/, ''));
}

function Stat({ label, value, tone }: { label: string; value: number | undefined; tone?: 'free' | 'reserved' | 'sold' }) {
  return (
    <div className="card stat">
      <span className={tone ? `stat-label ${tone}` : 'stat-label'}>{label}</span>
      <strong className="stat-value">{value ?? '—'}</strong>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="xon-empty">{children}</p>;
}

function HolatDot({ holat, text }: { holat: XonadonHolati; text?: boolean }) {
  return (
    <span className="holat-dot-wrap">
      <span className={`holat-dot ${holat}`} aria-hidden="true" />
      {text && XONADON_HOLATI_LABEL[holat]}
    </span>
  );
}

const holatOptions: SelectOption<XonadonHolati>[] = XONADON_HOLATLARI.map((h) => ({
  value: h,
  label: <HolatDot holat={h} text />,
  textValue: XONADON_HOLATI_LABEL[h],
}));

function planirovkaText(p: AdminPlanirovkaDto) {
  return `${p.xonalar} xona · ${p.maydon} m²${p.nomi ? ` · ${p.nomi.uz}` : ''}`;
}

function Narx({ x, p }: { x: AdminXonadonDto; p: AdminPlanirovkaDto | undefined }) {
  if (x.narx !== null) return <>{soum(x.narx)}</>;
  if (p?.qoldaNarx != null)
    return (
      <span className="muted" title="Xonadonda narx yo'q: Planirovka narxi ko'rinadi">
        {soum(p.qoldaNarx)}
      </span>
    );
  return <span className="muted">So'rov bo'yicha</span>;
}

function XonadonRow({
  x,
  blokNomi,
  planirovka,
  planirovkalar,
  isAdmin,
  ticked,
  onTick,
  onHolat,
  onChanged,
  onRemoved,
  onError,
}: {
  x: AdminXonadonDto;
  blokNomi: string;
  planirovka: AdminPlanirovkaDto | undefined;
  planirovkalar: AdminPlanirovkaDto[];
  isAdmin: boolean;
  ticked: boolean;
  onTick: (on: boolean) => void;
  onHolat: (h: XonadonHolati) => Promise<void>;
  onChanged: (x: AdminXonadonDto[]) => Promise<void>;
  onRemoved: () => Promise<void>;
  onError: (e: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  if (editing) {
    return (
      <XonadonForm
        blokId={x.blokId}
        blokNomi={blokNomi}
        planirovkalar={planirovkalar}
        initial={x}
        id={x.id}
        onDone={async (y) => {
          setEditing(false);
          await onChanged([y]);
        }}
        onCancel={() => setEditing(false)}
        onError={onError}
      />
    );
  }

  async function holat(h: XonadonHolati) {
    setBusy(true);
    await onHolat(h);
    setBusy(false);
  }

  async function remove() {
    setBusy(true);
    try {
      await adminApi('DELETE', `/katalog/xonadonlar/${x.id}`);
      await onRemoved();
    } catch (e) {
      onError(errorText(e));
      setBusy(false);
      setConfirm(false);
    }
  }

  return (
    <tr className={[x.holat === 'sotilgan' ? 'dim' : '', ticked ? 'ticked' : ''].join(' ').trim() || undefined}>
      <td className="check">
        <input
          type="checkbox"
          aria-label={`${blokNomi}-${x.raqam} ni tanlash`}
          checked={ticked}
          onChange={(e) => onTick(e.target.checked)}
        />
      </td>
      <td className="xon-no">
        {blokNomi}-{x.raqam}
      </td>
      <td className="num c-qavat-td" data-label="qavat">
        {x.qavat}
      </td>
      <td className="num" data-label="xona">
        {planirovka?.xonalar ?? '—'}
      </td>
      <td className="num nowrap">{planirovka ? `${planirovka.maydon} m²` : '—'}</td>
      <td className="num nowrap narx-td">
        <Narx x={x} p={planirovka} />
      </td>
      <td>
        <Select
          aria-label={`${blokNomi}-${x.raqam} statusi`}
          className={`xon-pill ${x.holat}`}
          size="sm"
          value={x.holat}
          options={holatOptions}
          onChange={holat}
          disabled={busy}
        />
      </td>
      <td className="muted small nowrap oxirgi-td">
        {x.oxirgiOzgarish ? `${x.oxirgiOzgarish.nomi} · ${qachon(x.oxirgiOzgarish.at)}` : '—'}
      </td>
      {isAdmin && (
        <td className="actions">
          {confirm ? (
            <span className="confirm">
              O'chirilsinmi?
              <button type="button" className="link-btn danger" disabled={busy} onClick={remove}>
                Ha
              </button>
              <button type="button" className="link-btn" onClick={() => setConfirm(false)}>
                Yo'q
              </button>
            </span>
          ) : (
            <>
              <button type="button" className="icon-btn" aria-label={`${blokNomi}-${x.raqam} ni tahrirlash`} onClick={() => setEditing(true)}>
                <Icon name="pencil" size={16} />
              </button>
              <button type="button" className="icon-btn" aria-label={`${blokNomi}-${x.raqam} ni o'chirish`} onClick={() => setConfirm(true)}>
                <Icon name="trash" size={16} />
              </button>
            </>
          )}
        </td>
      )}
    </tr>
  );
}

/** Add (no id) or edit a Xonadon inline, as a table row (kit: the edited row is tinted, «Saqlash» in place). */
function XonadonForm({
  id,
  blokId,
  blokNomi,
  planirovkalar,
  initial,
  onDone,
  onCancel,
  onError,
}: {
  id?: number;
  blokId: number;
  blokNomi: string;
  planirovkalar: AdminPlanirovkaDto[];
  initial: Pick<AdminXonadonDto, 'qavat' | 'raqam' | 'planirovkaId' | 'narx' | 'holat'>;
  onDone: (x: AdminXonadonDto, keyingisi: boolean) => Promise<void>;
  onCancel: () => void;
  onError: (e: string) => void;
}) {
  const [qavat, setQavat] = useState(String(initial.qavat));
  const [raqam, setRaqam] = useState(String(initial.raqam));
  const [planirovkaId, setPlanirovkaId] = useState(initial.planirovkaId);
  const [narx, setNarx] = useState(initial.narx === null ? '' : String(initial.narx));
  const [holat, setHolat] = useState(initial.holat);
  const [busy, setBusy] = useState(false);
  const first = useRef<HTMLInputElement>(null);
  const p = planirovkalar.find((x) => x.id === planirovkaId);

  useEffect(() => {
    first.current?.focus();
  }, []);

  async function submit(e?: FormEvent, keyingisi = false) {
    e?.preventDefault();
    const q = Number(qavat);
    const r = Number(raqam);
    const n = parseNumber(narx);
    if (!Number.isInteger(q) || !Number.isInteger(r) || r < 1) return onError("Qavat va raqam butun son bo'lishi kerak");
    if (Number.isNaN(n)) return onError("Narx raqam bo'lishi kerak (masalan 455 500 000) yoki bo'sh");
    const body = { qavat: q, raqam: r, planirovkaId, narx: n === null ? null : Math.round(n), holat };
    setBusy(true);
    try {
      const { xonadon } = id
        ? await adminApi<{ xonadon: AdminXonadonDto }>('PATCH', `/katalog/xonadonlar/${id}`, body)
        : await adminApi<{ xonadon: AdminXonadonDto }>('POST', `/katalog/bloklar/${blokId}/xonadonlar`, body);
      await onDone(xonadon, keyingisi);
      if (keyingisi) {
        setRaqam(String(r + 1));
        setNarx('');
        setBusy(false);
        first.current?.focus();
      }
    } catch (err) {
      onError(errorText(err));
      setBusy(false);
    }
  }

  const keys = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') void submit();
    if (e.key === 'Escape') onCancel();
  };

  return (
    <tr className="editing" onKeyDown={keys}>
      <td className="check" />
      <td className="xon-no">
        <label className="prefixed">
          <span aria-hidden="true">{blokNomi}-</span>
          <input inputMode="numeric" aria-label="Raqam" value={raqam} onChange={(e) => setRaqam(e.target.value)} />
        </label>
      </td>
      <td className="num">
        <input
          ref={first}
          className="cell-input tiny"
          inputMode="numeric"
          aria-label="Qavat"
          value={qavat}
          onChange={(e) => setQavat(e.target.value)}
        />
      </td>
      <td colSpan={2}>
        <Select
          aria-label="Planirovka"
          className="xon-cell-select"
          size="sm"
          value={planirovkaId}
          options={planirovkalar.map((x) => ({ value: x.id, label: planirovkaText(x) }))}
          onChange={setPlanirovkaId}
        />
      </td>
      <td className="num">
        <input
          className="cell-input"
          inputMode="numeric"
          aria-label="Narx, so'm"
          placeholder={p?.qoldaNarx != null ? `Planirovka: ${soum(p.qoldaNarx)}` : "So'rov bo'yicha"}
          value={narx}
          onChange={(e) => setNarx(e.target.value)}
        />
      </td>
      <td>
        <Select
          aria-label="Status"
          className={`xon-pill ${holat}`}
          size="sm"
          value={holat}
          options={holatOptions}
          onChange={setHolat}
        />
      </td>
      <td colSpan={2} className="actions">
        <button type="button" className="link-btn strong" disabled={busy} onClick={() => submit()}>
          {busy ? 'Saqlanmoqda…' : id ? 'Saqlash' : "Qo'shish"}
        </button>
        {!id && (
          <button
            type="button"
            className="link-btn"
            disabled={busy}
            title="Qo'shadi va keyingi raqam bilan yana ochadi"
            onClick={() => submit(undefined, true)}
          >
            + keyingisi
          </button>
        )}
        <button type="button" className="link-btn" onClick={onCancel}>
          Bekor
        </button>
      </td>
    </tr>
  );
}
