import { parseUlashishParam, type StartDto } from '@yh/shared';
import { navigate, parseRoute } from './router';
import { getStartParam } from './telegram';

let opened = false;

/**
 * Opens the screen the launch's `startapp` parameter names, once per launch
 * and only while the Mijoz is still on the home screen. Called first with
 * null (reads the parameter locally, no waiting) and again with the server's
 * reading from /api/me.
 *
 * Handled: «Ulashish» links `pl<id>_u<n>` (#16) → that Planirovka.
 * TODO(#9, #11): bot buttons 'ariza' and 'booking' (#7) once their screens exist.
 */
export function openStartScreen(fromServer: StartDto | null): void {
  if (opened) return;
  const link = parseUlashishParam(getStartParam());
  const start: StartDto | null =
    fromServer ?? (link ? { ekran: 'planirovka', planirovkaId: link.planirovkaId } : null);
  if (!start) return;
  opened = true;
  if (parseRoute(window.location.hash).name !== 'loyihalar') return;
  navigate({ name: 'planirovka', id: start.planirovkaId });
}
