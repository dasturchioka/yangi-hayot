import { SHAHARLAR, type LoyihaCardDto, type LoyihaDto, type Shahar } from '@yh/shared';
import { useState } from 'react';
import { api } from '../api';
import { useLang, useT, type MessageKey } from '../i18n';
import { href } from '../router';
import { openExternal } from '../telegram';
import { useLoad } from '../useLoad';
import { formatMaydon, formatNarx } from './format';
import { KontentLinks } from '../kontent/screens';
import { SevimliButton, UlashishButton } from '../sevimlilar/screens';
import { ArizaButton, BoshBadge, Chizma, HolatBadge, Loaded, PlanirovkaRow, VideoButton } from './parts';

// ---------------------------------------------------------------- Loyihalar

export function LoyihalarScreen() {
  const t = useT();
  const lang = useLang();
  const load = useLoad(`loyihalar:${lang}`, () => api.loyihalar(lang));
  const [shahar, setShahar] = useState<Shahar>('toshkent');

  return (
    <>
      <div className="row-between">
        <h1 className="h1">{t('katalog.title')}</h1>
        <a className="button-icon" href={href({ name: 'sevimlilar' })} aria-label={t('sevimli.open')}>
          ♡
        </a>
      </div>
      <Loaded load={load}>
        {({ loyihalar }) => {
          const shown = loyihalar.filter((l) => l.shahar === shahar);
          return (
            <>
              <div className="segmented" role="tablist">
                {SHAHARLAR.map((s) => (
                  <button
                    key={s}
                    role="tab"
                    aria-selected={s === shahar}
                    className={s === shahar ? 'active' : undefined}
                    onClick={() => setShahar(s)}
                  >
                    {t(`shahar.${s}`)} · {loyihalar.filter((l) => l.shahar === s).length}
                  </button>
                ))}
              </div>
              {shown.length === 0 && <p className="muted">{t('katalog.empty')}</p>}
              {shown.map((l, i) => (
                <LoyihaCard key={l.id} l={l} eager={i < 2} />
              ))}
            </>
          );
        }}
      </Loaded>
      <KontentLinks />
    </>
  );
}

