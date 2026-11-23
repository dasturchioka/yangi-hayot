import type { VoronkaResponse } from '@yh/shared';
import { useCallback, useEffect, useState } from 'react';
import { adminApi, errorText } from './api';
import { bugunSana, sanaNuqta, sanaQosh } from './format';
import { DatePicker } from '@yh/ui/date';
import { Select } from '@yh/ui/select';
import { XIcon } from './icons';
import './voronka.css';

/**
 * «Analitika → Voronka» (UF-7, #20; Administrator). Distinct Mijozlar per step
 * for any period, by Manba and Loyiha, and the most opened Planirovkalar.
 * Read from the bot database (`hodisa`), never amoCRM.
 */

type Davr = 'bugun' | '7' | '30' | 'boshqa';

const son = (n: number) => new Intl.NumberFormat('ru-RU').format(n).replace(/ /g, ' ');

/** «75%»; no base → «—». */
function foiz(n: number | null | undefined, base: number | null | undefined): string {
  if (n == null || !base) return '—';
  return `${Math.round((n / base) * 100)}%`;
}

/** Previous step with a figure (the bot entry has none under a Loyiha filter). */
function oldingi(sonlar: (number | null)[], i: number): number | null {
  for (let j = i - 1; j >= 0; j--) if (sonlar[j] != null) return sonlar[j]!;
  return null;
}

function birinchi(sonlar: (number | null)[]): number | null {
  return sonlar.find((n) => n != null) ?? null;
}

