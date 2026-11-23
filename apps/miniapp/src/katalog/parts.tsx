import type { PlanirovkaDto, PlanirovkaHolati, VideoDto } from '@yh/shared';
import { useState, type ReactNode } from 'react';
import { useT } from '../i18n';
import { href } from '../router';
import { openExternal, showAlert } from '../telegram';
import type { Load } from '../useLoad';
import { formatMaydon, formatNarx } from './format';

/** Renders loading / error states; `children` only when the data is there. */
export function Loaded<T>({ load, children }: { load: Load<T>; children: (data: T) => ReactNode }) {
  const t = useT();
  if (load.kind === 'loading') return <p className="muted">{t('state.loading')}</p>;
  if (load.kind === 'error') {
    if (load.notFound) return <p className="muted">{t('state.notFound')}</p>;
    return (
      <>
        <p className="error">{t('state.error')}</p>
        <button className="button-primary" onClick={load.retry}>
          {t('state.retry')}
        </button>
      </>
    );
  }
  return <>{children(load.data)}</>;
}

const HOLAT_KEY = { sotuvda: 'holat.sotuvda', band: 'holat.band', sotilgan: 'holat.sotilgan' } as const;

export function HolatBadge({ holat }: { holat: PlanirovkaHolati }) {
  const t = useT();
  return <span className={`badge badge-${holat}`}>{t(HOLAT_KEY[holat])}</span>;
}

export function BoshBadge({ n }: { n: number }) {
  const t = useT();
  return <span className="badge badge-sotuvda">{t('bosh.count', { n })}</span>;
}

/** Hidden when there is no video link (server gives only Telegram / YouTube ones). */
export function VideoButton({ video }: { video: VideoDto | null }) {
  const t = useT();
  if (!video) return null;
  return (
    <button className="button-secondary" onClick={() => openExternal(video.url)}>
      ▶ {t('video.watch')}
    </button>
  );
}

/** TODO(#9): open the Ariza form with this context (loyihaId / planirovkaId). */
export function ArizaButton({ primary = true }: { loyihaId?: number; planirovkaId?: number; primary?: boolean }) {
  const t = useT();
  return (
    <button className={primary ? 'button-primary' : 'button-secondary'} onClick={() => showAlert(t('ariza.soon'))}>
      {t('ariza.leave')}
    </button>
  );
}

export function PlanIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="3" y="3" width="22" height="22" rx="2" />
      <path d="M3 13h10V3M13 13v12M19 13h6" />
    </svg>
  );
}

/** One Planirovka in a list. Sotilgan ones are shown but cannot be opened. */
export function PlanirovkaRow({ p, showBlok = false }: { p: PlanirovkaDto; showBlok?: boolean }) {
  const t = useT();
  const sold = p.holat === 'sotilgan';
  const body = (
    <>
      <span className="plan-thumb">
        {p.chizma ? <img src={p.chizma} alt="" loading="lazy" /> : <PlanIcon />}
      </span>
      <span className="plan-text">
        <span className="title">{t('planirovka.short', { n: p.xonalar, maydon: formatMaydon(p.maydon) })}</span>
        <span className="caption">
          {[showBlok ? t('blok.nomi', { nomi: p.blokNomi }) : null, p.nomi].filter(Boolean).join(' · ')}
        </span>
        <span className="plan-price">{formatNarx(t, p.boshlangichNarx)}</span>
      </span>
      <span className="plan-side">
        {p.holat === 'sotuvda' ? <BoshBadge n={p.bosh} /> : <HolatBadge holat={p.holat} />}
      </span>
    </>
  );
  if (sold) {
    return (
      <div className="plan-row plan-row-sold" aria-disabled="true">
        {body}
      </div>
    );
  }
  return (
    <a className="plan-row" href={href({ name: 'planirovka', id: p.id })}>
      {body}
    </a>
  );
}

/** Chizma that opens full screen on tap; tap again to zoom in, scroll to move around. */
export function Chizma({ src }: { src: string | null }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  if (!src) {
    return (
      <div className="chizma chizma-empty">
        <PlanIcon />
      </div>
    );
  }
  return (
    <>
      <button className="chizma" onClick={() => setOpen(true)} aria-label={t('planirovka.chizmaHint')}>
        <img src={src} alt="" />
        <span className="chizma-hint caption">{t('planirovka.chizmaHint')}</span>
      </button>
      {open && (
        <div className="lightbox" role="dialog">
          <button
            className="lightbox-close"
            onClick={() => {
              setOpen(false);
              setZoomed(false);
            }}
          >
            {t('planirovka.close')}
          </button>
          <div className="lightbox-scroll">
            <img
              src={src}
              alt=""
              className={zoomed ? 'zoomed' : undefined}
              onClick={() => setZoomed((z) => !z)}
            />
          </div>
        </div>
      )}
    </>
  );
}
