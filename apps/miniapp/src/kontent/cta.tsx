import { useT, type MessageKey } from '../i18n';
import { href } from '../router';
import { showAlert } from '../telegram';

/**
 * Bottom buttons of «Qanday sotib olish» (TZ 5-b.). «Ariza qoldirish» is the
 * katalog's ArizaButton (#9 owns it). The two below are hooks for screens
 * that other tickets build: replace the onClick with `navigate(...)` to the
 * new route, keep the component name so every caller follows.
 */

/** Opens the calculator (no Planirovka context from here → the Mijoz enters the price). */
export function HisoblashButton({ primary = false }: { primary?: boolean }) {
  const t = useT();
  return (
    <a className={primary ? 'button-primary' : 'button-secondary'} href={href({ name: 'kalkulyator' })}>
      {t('kontent.hisoblash')}
    </a>
  );
}

/**
 * Opens «Ko'rishga yozilish» (#11). Without a Loyiha (menu, «Qanday sotib olish»)
 * the Mijoz picks one on the booking screen.
 */
export function YozilishButton({
  primary = false,
  loyihaId,
  planirovkaId,
  label = 'kontent.yozilish',
}: {
  primary?: boolean;
  loyihaId?: number;
  planirovkaId?: number;
  /** A shorter label where two buttons share the bottom bar. */
  label?: MessageKey;
}) {
  const t = useT();
  return (
    <a className={primary ? 'button-primary' : 'button-secondary'} href={href({ name: 'yozilish', loyihaId, planirovkaId })}>
      {t(label)}
    </a>
  );
}

/** «Ko'rishga yozilish» right under a video (TZ 2-b.: «video ostida»): one quiet line, not another big button. */
export function VideoYozilishLink({ loyihaId, planirovkaId }: { loyihaId: number; planirovkaId?: number }) {
  const t = useT();
  return (
    <a className="yz-link yz-video-link" href={href({ name: 'yozilish', loyihaId, planirovkaId })}>
      {t('yozilish.video')}
    </a>
  );
}
