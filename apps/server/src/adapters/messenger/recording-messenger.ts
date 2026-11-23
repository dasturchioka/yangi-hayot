import type { Messenger, OutgoingMessage, SendResult } from './messenger';

/**
 * In-memory Messenger for tests and local dev. Records every message with its
 * result and can simulate failures:
 *
 *   messenger.blockBy('700000001')  // this Mijoz blocked the bot → 'blocked'
 *   messenger.fail('error')         // every send → { status: 'error' }
 *   messenger.recover()             // clears the global failure mode
 */
export class RecordingMessenger implements Messenger {
  readonly sent: Array<{ message: OutgoingMessage; result: SendResult }> = [];

  #blocked = new Set<string>();
  #failure: 'error' | null = null;
  #seq = 0;

  blockBy(chatId: string): void {
    this.#blocked.add(chatId);
  }

  fail(mode: 'error'): void {
    this.#failure = mode;
  }

  recover(): void {
    this.#failure = null;
  }

  /** Messages that were delivered to this chat. */
  deliveredTo(chatId: string): OutgoingMessage[] {
    return this.sent.filter((s) => s.message.chatId === chatId && s.result.status === 'delivered').map((s) => s.message);
  }

  async send(message: OutgoingMessage): Promise<SendResult> {
    let result: SendResult;
    if (this.#failure === 'error') result = { status: 'error', error: 'Messenger error (fake)' };
    else if (this.#blocked.has(message.chatId)) result = { status: 'blocked' };
    else result = { status: 'delivered', messageId: String(++this.#seq) };
    this.sent.push({ message, result });
    return result;
  }
}
