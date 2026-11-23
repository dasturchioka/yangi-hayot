import { parseDojimParam, parseUlashishParam, type DojimEkran, type StartDto } from '@yh/shared';
import { navigate, parseRoute, type Route } from './router';
import { getStartParam } from './telegram';

let opened = false;

/**
 * The dojim (#17) whose bot button opened this launch, or null. A booking
 * made anywhere in the launch carries it, so the report counts it as «dojimdan».
 */
export function launchDojimId(): number | null {
  return parseDojimParam(getStartParam())?.dojimId ?? null;
}

function dojimRoute(e: DojimEkran): Route {
  switch (e.ekran) {
    case 'planirovka':
      return { name: 'planirovka', id: e.planirovkaId };
    case 'yozilish':
      return { name: 'yozilish', loyihaId: e.loyihaId, ...(e.planirovkaId ? { planirovkaId: e.planirovkaId } : {}) };
    case 'kalkulyator':
      return { name: 'kalkulyator', ...(e.planirovkaId ? { planirovkaId: e.planirovkaId } : {}) };
  }
}

/**
 * Opens the screen the launch's `startapp` parameter names, once per launch
 * and only while the Mijoz is still on the home screen. Called first with
 * null (reads the parameter locally, no waiting) and again with the server's
 * reading from /api/me.
 *
 * Handled: «Ulashish» links `pl<id>_u<n>` (#16) → that Planirovka; the bot's
 * «Ariza qoldirish» button `ariza` (#7, #9) → the Ariza form; `kalkulyator` (#12) → the calculator;
 * «Ko'rishga yozilish» button `booking` (#7, #11) → the booking screen;
 * dojim buttons `dj<id>_…` (#17) → Planirovka, booking or calculator.
 */
export function openStartScreen(fromServer: StartDto | null): void {
  if (opened) return;
  const param = getStartParam();
  if (param === 'ariza' || param === 'kalkulyator' || param === 'booking') {
    opened = true;
    if (parseRoute(window.location.hash).name === 'loyihalar') navigate({ name: param === 'booking' ? 'yozilish' : param });
    return;
  }
  const dojim = parseDojimParam(param);
  if (dojim) {
    opened = true;
    if (parseRoute(window.location.hash).name === 'loyihalar') navigate(dojimRoute(dojim.ekran));
    return;
  }
  const link = parseUlashishParam(getStartParam());
  const start: StartDto | null =
    fromServer ?? (link ? { ekran: 'planirovka', planirovkaId: link.planirovkaId } : null);
  if (!start) return;
  opened = true;
  if (parseRoute(window.location.hash).name !== 'loyihalar') return;
  navigate({ name: 'planirovka', id: start.planirovkaId });
}