function LoyihaCard({ l, eager }: { l: LoyihaCardDto; eager: boolean }) {
  const t = useT();
  const facts = [
    l.bloklarSoni ? t('loyiha.bloklar', { n: l.bloklarSoni }) : null,
    l.qavatlarSoni ? t('loyiha.qavat', { n: l.qavatlarSoni }) : null,
    l.qisqaTavsif,
  ].filter(Boolean);
  return (
    <a className="card loyiha-card" href={href({ name: 'loyiha', id: l.id })}>
      <div className="loyiha-cover">
        {l.foto && <img src={l.foto} alt="" loading={eager ? 'eager' : 'lazy'} fetchPriority={eager ? 'high' : 'auto'} />}
        {l.video && <span className="chip-on-photo">▶ Video</span>}
        <div className="loyiha-cover-text">
          <span className="h2">{l.nomi}</span>
          <span className="caption">{l.manzil}</span>
        </div>
      </div>
      <div className="loyiha-card-foot">
        <div>
          {facts.length > 0 && <p className="caption muted">{facts.join(' · ')}</p>}
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

// ---------------------------------------------------------------- Loyiha

export function LoyihaScreen({ id }: { id: number }) {
  const lang = useLang();
  const load = useLoad(`loyiha:${id}:${lang}`, () => api.loyiha(id, lang));
  return <Loaded load={load}>{({ loyiha }) => <Loyiha l={loyiha} />}</Loaded>;
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

function Loyiha({ l }: { l: LoyihaDto }) {
  const t = useT();
  const [tab, setTab] = useState<'infratuzilma' | 'haqida'>(l.infratuzilma.length ? 'infratuzilma' : 'haqida');
  const [kategoriya, setKategoriya] = useState<string | null>(null);
  const kategoriyalar = [...new Set(l.infratuzilma.map((i) => i.kategoriya))];
  const hasPlanirovkalar = l.bloklar.some((b) => b.guruhlar.length > 0);

  return (
    <>
      <div className="gallery-wrap">
        <div className="gallery">
          {l.fotolar.length ? (
            l.fotolar.map((src, i) => <img key={src} src={src} alt="" loading={i === 0 ? 'eager' : 'lazy'} />)
          ) : (
            <div className="gallery-empty" />
          )}
        </div>
        <div className="gallery-chips">
          {l.fotolar.length > 1 && <span className="chip-on-photo">{t('loyiha.fotolar', { n: l.fotolar.length })}</span>}
          {l.xarita && (
            <button
              className="chip-on-photo"
              onClick={() => openExternal(`https://yandex.uz/maps/?pt=${l.xarita!.lng},${l.xarita!.lat}&z=16&l=map`)}
            >
              {t('loyiha.xarita')}
            </button>
          )}
        </div>
      </div>

      <div>
        <h1 className="h1">{l.nomi}</h1>
        <p className="muted">
          {t(`shahar.${l.shahar}`)}, {l.manzil}
        </p>
      </div>

      <div className="stats">
        {l.bloklarSoni > 0 && <Stat n={l.bloklarSoni} label={t('loyiha.stat.blok')} />}
        {l.qavatlarSoni && <Stat n={l.qavatlarSoni} label={t('loyiha.stat.qavat')} />}
        {l.jamiXonadonlar > 0 && <Stat n={l.jamiXonadonlar} label={t('loyiha.stat.xonadon')} />}
        {l.jamiXonadonlar > 0 && <Stat n={l.boshXonadonlar} label={t('loyiha.stat.bosh')} accent />}
      </div>

      <p className="price">{formatNarx(t, l.boshlangichNarx)}</p>
      <VideoButton video={l.video} />

      {(l.infratuzilma.length > 0 || l.tavsif) && (
        <>
          <div className="tabs" role="tablist">
            {l.infratuzilma.length > 0 && (
              <button
                role="tab"
                aria-selected={tab === 'infratuzilma'}
                className={tab === 'infratuzilma' ? 'active' : undefined}
                onClick={() => setTab('infratuzilma')}
              >
                {t('loyiha.tab.infratuzilma')}
              </button>
            )}
            {l.tavsif && (
              <button
                role="tab"
                aria-selected={tab === 'haqida'}
                className={tab === 'haqida' ? 'active' : undefined}
                onClick={() => setTab('haqida')}
              >
                {t('loyiha.tab.haqida')}
              </button>
            )}
          </div>
          {tab === 'infratuzilma' && l.infratuzilma.length > 0 && (
            <>
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
              <ul className="infra-list">
                {l.infratuzilma
                  .filter((i) => !kategoriya || i.kategoriya === kategoriya)
                  .map((i) => (
                    <li key={`${i.kategoriya}:${i.nomi}`}>
                      <span>{i.nomi}</span>
                      {i.masofa && <span className="caption muted">{i.masofa}</span>}
                    </li>
                  ))}
              </ul>
            </>
          )}
          {tab === 'haqida' && l.tavsif && <p className="body-text">{l.tavsif}</p>}
        </>
      )}

      {!hasPlanirovkalar && <p className="muted">{t('loyiha.noPlanirovkalar')}</p>}

      <div className="sticky-actions">
        {hasPlanirovkalar ? (
          <a className="button-primary" href={href({ name: 'planirovkalar', loyihaId: l.id })}>
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

export function PlanirovkalarScreen({ loyihaId }: { loyihaId: number }) {
  const t = useT();
  const lang = useLang();
  const load = useLoad(`loyiha:${loyihaId}:${lang}`, () => api.loyiha(loyihaId, lang));
  const [blokId, setBlokId] = useState<number | null>(null);

  return (
    <Loaded load={load}>
      {({ loyiha }) => {
        const bloklar = loyiha.bloklar.filter((b) => b.guruhlar.length > 0);
        const blok = bloklar.find((b) => b.id === blokId) ?? bloklar[0];
        return (
          <>
            <div>
              <p className="label">{loyiha.nomi}</p>
              <h1 className="h1">{t('loyiha.xonadonlar', { n: loyiha.boshXonadonlar })}</h1>
            </div>
            {bloklar.length > 1 && (
              <div className="chips" role="tablist">
                {bloklar.map((b) => (
                  <button
                    key={b.id}
                    role="tab"
                    aria-selected={b === blok}
                    className={b === blok ? 'chip active' : 'chip'}
                    onClick={() => setBlokId(b.id)}
                  >
                    {t('blok.nomi', { nomi: b.nomi })} · {b.boshXonadonlar}
                  </button>
                ))}
              </div>
            )}
            {!blok && <p className="muted">{t('loyiha.noPlanirovkalar')}</p>}
            {blok?.guruhlar.map((g) => (
              <section key={g.xonalar} className="group">
                <h2 className="h3">{t('planirovka.guruh', { n: g.xonalar })}</h2>
                {g.planirovkalar.map((p) => (
                  <PlanirovkaRow key={p.id} p={p} />
                ))}
              </section>
            ))}
          </>
        );
      }}
    </Loaded>
  );
}

// ---------------------------------------------------------------- Planirovka

export function PlanirovkaScreen({ id }: { id: number }) {
  const t = useT();
  const lang = useLang();
  const load = useLoad(`planirovka:${id}:${lang}`, () => api.planirovka(id, lang));

  return (
    <Loaded load={load}>
      {({ planirovka: p }) => (
        <>
          <Chizma src={p.chizma} />
          <div className="row-actions">
            <SevimliButton id={p.id} />
            <UlashishButton p={p} />
          </div>
          <div className="row-between">
            <p className="muted">
              {p.loyihaNomi} · {t('blok.nomi', { nomi: p.blokNomi })}
              {p.nomi ? ` · ${p.nomi}` : ''}
            </p>
            {p.holat === 'sotuvda' ? <BoshBadge n={p.bosh} /> : <HolatBadge holat={p.holat} />}
          </div>
          <h1 className="h1">{t('planirovka.title', { n: p.xonalar, maydon: formatMaydon(p.maydon) })}</h1>
          <p className="price">{formatNarx(t, p.boshlangichNarx)}</p>
          {p.holat === 'band' && <p className="note note-band">{t('holat.bandHint')}</p>}
          <VideoButton video={p.video} />
          {p.holat !== 'sotilgan' && (
            <div className="sticky-actions">
              <ArizaButton planirovkaId={p.id} />
            </div>
          )}
        </>
      )}
    </Loaded>
  );
}