export function VoronkaScreen() {
  const today = bugunSana();
  const [davr, setDavr] = useState<Davr>('7');
  const [boshqa, setBoshqa] = useState({ dan: sanaQosh(today, -29), gacha: today });
  const [manba, setManba] = useState('');
  const [loyihaId, setLoyihaId] = useState('');
  const [data, setData] = useState<VoronkaResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [dan, gacha] =
    davr === 'bugun'
      ? [today, today]
      : davr === '7'
        ? [sanaQosh(today, -6), today]
        : davr === '30'
          ? [sanaQosh(today, -29), today]
          : [boshqa.dan, boshqa.gacha];
  const davrXato = davr === 'boshqa' && dan > gacha ? "Boshlanish sanasi tugash sanasidan keyin bo'lmasin" : '';

  const load = useCallback(() => {
    if (davrXato) return;
    const q = new URLSearchParams({ dan, gacha });
    if (manba) q.set('manba', manba);
    if (loyihaId) q.set('loyihaId', loyihaId);
    setLoading(true);
    setError('');
    adminApi<VoronkaResponse>('GET', `/voronka?${q}`)
      .then(setData, (e) => setError(errorText(e)))
      .finally(() => setLoading(false));
  }, [dan, gacha, manba, loyihaId, davrXato]);

  useEffect(load, [load]);

  const filtrBor = manba !== '' || loyihaId !== '';
  const loyihaNomi = data?.tanlov.loyihalar.find((l) => String(l.id) === loyihaId)?.nomi;

  return (
    <div className="stack wide voronka">
      <header className="vr-head">
        <div>
          <h1 className="h2">Voronka</h1>
          <p className="muted">
            {dan === gacha ? sanaNuqta(dan) : `${sanaNuqta(dan)} – ${sanaNuqta(gacha)}`}
            {manba && ` · ${manba}`}
            {loyihaNomi && ` · ${loyihaNomi}`}
            {' · '}har qadamda bir Mijoz bir marta sanaladi
          </p>
        </div>
      </header>

      <div className="vr-filters" role="group" aria-label="Filtrlar">
        <div className="tabs vr-tabs" role="tablist" aria-label="Davr">
          {(
            [
              ['bugun', 'Bugun'],
              ['7', '7 kun'],
              ['30', '30 kun'],
              ['boshqa', 'Boshqa davr'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              role="tab"
              aria-selected={davr === id}
              className={davr === id ? 'tab active' : 'tab'}
              onClick={() => setDavr(id)}
            >
              {label}
            </button>
          ))}
        </div>
        {davr === 'boshqa' && (
          <span className="vr-range">
            <DatePicker
              aria-label="Davr boshi"
              value={boshqa.dan}
              max={today}
              onChange={(dan) => setBoshqa((b) => ({ ...b, dan }))}
            />
            <span aria-hidden>–</span>
            <DatePicker
              aria-label="Davr oxiri"
              value={boshqa.gacha}
              max={today}
              onChange={(gacha) => setBoshqa((b) => ({ ...b, gacha }))}
            />
          </span>
        )}
        <Select
          aria-label="Manba"
          value={manba}
          onChange={setManba}
          options={[{ value: '', label: 'Barcha manbalar' }, ...(data?.tanlov.manbalar ?? []).map((m) => ({ value: m, label: m }))]}
        />
        <Select
          aria-label="Loyiha"
          value={loyihaId}
          onChange={setLoyihaId}
          options={[
            { value: '', label: 'Barcha Loyihalar' },
            ...(data?.tanlov.loyihalar ?? []).map((l) => ({ value: String(l.id), label: l.nomi })),
          ]}
        />
        {filtrBor && (
          <button
            className="link vr-clear"
            onClick={() => {
              setManba('');
              setLoyihaId('');
            }}
          >
            <XIcon />
            Filtrni tozalash
          </button>
        )}
      </div>

      {(davrXato || error) && (
        <p className="error">
          {davrXato || error}{' '}
          {error && (
            <button className="link" onClick={load}>
              Qayta urinish
            </button>
          )}
        </p>
      )}

      {!data && loading && <p className="muted">Yuklanmoqda…</p>}

      {data && (
        <div className={loading ? 'vr-body is-loading' : 'vr-body'} aria-busy={loading}>
          <Funnel data={data} />
          <Kesim data={data} manba={manba} loyihaId={loyihaId} setManba={setManba} setLoyihaId={setLoyihaId} />
          <EngKop data={data} />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- funnel

function Funnel({ data }: { data: VoronkaResponse }) {
  const sonlar = data.qadamlar.map((q) => q.mijozlar);
  const max = Math.max(1, ...sonlar.map((n) => n ?? 0));
  const bosh = birinchi(sonlar);
  const bosmi = sonlar.every((n) => !n);
  const ariza = data.qadamlar.find((q) => q.kalit === 'ariza')?.mijozlar;
  const keldi = data.qadamlar.find((q) => q.kalit === 'keldi')?.mijozlar;
  /** The first step with a figure: «Botga kirdi», or «ko'rdi» under a Loyiha filter. */
  const boshQadam = data.qadamlar.find((q) => q.mijozlar != null);

  return (
    <section className="card vr-card" aria-labelledby="vr-funnel-title">
      <div className="vr-card-head">
        <h2 id="vr-funnel-title" className="title">
          Mijozlar yo'li
        </h2>
        {!bosmi && boshQadam && (
          <p className="muted small">
            «{boshQadam.nomi}» qadamidan: Ariza — <strong className="vr-strong">{foiz(ariza, bosh)}</strong>, keldi —{' '}
            <strong className="vr-strong">{foiz(keldi, bosh)}</strong>
          </p>
        )}
      </div>

      <div className="vr-funnel-cols" aria-hidden>
        <span>Qadam</span>
        <span />
        <span className="num">Mijozlar</span>
        <span className="num">Oldingidan</span>
      </div>
      <ol className="vr-funnel">
        {data.qadamlar.map((q, i) => {
          const n = q.mijozlar;
          const prev = oldingi(sonlar, i);
          const tip =
            n == null
              ? "Botga kirish Loyihaga bog'lanmaydi — Loyiha tanlanganda hisoblanmaydi"
              : [`${son(n)} Mijoz`, prev != null && `oldingi qadamdan ${foiz(n, prev)}`, prev != null && `«${boshQadam?.nomi}» qadamidan ${foiz(n, bosh)}`]
                    .filter(Boolean)
                    .join(' · ');
          return (
            <li key={q.kalit} className="vr-step" data-step={i} tabIndex={0} aria-label={`${q.nomi}: ${n == null ? "hisoblanmaydi" : `${n} Mijoz`}`}>
              <span className="vr-step-name">{q.nomi}</span>
              <span className={n == null ? 'vr-track is-na' : 'vr-track'}>
                {n == null ? (
                  <span className="vr-na">Loyiha bo'yicha hisoblanmaydi</span>
                ) : (
                  <span className="vr-bar" style={{ transform: `scaleX(${n / max})` }} />
                )}
              </span>
              <span className="vr-count">{n == null ? '—' : son(n)}</span>
              <span className="vr-conv">{n == null || prev == null ? '' : foiz(n, prev)}</span>
              <span className="vr-tip" role="tooltip">
                {tip}
              </span>
            </li>
          );
        })}
      </ol>
      {bosmi && (
        <p className="muted vr-empty">
          Bu davrda hali hodisa yo'q. Mijozlar botga kirib, Mini App'da Planirovkalarni ochganda raqamlar shu yerda paydo
          bo'ladi.
        </p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- by Manba / Loyiha

function Kesim({
  data,
  manba,
  loyihaId,
  setManba,
  setLoyihaId,
}: {
  data: VoronkaResponse;
  manba: string;
  loyihaId: string;
  setManba: (m: string) => void;
  setLoyihaId: (id: string) => void;
}) {
  const [tab, setTab] = useState<'manba' | 'loyiha'>('manba');
  const rows =
    tab === 'manba'
      ? data.manbalar.map((m) => ({
          key: m.manba,
          nomi: m.manba,
          mijozlar: m.mijozlar,
          tanlangan: m.manba === manba,
          tanla: () => setManba(m.manba === manba ? '' : m.manba),
        }))
      : data.loyihalar.map((l) => ({
          key: String(l.id),
          nomi: l.nomi,
          mijozlar: l.mijozlar,
          tanlangan: String(l.id) === loyihaId,
          tanla: () => setLoyihaId(String(l.id) === loyihaId ? '' : String(l.id)),
        }));
  const arizaI = data.qadamlar.findIndex((q) => q.kalit === 'ariza');

  return (
    <section className="card flush vr-card" aria-label="Kesimlar">
      <div className="vr-card-head pad">
        <div className="tabs" role="tablist" aria-label="Kesim">
          <button role="tab" aria-selected={tab === 'manba'} className={tab === 'manba' ? 'tab active' : 'tab'} onClick={() => setTab('manba')}>
            Manbalar bo'yicha
          </button>
          <button role="tab" aria-selected={tab === 'loyiha'} className={tab === 'loyiha' ? 'tab active' : 'tab'} onClick={() => setTab('loyiha')}>
            Loyihalar bo'yicha
          </button>
        </div>
        <p className="muted small">Qatorni bossangiz, voronka shu {tab === 'manba' ? 'Manba' : 'Loyiha'} bo'yicha filtrlanadi</p>
      </div>
      {rows.length === 0 ? (
        <p className="muted pad">Bu davrda ma'lumot yo'q.</p>
      ) : (
        <table className="vr-table">
          <thead>
            <tr>
              <th>{tab === 'manba' ? 'Manba' : 'Loyiha'}</th>
              {data.qadamlar.map((q) => (
                <th key={q.kalit} className="num">
                  {q.nomi}
                </th>
              ))}
              <th className="num" title="Ariza qoldirganlar — birinchi sanalgan qadamdagi Mijozlarning necha foizi">
                Ariza %
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className={r.tanlangan ? 'is-selected' : undefined}>
                <th scope="row">
                  <button className="vr-row-btn" aria-pressed={r.tanlangan} onClick={r.tanla}>
                    {r.nomi}
                  </button>
                </th>
                {r.mijozlar.map((n, i) => (
                  <td key={i} className={n ? 'num' : 'num is-zero'}>
                    {n == null ? '—' : son(n)}
                  </td>
                ))}
                <td className="num vr-rate">{foiz(r.mijozlar[arizaI], birinchi(r.mijozlar))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- most viewed

function EngKop({ data }: { data: VoronkaResponse }) {
  const max = Math.max(1, ...data.engKopKorilgan.map((p) => p.korishlar));
  return (
    <section className="card flush vr-card" aria-labelledby="vr-top-title">
      <div className="vr-card-head pad">
        <h2 id="vr-top-title" className="title">
          Eng ko'p ko'rilgan Planirovkalar
        </h2>
        <p className="muted small">Mini App'da kartochka necha marta ochilgani</p>
      </div>
      {data.engKopKorilgan.length === 0 ? (
        <p className="muted pad">Bu davrda Planirovkalar ochilmagan.</p>
      ) : (
        <table className="vr-table vr-top">
          <thead>
            <tr>
              <th className="num vr-rank">№</th>
              <th>Planirovka</th>
              <th>Ko'rishlar</th>
              <th className="num">Mijozlar</th>
            </tr>
          </thead>
          <tbody>
            {data.engKopKorilgan.map((p, i) => (
              <tr key={p.planirovkaId}>
                <td className="num vr-rank">{i + 1}</td>
                <td>
                  <span className="vr-pl-name">
                    {p.xonalar} xona, {String(p.maydon).replace('.', ',')} m²{p.nomi ? ` · ${p.nomi}` : ''}
                  </span>
                  <span className="vr-pl-sub">
                    {p.loyiha} · {p.blok} blok
                  </span>
                </td>
                <td className="vr-views">
                  <span className="vr-views-track" aria-hidden>
                    <span className="vr-views-bar" style={{ transform: `scaleX(${p.korishlar / max})` }} />
                  </span>
                  <span className="vr-views-n">{son(p.korishlar)}</span>
                </td>
                <td className="num">{son(p.mijozlar)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
