import type { PlanirovkaDto, PlanirovkaHolati, VideoDto } from '@yh/shared';
import { useState, type ReactNode } from 'react';
import { useT } from '../i18n';
import { HeartIcon, PlanIcon as LinePlanIcon, PlayIcon, SearchIcon } from '../icons';
import { href } from '../router';
import { toggleSevimli, useSevimliIds } from '../sevimlilar/store';
import { openExternal, showAlert } from '../telegram';
import type { Load } from '../useLoad';
import { formatMaydon, formatNarx } from './format';

/** Kit «Yuklanish (skeleton)»: grey shapes where the content will be. */
export function Skeleton({ kind = 'list' }: { kind?: 'list' | 'detail' }) {
  if (kind === 'detail') {
    return (
      <div className="skeleton" aria-hidden>
        <span className="skeleton-block skeleton-hero" />
        <span className="skeleton-line" style={{ width: '62%', height: 26 }} />
        <span className="skeleton-line" style={{ width: '44%' }} />
        <span className="skeleton-row">
          <span className="skeleton-block" />
          <span className="skeleton-block" />
          <span className="skeleton-block" />
        </span>
      </div>
    );
  }
  return (
    <div className="skeleton" aria-hidden>
      {[0, 1, 2].map((i) => (
        <span key={i} className="skeleton-card">
          <span className="skeleton-block skeleton-thumb" />
          <span className="skeleton-lines">
            <span className="skeleton-line" style={{ width: '70%' }} />
            <span className="skeleton-line" style={{ width: '50%' }} />
            <span className="skeleton-line" style={{ width: '38%' }} />
          </span>
        </span>
      ))}
    </div>
  );
}

/** Kit «Bo'sh holat»: leaf icon tile, title, one line, an optional way out. */
export function EmptyState({
  icon = <SearchIcon size={26} />,
  title,
  text,
  action,
}: {
  icon?: ReactNode;
  title: string;
  text?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-state-icon">{icon}</span>
      <p className="title">{title}</p>
      {text && <p className="caption empty-state-text">{text}</p>}
      {action}
    </div>
  );
}

/** Renders loading / error states; `children` only when the data is there. */
export function Loaded<T>({
  load,
  children,
  skeleton = 'list',
}: {
  load: Load<T>;
  children: (data: T) => ReactNode;
  skeleton?: 'list' | 'detail';
}) {
  const t = useT();
  if (load.kind === 'loading') {
    return (
      <>
        <span className="visually-hidden" role="status">
          {t('state.loading')}
        </span>
        <Skeleton kind={skeleton} />
      </>
    );
  }
  if (load.kind === 'error') {
    if (load.notFound) {
      return (
        <EmptyState
          title={t('state.notFound')}
          action={
            <a className="button-secondary button-fit" href={href({ name: 'bosh' })}>
              {t('tab.bosh')}
            </a>
          }
        />
      );
    }
    return (
      <EmptyState
        title={t('state.errorTitle')}
        text={t('state.error')}
        action={
          <button className="button-secondary button-fit" onClick={load.retry}>
            {t('state.retry')}
          </button>
        }
      />
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
      <PlayIcon size={18} />
      {t('video.watch')}
    </button>
  );
}

/** Opens the «Ariza qoldirish» form about this Loyiha or Planirovka. */
export function ArizaButton({
  loyihaId,
  planirovkaId,
  primary = true,
}: {
  loyihaId?: number;
  planirovkaId?: number;
  primary?: boolean;
}) {
  const t = useT();
  return (
    <a className={primary ? 'button-primary' : 'button-secondary'} href={href({ name: 'ariza', loyihaId, planirovkaId })}>
      {t('ariza.leave')}
    </a>
  );
}

export function PlanIcon() {
  return <LinePlanIcon size={28} />;
}

/** Small heart on a list row (kit «Xonadon qatori»). */
export function RowSevimli({ id }: { id: number }) {
  const t = useT();
  const on = useSevimliIds().has(id);
  return (
    <button
      type="button"
      className={`row-heart${on ? ' active' : ''}`}
      aria-pressed={on}
      aria-label={t(on ? 'sevimli.remove' : 'sevimli.add')}
      onClick={() => toggleSevimli(id).catch(() => showAlert(t('state.error')))}
    >
      <HeartIcon size={18} filled={on} />
    </button>
  );
}

/** One Planirovka in a list. Sotilgan ones are shown but cannot be opened. */
export function PlanirovkaRow({
  p,
  showBlok = false,
  showLoyiha = false,
}: {
  p: PlanirovkaDto;
  showBlok?: boolean;
  /** Lists across Loyihalar (filter results) name the Loyiha too. */
  showLoyiha?: boolean;
}) {
  const t = useT();
  const sold = p.holat === 'sotilgan';
  const meta = [showLoyiha ? p.loyihaNomi : null, showBlok ? t('blok.nomi', { nomi: p.blokNomi }) : null, p.nomi]
    .filter(Boolean)
    .join(' · ');
  const body = (
    <>
      <span className="plan-thumb">
        {p.chizma ? <img src={p.chizma} alt="" loading="lazy" /> : <PlanIcon />}
      </span>
      <span className="plan-text">
        <span className="title">{t('planirovka.short', { n: p.xonalar, maydon: formatMaydon(p.maydon) })}</span>
        {meta && <span className="caption">{meta}</span>}
        <span className="plan-price">{formatNarx(t, p.boshlangichNarx)}</span>
        <span className={`plan-holat plan-holat-${p.holat}`}>
          {p.holat === 'sotuvda' ? t('bosh.count', { n: p.bosh }) : t(HOLAT_KEY[p.holat])}
        </span>
      </span>
    </>
  );
  if (sold) {
    return (
      <div className="plan-row plan-row-sold" aria-disabled="true">
        <span className="plan-link">{body}</span>
      </div>
    );
  }
  return (
    <div className="plan-row">
      <a className="plan-link" href={href({ name: 'planirovka', id: p.id })}>
        {body}
      </a>
      <RowSevimli id={p.id} />
    </div>
  );
}

/** Chizma that opens full screen on tap; tap again to zoom in, scroll to move around. */
export function Chizma({ src, children }: { src: string | null; children?: ReactNode }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  if (!src) {
    return (
      <div className="chizma chizma-empty">
        <LinePlanIcon size={72} />
        {children}
      </div>
    );
  }
  return (
    <>
      <div className="chizma">
        <button className="chizma-open" onClick={() => setOpen(true)} aria-label={t('planirovka.chizmaHint')}>
          <img src={src} alt="" />
        </button>
        {children}
      </div>
      {open && (
        <div className="lightbox" role="dialog" aria-modal="true">
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
