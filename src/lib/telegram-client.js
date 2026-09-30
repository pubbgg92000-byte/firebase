/**
 * Browser Telegram Client — GramJS wrapper
 * 
 * Replaces Python Telethon worker with a pure browser MTProto client.
 * Session is stored in localStorage so login persists across page refreshes.
 * 
 * Usage:
 *   import { tgClient } from '$lib/telegram-client.js';
 *   await tgClient.connect(apiId, apiHash);
 *   await tgClient.login(phone);      // sends OTP
 *   await tgClient.submitCode(code);   // verifies OTP
 *   await tgClient.sendMessage(botUsername, text);
 *   tgClient.onNewMessage(botUsername, handler);
 */

const isBrowser = typeof window !== 'undefined';
const SESSION_KEY = 'tg_gramjs_session';

let _client = null;
let _connected = false;
let _handlers = [];
let _TelegramModule = null;

/**
 * Lazy-load the telegram (GramJS) module.
 * This avoids SSR issues since GramJS requires browser APIs.
 */
async function loadGramJS() {
  if (_TelegramModule) return _TelegramModule;
  _TelegramModule = await import('telegram');
  return _TelegramModule;
}

/**
 * Custom localStorage-based session store for GramJS.
 * Persists the MTProto session so user doesn't need to re-login.
 */
class LocalStorageSession {
  constructor(sessionName) {
    this._name = sessionName;
    this._data = '';
    if (isBrowser) {
      try {
        this._data = localStorage.getItem(`${SESSION_KEY}:${sessionName}`) || '';
      } catch {}
    }
  }

  save() {
    if (isBrowser && this._data) {
      try {
        localStorage.setItem(`${SESSION_KEY}:${this._name}`, this._data);
      } catch {}
    }
  }

  load() {
    return this._data;
  }

  delete() {
    this._data = '';
    if (isBrowser) {
      try {
        localStorage.removeItem(`${SESSION_KEY}:${this._name}`);
      } catch {}
    }
  }
}

/**
 * Exported singleton Telegram client wrapper.
 */
