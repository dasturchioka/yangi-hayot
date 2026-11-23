import type { Migration } from './index';

/**
 * Katalog (ADR 0001): Loyiha → Blok → Planirovka. No Xonadon rows: each
 * Planirovka keeps how many Xonadonlar are bo'sh / bron / sotilgan
 * (jami = their sum). Planirovka holati is not stored, it is derived.
 * Texts shown to the Mijoz in two languages are jsonb `{"ru": …, "uz": …}`.
 */
export const m0003_katalog: Migration = {
  name: '0003_katalog',
  sql: `
    CREATE TABLE loyiha (
      id             serial PRIMARY KEY,
      slug           text NOT NULL UNIQUE,
      nomi           text NOT NULL,
      shahar         text NOT NULL CHECK (shahar IN ('toshkent', 'navoiy')),
      holat          text NOT NULL CHECK (holat IN ('sotuvda', 'topshirilgan')),
      manzil         jsonb NOT NULL,
      qisqa_tavsif   jsonb,
      tavsif         jsonb,
      fotolar        text[] NOT NULL DEFAULT '{}',
      video_url      text,
      qavatlar_soni  integer CHECK (qavatlar_soni > 0),
      lat            double precision,
      lng            double precision,
      infratuzilma   jsonb NOT NULL DEFAULT '[]',
      tartib         integer NOT NULL DEFAULT 0,
      created_at     timestamptz NOT NULL DEFAULT now(),
      updated_at     timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE blok (
      id         serial PRIMARY KEY,
      loyiha_id  integer NOT NULL REFERENCES loyiha(id) ON DELETE CASCADE,
      nomi       text NOT NULL,
      tartib     integer NOT NULL DEFAULT 0,
      UNIQUE (loyiha_id, nomi)
    );

    CREATE TABLE planirovka (
      id                serial PRIMARY KEY,
      blok_id           integer NOT NULL REFERENCES blok(id) ON DELETE CASCADE,
      xonalar           integer NOT NULL CHECK (xonalar > 0),
      maydon            numeric(7, 2) NOT NULL CHECK (maydon > 0),
      nomi              jsonb,
      chizma_url        text,
      video_url         text,
      boshlangich_narx  bigint CHECK (boshlangich_narx > 0),
      bosh              integer NOT NULL DEFAULT 0 CHECK (bosh >= 0),
      bron              integer NOT NULL DEFAULT 0 CHECK (bron >= 0),
      sotilgan          integer NOT NULL DEFAULT 0 CHECK (sotilgan >= 0),
      tartib            integer NOT NULL DEFAULT 0,
      created_at        timestamptz NOT NULL DEFAULT now(),
      updated_at        timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX planirovka_blok_id ON planirovka (blok_id);
  `,
};
