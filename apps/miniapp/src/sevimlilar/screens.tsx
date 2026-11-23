import { TAQQOSLASH_MAX, type PlanirovkaDto, type TaqqoslashDto } from '@yh/shared';
import { useState } from 'react';
import { api } from '../api';
import { useLang, useT, type MessageKey, type Translate } from '../i18n';
import { formatMaydon, formatNarx } from '../katalog/format';
import { HolatBadge, Loaded, PlanIcon } from '../katalog/parts';
import { href, navigate } from '../router';
import { shareToChat, showAlert } from '../telegram';
import { useLoad } from '../useLoad';
import { toggleSevimli, useSevimliIds } from './store';

// ---------------------------------------------------------------- buttons on the Planirovka screen

export function SevimliButton({ id }: { id: number }) {
  const t = useT();
  const on = useSevimliIds().has(id);
  return (
    <button
      className={`button-icon${on ? ' active' : ''}`}
      aria-pressed={on}
      aria-label={t(on ? 'sevimli.remove' : 'sevimli.add')}
      onClick={() => toggleSevimli(id).catch(() => showAlert(t('state.error')))}
    >
      <Heart filled={on} />
    </button>
  );
}

/** Sends a link to this Planirovka into a Telegram chat; the link opens it in the Mini App. */
export function UlashishButton({ p }: { p: PlanirovkaDto }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="button-icon"
      aria-label={t('ulashish.button')}
      disabled={busy}
      onClick={() => {
        setBusy(true);
        api
          .ulashish(p.id)
          .then(({ url }) =>
            shareToChat(
              url,
              t('ulashish.text', {
                loyiha: p.loyihaNomi,
                n: p.xonalar,
                maydon: formatMaydon(p.maydon),
                narx: formatNarx(t, p.boshlangichNarx),
              }),
            ),
          )
          .catch(() => showAlert(t('state.error')))
          .finally(() => setBusy(false));
      }}
    >
      <ShareIcon />
    </button>
  );
}

