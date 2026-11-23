import type { TaklifchiDto, TaklifchilarResponse, TaklifMijozDto, TaklifQilinganlarResponse } from '@yh/shared';
import { useEffect, useState } from 'react';
import { adminApi, errorText } from './api';
import { qachon } from './format';

/**
 * «Takliflar» (UF-6 qabul): Mijozlar who invited others, and for the chosen
 * one — the invited Mijozlar with their amoCRM Bitimlar. No bonuses or «uy
 * oldi» here: the Bitim status is checked in amoCRM (S12).
 */
export function TakliflarScreen() {
  const [rows, setRows] = useState<TaklifchiDto[] | null>(null);
  const [tanlangan, setTanlangan] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    adminApi<TaklifchilarResponse>('GET', '/takliflar')
      .then((r) => setRows(r.taklifchilar))
      .catch((e) => setError(errorText(e)));
  }, []);

  const jami = rows?.reduce((n, r) => n + r.soni, 0) ?? 0;

  return (
    <div className="stack wide">
      <header>
        <h1 className="h2">Takliflar</h1>
        <p className="muted">«Do'stingni taklif qil» havolasi orqali kelgan Mijozlar va ularning Bitimlari</p>
      </header>
      {error && <p className="error">{error}</p>}
      {rows && rows.length > 0 && (
        <div className="stats">
          <div className="stat">
            <span className="stat-label">Taklif qilganlar</span>
            <span className="stat-value">{rows.length}</span>
          </div>
          <div className="stat">
            <span className="stat-label free">Taklif qilinganlar</span>
            <span className="stat-value">{jami}</span>
          </div>
        </div>
      )}
      <section className="card flush">
        <table className="table">
          <thead>
            <tr>
              <th>Taklif qilgan Mijoz</th>
              <th>Telefon</th>
              <th>Telegram ID</th>
              <th className="num">Taklif qilingan</th>
              <th>Oxirgisi</th>
            </tr>
          </thead>
          <tbody>
            {rows?.map((r) => (
              <tr
                key={r.telegramId}
                className={r.telegramId === tanlangan ? 'clickable selected' : 'clickable'}
                onClick={() => setTanlangan(r.telegramId)}
              >
                <td>
                  <button className="link-button" aria-pressed={r.telegramId === tanlangan}>
                    <MijozNomi m={r} />
                  </button>
                </td>
                <td className="nowrap">{r.phone ?? '—'}</td>
                <td className="nowrap">{r.telegramId}</td>
                <td className="num">{r.soni}</td>
                <td className="nowrap">{qachon(r.oxirgiAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows?.length === 0 && <p className="pad muted">Hozircha hech kim taklif havolasi orqali kelmagan.</p>}
        {rows === null && !error && <p className="pad muted">Yuklanmoqda…</p>}
      </section>
      {tanlangan && <TaklifQilinganlar key={tanlangan} telegramId={tanlangan} />}
    </div>
  );
}

function TaklifQilinganlar({ telegramId }: { telegramId: string }) {
  const [data, setData] = useState<TaklifQilinganlarResponse | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    adminApi<TaklifQilinganlarResponse>('GET', `/takliflar/${telegramId}`)
      .then(setData)
      .catch((e) => setError(errorText(e)));
  }, [telegramId]);

  if (error) return <p className="error">{error}</p>;
  if (!data) return <p className="muted">Yuklanmoqda…</p>;

  return (
    <section className="card flush taklif-detail">
      <h2 className="title pad">
        <MijozNomi m={data.taklifchi} /> taklif qilganlar · {data.taklifQilinganlar.length}
      </h2>
      <table className="table">
        <thead>
          <tr>
            <th>Mijoz</th>
            <th>Telefon</th>
            <th>Kelgan</th>
            <th className="num">Arizalar</th>
            <th>amoCRM Bitimlari</th>
          </tr>
        </thead>
        <tbody>
          {data.taklifQilinganlar.map((m) => (
            <tr key={m.telegramId}>
              <td>
                <MijozNomi m={m} />
                <br />
                <span className="muted small">ID {m.telegramId}</span>
              </td>
              <td className="nowrap">{m.phone ?? '—'}</td>
              <td className="nowrap">{qachon(m.kelganAt)}</td>
              <td className="num">
                {m.arizalarSoni}
                {m.kutilayotganArizalar > 0 && (
                  <>
                    <br />
                    <span className="muted small nowrap" title="amoCRM'ga hali yetib bormagan, qayta yuborilmoqda">
                      {m.kutilayotganArizalar} tasi navbatda
                    </span>
                  </>
                )}
              </td>
              <td>
                {m.bitimlar.length === 0 ? (
                  <span className="muted">
                    {m.arizalarSoni === 0 ? 'Ariza qoldirmagan' : "Hali amoCRM'ga yetib bormagan"}
                  </span>
                ) : (
                  <ul className="bitimlar">
                    {m.bitimlar.map((b) => (
                      <li key={b.id}>
                        {b.url ? (
                          <a href={b.url} target="_blank" rel="noreferrer">
                            Bitim #{b.id}
                          </a>
                        ) : (
                          <span>Bitim #{b.id}</span>
                        )}
                        <span className="muted small">
                          {' '}
                          · {b.arizalarSoni} ta Ariza · {qachon(b.oxirgiArizaAt)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {data.taklifQilinganlar.length === 0 && <p className="pad muted">Bu Mijoz hali hech kimni taklif qilmagan.</p>}
    </section>
  );
}

function MijozNomi({ m }: { m: TaklifMijozDto }) {
  return (
    <>
      <strong>{m.name || 'Nomsiz'}</strong>
      {m.username && <span className="muted"> @{m.username}</span>}
    </>
  );
}
