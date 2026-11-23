/**
 * Messenger adapter: sending Telegram messages from the bot (Bot API in
 * production). Used for broadcasts, reminders (dojim), manager-group
 * notifications and reports. Business code depends on this interface only.
 *
 * `send` never throws for per-recipient outcomes; it reports them in the
 * result so the caller can mark "botni bloklagan" or count errors.
 */
export interface Messenger {
  send(message: OutgoingMessage): Promise<SendResult>;
}

export interface OutgoingMessage {
  /** Telegram chat id (Mijoz telegram id or a group id). */
  chatId: string;
  text?: string;
  /** Photo/video with `text` as caption; `fileId` is a Telegram file_id or an https URL. */
  media?: { kind: 'photo' | 'video'; fileId: string };
  /** Inline keyboard: rows of buttons. */
  buttons?: MessageButton[][];
}

export type MessageButton =
  | { text: string; url: string }
  /** Opens the Mini App with `startapp=<startParam>`. */
  | { text: string; startapp: string }
  | { text: string; callbackData: string };

export type SendResult =
  | { status: 'delivered'; messageId: string }
  /** The Mijoz blocked the bot (403). */
  | { status: 'blocked' }
  | { status: 'error'; error: string };