export const tgClient = {
  /**
   * Connect to Telegram (creates the client instance).
   * Does NOT trigger login — call login() separately.
   */
  async connect(apiId, apiHash) {
    if (!isBrowser) throw new Error('Telegram client only works in browser');
    
    const { TelegramClient, sessions } = await loadGramJS();
    const { StringSession } = sessions;
    
    // Load saved session
    let savedSession = '';
    try {
      savedSession = localStorage.getItem(SESSION_KEY) || '';
    } catch {}
    
    const session = new StringSession(savedSession);
    
    _client = new TelegramClient(session, Number(apiId), apiHash, {
      connectionRetries: 5,
      useWSS: true, // Use WebSocket (browser-compatible)
    });
    
    await _client.connect();
    _connected = true;
    
    // Save session after connect
    _saveSession();
    
    return _client;
  },

  /**
   * Check if already authorized (has valid session).
   */
  async isAuthorized() {
    if (!_client || !_connected) return false;
    try {
      return await _client.isUserAuthorized();
    } catch {
      return false;
    }
  },

  /**
   * Get current user info.
   */
  async getMe() {
    if (!_client) return null;
    try {
      return await _client.getMe();
    } catch {
      return null;
    }
  },

  /**
   * Start login flow — sends OTP to the phone number.
   * Returns { phoneCodeHash } needed for submitCode().
   */
  async sendCode(phone) {
    if (!_client) throw new Error('Client not connected');
    const { Api } = await loadGramJS();
    
    const result = await _client.invoke(
      new Api.auth.SendCode({
        phoneNumber: phone,
        apiId: _client.apiId,
        apiHash: _client.apiHash,
        settings: new Api.CodeSettings({
          allowFlashcall: false,
          currentNumber: true,
          allowAppHash: false,
        }),
      })
    );
    
    return { phoneCodeHash: result.phoneCodeHash };
  },

  /**
   * Submit the OTP code received on phone.
   * Returns user object on success.
   */
  async submitCode(phone, code, phoneCodeHash) {
    if (!_client) throw new Error('Client not connected');
    const { Api } = await loadGramJS();
    
    try {
      const result = await _client.invoke(
        new Api.auth.SignIn({
          phoneNumber: phone,
          phoneCodeHash,
          phoneCode: code,
        })
      );
      _saveSession();
      return result.user;
    } catch (err) {
      // If 2FA is required, the error will have type SESSION_PASSWORD_NEEDED
      if (err.errorMessage === 'SESSION_PASSWORD_NEEDED') {
        throw { type: '2FA_REQUIRED', message: 'Two-factor authentication required' };
      }
      throw err;
    }
  },

  /**
   * Submit 2FA password.
   */
  async submit2FA(password) {
    if (!_client) throw new Error('Client not connected');
    const { Api } = await loadGramJS();
    const { computeCheck } = await import('telegram/Password.js');
    
    const passwordInfo = await _client.invoke(new Api.account.GetPassword());
    const passwordHash = await computeCheck(passwordInfo, password);
    
    const result = await _client.invoke(
      new Api.auth.CheckPassword({ password: passwordHash })
    );
    _saveSession();
    return result.user;
  },

  /**
   * Full interactive login using GramJS's built-in start() flow.
   * Callbacks: onPhone, onCode, onPassword, onError
   */
  async startInteractive({ phone, onCodeNeeded, on2FANeeded, onError }) {
    if (!_client) throw new Error('Client not connected');
    
    try {
      await _client.start({
        phoneNumber: () => Promise.resolve(phone),
        phoneCode: () => new Promise((resolve) => {
          onCodeNeeded(resolve);
        }),
        password: () => new Promise((resolve) => {
          on2FANeeded(resolve);
        }),
        onError: (err) => {
          if (onError) onError(err);
        },
      });
      _saveSession();
      return await _client.getMe();
    } catch (err) {
      if (onError) onError(err);
      throw err;
    }
  },

  /**
   * Send a text message to a user/bot.
   */
  async sendMessage(entity, text) {
    if (!_client) throw new Error('Client not connected');
    return await _client.sendMessage(entity, { message: text });
  },

  /**
   * Get latest messages from a chat.
   */
  async getMessages(entity, limit = 1) {
    if (!_client) throw new Error('Client not connected');
    return await _client.getMessages(entity, { limit });
  },

  /**
   * Click an inline button on a message.
   * @param {object} message - The message object containing buttons
   * @param {number} row - Button row index
   * @param {number} col - Button column index
   */
  async clickButton(message, row, col) {
    if (!_client) throw new Error('Client not connected');
    
    // GramJS messages have a built-in .click() helper
    if (typeof message.click === 'function') {
      try {
        return await message.click({ i: row, j: col });
      } catch (e1) {
        try {
          return await message.click(row, col);
        } catch (e2) {}
      }
    }
    
    const { Api } = await loadGramJS();
    const buttons = message.replyMarkup?.rows;
    if (!buttons || !buttons[row] || !buttons[row].buttons[col]) {
      throw new Error(`Button at [${row},${col}] not found`);
    }
    
    const button = buttons[row].buttons[col];
    
    // Handle callback button
    if (button.data) {
      return await _client.invoke(
        new Api.messages.GetBotCallbackAnswer({
          peer: message.peerId,
          msgId: message.id,
          data: button.data,
        })
      );
    }
    
    throw new Error('Unsupported button type');
  },

  /**
   * Register a handler for new messages from a specific entity.
   * @param {string} entity - Bot username (e.g., '@Swiggy_fuckbot')
   * @param {function} handler - async (event) => void
   */
  async onNewMessage(entity, handler) {
    if (!_client) throw new Error('Client not connected');
    const { NewMessage } = await import('telegram/events/index.js');
    
    const eventHandler = new NewMessage({ chats: [entity] });
    const wrappedHandler = async (event) => {
      try {
        await handler(event);
      } catch (err) {
        console.error('[TG Handler Error]', err);
      }
    };
    
    _client.addEventHandler(wrappedHandler, eventHandler);
    _handlers.push({ entity, handler: wrappedHandler, event: eventHandler });
    
    return () => {
      _client.removeEventHandler(wrappedHandler, eventHandler);
      _handlers = _handlers.filter(h => h.handler !== wrappedHandler);
    };
  },

  /**
   * Register a handler for edited messages from a specific entity.
   */
  async onEditedMessage(entity, handler) {
    if (!_client) throw new Error('Client not connected');
    const { MessageEdited } = await import('telegram/events/index.js');
    
    const eventHandler = new MessageEdited({ chats: [entity] });
    const wrappedHandler = async (event) => {
      try {
        await handler(event);
      } catch (err) {
        console.error('[TG Handler Error]', err);
      }
    };
    
    _client.addEventHandler(wrappedHandler, eventHandler);
    _handlers.push({ entity, handler: wrappedHandler, event: eventHandler });
    
    return () => {
      _client.removeEventHandler(wrappedHandler, eventHandler);
      _handlers = _handlers.filter(h => h.handler !== wrappedHandler);
    };
  },

  /**
   * Remove all message handlers.
   */
  removeAllHandlers() {
    if (!_client) return;
    for (const h of _handlers) {
      try {
        _client.removeEventHandler(h.handler, h.event);
      } catch {}
    }
    _handlers = [];
  },

  /**
   * Disconnect the client.
   */
  async disconnect() {
    if (_client) {
      this.removeAllHandlers();
      try {
        await _client.disconnect();
      } catch {}
      _connected = false;
    }
  },

  /**
   * Logout and destroy session.
   */
  async logout() {
    if (_client) {
      try {
        const { Api } = await loadGramJS();
        await _client.invoke(new Api.auth.LogOut());
      } catch {}
      this.removeAllHandlers();
      try {
        await _client.disconnect();
      } catch {}
      _connected = false;
      _client = null;
    }
    // Clear saved session
    if (isBrowser) {
      try {
        localStorage.removeItem(SESSION_KEY);
      } catch {}
    }
  },

  /**
   * Check if client is connected.
   */
  isConnected() {
    return _connected && _client?.connected;
  },

  /**
   * Get raw GramJS client (for advanced usage).
   */
  getRawClient() {
    return _client;
  },

  /**
   * Check if a saved session exists.
   */
  hasSavedSession() {
    if (!isBrowser) return false;
    try {
      return !!localStorage.getItem(SESSION_KEY);
    } catch {
      return false;
    }
  },

  /**
   * Clear saved session without logging out.
   */
  clearSession() {
    if (isBrowser) {
      try {
        localStorage.removeItem(SESSION_KEY);
      } catch {}
    }
  },
};

function _saveSession() {
  if (!_client || !isBrowser) return;
  try {
    const sessionStr = _client.session.save();
    if (sessionStr) {
      localStorage.setItem(SESSION_KEY, sessionStr);
    }
  } catch {}
}
