import { TAQQOSLASH_MAX, type PlanirovkaDto, type TaqqoslashDto } from '@yh/shared';
import { useState } from 'react';
import { api } from '../api';
import { useLang, useT, type MessageKey, type Translate } from '../i18n';
import { formatMaydon, formatNarx } from '../katalog/format';
import { EmptyState, HolatBadge, Loaded, PlanIcon } from '../katalog/parts';
import { HeartIcon, ShareIcon } from '../icons';
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
      <ShareIcon size={20} />
    </button>
  );
}

const Heart = ({ filled }: { filled: boolean }) => <HeartIcon size={20} filled={filled} />;

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
          if (planirovkalar.length === 0) {
            return (
              <EmptyState
                icon={<HeartIcon size={26} />}
                title={t('sevimli.emptyTitle')}
                text={t('sevimli.empty')}
                action={
                  <a className="button-secondary button-fit" href={href({ name: 'loyihalar' })}>
                    {t('sevimli.emptyAction')}
                  </a>
                }
              />
            );
          }
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
  { key: 'taqqoslash.blok', value: (_t, p) => p.blokNomi },
  { key: 'taqqoslash.maydon', value: (_t, p) => `${formatMaydon(p.maydon)} m²` },
  { key: 'taqqoslash.narx', value: (t, p) => formatSom(t, p.boshlangichNarx), best: (p) => p.boshlangichNarx },
  { key: 'taqqoslash.kvMetr', value: (t, p) => formatSom(t, p.kvMetrNarxi), best: (p) => p.kvMetrNarxi },
  { key: 'taqqoslash.oylik', value: (t, p) => formatSom(t, p.oylikTolov), best: (p) => p.oylikTolov },
];

/** «10,5 mln so'm»: short enough for three columns at 360px. */
function formatSom(t: Translate, n: number | null): string {
  if (n === null) return '—';
  const mln = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(n / 1_000_000).replace('.', ',');
  return t('narx.som', { narx: t('narx.mln', { n: mln }) });
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
              <colgroup>
                <col className="taqqoslash-label" />
                {ps.map((p) => (
                  <col key={p.id} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  <th />
                  {ps.map((p) => (
                    <th key={p.id}>
                      <a className="taqqoslash-head" href={href({ name: 'planirovka', id: p.id })}>
                        <span className="title">{t('planirovka.xonalar', { n: p.xonalar })}</span>
                        <span className="caption">{p.loyihaNomi}</span>
                        {p.nomi && <span className="caption">{p.nomi}</span>}
                      </a>
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
