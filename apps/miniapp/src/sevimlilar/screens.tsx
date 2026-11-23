import {
  TAQQOSLASH_MAX,
  taqqoslashKaliti,
  type PlanirovkaDto,
  type PlanirovkaHolati,
  type SevimliXonadonDto,
  type TaqqoslashDto,
  type TaqqoslashKalit,
  type XonadonDto,
} from '@yh/shared';
import { useState, type ReactNode } from 'react';
import { api } from '../api';
import { useLang, useT, type MessageKey, type Translate } from '../i18n';
import { formatMaydon, formatNarx } from '../katalog/format';
import { EmptyState, HolatBadge, Loaded, PlanIcon } from '../katalog/parts';
import { HeartIcon, ShareIcon } from '../icons';
import { href, navigate, type Route } from '../router';
import { shareToChat, showAlert } from '../telegram';
import { useLoad } from '../useLoad';
import { toggleSevimli, useSevimliKalitlar } from './store';

// ---------------------------------------------------------------- buttons on the Xonadon / Planirovka screens

/** Heart on a kartochka: `x<id>` = this Xonadon (#25), `p<id>` = this Planirovka (#16). */
export function SevimliButton({ kalit }: { kalit: TaqqoslashKalit }) {
  const t = useT();
  const on = useSevimliKalitlar().has(kalit);
  return (
    <button
      className={`button-icon${on ? ' active' : ''}`}
      aria-pressed={on}
      aria-label={t(on ? 'sevimli.remove' : 'sevimli.add')}
      onClick={() => toggleSevimli(kalit).catch(() => showAlert(t('state.error')))}
    >
      <HeartIcon size={20} filled={on} />
    </button>
  );
}

/**
 * Sends a link into a Telegram chat; the link opens the same screen in the
 * Mini App and, for someone else, brings Manba «mijoz ulashdi». With `x` the
 * link is to that Xonadon (#25), else to the Planirovka.
 */
export function UlashishButton({ p, x }: { p: PlanirovkaDto; x?: XonadonDto }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const text = x
    ? t('ulashish.xonadonText', {
        loyiha: p.loyihaNomi,
        raqam: `${x.blokNomi}-${x.raqam}`,
        qavat: x.qavat,
        n: x.xonalar,
        maydon: formatMaydon(x.maydon),
        narx: x.narx === null ? t('narx.onRequest') : formatSom(t, x.narx),
      })
    : t('ulashish.text', {
        loyiha: p.loyihaNomi,
        n: p.xonalar,
        maydon: formatMaydon(p.maydon),
        narx: formatNarx(t, p.boshlangichNarx),
      });
  return (
    <button
      className="button-icon"
      aria-label={t('ulashish.button')}
      disabled={busy}
      onClick={() => {
        setBusy(true);
        api
          .ulashish(x ? { xonadonId: x.id } : { planirovkaId: p.id })
          .then(({ url }) => shareToChat(url, text))
          .catch(() => showAlert(t('state.error')))
          .finally(() => setBusy(false));
      }}
    >
      <ShareIcon size={20} />
    </button>
  );
}

// ---------------------------------------------------------------- Sevimlilar

const XONADON_BADGE: Record<XonadonDto['holat'], PlanirovkaHolati> = { bosh: 'sotuvda', bron: 'band', sotilgan: 'sotilgan' };

/** One row of the list: what both kinds have in common. */
interface Qator {
  kalit: TaqqoslashKalit;
  route: Route;
  chizma: string | null;
  title: string;
  caption: string;
  price: string;
  holat: PlanirovkaHolati;
}

