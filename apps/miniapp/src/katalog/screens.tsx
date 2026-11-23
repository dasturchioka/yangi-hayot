import {
  namunaviyOylik,
  SHAHARLAR,
  type KalkulyatorSozlamalari,
  type LoyihaCardDto,
  type LoyihaDto,
  type PlanirovkaDto,
  type Shahar,
} from '@yh/shared';
import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { useLang, useT, type MessageKey, type Translate } from '../i18n';
import { ChevronRightIcon, GridIcon, InfraIcon, PhoneIcon, PhotoIcon, PinIcon, PlayIcon } from '../icons';
import { BlokHead, xonadonlarRoute } from './shaxmatka';
import { href, replaceRoute, type Route } from '../router';
import { SevimliButton, UlashishButton } from '../sevimlilar/screens';
import { VideoYozilishLink, YozilishButton } from '../kontent/cta';
import '../yozilish/yozilish.css';
import { openExternal } from '../telegram';
import { useLoad, type Load } from '../useLoad';
import { formatMaydon, formatNarx, joyNomi } from './format';
import { ArizaButton, BoshBadge, Chizma, HolatBadge, Loaded, PlanirovkaRow, VideoButton } from './parts';

// ---------------------------------------------------------------- city choice, shared by Bosh and Loyihalar

/** The city the Mijoz last picked: the home list and the Loyihalar tab follow each other. */
let tanlanganShahar: Shahar = 'toshkent';

export function useShahar(): [Shahar, (s: Shahar) => void] {
  const [shahar, setShahar] = useState<Shahar>(tanlanganShahar);
  return [
    shahar,
    (s) => {
      tanlanganShahar = s;
      setShahar(s);
    },
  ];
}

export function useLoyihalar(): Load<{ loyihalar: LoyihaCardDto[] }> {
  const lang = useLang();
  return useLoad(`loyihalar:${lang}`, () => api.loyihalar(lang));
}

