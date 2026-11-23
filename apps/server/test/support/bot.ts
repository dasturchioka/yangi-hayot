import type { BotAction, BotButton, BotEvent, BotUser } from '@yh/shared';
import type { TestApp } from './test-app';

/** Shared secret the test app expects from the bot on /internal/bot/*. */
export const TEST_BOT_API_SECRET = 'test-bot-api-secret-0123456789abcdef';

/**
 * Sends one bot event the way apps/bot does and returns the actions the bot
 * would execute. Fails the test on a non-200 response.
 */
export async function botEvent(t: TestApp, user: BotUser, event: BotEvent): Promise<BotAction[]> {
  const res = await t.app.inject({
    method: 'POST',
    url: '/internal/bot/events',
    headers: { authorization: `Bearer ${TEST_BOT_API_SECRET}` },
    payload: { user, event },
  });
  if (res.statusCode !== 200) throw new Error(`bot event failed: ${res.statusCode} ${res.body}`);
  return res.json().actions;
}

/** Convenience: a text message event. */
export function text(value: string, messageId = 1): BotEvent {
  return { type: 'message', message: { messageId, kind: 'text', text: value } };
}

/** All button labels of a `send` action, row by row. */
export function labels(buttons: BotButton[][] | undefined): string[] {
  return (buttons ?? []).flat().map((b) => b.text);
}

/** Only the `send` actions. */
export function sends(actions: BotAction[]) {
  return actions.filter((a): a is Extract<BotAction, { type: 'send' }> => a.type === 'send');
}
