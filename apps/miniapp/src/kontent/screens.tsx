import type { KontentResponse } from '@yh/shared';
import { useRef } from 'react';
import { api } from '../api';
import { useLang, useT } from '../i18n';
import { ArizaButton, Loaded } from '../katalog/parts';
import { openExternal } from '../telegram';
import { useAutoSlide } from '../useAutoSlide';
import { useLoad } from '../useLoad';
import './kontent.css';
import { HisoblashButton, YozilishButton } from './cta';
import { ChevronIcon, ClockIcon, DocIcon, PhoneIcon, PinIcon, SendIcon } from './icons';

function useKontent() {
  const lang = useLang();
  return useLoad(`kontent:${lang}`, () => api.kontent(lang));
}

/** «tel:» link for «1349» or «+998 71 …». */
export const telHref = (telefon: string) => `tel:${telefon.replace(/[^\d+]/g, '')}`;

const xaritaUrl = ({ lat, lng }: { lat: number; lng: number }) =>
  `https://yandex.uz/maps/?pt=${lng},${lat}&z=16&l=map`;

// ---------------------------------------------------------------- «Qanday sotib olish»

export function SotibOlishScreen() {
  const load = useKontent();
  return <Loaded load={load}>{({ sotibOlish }) => <SotibOlish k={sotibOlish} />}</Loaded>;
}

function SotibOlish({ k }: { k: KontentResponse['sotibOlish'] }) {
  const t = useT();
  return (
    <>
      <h1 className="h1 balance">{k.sarlavha}</h1>

      <ol className="steps">
        {k.bosqichlar.map((b, i) => (
          <li key={i} className="step">
            <span className="step-n" aria-hidden>
              {i + 1}
            </span>
            <div>
              <p className="title">{b.nomi}</p>
              <p className="caption body-text">{b.matn}</p>
            </div>
          </li>
        ))}
      </ol>

      {k.hujjatlar.length > 0 && <Hujjatlar title={t('kontent.hujjatlar')} items={k.hujjatlar} />}
      {k.ipotekaHujjatlari.length > 0 && <Hujjatlar title={t('kontent.ipotekaHujjatlari')} items={k.ipotekaHujjatlari} />}

      {k.faq.length > 0 && (
        <section className="kontent-section">
          <h2 className="h3">{t('kontent.faq')}</h2>
          <div className="faq">
            {k.faq.map((f, i) => (
              <details key={i} className="faq-item">
                <summary>
                  <span className="title">{f.savol}</span>
                  <ChevronIcon />
                </summary>
                <p className="body-text">{f.javob}</p>
              </details>
            ))}
          </div>
        </section>
      )}

      <div className="sticky-actions cta-stack">
        <ArizaButton />
        <div className="cta-row">
          <HisoblashButton />
          <YozilishButton />
        </div>
      </div>
    </>
  );
}

function Hujjatlar({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="kontent-section">
      <h2 className="h3">{title}</h2>
      <ul className="doc-list">
        {items.map((h, i) => (
          <li key={i}>
            <DocIcon />
            <span>{h}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------- «Biz haqimizda» + kontaktlar

/** Delivered Loyihalar: a sideways strip that moves on by itself (see useAutoSlide). */
function Portfolio({ items }: { items: KontentResponse['bizHaqimizda']['portfolio'] }) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  useAutoSlide(ref, items.length);
  return (
    <div className="portfolio" role="list" ref={ref}>
      {items.map((l) => (
        <article key={l.id} className="portfolio-card" role="listitem">
          <div className="portfolio-photo">{l.foto && <img src={l.foto} alt="" loading="lazy" />}</div>
          <p className="title">{l.nomi}</p>
          <p className="caption muted">
            {t(`shahar.${l.shahar}`)} · {t('kontent.topshirilgan')}
          </p>
        </article>
      ))}
    </div>
  );
}

export function BizHaqimizdaScreen() {
  const load = useKontent();
  return <Loaded load={load}>{(k) => <BizHaqimizda k={k} />}</Loaded>;
}

function BizHaqimizda({ k }: { k: KontentResponse }) {
  const t = useT();
  const { bizHaqimizda: b, kontaktlar: c } = k;
  return (
    <>
      <div className={b.foto ? 'about-hero' : 'about-hero about-hero-plain'}>
        {b.foto && <img src={b.foto} alt="" fetchPriority="high" />}
        <h1 className="h2 balance">{b.sarlavha}</h1>
      </div>

      {b.raqamlar.length > 0 && (
        <div className="about-stats" style={{ gridTemplateColumns: `repeat(${Math.min(b.raqamlar.length, 3)}, 1fr)` }}>
          {b.raqamlar.map((r, i) => (
            <div key={i} className="stat">
              <b>{r.qiymat}</b>
              <span className="caption">{r.nomi}</span>
            </div>
          ))}
        </div>
      )}

      {b.matn && <p className="body-text about-text">{b.matn}</p>}

      {b.portfolio.length > 0 && (
        <section className="kontent-section">
          <h2 className="h3">{t('kontent.portfolio', { n: b.portfolio.length })}</h2>
          <Portfolio items={b.portfolio} />
        </section>
      )}

      <section className="kontent-section" id="aloqa">
        <h2 className="h3">{t('kontent.aloqa')}</h2>
        <ul className="contact-list">
          <li>
            <a className="contact-row" href={telHref(c.telefon)}>
              <PhoneIcon />
              <span>
                <span className="caption muted">{t('kontent.telefon')}</span>
                <span className="title">{c.telefon}</span>
              </span>
            </a>
          </li>
          <li>
            <div className="contact-row">
              <PinIcon />
              <span>
                <span className="caption muted">{t('kontent.manzil')}</span>
                <span className="title">{c.manzil}</span>
              </span>
              {c.xarita && (
                <button className="link-button" onClick={() => openExternal(xaritaUrl(c.xarita!))}>
                  {t('kontent.xarita')}
                </button>
              )}
            </div>
          </li>
          <li>
            <div className="contact-row">
              <ClockIcon />
              <span>
                <span className="caption muted">{t('kontent.ishVaqti')}</span>
                <span className="title">{c.ishVaqti}</span>
              </span>
            </div>
          </li>
          {c.telegram && (
            <li>
              <button className="contact-row" onClick={() => openExternal(`https://t.me/${c.telegram}`)}>
                <SendIcon />
                <span>
                  <span className="caption muted">{t('kontent.telegram')}</span>
                  <span className="title">@{c.telegram}</span>
                </span>
              </button>
            </li>
          )}
        </ul>
      </section>

      <div className="sticky-actions">
        <a className="button-primary button-call" href={telHref(c.telefon)}>
          <PhoneIcon />
          {t('kontent.qongiroq')}
        </a>
      </div>
    </>
  );
}
