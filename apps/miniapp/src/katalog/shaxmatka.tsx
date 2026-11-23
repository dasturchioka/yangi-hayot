import {
  namunaviyOylik,
  xonadonFiltriBor,
  xonadonMos,
  XONALAR_VARIANTLARI,
  type KalkulyatorSozlamalari,
  type LoyihaDto,
  type PlanirovkaDto,
  type PlanirovkaFiltr,
  type PlanirovkaHolati,
  type ShaxmatkaKatakDto,
  type ShaxmatkaResponse,
  type XonadonDto,
  type XonadonHolati,
} from '@yh/shared';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { api } from '../api';
import { useLang, useT, type Translate } from '../i18n';
import { CalculatorIcon, ChevronRightIcon, FiltrIcon, GridIcon, PhoneIcon, XIcon } from '../icons';
import { VideoYozilishLink, YozilishButton } from '../kontent/cta';
import { href, navigate, replaceRoute, type Route } from '../router';
import { SevimliButton, UlashishButton } from '../sevimlilar/screens';
import { FiltrChips, FiltrSheet } from '../tanlash/TanlashScreen';
import { filtrSoni } from '../tanlash/filtr';
import '../tanlash/tanlash.css';
import { useLoad } from '../useLoad';
import { formatMaydon } from './format';
import { Chizma, EmptyState, HolatBadge, Loaded, VideoButton } from './parts';
import { mln, OylikCard } from './screens';
import './shaxmatka.css';

// ---------------------------------------------------------------- Blok head: Blok chips + «Shaxmatka | Planirovkalar»

type Korinish = 'shaxmatka' | 'planirovkalar';

/** The view the Mijoz last picked; the Loyiha's «Xonadonlar» button opens it again. */
let oxirgiKorinish: Korinish = 'shaxmatka';

export function xonadonlarRoute(loyihaId: number): Route {
  return oxirgiKorinish === 'shaxmatka' ? { name: 'shaxmatka', loyihaId, filtr: {} } : { name: 'planirovkalar', loyihaId };
}

