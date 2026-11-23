import {
  DOJIM_MATN_MAX,
  DOJIM_OZGARUVCHILAR,
  DOJIM_SSENARIYLARI,
  type DojimSozlamalari,
  type DojimSsenariy,
  type Lang,
} from '@yh/shared';
import { useEffect, useRef, useState } from 'react';
import { adminApi, errorText } from './api';
import './dojim.css';
import { Form } from './Matnlar';

type SaveState = { kind: 'idle' | 'saving' | 'saved' } | { kind: 'error'; text: string };

const LANGS: Lang[] = ['uz', 'ru'];

/** What the Administrator needs to know per ssenariy: when it fires and what the bot adds to the text. */
const SSENARIY: Record<DojimSsenariy, { nomi: string; qachon: string; tugmalar: Record<Lang, string[]> }> = {
  korish: {
    nomi: "Ko'rdi, ariza qoldirmadi",
    qachon: "Xonadon yoki planirovkani ochgan, kalkulyatorda hisoblagan va 24 soat ichida ariza qoldirmagan Mijozga.",
    tugmalar: { uz: ['🏠 Xonadonni ochish', "📅 Ko'rishga yozilish"], ru: ['🏠 Открыть квартиру', '📅 Записаться на просмотр'] },
  },
  sevimliBand: {
    nomi: "Sevimli xonadon band bo'ldi",
    qachon: "Sevimlilarga qo'shilgan xonadon bron qilinganda yoki sotilganda (yoki sevimli planirovkada bo'sh xonadon qolmaganda). Ostiga 3 tagacha o'xshash xonadon tugma bo'lib qo'shiladi.",
    tugmalar: {
      uz: ['Sayhun · A-13 · 5-qavat · 54,5 m²', 'Sayhun · A-30 · 7-qavat · 52 m²'],
      ru: ['Sayhun · A-13 · 5 эт. · 54,5 м²', 'Sayhun · A-30 · 7 эт. · 52 м²'],
    },
  },
  kelmadi: {
    nomi: "Ko'rishga kelmadi",
    qachon: "Yozilishlarda «Kelmadi» belgilangandan bir soat o'tib, yangi vaqt tanlashni taklif qiladi.",
    tugmalar: { uz: ['📅 Yangi vaqt tanlash'], ru: ['📅 Выбрать новое время'] },
  },
  keldi: {
    nomi: "Ko'rishdan keyin",
    qachon: "«Keldi» belgilangandan bir soat o'tib: «Qanday bo'ldi?» va to'lovni hisoblash tugmasi.",
    tugmalar: { uz: ["🧮 To'lovni hisoblash"], ru: ['🧮 Рассчитать платёж'] },
  },
};

const STOP: Record<Lang, string> = { uz: '🔕 Yubormang', ru: '🔕 Не присылать' };

/** Sample values the preview fills placeholders with. */
const NAMUNA: Record<Lang, Record<string, string>> = {
  uz: { planirovka: 'A-12, 2 xonali, 54,5 m²', loyiha: 'Sayhun' },
  ru: { planirovka: 'A-12, 2-комн., 54,5 м²', loyiha: 'Sayhun' },
};

const fill = (s: string, p: Record<string, string>) => s.replace(/\{(\w+)\}/g, (m, k: string) => p[k] ?? m);

/**
 * «Matnlar va sozlamalar» → «Dojim» (#17, UF-3): the bot's reminder texts in
 * RU/UZ and an on/off switch per ssenariy. Fixed rules shown, not editable:
 * ≤ 1 per Mijoz in 7 days, «Yubormang» on every message, 09:00–21:00 only.
 */