function xonadonQatori(t: Translate, { xonadon: x, planirovka: p }: SevimliXonadonDto): Qator {
  return {
    kalit: taqqoslashKaliti('xonadon', x.id),
    route: { name: 'xonadon', id: x.id },
    chizma: p.chizma,
    title: t('planirovka.short', { n: x.xonalar, maydon: formatMaydon(x.maydon) }),
    caption: [p.loyihaNomi, `№ ${x.blokNomi}-${x.raqam}`, t('shaxmatka.qavat', { n: x.qavat })].join(' · '),
    price: x.narx === null ? t('narx.onRequest') : formatSom(t, x.narx),
    holat: XONADON_BADGE[x.holat],
  };
}

function planirovkaQatori(t: Translate, p: PlanirovkaDto): Qator {
  return {
    kalit: taqqoslashKaliti('planirovka', p.id),
    route: { name: 'planirovka', id: p.id },
    chizma: p.chizma,
    title: t('planirovka.short', { n: p.xonalar, maydon: formatMaydon(p.maydon) }),
    caption: [p.loyihaNomi, t('blok.nomi', { nomi: p.blokNomi }), p.nomi].filter(Boolean).join(' · '),
    price: formatNarx(t, p.boshlangichNarx),
    holat: p.holat,
  };
}

