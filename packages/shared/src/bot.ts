/**
 * Bot ↔ server contract (internal API, `POST /internal/bot/events`).
 *
 * The bot (apps/bot) is a thin translator: it turns every Telegram update in a
 * private chat into one `BotEvent`, posts it to the server and executes the
 * returned `BotAction`s in order. All decisions (Mijoz, Manba, language,
 * texts, buttons, admin rights, unfinished steps) are made on the server.
 */

/** Telegram user as the bot sees it (`ctx.from`). */
export interface BotUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export type BotEvent =
  /** `/start [payload]`; payload is the deep-link parameter (e.g. `src_instagram`). */
  | { type: 'start'; payload?: string }
  /** Any other `/command`, name without the slash (e.g. `welcome`, `restart`). */
  | { type: 'command'; name: string }
  /** Inline button press (`callback_data`). */
  | { type: 'callback'; data: string }
  /** Any other message in the private chat. */
  | { type: 'message'; message: BotIncomingMessage };

export interface BotIncomingMessage {
  /** Telegram message_id in the private chat (used to copy it to the managers group). */
  messageId: number;
  kind: 'text' | 'voice' | 'photo' | 'video' | 'other';
  /** Text, or caption for media. */
  text?: string;
  /** Telegram file_id of the photo (largest size), video or voice. */
  fileId?: string;
}

export interface BotEventRequest {
  user: BotUser;
  event: BotEvent;
}

export interface BotEventResponse {
  actions: BotAction[];
}

export type BotAction =
  | {
      type: 'send';
      chatId: string;
      text: string;
      /** Photo/video sent with `text` as its caption. */
      media?: BotMedia;
      /** Inline keyboard: rows of buttons. */
      buttons?: BotButton[][];
      /** Persistent reply keyboard: rows of button labels. Not combined with `buttons`. */
      keyboard?: string[][];
    }
  /** Copy a message (any kind, e.g. voice) from one chat to another. */
  | { type: 'copy'; chatId: string; fromChatId: string; messageId: number };

export interface BotMedia {
  kind: 'photo' | 'video';
  /** Telegram file_id (or an https URL). */
  fileId: string;
}

export type BotButton =
  | { text: string; callbackData: string }
  /** Opens the Mini App on a screen; `startapp` names it ('' = home). */
  | { text: string; startapp: string }
  | { text: string; url: string };
