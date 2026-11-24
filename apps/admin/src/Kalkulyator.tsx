import type { Bank, KalkulyatorResponse, KalkulyatorSozlamalari } from '@yh/shared';
import { useEffect, useState } from 'react';
import { adminApi, errorText } from './api';
import { Switch, useDirty, type SaveState } from './controls';
import { Form, ListEditor, Section } from './Matnlar';

/** A bank row as typed: numbers stay text until saving so a half-typed «17,» is not lost. */
interface BankRow {
  id: string;
  nomi: string;
  stavka: string;
  minBoshlangichFoiz: string;
  muddatlar: string;
}

const toRow = (b: Bank): BankRow => ({
  id: b.id,
  nomi: b.nomi,
  stavka: String(b.stavka),
  minBoshlangichFoiz: String(b.minBoshlangichFoiz),
  muddatlar: b.muddatlarYil.join(', '),
});

const num = (s: string) => Number(s.trim().replace(',', '.'));

/** «Xalq banki» → «xalq-banki»; unique among the rows. */
function newId(nomi: string, taken: Set<string>): string {
  const base =
    nomi
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 24) || 'bank';
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  return id;
}

/**
 * «Matnlar va sozlamalar» → «Muddatli to'lov va ipoteka» (#12, TZ 6-b., UF-2):
 * the limits the Mini App calculator applies and the banks it offers.
 */
export function KalkulyatorForm() {
  const [muddatli, setMuddatli] = useState<KalkulyatorSozlamalari['muddatli'] | null>(null);
  const [banklar, setBanklar] = useState<BankRow[]>([]);
  const [state, setState] = useState<SaveState>({ kind: 'idle' });
  const { dirty, rebase } = useDirty(muddatli ? { muddatli, banklar } : null);

  function load(s: KalkulyatorSozlamalari) {
    setMuddatli(s.muddatli);
    setBanklar(s.banklar.map(toRow));
  }

  useEffect(() => {
    adminApi<KalkulyatorResponse>('GET', '/kalkulyator').then(
      (r) => load(r.sozlama),
      (e) => setState({ kind: 'error', text: errorText(e) }),
    );
  }, []);

  if (!muddatli) return state.kind === 'error' ? <p className="error">{state.text}</p> : null;

  const touch = () => setState((s) => (s.kind === 'saved' ? { kind: 'idle' } : s));
  const setM = <K extends keyof KalkulyatorSozlamalari['muddatli']>(k: K, v: KalkulyatorSozlamalari['muddatli'][K]) => {
    touch();
    setMuddatli({ ...muddatli, [k]: v });
  };

  async function submit() {
    if (!muddatli) return;
    const taken = new Set<string>();
    const out: Bank[] = banklar.map((b) => {
      const id = b.id || newId(b.nomi, taken);
      taken.add(id);
      return {
        id,
        nomi: b.nomi.trim(),
        stavka: num(b.stavka),
        minBoshlangichFoiz: num(b.minBoshlangichFoiz),
        muddatlarYil: b.muddatlar
          .split(/[^0-9]+/)
          .filter(Boolean)
          .map(Number),
      };
    });
    setState({ kind: 'saving' });
    try {
      const r = await adminApi<KalkulyatorResponse>('PUT', '/kalkulyator', { muddatli, banklar: out });
      load(r.sozlama);
      rebase();
      setState({ kind: 'saved' });
    } catch (e) {
      setState({
        kind: 'error',
        text: `${errorText(e)}. Tekshiring: stavka 0–100%, har bankda kamida bitta muddat.`,
      });
    }
  }

  return (
    <Form state={state} dirty={dirty} onSubmit={submit}>
      <Section
        title="Muddatli to'lov"
        hint="Oylik to'lov = (narx − boshlang'ich to'lov) × (1 + ustama) ÷ oylar. Kalkulyator shu chegaralardan chiqishga yo'l qo'ymaydi."
      >
        <Switch checked={muddatli.yoqilgan} onChange={(e) => setM('yoqilgan', e.target.checked)}>
          Muddatli to'lov bor (o'chirilsa, kalkulyatorda faqat ipoteka qoladi)
        </Switch>
        <div className="row">
          <NumField
            label="Boshl. to'lov min, %"
            value={muddatli.minBoshlangichFoiz}
            max={99}
            onChange={(v) => setM('minBoshlangichFoiz', v)}
          />
          <NumField label="Muddat max, oy" value={muddatli.maxMuddatOy} min={1} max={240} step={1} onChange={(v) => setM('maxMuddatOy', v)} />
          <NumField label="Ustama, % (0 — ustamasiz)" value={muddatli.ustamaFoiz} max={100} onChange={(v) => setM('ustamaFoiz', v)} />
        </div>
      </Section>

      <Section
        title="Ipoteka banklari"
        hint="Mini App'da shu tartibda chiqadi — birinchisi tanlangan holda ochiladi. Mijoz stavkani qo'lda ham kiritishi mumkin."
      >
        <ListEditor
          items={banklar}
          onChange={(b) => {
            touch();
            setBanklar(b);
          }}
          max={20}
          min={1}
          blank={() => ({ id: '', nomi: '', stavka: '', minBoshlangichFoiz: '', muddatlar: '' })}
          addLabel="Bank qo'shish"
          numbered
        >
          {(b, set) => (
            <div className="row">
              <label className="field grow">
                <span>Hamkor bank</span>
                <input required maxLength={60} value={b.nomi} onChange={(e) => set({ ...b, nomi: e.target.value })} />
              </label>
              <label className="field">
                <span>Boshl. to'lov min, %</span>
                <input
                  required
                  className="tabular"
                  inputMode="decimal"
                  placeholder="25"
                  value={b.minBoshlangichFoiz}
                  onChange={(e) => set({ ...b, minBoshlangichFoiz: e.target.value })}
                />
              </label>
              <label className="field">
                <span>Stavka, % yillik</span>
                <input
                  required
                  className="tabular"
                  inputMode="decimal"
                  placeholder="18"
                  value={b.stavka}
                  onChange={(e) => set({ ...b, stavka: e.target.value })}
                />
              </label>
              <label className="field">
                <span>Muddatlar, yil</span>
                <input
                  required
                  className="tabular"
                  placeholder="5, 10, 15, 20"
                  value={b.muddatlar}
                  onChange={(e) => set({ ...b, muddatlar: e.target.value })}
                />
              </label>
            </div>
          )}
        </ListEditor>
      </Section>
    </Form>
  );
}

function NumField({
  label,
  value,
  onChange,
  min = 0,
  max,
  step = 0.1,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max: number;
  step?: number;
}) {
  return (
    <label className="field grow">
      <span>{label}</span>
      <input
        required
        type="number"
        className="tabular"
        min={min}
        max={max}
        step={step}
        value={Number.isFinite(value) ? value : ''}
        onChange={(e) => onChange(e.target.valueAsNumber)}
      />
    </label>
  );
}