export function ShaharSegment({
  shahar,
  onChange,
  loyihalar,
  compact = false,
}: {
  shahar: Shahar;
  onChange: (s: Shahar) => void;
  loyihalar: LoyihaCardDto[];
  compact?: boolean;
}) {
  const t = useT();
  return (
    <div className={compact ? 'segmented segmented-sm' : 'segmented'} role="tablist">
      {SHAHARLAR.map((s) => (
        <button
          key={s}
          role="tab"
          aria-selected={s === shahar}
          className={s === shahar ? 'active' : undefined}
          onClick={() => onChange(s)}
        >
          {t(`shahar.${s}`)}
          {!compact && <span className="segmented-count"> · {loyihalar.filter((l) => l.shahar === s).length}</span>}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- Loyihalar tab

export function LoyihalarScreen() {
  const t = useT();
  const load = useLoyihalar();
  const [shahar, setShahar] = useShahar();

  return (
    <>
      <h1 className="h1">{t('katalog.title')}</h1>
      <Loaded load={load}>
        {({ loyihalar }) => {
          const shown = loyihalar.filter((l) => l.shahar === shahar);
          return (
            <>
              <ShaharSegment shahar={shahar} onChange={setShahar} loyihalar={loyihalar} />
              {shown.length === 0 && <p className="muted">{t('katalog.empty')}</p>}
              <div className="loyiha-list" key={shahar}>
                {shown.map((l, i) => (
                  <LoyihaCard key={l.id} l={l} eager={i < 2} />
                ))}
              </div>
            </>
          );
        }}
      </Loaded>
    </>
  );
}

function cardFacts(t: Translate, l: LoyihaCardDto): string {
  return [
    l.bloklarSoni ? t('loyiha.bloklar', { n: l.bloklarSoni }) : null,
    l.qavatlarSoni ? t('loyiha.qavat', { n: l.qavatlarSoni }) : null,
    l.qisqaTavsif,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Big card of the Loyihalar tab (kit p.5): photo with chips and name, then facts, price and bo'sh count. */
function LoyihaCard({ l, eager }: { l: LoyihaCardDto; eager: boolean }) {
  const t = useT();
  const facts = cardFacts(t, l);
  return (
    <a className="loyiha-card" href={href({ name: 'loyiha', id: l.id })}>
      <div className="loyiha-cover">
        {l.foto && <img src={l.foto} alt="" loading={eager ? 'eager' : 'lazy'} fetchPriority={eager ? 'high' : 'auto'} />}
        <div className="loyiha-cover-chips">
          <span className="chip-on-photo">
            <span className="chip-dot" aria-hidden />
            {t('loyiha.tayyor')}
          </span>
          {l.video && (
            <span className="chip-on-photo chip-on-photo-dark">
              <PlayIcon size={12} />
              {t('loyiha.tab.video')}
            </span>
          )}
        </div>
        <div className="loyiha-cover-text">
          <span className="h2">{l.nomi}</span>
          <span className="caption loyiha-cover-place">
            <PinIcon size={14} />
            {l.manzil}
          </span>
        </div>
      </div>
      <div className="loyiha-card-foot">
        <div className="loyiha-card-foot-text">
          {facts && <p className="caption muted">{facts}</p>}
          <p className="price-sm">{formatNarx(t, l.boshlangichNarx)}</p>
        </div>
        {l.boshXonadonlar > 0 && (
          <span className="bosh-box">
            <b>{l.boshXonadonlar}</b>
            <span>{t('bosh.short')}</span>
          </span>
        )}
      </div>
    </a>
  );
}

/** Compact row card of the home screen (kit p.4, «Loyiha kartochkasi»). */
export function LoyihaRowCard({ l }: { l: LoyihaCardDto }) {
  const t = useT();
  const meta = [l.manzil, l.bloklarSoni ? t('loyiha.bloklar', { n: l.bloklarSoni }) : null].filter(Boolean).join(' · ');
  return (
    <a className="loyiha-row" href={href({ name: 'loyiha', id: l.id })}>
      <span className="loyiha-row-thumb">{l.foto && <img src={l.foto} alt="" loading="lazy" />}</span>
      <span className="loyiha-row-text">
        <span className="title">{l.nomi}</span>
        <span className="caption muted loyiha-row-meta">{meta}</span>
        {l.boshXonadonlar > 0 && <BoshBadge n={l.boshXonadonlar} />}
        <span className="loyiha-row-price">{formatNarx(t, l.boshlangichNarx)}</span>
      </span>
    </a>
  );
}

// ---------------------------------------------------------------- Loyiha

export function LoyihaScreen({ id }: { id: number }) {
  const lang = useLang();
  const load = useLoad(`loyiha:${id}:${lang}`, () => api.loyiha(id, lang));
  return (
    <Loaded load={load} skeleton="detail">
      {({ loyiha }) => <Loyiha l={loyiha} />}
    </Loaded>
  );
}

const INFRA_KEYS: Record<string, MessageKey> = {
  talim: 'infra.talim',
  bogcha: 'infra.bogcha',
  transport: 'infra.transport',
  dokon: 'infra.dokon',
  dam_olish: 'infra.dam_olish',
  masjid: 'infra.masjid',
  tibbiyot: 'infra.tibbiyot',
};

type LoyihaTab = 'infratuzilma' | 'haqida' | 'video';

function Gallery({ l }: { l: LoyihaDto }) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const onScroll = () => {
    const el = ref.current;
    if (el) setIndex(Math.round(el.scrollLeft / el.clientWidth));
  };
  return (
    <div className="gallery-wrap">
      <div className="gallery" ref={ref} onScroll={onScroll}>
        {l.fotolar.length ? (
          l.fotolar.map((src, i) => <img key={src} src={src} alt="" loading={i === 0 ? 'eager' : 'lazy'} />)
        ) : (
          <div className="gallery-empty" />
        )}
      </div>
      <div className="gallery-chips">
        {l.fotolar.length > 1 && (
          <span className="chip-on-photo chip-on-photo-dark">
            <PhotoIcon size={14} />
            {t('loyiha.fotolar', { n: l.fotolar.length })}
          </span>
        )}
        {l.xarita && (
          <button
            className="chip-on-photo chip-on-photo-dark"
            onClick={() => openExternal(`https://yandex.uz/maps/?pt=${l.xarita!.lng},${l.xarita!.lat}&z=16&l=map`)}
          >
            <PinIcon size={14} />
            {t('loyiha.xarita')}
          </button>
        )}
      </div>
      {l.fotolar.length > 1 && (
        <div className="gallery-dots" aria-hidden>
          {l.fotolar.slice(0, 8).map((src, i) => (
            <span key={src} className={i === Math.min(index, 7) ? 'active' : undefined} />
          ))}
        </div>
      )}
    </div>
  );
}

function Loyiha({ l }: { l: LoyihaDto }) {
  const t = useT();
  const tabs: LoyihaTab[] = [
    ...(l.infratuzilma.length > 0 ? (['infratuzilma'] as const) : []),
    ...(l.tavsif ? (['haqida'] as const) : []),
    ...(l.video ? (['video'] as const) : []),
  ];
  const [tab, setTab] = useState<LoyihaTab | undefined>(tabs[0]);
  const [kategoriya, setKategoriya] = useState<string | null>(null);
  const kategoriyalar = [...new Set(l.infratuzilma.map((i) => i.kategoriya))];
  const hasPlanirovkalar = l.bloklar.some((b) => b.guruhlar.length > 0);
  const TAB_KEY: Record<LoyihaTab, MessageKey> = {
    infratuzilma: 'loyiha.tab.infratuzilma',
    haqida: 'loyiha.tab.haqida',
    video: 'loyiha.tab.video',
  };

  return (
    <>
      <Gallery l={l} />

      <div className="loyiha-head">
        <h1 className="h1">{l.nomi}</h1>
        <p className="muted">{joyNomi(t(`shahar.${l.shahar}`), l.manzil)}</p>
      </div>

      {l.jamiXonadonlar > 0 && (
        <div className="stats">
          {l.bloklarSoni > 0 && <Stat n={l.bloklarSoni} label={t('loyiha.stat.blok')} />}
          {l.qavatlarSoni && <Stat n={l.qavatlarSoni} label={t('loyiha.stat.qavat')} />}
          <Stat n={l.jamiXonadonlar} label={t('loyiha.stat.xonadon')} />
          <Stat n={l.boshXonadonlar} label={t('loyiha.stat.bosh')} accent />
        </div>
      )}

      <p className="price">{formatNarx(t, l.boshlangichNarx)}</p>

      {tabs.length > 0 && tab && (
        <section className="loyiha-tabs">
          <div className="tabs" role="tablist">
            {tabs.map((k) => (
              <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'active' : undefined} onClick={() => setTab(k)}>
                {t(TAB_KEY[k])}
              </button>
            ))}
          </div>
          {tab === 'infratuzilma' && (
            <>
              {kategoriyalar.length > 1 && (
                <div className="chips">
                  <button className={kategoriya === null ? 'chip active' : 'chip'} onClick={() => setKategoriya(null)}>
                    {t('infra.all')}
                  </button>
                  {kategoriyalar.map((k) => (
                    <button key={k} className={kategoriya === k ? 'chip active' : 'chip'} onClick={() => setKategoriya(k)}>
                      {INFRA_KEYS[k] ? t(INFRA_KEYS[k]) : k}
                    </button>
                  ))}
                </div>
              )}
              <ul className="infra-list">
                {l.infratuzilma
                  .filter((i) => !kategoriya || i.kategoriya === kategoriya)
                  .map((i) => (
                    <li key={`${i.kategoriya}:${i.nomi}`}>
                      <span className="infra-icon">
                        <InfraIcon kategoriya={i.kategoriya} />
                      </span>
                      <span className="infra-name">{i.nomi}</span>
                      {i.masofa && <span className="caption muted infra-masofa">{i.masofa}</span>}
                    </li>
                  ))}
              </ul>
            </>
          )}
          {tab === 'haqida' && <p className="body-text">{l.tavsif}</p>}
          {tab === 'video' && (
            <div className="loyiha-video">
              <p className="caption muted">{t('loyiha.videoHint')}</p>
              <VideoButton video={l.video} />
              <VideoYozilishLink loyihaId={l.id} />
            </div>
          )}
        </section>
      )}

      {!hasPlanirovkalar && <p className="note note-info">{t('loyiha.noPlanirovkalar')}</p>}

      <div className="sticky-actions actions-split">
        <YozilishButton loyihaId={l.id} label="yozilish.qisqa" />
        {hasPlanirovkalar ? (
          <a className="button-primary" href={href(xonadonlarRoute(l.id))}>
            {t('loyiha.xonadonlar', { n: l.boshXonadonlar })}
          </a>
        ) : (
          <ArizaButton loyihaId={l.id} />
        )}
      </div>
    </>
  );
}

function Stat({ n, label, accent = false }: { n: number; label: string; accent?: boolean }) {
  return (
    <div className={accent ? 'stat stat-accent' : 'stat'}>
      <b>{n}</b>
      <span className="caption">{label}</span>
    </div>
  );
}

// ---------------------------------------------------------------- Planirovkalar of a Loyiha

export function PlanirovkalarScreen({ loyihaId, blokId }: { loyihaId: number; blokId?: number }) {
  const t = useT();
  const lang = useLang();
  const load = useLoad(`loyiha:${loyihaId}:${lang}`, () => api.loyiha(loyihaId, lang));

  return (
    <Loaded load={load}>
      {({ loyiha }) => {
        const bloklar = loyiha.bloklar.filter((b) => b.guruhlar.length > 0);
        const blok = bloklar.find((b) => b.id === blokId) ?? bloklar[0];
        return (
          <>
            <BlokHead
              loyiha={loyiha}
              blokId={blok?.id}
              view="planirovkalar"
              onBlok={(id) => replaceRoute({ name: 'planirovkalar', loyihaId, blokId: id })}
            />
            {!blok && <p className="muted">{t('loyiha.noPlanirovkalar')}</p>}
            <div className="plan-groups" key={blok?.id}>
              {blok?.guruhlar.map((g) => (
                <section key={g.xonalar} className="group">
                  <h2 className="h3">{t('planirovka.guruh', { n: g.xonalar })}</h2>
                  {g.planirovkalar.map((p) => (
                    <PlanirovkaRow key={p.id} p={p} />
                  ))}
                </section>
              ))}
            </div>
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

// ---------------------------------------------------------------- Planirovka

export function PlanirovkaScreen({ id }: { id: number }) {
  const lang = useLang();
  const load = useLoad(`planirovka:${id}:${lang}`, () => api.planirovka(id, lang));
  return (
    <Loaded load={load} skeleton="detail">
      {({ planirovka }) => <Planirovka p={planirovka} />}
    </Loaded>
  );
}

export const mln = (n: number) =>
  new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(n / 1_000_000).replace('.', ',');

function Planirovka({ p }: { p: PlanirovkaDto }) {
  const t = useT();
  const [sozlama, setSozlama] = useState<KalkulyatorSozlamalari | null>(null);
  useEffect(() => {
    if (p.boshlangichNarx === null) return;
    api.kalkulyator().then(({ sozlama }) => setSozlama(sozlama), () => {});
  }, [p.boshlangichNarx]);

  const sold = p.holat === 'sotilgan';
  const kvMetr = p.boshlangichNarx !== null ? p.boshlangichNarx / p.maydon : null;

  return (
    <>
      <Chizma src={p.chizma}>
        <div className="chizma-actions">
          <UlashishButton p={p} />
          <SevimliButton id={p.id} />
        </div>
      </Chizma>

      <div className="plan-head">
        <div className="row-between">
          <p className="caption muted">
            {p.loyihaNomi} · {t('blok.nomi', { nomi: p.blokNomi })}
            {p.nomi ? ` · ${p.nomi}` : ''}
          </p>
          {p.holat === 'sotuvda' ? <HolatBadge holat="sotuvda" /> : <HolatBadge holat={p.holat} />}
        </div>
        <h1 className="h1">{t('planirovka.title', { n: p.xonalar, maydon: formatMaydon(p.maydon) })}</h1>
        <p className="plan-price-line">
          <span className="price">{formatNarx(t, p.boshlangichNarx)}</span>
          {kvMetr !== null && <span className="caption muted">{t('planirovka.kvMetr', { narx: mln(kvMetr) })}</span>}
        </p>
      </div>

      <div className="facts">
        <div className="fact">
          <span className="caption muted">{t('planirovka.fakt.blok')}</span>
          <b>{p.blokNomi}</b>
        </div>
        <div className="fact">
          <span className="caption muted">{t('planirovka.fakt.xonalar')}</span>
          <b>{p.xonalar}</b>
        </div>
        <div className={p.bosh > 0 ? 'fact fact-accent' : 'fact'}>
          <span className="caption">{t('planirovka.fakt.bosh')}</span>
          <b>{t('planirovka.fakt.boshN', { n: p.bosh })}</b>
        </div>
      </div>

      <a className="shx-link" href={href({ name: 'shaxmatka', loyihaId: p.loyihaId, filtr: { blokId: p.blokId }, planirovkaId: p.id })}>
        <GridIcon />
        <span>{t('planirovka.xonadonlari')}</span>
        <ChevronRightIcon />
      </a>

      {p.holat === 'band' && <p className="note note-band">{t('holat.bandHint')}</p>}

      {!sold && sozlama && (
        <OylikCard narx={p.boshlangichNarx} sozlama={sozlama} hisoblash={{ name: 'kalkulyator', planirovkaId: p.id }} />
      )}

      {p.video && (
        <>
          <VideoButton video={p.video} />
          {!sold && <VideoYozilishLink loyihaId={p.loyihaId} planirovkaId={p.id} />}
        </>
      )}

      {!sold && (
        <div className="sticky-actions actions-call">
          <a
            className="button-secondary button-square"
            href={href({ name: 'ariza', planirovkaId: p.id })}
            aria-label={t('planirovka.qongiroq')}
            title={t('planirovka.qongiroq')}
          >
            <PhoneIcon />
          </a>
          <YozilishButton primary loyihaId={p.loyihaId} planirovkaId={p.id} />
        </div>
      )}
    </>
  );
}

/** Dark card (kit p.9): a typical monthly payment for this narx, «Hisoblash» opens the calculator with it. */
export function OylikCard({ narx, sozlama, hisoblash }: { narx: number | null; sozlama: KalkulyatorSozlamalari; hisoblash: Route }) {
  const t = useT();
  const oylik = namunaviyOylik(narx, sozlama);
  if (oylik === null) return null;
  const bank = sozlama.banklar[0];
  const sharti = sozlama.muddatli.yoqilgan
    ? t('planirovka.oylik.muddatli', { n: sozlama.muddatli.maxMuddatOy })
    : t('planirovka.oylik.ipoteka', { bank: bank?.nomi ?? '' });
  return (
    <div className="oylik-card">
      <span className="oylik-card-text">
        <span className="caption">{sharti}</span>
        <span className="oylik-card-sum">{t('planirovka.oylik', { narx: t('narx.som', { narx: t('narx.mln', { n: mln(oylik) }) }) })}</span>
      </span>
      <a className="oylik-card-button" href={href(hisoblash)}>
        {t('kalk.hisoblash')}
      </a>
    </div>
  );
}
