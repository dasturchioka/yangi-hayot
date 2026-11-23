import { useT } from '../i18n';
import { showAlert } from '../telegram';

/**
 * Bottom buttons of «Qanday sotib olish» (TZ 5-b.). «Ariza qoldirish» is the
 * katalog's ArizaButton (#9 owns it). The two below are hooks for screens
 * that other tickets build: replace the onClick with `navigate(...)` to the
 * new route, keep the component name so every caller follows.
 */

/** TODO(#12): open the calculator (no Planirovka context from here → Mijoz enters the price). */
export function HisoblashButton({ primary = false }: { primary?: boolean }) {
  const t = useT();
  return (
    <button
      className={primary ? 'button-primary' : 'button-secondary'}
      onClick={() => showAlert(t('kontent.hisoblashSoon'))}
    >
      {t('kontent.hisoblash')}
    </button>
  );
}

/** TODO(#11): open «Ko'rishga yozilish» (no Loyiha context from here → Mijoz picks it). */
export function YozilishButton({ primary = false }: { primary?: boolean }) {
  const t = useT();
  return (
    <button
      className={primary ? 'button-primary' : 'button-secondary'}
      onClick={() => showAlert(t('kontent.yozilishSoon'))}
    >
      {t('kontent.yozilish')}
    </button>
  );
}