export function DojimForm() {
  const [sozlama, setSozlama] = useState<DojimSozlamalari | null>(null);
  const [state, setState] = useState<SaveState>({ kind: 'idle' });

  useEffect(() => {
    adminApi<DojimSozlamalari>('GET', '/dojim').then(setSozlama, (e) => setState({ kind: 'error', text: errorText(e) }));
  }, []);

  if (!sozlama) return state.kind === 'error' ? <p className="error">{state.text}</p> : null;

  function change(s: DojimSsenariy, v: DojimSozlamalari[DojimSsenariy]) {
    setState((st) => (st.kind === 'saved' ? { kind: 'idle' } : st));
    setSozlama((prev) => (prev ? { ...prev, [s]: v } : prev));
  }

  async function submit() {
    if (!sozlama) return;
    setState({ kind: 'saving' });
    try {
      setSozlama(await adminApi<DojimSozlamalari>('PUT', '/dojim', sozlama));
      setState({ kind: 'saved' });
    } catch (e) {
      setState({ kind: 'error', text: `${errorText(e)}. Har matn ikkala tilda to'ldirilgan bo'lsin.` });
    }
  }

  return (
    <Form state={state} onSubmit={submit} savedText="Saqlandi — keyingi eslatmalar shu matn bilan boradi">
      <p className="dojim-rules muted">
        Bot bitta Mijozga 7 kunda ko'pi bilan bitta eslatma yuboradi, faqat 09:00–21:00 oralig'ida. Har xabar ostida
        «Yubormang» tugmasi bor: bosilsa, Mijozga boshqa eslatma bormaydi.
      </p>
      {DOJIM_SSENARIYLARI.map((s) => (
        <Ssenariy key={s} id={s} value={sozlama[s]} onChange={(v) => change(s, v)} />
      ))}
    </Form>
  );
}

function Ssenariy({
  id,
  value,
  onChange,
}: {
  id: DojimSsenariy;
  value: DojimSozlamalari[DojimSsenariy];
  onChange: (v: DojimSozlamalari[DojimSsenariy]) => void;
}) {
  const info = SSENARIY[id];
  const refs = useRef<Partial<Record<Lang, HTMLTextAreaElement | null>>>({});
  const titleId = `dojim-${id}`;

  /** Inserts a placeholder at the caret of that language's text. */
  function insert(lang: Lang, token: string) {
    const el = refs.current[lang];
    const text = value.matn[lang];
    const at = el ? el.selectionStart : text.length;
    const end = el ? el.selectionEnd : text.length;
    onChange({ ...value, matn: { ...value.matn, [lang]: text.slice(0, at) + token + text.slice(end) } });
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(at + token.length, at + token.length);
    });
  }

  return (
    <section className={value.yoqilgan ? 'card dojim' : 'card dojim off'} aria-labelledby={titleId}>
      <header className="dojim-head">
        <div>
          <h2 className="title" id={titleId}>
            {info.nomi}
          </h2>
          <p className="muted small">{info.qachon}</p>
        </div>
        <label className="switch">
          <input
            type="checkbox"
            role="switch"
            checked={value.yoqilgan}
            onChange={(e) => onChange({ ...value, yoqilgan: e.target.checked })}
          />
          <span className="switch-track" aria-hidden="true" />
          <span className="switch-label">{value.yoqilgan ? 'Yoqilgan' : "O'chirilgan"}</span>
        </label>
      </header>

      <div className="dojim-langs">
        {LANGS.map((lang) => (
          <div key={lang} className="dojim-lang">
            <label className="field">
              <span>
                Matn <span className="lang">{lang.toUpperCase()}</span>
              </span>
              <textarea
                ref={(el) => {
                  refs.current[lang] = el;
                }}
                rows={4}
                required
                maxLength={DOJIM_MATN_MAX}
                value={value.matn[lang]}
                onChange={(e) => onChange({ ...value, matn: { ...value.matn, [lang]: e.target.value } })}
              />
            </label>
            <div className="dojim-tokens" aria-label={`${lang.toUpperCase()} matnga qo'yish`}>
              {DOJIM_OZGARUVCHILAR[id].map((token) => (
                <button key={token} type="button" className="token" onClick={() => insert(lang, token)}>
                  {token}
                </button>
              ))}
              <span className="small muted counter tabular">
                {value.matn[lang].length}/{DOJIM_MATN_MAX}
              </span>
            </div>
            <Preview text={fill(value.matn[lang], NAMUNA[lang])} buttons={[...info.tugmalar[lang], STOP[lang]]} />
          </div>
        ))}
      </div>
    </section>
  );
}

/** How the message looks in Telegram, with sample values for the placeholders. */
function Preview({ text, buttons }: { text: string; buttons: string[] }) {
  return (
    <figure className="tg-preview">
      <figcaption className="small muted">Botda shunday ko'rinadi</figcaption>
      <div className="tg-bubble">{text.trim() || <span className="muted">Matn yo'q</span>}</div>
      <div className="tg-buttons">
        {buttons.map((b) => (
          <span key={b} className="tg-button">
            {b}
          </span>
        ))}
      </div>
    </figure>
  );
}
