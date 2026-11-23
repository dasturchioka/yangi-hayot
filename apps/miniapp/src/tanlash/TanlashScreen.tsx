import { SHAHARLAR, XONALAR_VARIANTLARI, type FiltrVariantlariResponse, type PlanirovkaFiltr } from '@yh/shared';
import { useEffect, useId, useState, type CSSProperties, type ReactNode } from 'react';
import { api } from '../api';
import { useLang, useT } from '../i18n';
import { formatMaydon } from '../katalog/format';
import { Loaded, PlanirovkaRow } from '../katalog/parts';
import { href, navigate, replaceRoute, type Route } from '../router';
import { useLoad } from '../useLoad';
import { filtrQuery, filtrSoni, formatOraliq, formatXonalar } from './filtr';
import './tanlash.css';

type TanlashRoute = Extract<Route, { name: 'tanlash' }>;

/**
 * «Xonadonlar»: Planirovkalar matching the filter (kit «Xonadonlar» list),
 * active filters as removable chips, the filter sheet on top when
 * `route.sheet` (its own history entry, so Telegram Back closes it).
 */
export function TanlashScreen({ route }: { route: TanlashRoute }) {
  const t = useT();
  const lang = useLang();
  const { filtr } = route;
  const key = filtrQuery(filtr);
  const load = useLoad(`tanlash:${key}:${lang}`, () => api.planirovkalar(filtr, lang));
  const variantlar = useLoad(`filtr:${filtr.shahar ?? ''}`, () => api.filtr(filtr.shahar));
  const soni = filtrSoni(filtr);

  const show = (f: PlanirovkaFiltr) => replaceRoute({ name: 'tanlash', filtr: f });

  return (
    <>
      <div className="row-between">
        <h1 className="h1">{t('tanlash.title')}</h1>
        <button
          className="button-icon filtr-button"
          onClick={() => navigate({ ...route, sheet: true, kviz: false })}
          aria-label={t('filtr.open')}
        >
          <FiltrIcon />
          {soni > 0 && <span className="filtr-count">{soni}</span>}
        </button>
      </div>

      {route.kviz && <KvizQabul />}

      {soni > 0 && (
        <FiltrChips
          filtr={filtr}
          variantlar={variantlar.kind === 'ready' ? variantlar.data : null}
          onChange={show}
        />
      )}

      <Loaded load={load}>
        {({ planirovkalar }) =>
          planirovkalar.length === 0 ? (
            <div className="tanlash-empty">
              <p className="title">{t('tanlash.empty.title')}</p>
              <p className="caption muted">{t('tanlash.empty.text')}</p>
              <button className="button-secondary" onClick={() => navigate({ ...route, sheet: true, kviz: false })}>
                {t('tanlash.empty.change')}
              </button>
            </div>
          ) : (
            <>
              <p className="caption muted">{t('tanlash.found', { n: planirovkalar.length })}</p>
              <div className="group">
                {planirovkalar.map((p) => (
                  <PlanirovkaRow key={p.id} p={p} showLoyiha showBlok />
                ))}
              </div>
            </>
          )
        }
      </Loaded>

      {!route.kviz && (
        <div className="sticky-actions">
          <a className="button-secondary" href={href({ name: 'ariza' })}>
            {t('tanlash.help')}
          </a>
        </div>
      )}

      {route.sheet && <FiltrSheet initial={filtr} />}
    </>
  );
}

/** After the kviz: the Ariza is in, here is what matches. */
function KvizQabul() {
  const t = useT();
  return (
    <div className="kviz-qabul" role="status">
      <span className="kviz-qabul-mark" aria-hidden>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      </span>
      <span>
        <span className="title">{t('kviz.qabul.title')}</span>
        <span className="caption">{t('kviz.qabul.text')}</span>
      </span>
    </div>
  );
}