/** Header shared by both views of a Loyiha's Xonadonlar: title, Blok chips, view switch. */
export function BlokHead({
  loyiha,
  blokId,
  view,
  onBlok,
}: {
  loyiha: LoyihaDto;
  blokId: number | undefined;
  view: Korinish;
  onBlok: (id: number) => void;
}) {
  const t = useT();
  const bloklar = loyiha.bloklar.filter((b) => b.guruhlar.length > 0);
  const switchTo = (v: Korinish) => {
    if (v === view) return;
    oxirgiKorinish = v;
    replaceRoute(
      v === 'shaxmatka'
        ? { name: 'shaxmatka', loyihaId: loyiha.id, filtr: blokId ? { blokId } : {} }
        : { name: 'planirovkalar', loyihaId: loyiha.id, ...(blokId ? { blokId } : {}) },
    );
  };
  return (
    <>
      <div className="screen-head">
        <p className="caption muted">{loyiha.nomi}</p>
        <h1 className="h1">{t('loyiha.xonadonlar', { n: loyiha.boshXonadonlar })}</h1>
      </div>
      {bloklar.length > 1 && (
        <div className="chips" role="tablist">
          {bloklar.map((b) => (
            <button
              key={b.id}
              role="tab"
              aria-selected={b.id === blokId}
              className={b.id === blokId ? 'chip active' : 'chip'}
              onClick={() => onBlok(b.id)}
            >
              {t('blok.nomi', { nomi: b.nomi })}
              <span className="chip-count">{b.boshXonadonlar}</span>
            </button>
          ))}
        </div>
      )}
      {bloklar.length > 0 && (
        <div className="segmented shx-korinish" role="radiogroup">
          {(['shaxmatka', 'planirovkalar'] as const).map((v) => (
            <button key={v} role="radio" aria-checked={v === view} className={v === view ? 'active' : undefined} onClick={() => switchTo(v)}>
              {t(`korinish.${v}`)}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------- Shaxmatka screen

type ShaxmatkaRoute = Extract<Route, { name: 'shaxmatka' }>;

export function ShaxmatkaScreen({ route }: { route: ShaxmatkaRoute }) {
  const t = useT();
  const lang = useLang();
  const load = useLoad(`loyiha:${route.loyihaId}:${lang}`, () => api.loyiha(route.loyihaId, lang));
  return (
    <Loaded load={load}>
      {({ loyiha }) => {
        const bloklar = loyiha.bloklar.filter((b) => b.guruhlar.length > 0);
        const blok = bloklar.find((b) => b.id === route.filtr.blokId) ?? bloklar[0];
        return (
          <>
            <BlokHead
              loyiha={loyiha}
              blokId={blok?.id}
              view="shaxmatka"
              onBlok={(id) => replaceRoute({ name: 'shaxmatka', loyihaId: loyiha.id, filtr: { ...route.filtr, blokId: id } })}
            />
            {blok ? (
              <BlokShaxmatka key={blok.id} blokId={blok.id} route={route} />
            ) : (
              <p className="muted">{t('loyiha.noPlanirovkalar')}</p>
            )}
            <div className="sticky-actions">
              <a className="button-secondary" href={href({ name: 'ariza', loyihaId: loyiha.id })}>
                {t('planirovkalar.yordam')}
              </a>
            </div>
          </>
        );
      }}
    </Loaded>
  );
}

const XONADON_BADGE: Record<XonadonHolati, PlanirovkaHolati> = { bosh: 'sotuvda', bron: 'band', sotilgan: 'sotilgan' };

function BlokShaxmatka({ blokId, route }: { blokId: number; route: ShaxmatkaRoute }) {
  const load = useLoad(`shaxmatka:${blokId}`, () => api.shaxmatka(blokId));
  return <Loaded load={load}>{(data) => <Shaxmatka data={data} route={{ ...route, filtr: { ...route.filtr, blokId } }} />}</Loaded>;
}

function bounds(xs: number[]) {
  return xs.length ? { min: Math.min(...xs), max: Math.max(...xs) } : null;
}

function Shaxmatka({ data, route }: { data: ShaxmatkaResponse; route: ShaxmatkaRoute }) {
  const t = useT();
  const { filtr, planirovkaId } = route;
  const planirovkalar = new Map(data.planirovkalar.map((p) => [p.id, p]));
  const pOf = (x: ShaxmatkaKatakDto) => planirovkalar.get(x.planirovkaId)!;

  // Same rule as the server (`xonadonMos`); counted here so highlighting is instant.
  const mos = (x: ShaxmatkaKatakDto, f: PlanirovkaFiltr) =>
    x.holat !== 'sotilgan' &&
    (!planirovkaId || x.planirovkaId === planirovkaId) &&
    xonadonMos(
      {
        shahar: data.blok.shahar,
        loyihaId: data.blok.loyihaId,
        blokId: data.blok.id,
        xonalar: pOf(x).xonalar,
        maydon: pOf(x).maydon,
        narx: x.narx,
        qavat: x.qavat,
        holat: x.holat,
      },
      f,
    );
  const ajratish = xonadonFiltriBor(filtr) || Boolean(planirovkaId);
  const sotuvda = data.xonadonlar.filter((x) => x.holat !== 'sotilgan').length;
  const mosSoni = data.xonadonlar.filter((x) => mos(x, filtr)).length;
  const soni = (h: XonadonHolati) => data.xonadonlar.filter((x) => x.holat === h).length;

  const qavatlar = [...new Set(data.xonadonlar.map((x) => x.qavat))].sort((a, b) => b - a);
  const qavatda = new Map<number, ShaxmatkaKatakDto[]>();
  for (const x of data.xonadonlar) qavatda.set(x.qavat, [...(qavatda.get(x.qavat) ?? []), x]);

  const show = (f: PlanirovkaFiltr) => replaceRoute({ ...route, filtr: { ...f, blokId: data.blok.id }, sheet: false });
  const xonalar = filtr.xonalar ?? [];
  const tanlangan = planirovkaId ? planirovkalar.get(planirovkaId) : undefined;
  // Bo'lak filter chips (narx, maydon, qavat, «bo'sh»); Blok is the screen itself.
  const { blokId: _b, loyihaId: _l, shahar: _s, xonalar: _x, ...qolgan } = filtr;

  if (data.xonadonlar.length === 0) return <EmptyState icon={<GridIcon size={26} />} title={t('shaxmatka.empty')} />;

  return (
    <>
      <div className="shx-toolbar">
        <div className="shx-xonalar" role="group" aria-label={t('filtr.xonalar')}>
          {XONALAR_VARIANTLARI.map((n) => {
            const on = xonalar.includes(n);
            return (
              <button
                key={n}
                className={on ? 'shx-xona active' : 'shx-xona'}
                aria-pressed={on}
                aria-label={t('filtr.xona', { n: n >= 4 ? '4+' : n })}
                onClick={() => {
                  const next = on ? xonalar.filter((y) => y !== n) : [...xonalar, n];
                  const { xonalar: _, ...rest } = filtr;
                  show(next.length ? { ...rest, xonalar: next } : rest);
                }}
              >
                {t('shaxmatka.xona', { n })}
                {n >= 4 && '+'}
              </button>
            );
          })}
        </div>
        <button
          className="button-icon filtr-button"
          onClick={() => navigate({ ...route, sheet: true })}
          aria-label={t('filtr.open')}
        >
          <FiltrIcon strokeWidth={2} />
          {filtrSoni(qolgan) > 0 && <span className="filtr-count">{filtrSoni(qolgan)}</span>}
        </button>
      </div>

      {(filtrSoni(qolgan) > 0 || tanlangan) && (
        <FiltrChips
          filtr={qolgan}
          variantlar={null}
          onChange={(f) => show({ ...f, ...(filtr.xonalar ? { xonalar: filtr.xonalar } : {}) })}
          lead={
            tanlangan && (
              <FiltrChipPlanirovka
                label={t('shaxmatka.planirovka', {
                  nomi: t('planirovka.short', { n: tanlangan.xonalar, maydon: formatMaydon(tanlangan.maydon) }),
                })}
                onRemove={() => replaceRoute({ ...route, planirovkaId: undefined, sheet: false })}
              />
            )
          }
        />
      )}

      <div className="shx-legend" aria-live="polite">
        {ajratish ? (
          <span className="shx-mos">{t('shaxmatka.mos', { n: mosSoni, jami: sotuvda })}</span>
        ) : (
          <>
            <Legend holat="bosh" label={t('holat.sotuvda')} n={soni('bosh')} />
            <Legend holat="bron" label={t('shaxmatka.bron')} n={soni('bron')} />
            <Legend holat="sotilgan" label={t('holat.sotilgan')} n={soni('sotilgan')} />
          </>
        )}
      </div>

      <Grid
        qavatlar={qavatlar}
        qavatda={qavatda}
        render={(x) => (
          <Katak
            key={x.id}
            x={x}
            xonalar={pOf(x).xonalar}
            maydon={pOf(x).maydon}
            raqam={`${data.blok.nomi}-${x.raqam}`}
            holat={!ajratish ? 'oddiy' : mos(x, filtr) ? 'mos' : 'xira'}
          />
        )}
      />
      <p className="caption muted shx-hint">{t('shaxmatka.hint')}</p>

      {route.sheet && (
        <FiltrSheet
          initial={filtr}
          onApply={show}
          blok={{
            count: (f) => data.xonadonlar.filter((x) => mos(x, f)).length,
            narx: bounds(data.xonadonlar.flatMap((x) => (x.narx === null ? [] : [x.narx]))),
            maydon: bounds(data.planirovkalar.map((p) => p.maydon)),
            qavat: bounds(qavatlar),
          }}
        />
      )}
    </>
  );
}

function FiltrChipPlanirovka({ label, onRemove }: { label: string; onRemove: () => void }) {
  const t = useT();
  return (
    <button className="chip chip-remove" onClick={onRemove} aria-label={t('filtr.remove', { nomi: label })}>
      {label}
      <XIcon size={14} />
    </button>
  );
}

function Legend({ holat, label, n }: { holat: XonadonHolati; label: string; n: number }) {
  return (
    <span className="shx-legend-item">
      <span className={`shx-swatch ${holat}`} aria-hidden />
      {label}
      <b>{n}</b>
    </span>
  );
}

/**
 * «qavat × xonadon»: top floor first, like the building. Only this box
 * scrolls sideways (360–390px screens); the floor number stays pinned.
 */
function Grid({
  qavatlar,
  qavatda,
  render,
}: {
  qavatlar: number[];
  qavatda: Map<number, ShaxmatkaKatakDto[]>;
  render: (x: ShaxmatkaKatakDto) => ReactNode;
}) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);
  const measure = () => {
    const el = ref.current;
    if (el) setMore(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  };
  useLayoutEffect(measure, [qavatlar.length]);
  useEffect(() => {
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);
  return (
    <div className="shx-scroll" ref={ref} onScroll={measure} data-more={more || undefined}>
      <div className="shx-grid">
        {qavatlar.map((q) => (
          <div className="shx-row" key={q} role="group" aria-label={t('shaxmatka.qavat', { n: q })}>
            <span className="shx-qavat" aria-hidden>
              {q}
            </span>
            {(qavatda.get(q) ?? []).map(render)}
          </div>
        ))}
      </div>
    </div>
  );
}

function Katak({
  x,
  xonalar,
  maydon,
  raqam,
  holat,
}: {
  x: ShaxmatkaKatakDto;
  xonalar: number;
  maydon: number;
  raqam: string;
  holat: 'oddiy' | 'mos' | 'xira';
}) {
  const t = useT();
  const label = t('shaxmatka.katak', {
    raqam,
    qavat: x.qavat,
    n: xonalar,
    maydon: formatMaydon(maydon),
    holat: x.holat === 'bosh' ? t('holat.sotuvda') : x.holat === 'bron' ? t('shaxmatka.bron') : t('holat.sotilgan'),
  });
  const className = `shx-cell ${x.holat}${holat === 'oddiy' ? '' : ` ${holat}`}`;
  const body = (
    <>
      <span className="shx-cell-xona">{t('shaxmatka.xona', { n: xonalar })}</span>
      <span className="shx-cell-m2">{formatMaydon(maydon)}</span>
    </>
  );
  // Sotilgan: shown so the Mijoz sees the house selling, but not a control.
  if (x.holat === 'sotilgan') {
    return (
      <span className={className} role="img" aria-label={label}>
        {body}
      </span>
    );
  }
  return (
    <a className={className} href={href({ name: 'xonadon', id: x.id })} aria-label={label}>
      {body}
    </a>
  );
}

// ---------------------------------------------------------------- Xonadon kartochkasi

export function XonadonScreen({ id }: { id: number }) {
  const lang = useLang();
  const load = useLoad(`xonadon:${id}:${lang}`, () => api.xonadon(id, lang));
  return (
    <Loaded load={load} skeleton="detail">
      {({ xonadon, planirovka }) => <Xonadon x={xonadon} p={planirovka} />}
    </Loaded>
  );
}

/** Exact price of one Xonadon: «455,5 mln so'm»; none → «Narx so'rov bo'yicha». */
export function formatXonadonNarx(t: Translate, narx: number | null): string {
  return narx === null ? t('narx.onRequest') : t('narx.som', { narx: t('narx.mln', { n: mln(narx) }) });
}

function Xonadon({ x, p }: { x: XonadonDto; p: PlanirovkaDto }) {
  const t = useT();
  const [sozlama, setSozlama] = useState<KalkulyatorSozlamalari | null>(null);
  useEffect(() => {
    if (x.narx === null) return;
    api.kalkulyator().then(({ sozlama }) => setSozlama(sozlama), () => {});
  }, [x.narx]);

  const sold = x.holat === 'sotilgan';
  const raqam = `${x.blokNomi}-${x.raqam}`;
  const kvMetr = x.narx !== null ? x.narx / x.maydon : null;
  const hisoblash: Route = { name: 'kalkulyator', planirovkaId: p.id, xonadonId: x.id };
  const boshqalari: Route = { name: 'shaxmatka', loyihaId: x.loyihaId, filtr: { blokId: x.blokId }, planirovkaId: p.id };

  return (
    <>
      <Chizma src={p.chizma}>
        {/* TODO(#25): Ulashish and Sevimlilar act on the Planirovka until they move to the Xonadon. */}
        <div className="chizma-actions">
          <UlashishButton p={p} />
          <SevimliButton id={p.id} />
        </div>
      </Chizma>

      <div className="plan-head">
        <div className="row-between">
          <p className="caption muted">
            {p.loyihaNomi} · {t('blok.nomi', { nomi: x.blokNomi })} · № {raqam}
          </p>
          <HolatBadge holat={XONADON_BADGE[x.holat]} />
        </div>
        <h1 className="h1">{t('planirovka.title', { n: x.xonalar, maydon: formatMaydon(x.maydon) })}</h1>
        <p className="plan-price-line">
          <span className="price">{formatXonadonNarx(t, x.narx)}</span>
          {kvMetr !== null && <span className="caption muted">{t('planirovka.kvMetr', { narx: mln(kvMetr) })}</span>}
        </p>
      </div>

      <div className="facts">
        <div className="fact">
          <span className="caption muted">{t('xonadon.fakt.qavat')}</span>
          <b>{x.qavat}</b>
        </div>
        <div className="fact">
          <span className="caption muted">{t('xonadon.fakt.raqam')}</span>
          <b>{raqam}</b>
        </div>
        <div className="fact">
          <span className="caption muted">{t('xonadon.fakt.maydon')}</span>
          <b>{t('xonadon.m2', { n: formatMaydon(x.maydon) })}</b>
        </div>
      </div>

      {x.holat === 'bron' && <p className="note note-band">{t('xonadon.band')}</p>}
      {sold && <p className="note note-info">{t('xonadon.sotilgan')}</p>}

      {!sold &&
        (sozlama && namunaviyOylik(x.narx, sozlama) !== null ? (
          <OylikCard narx={x.narx} sozlama={sozlama} hisoblash={hisoblash} />
        ) : (
          <a className="button-secondary" href={href(hisoblash)}>
            <CalculatorIcon size={18} />
            {t('kalk.hisoblash')}
          </a>
        ))}

      {p.video && (
        <>
          <VideoButton video={p.video} />
          {/* TODO(#25): booking from a Xonadon carries the Planirovka until yozilish has xonadonId. */}
          {!sold && <VideoYozilishLink loyihaId={x.loyihaId} planirovkaId={p.id} />}
        </>
      )}

      <a className="shx-link" href={href(boshqalari)}>
        <GridIcon />
        <span>{t('xonadon.boshqalari')}</span>
        <ChevronRightIcon />
      </a>

      {!sold && (
        <div className="sticky-actions actions-call">
          {/* TODO(#25): Ariza / yozilish about this Xonadon (xonadonId), today about its Planirovka. */}
          <a
            className="button-secondary button-square"
            href={href({ name: 'ariza', planirovkaId: p.id })}
            aria-label={t('planirovka.qongiroq')}
            title={t('planirovka.qongiroq')}
          >
            <PhoneIcon />
          </a>
          <YozilishButton primary loyihaId={x.loyihaId} planirovkaId={p.id} />
        </div>
      )}
    </>
  );
}