export function SevimlilarScreen() {
  const t = useT();
  const lang = useLang();
  const load = useLoad(`sevimlilar:${lang}`, () => api.sevimlilar(lang));
  const [tanlangan, setTanlangan] = useState<TaqqoslashKalit[]>([]);

  const toggle = (kalit: TaqqoslashKalit) =>
    setTanlangan((cur) =>
      cur.includes(kalit) ? cur.filter((x) => x !== kalit) : cur.length < TAQQOSLASH_MAX ? [...cur, kalit] : cur,
    );

  return (
    <>
      <h1 className="h1">{t('sevimli.title')}</h1>
      <Loaded load={load}>
        {({ xonadonlar, planirovkalar }) => {
          const guruhlar: { nomi: MessageKey; qatorlar: Qator[] }[] = [
            { nomi: 'sevimli.xonadonlar' as const, qatorlar: xonadonlar.map((s) => xonadonQatori(t, s)) },
            { nomi: 'sevimli.planirovkalar' as const, qatorlar: planirovkalar.map((p) => planirovkaQatori(t, p)) },
          ].filter((g) => g.qatorlar.length > 0);
          if (guruhlar.length === 0) {
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
          const bor = new Set(guruhlar.flatMap((g) => g.qatorlar.map((q) => q.kalit)));
          const chosen = tanlangan.filter((k) => bor.has(k));
          return (
            <>
              <p className="caption muted">{t('taqqoslash.hint', { n: TAQQOSLASH_MAX })}</p>
              {guruhlar.map((g) => (
                <section key={g.nomi} className="group" aria-label={t(g.nomi)}>
                  {/* Headings only when both kinds are there: one list needs no label. */}
                  {guruhlar.length > 1 && (
                    <h2 className="h3">
                      {t(g.nomi)} <span className="muted">{g.qatorlar.length}</span>
                    </h2>
                  )}
                  {g.qatorlar.map((q) => (
                    <SevimliQator
                      key={q.kalit}
                      q={q}
                      checked={chosen.includes(q.kalit)}
                      full={chosen.length >= TAQQOSLASH_MAX}
                      onToggle={() => toggle(q.kalit)}
                    />
                  ))}
                </section>
              ))}
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

function SevimliQator({ q, checked, full, onToggle }: { q: Qator; checked: boolean; full: boolean; onToggle: () => void }) {
  const t = useT();
  return (
    <div className={`plan-row sevimli-row${checked ? ' checked' : ''}`}>
      <input
        type="checkbox"
        className="sevimli-check"
        checked={checked}
        disabled={(full && !checked) || q.holat === 'sotilgan'}
        aria-label={t('taqqoslash.choose')}
        onChange={onToggle}
      />
      <a className="sevimli-link" href={href(q.route)}>
        <span className="plan-thumb">{q.chizma ? <img src={q.chizma} alt="" loading="lazy" /> : <PlanIcon />}</span>
        <span className="plan-text">
          <span className="title">{q.title}</span>
          <span className="caption">{q.caption}</span>
          {/* The badge sits under the price: beside the text it squeezes the row at 360px. */}
          <span className="sevimli-narx">
            <span className="plan-price">{q.price}</span>
            {q.holat !== 'sotuvda' && <HolatBadge holat={q.holat} />}
          </span>
        </span>
      </a>
    </div>
  );
}

// ---------------------------------------------------------------- Taqqoslash

/** «5» / «2–9» / «—». */
function formatQavat(q: TaqqoslashDto['qavat']): string {
  if (!q) return '—';
  return q.dan === q.gacha ? String(q.dan) : `${q.dan}–${q.gacha}`;
}

/**
 * Rows of the table (TZ UF-5: narx, maydon, qavat, to'lov); the lowest narx,
 * m² narxi and oylik are highlighted. A Planirovka's narx is a «from» price.
 */
const ROWS: { key: MessageKey; value: (t: Translate, p: TaqqoslashDto) => ReactNode; best?: (p: TaqqoslashDto) => number | null }[] = [
  { key: 'taqqoslash.qavat', value: (_t, p) => formatQavat(p.qavat) },
  { key: 'taqqoslash.maydon', value: (_t, p) => `${formatMaydon(p.maydon)} m²` },
  {
    key: 'taqqoslash.narx',
    value: (t, p) =>
      p.boshlangichNarx !== null && p.tur === 'planirovka'
        ? t('narx.from', { narx: t('narx.mln', { n: mlnSon(p.boshlangichNarx) }) })
        : formatSom(t, p.boshlangichNarx),
    best: (p) => p.boshlangichNarx,
  },
  { key: 'taqqoslash.kvMetr', value: (t, p) => formatSom(t, p.kvMetrNarxi), best: (p) => p.kvMetrNarxi },
  { key: 'taqqoslash.oylik', value: (t, p) => formatSom(t, p.oylikTolov), best: (p) => p.oylikTolov },
];

const mlnSon = (n: number) =>
  new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(n / 1_000_000).replace('.', ',');

/** «10,5 mln so'm»: short enough for three columns at 360px. */
function formatSom(t: Translate, n: number | null): string {
  if (n === null) return '—';
  return t('narx.som', { narx: t('narx.mln', { n: mlnSon(n) }) });
}

export function TaqqoslashScreen({ ids }: { ids: TaqqoslashKalit[] }) {
  const t = useT();
  const lang = useLang();
  const load = useLoad(`taqqoslash:${ids.join(',')}:${lang}`, () =>
    api.taqqoslash(ids.slice(0, TAQQOSLASH_MAX), lang),
  );
  return (
    <>
      <h1 className="h1">{t('taqqoslash.title')}</h1>
      <Loaded load={load}>
        {({ ustunlar: ps }) => (
          <div className="taqqoslash">
            <table>
              <colgroup>
                <col className="taqqoslash-label" />
                {ps.map((p) => (
                  <col key={p.kalit} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  <th />
                  {ps.map((p) => (
                    <th key={p.kalit}>
                      <a
                        className="taqqoslash-head"
                        href={href(p.tur === 'xonadon' ? { name: 'xonadon', id: p.id } : { name: 'planirovka', id: p.id })}
                      >
                        {/* Same three lines for both kinds, so the heads line up. The Blok is in the head
                            (a Xonadon's «A-77» names it), so the table has no Blok row. */}
                        <span className="title">{p.raqam ?? t('planirovka.xonalar', { n: p.xonalar })}</span>
                        <span className="caption">
                          {p.raqam ? t('planirovka.xonalar', { n: p.xonalar }) : t('blok.nomi', { nomi: p.blokNomi })}
                        </span>
                        <span className="caption">{p.loyihaNomi}</span>
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
                        <td key={p.kalit} className={min !== null && row.best?.(p) === min ? 'best' : undefined}>
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
                    <td key={p.kalit}>
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