function FiltrChips({
  filtr,
  variantlar,
  onChange,
}: {
  filtr: PlanirovkaFiltr;
  variantlar: FiltrVariantlariResponse | null;
  onChange: (f: PlanirovkaFiltr) => void;
}) {
  const t = useT();
  const loyiha = variantlar?.loyihalar.find((l) => l.id === filtr.loyihaId);
  const blok = loyiha?.bloklar.find((b) => b.id === filtr.blokId);
  const without = (...keys: (keyof PlanirovkaFiltr)[]) => {
    const f = { ...filtr };
    for (const k of keys) delete f[k];
    onChange(f);
  };
  const chips: { key: string; label: string; remove: () => void }[] = [];
  if (filtr.shahar) chips.push({ key: 'shahar', label: t(`shahar.${filtr.shahar}`), remove: () => without('shahar', 'loyihaId', 'blokId') });
  if (filtr.loyihaId && loyiha) chips.push({ key: 'loyiha', label: loyiha.nomi, remove: () => without('loyihaId', 'blokId') });
  if (filtr.blokId && blok) chips.push({ key: 'blok', label: t('blok.nomi', { nomi: blok.nomi }), remove: () => without('blokId') });
  if (filtr.xonalar?.length) chips.push({ key: 'xonalar', label: formatXonalar(t, filtr.xonalar), remove: () => without('xonalar') });
  if (filtr.narxDan !== undefined || filtr.narxGacha !== undefined)
    chips.push({
      key: 'narx',
      label: formatOraliq(t, { dan: filtr.narxDan ?? null, gacha: filtr.narxGacha ?? null }),
      remove: () => without('narxDan', 'narxGacha'),
    });
  if (filtr.maydonDan !== undefined || filtr.maydonGacha !== undefined)
    chips.push({
      key: 'maydon',
      label: t('filtr.maydonChip', {
        n: [filtr.maydonDan, filtr.maydonGacha].map((m) => (m === undefined ? '…' : formatMaydon(m))).join('–'),
      }),
      remove: () => without('maydonDan', 'maydonGacha'),
    });
  if (filtr.faqatBosh) chips.push({ key: 'bosh', label: t('filtr.boshChip'), remove: () => without('faqatBosh') });

  return (
    <div className="chips filtr-chips">
      {chips.map((c) => (
        <button key={c.key} className="chip chip-remove" onClick={c.remove} aria-label={t('filtr.remove', { nomi: c.label })}>
          {c.label}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- Filter sheet

const MLN = 1_000_000;

/** «Xonadon tanlash» bottom sheet (kit p.7, without «Qavat»). Shows how many match before applying. */
function FiltrSheet({ initial }: { initial: PlanirovkaFiltr }) {
  const t = useT();
  const lang = useLang();
  const titleId = useId();
  const [draft, setDraft] = useState<PlanirovkaFiltr>(initial);
  const [closing, setClosing] = useState(false);
  const variantlar = useLoad(`filtr:${draft.shahar ?? ''}`, () => api.filtr(draft.shahar));
  const v = variantlar.kind === 'ready' ? variantlar.data : null;
  const count = useCount(draft, lang);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const set = (patch: Partial<PlanirovkaFiltr>) =>
    setDraft((d) => {
      const next = { ...d, ...patch };
      for (const k of Object.keys(next) as (keyof PlanirovkaFiltr)[]) if (next[k] === undefined) delete next[k];
      return next;
    });

  function close() {
    if (closing) return;
    setClosing(true);
    window.setTimeout(() => window.history.back(), 180);
  }

  const loyihalar = v?.loyihalar ?? [];
  const loyiha = loyihalar.find((l) => l.id === draft.loyihaId);
  const xonalar = draft.xonalar ?? [];

  return (
    <div className="sheet-layer" data-closing={closing || undefined}>
      <div className="sheet-scrim" onClick={close} aria-hidden />
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <button className="sheet-handle" onClick={close} aria-label={t('filtr.close')} />
        <div className="sheet-body">
          <div className="row-between">
            <h2 className="h2" id={titleId}>
              {t('filtr.title')}
            </h2>
            <button className="link-button" onClick={() => setDraft({})} disabled={filtrSoni(draft) === 0}>
              {t('filtr.clear')}
            </button>
          </div>

          <Section label={t('filtr.shahar')}>
            <div className="segmented" role="radiogroup">
              {SHAHARLAR.map((s) => (
                <button
                  key={s}
                  role="radio"
                  aria-checked={draft.shahar === s}
                  className={draft.shahar === s ? 'active' : undefined}
                  onClick={() => set({ shahar: draft.shahar === s ? undefined : s, loyihaId: undefined, blokId: undefined })}
                >
                  {t(`shahar.${s}`)}
                </button>
              ))}
            </div>
          </Section>

          {loyihalar.length > 1 && (
            <Section label={t('filtr.loyiha')}>
              <div className="chips">
                <button className={!draft.loyihaId ? 'chip chip-lg active' : 'chip chip-lg'} onClick={() => set({ loyihaId: undefined, blokId: undefined })}>
                  {t('filtr.hammasi')}
                </button>
                {loyihalar.map((l) => (
                  <button
                    key={l.id}
                    className={draft.loyihaId === l.id ? 'chip chip-lg active' : 'chip chip-lg'}
                    onClick={() => set({ loyihaId: l.id, blokId: undefined })}
                  >
                    {l.nomi}
                  </button>
                ))}
              </div>
            </Section>
          )}

          {loyiha && loyiha.bloklar.length > 1 && (
            <Section label={t('filtr.blok')}>
              <div className="chips">
                <button className={!draft.blokId ? 'chip chip-lg active' : 'chip chip-lg'} onClick={() => set({ blokId: undefined })}>
                  {t('filtr.hammasi')}
                </button>
                {loyiha.bloklar.map((b) => (
                  <button
                    key={b.id}
                    className={draft.blokId === b.id ? 'chip chip-lg active' : 'chip chip-lg'}
                    onClick={() => set({ blokId: b.id })}
                  >
                    {t('blok.nomi', { nomi: b.nomi })}
                  </button>
                ))}
              </div>
            </Section>
          )}

          <Section label={t('filtr.xonalar')}>
            <div className="xona-grid">
              {XONALAR_VARIANTLARI.map((x) => {
                const on = xonalar.includes(x);
                return (
                  <button
                    key={x}
                    className={on ? 'xona-toggle active' : 'xona-toggle'}
                    aria-pressed={on}
                    onClick={() =>
                      setDraft((d) => {
                        const cur = d.xonalar ?? [];
                        const next = cur.includes(x) ? cur.filter((y) => y !== x) : [...cur, x];
                        const { xonalar: _, ...rest } = d;
                        return next.length ? { ...rest, xonalar: next } : rest;
                      })
                    }
                  >
                    {x >= 4 ? '4+' : x}
                  </button>
                );
              })}
            </div>
          </Section>

          <Section label={t('filtr.narx')}>
            <RangeField
              bounds={v?.narx ? { min: Math.floor(v.narx.min / MLN), max: Math.ceil(v.narx.max / MLN) } : null}
              dan={draft.narxDan === undefined ? undefined : draft.narxDan / MLN}
              gacha={draft.narxGacha === undefined ? undefined : draft.narxGacha / MLN}
              onChange={(dan, gacha) =>
                set({
                  narxDan: dan === undefined ? undefined : Math.round(dan * MLN),
                  narxGacha: gacha === undefined ? undefined : Math.round(gacha * MLN),
                })
              }
              slider
            />
          </Section>

          <Section label={t('filtr.maydon')}>
            <RangeField
              bounds={v?.maydon ? { min: Math.floor(v.maydon.min), max: Math.ceil(v.maydon.max) } : null}
              dan={draft.maydonDan}
              gacha={draft.maydonGacha}
              onChange={(dan, gacha) => set({ maydonDan: dan, maydonGacha: gacha })}
            />
          </Section>

          <label className="switch-row">
            <span>{t('filtr.faqatBosh')}</span>
            <input
              type="checkbox"
              role="switch"
              className="switch"
              checked={Boolean(draft.faqatBosh)}
              onChange={(e) => set({ faqatBosh: e.target.checked || undefined })}
            />
          </label>
        </div>

        <div className="sheet-actions">
          <button
            className="button-primary"
            disabled={count === 0}
            aria-busy={count === null}
            onClick={() => replaceRoute({ name: 'tanlash', filtr: draft })}
          >
            {count === null ? (
              <span className="spinner" aria-hidden />
            ) : count === 0 ? (
              t('filtr.none')
            ) : (
              t('filtr.show', { n: count })
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="sheet-section">
      <p className="field-label">{label}</p>
      {children}
    </section>
  );
}

/** Live count of matches for the draft, a beat after the last change; null while counting. */
function useCount(f: PlanirovkaFiltr, lang: 'ru' | 'uz'): number | null {
  const key = filtrQuery(f);
  const [count, setCount] = useState<{ key: string; n: number } | null>(null);
  useEffect(() => {
    let live = true;
    const timer = window.setTimeout(() => {
      api.planirovkalar(f, lang).then(
        (r) => live && setCount({ key, n: r.planirovkalar.length }),
        () => {},
      );
    }, 220);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` identifies the filter
  }, [key, lang]);
  // While recounting, the previous number stays (no flicker); null only before the first answer.
  return count ? count.n : null;
}

/**
 * «dan / gacha» number fields; with `slider`, a two-thumb range under them
 * over the catalog's bounds. Empty field = open end.
 */
function RangeField({
  bounds,
  dan,
  gacha,
  onChange,
  slider = false,
}: {
  bounds: { min: number; max: number } | null;
  dan: number | undefined;
  gacha: number | undefined;
  onChange: (dan: number | undefined, gacha: number | undefined) => void;
  slider?: boolean;
}) {
  const t = useT();
  const parse = (s: string) => {
    const n = Number(s.replace(',', '.').replace(/[^\d.]/g, ''));
    return s.trim() === '' || !Number.isFinite(n) ? undefined : n;
  };
  const span = bounds ? Math.max(1, bounds.max - bounds.min) : 1;
  const lo = bounds ? Math.min(Math.max(dan ?? bounds.min, bounds.min), bounds.max) : 0;
  const hi = bounds ? Math.max(Math.min(gacha ?? bounds.max, bounds.max), bounds.min) : 0;
  const pct = (x: number) => (bounds ? ((x - bounds.min) / span) * 100 : 0);
  const fmt = (n: number | undefined) => (n === undefined ? '' : String(Math.round(n * 10) / 10).replace('.', ','));

  return (
    <div className="range-field">
      <div className="range-inputs">
        <label className="input range-input">
          <span>{t('filtr.dan')}</span>
          <input
            inputMode="decimal"
            value={fmt(dan)}
            placeholder={bounds ? String(bounds.min) : ''}
            onChange={(e) => onChange(parse(e.target.value), gacha)}
          />
        </label>
        <label className="input range-input">
          <span>{t('filtr.gacha')}</span>
          <input
            inputMode="decimal"
            value={fmt(gacha)}
            placeholder={bounds ? String(bounds.max) : ''}
            onChange={(e) => onChange(dan, parse(e.target.value))}
          />
        </label>
      </div>
      {slider && bounds && bounds.max > bounds.min && (
        <div className="dual-range" style={{ '--from': `${pct(lo)}%`, '--to': `${pct(hi)}%` } as CSSProperties}>
          <span className="dual-range-fill" aria-hidden />
          <input
            type="range"
            min={bounds.min}
            max={bounds.max}
            step={1}
            value={lo}
            aria-label={t('filtr.dan')}
            onChange={(e) => {
              const x = Math.min(Number(e.target.value), hi);
              onChange(x <= bounds.min ? undefined : x, gacha);
            }}
          />
          <input
            type="range"
            min={bounds.min}
            max={bounds.max}
            step={1}
            value={hi}
            aria-label={t('filtr.gacha')}
            onChange={(e) => {
              const x = Math.max(Number(e.target.value), lo);
              onChange(dan, x >= bounds.max ? undefined : x);
            }}
          />
        </div>
      )}
    </div>
  );
}

function FiltrIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
      <path d="M4 7h16M7 12h10M10 17h4" />
    </svg>
  );
}

/** For the home screen: the «Xonadon qidirish» field that opens the filter sheet. */
export function TanlashQidiruv() {
  const t = useT();
  return (
    <a className="tanlash-search" href={href({ name: 'tanlash', filtr: {}, sheet: true })}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
        <circle cx="11" cy="11" r="6.5" />
        <path d="M16 16l4 4" />
      </svg>
      <span>{t('tanlash.search')}</span>
      <span className="tanlash-search-icon">
        <FiltrIcon />
      </span>
    </a>
  );
}