function Heart({ filled }: { filled: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" strokeLinejoin="round" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M12 3v12M7 8l5-5 5 5M5 14v5h14v-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ---------------------------------------------------------------- Sevimlilar

export function SevimlilarScreen() {
  const t = useT();
  const lang = useLang();
  const load = useLoad(`sevimlilar:${lang}`, () => api.sevimlilar(lang));
  const [tanlangan, setTanlangan] = useState<number[]>([]);

  const toggle = (id: number) =>
    setTanlangan((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : cur.length < TAQQOSLASH_MAX ? [...cur, id] : cur,
    );

  return (
    <>
      <h1 className="h1">{t('sevimli.title')}</h1>
      <Loaded load={load}>
        {({ planirovkalar }) => {
          if (planirovkalar.length === 0) return <p className="muted">{t('sevimli.empty')}</p>;
          const chosen = tanlangan.filter((id) => planirovkalar.some((p) => p.id === id));
          return (
            <>
              <p className="caption muted">{t('taqqoslash.hint', { n: TAQQOSLASH_MAX })}</p>
              <div className="group">
                {planirovkalar.map((p) => {
                  const checked = chosen.includes(p.id);
                  const full = !checked && chosen.length >= TAQQOSLASH_MAX;
                  return (
                    <div key={p.id} className={`plan-row sevimli-row${checked ? ' checked' : ''}`}>
                      <input
                        type="checkbox"
                        className="sevimli-check"
                        checked={checked}
                        disabled={full || p.holat === 'sotilgan'}
                        aria-label={t('taqqoslash.choose')}
                        onChange={() => toggle(p.id)}
                      />
                      <a className="sevimli-link" href={href({ name: 'planirovka', id: p.id })}>
                        <span className="plan-thumb">{p.chizma ? <img src={p.chizma} alt="" loading="lazy" /> : <PlanIcon />}</span>
                        <span className="plan-text">
                          <span className="title">{t('planirovka.short', { n: p.xonalar, maydon: formatMaydon(p.maydon) })}</span>
                          <span className="caption">
                            {[p.loyihaNomi, t('blok.nomi', { nomi: p.blokNomi }), p.nomi].filter(Boolean).join(' · ')}
                          </span>
                          <span className="plan-price">{formatNarx(t, p.boshlangichNarx)}</span>
                        </span>
                      </a>
                      {p.holat !== 'sotuvda' && <HolatBadge holat={p.holat} />}
                    </div>
                  );
                })}
              </div>
              <div className="sticky-actions">
                <button
                  className="button-primary"
                  disabled={chosen.length < 2}
                  onClick={() => navigate({ name: 'taqqoslash', ids: chosen })}
                >
                  {t('taqqoslash.button', { n: chosen.length })}
                </button>
              </div>
            </>
          );
        }}
      </Loaded>
    </>
  );
}

// ---------------------------------------------------------------- Taqqoslash

/** Rows of the table; the lowest narx and m² narxi are highlighted. No qavat (ADR 0001). */
const ROWS: { key: MessageKey; value: (t: Translate, p: TaqqoslashDto) => string; best?: (p: TaqqoslashDto) => number | null }[] = [
  { key: 'taqqoslash.loyiha', value: (_t, p) => p.loyihaNomi },
  { key: 'taqqoslash.blok', value: (_t, p) => p.blokNomi },
  { key: 'taqqoslash.xonalar', value: (_t, p) => String(p.xonalar) },
  { key: 'taqqoslash.maydon', value: (_t, p) => `${formatMaydon(p.maydon)} m²` },
  { key: 'taqqoslash.narx', value: (t, p) => formatNarx(t, p.boshlangichNarx), best: (p) => p.boshlangichNarx },
  { key: 'taqqoslash.kvMetr', value: (t, p) => formatSom(t, p.kvMetrNarxi), best: (p) => p.kvMetrNarxi },
  { key: 'taqqoslash.oylik', value: (t, p) => formatSom(t, p.oylikTolov), best: (p) => p.oylikTolov },
];

function formatSom(t: Translate, n: number | null): string {
  if (n === null) return '—';
  return t('narx.som', { narx: new Intl.NumberFormat('ru-RU').format(n) });
}

export function TaqqoslashScreen({ ids }: { ids: number[] }) {
  const t = useT();
  const lang = useLang();
  const load = useLoad(`taqqoslash:${ids.join(',')}:${lang}`, () =>
    api.taqqoslash(ids.slice(0, TAQQOSLASH_MAX), lang),
  );
  return (
    <>
      <h1 className="h1">{t('taqqoslash.title')}</h1>
      <Loaded load={load}>
        {({ planirovkalar: ps }) => (
          <div className="taqqoslash">
            <table>
              <thead>
                <tr>
                  <th />
                  {ps.map((p) => (
                    <th key={p.id}>
                      <a href={href({ name: 'planirovka', id: p.id })}>{t('planirovka.xonalar', { n: p.xonalar })}</a>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ROWS.map((row) => {
                  const values = row.best ? ps.map(row.best).filter((v): v is number => v !== null) : [];
                  const min = values.length > 1 ? Math.min(...values) : null;
                  return (
                    <tr key={row.key}>
                      <th scope="row" className="caption muted">
                        {t(row.key)}
                      </th>
                      {ps.map((p) => (
                        <td key={p.id} className={min !== null && row.best?.(p) === min ? 'best' : undefined}>
                          {row.value(t, p)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
                <tr>
                  <th scope="row" className="caption muted">
                    {t('taqqoslash.holat')}
                  </th>
                  {ps.map((p) => (
                    <td key={p.id}>
                      <HolatBadge holat={p.holat} />
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
            <p className="caption muted">{t('taqqoslash.legend')}</p>
          </div>
        )}
      </Loaded>
    </>
  );
}
