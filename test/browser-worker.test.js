import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// Isolated copies of parser logic for validation
function extractLocal10Digits(phone) {
  let digits = String(phone || '').replace(/\D/g, '');
  if (digits.startsWith('91') && digits.length === 12) digits = digits.slice(2);
  if (digits.length !== 10) throw new Error(`Expected 10-digit number, got: ${phone}`);
  return digits;
}

function extractOtpCode(text) {
  if (!text) return null;
  const t = text.trim();
  let m = t.match(/(?:otp|code|verification|password|pin|is)[^\d]{0,30}\b(\d{6})\b/i);
  if (m) return m[1];
  const six = t.match(/\b\d{6}\b/g);
  if (six) return six[0];
  m = t.match(/(?:otp|code|verification|password)[^\d]{0,30}\b(\d{4,8})\b/i);
  if (m) return m[1];
  return null;
}

function classifyBotMessage(lower) {
  if (lower.includes('login successful') || lower.includes('successfully linked')) return 'success';
  if (lower.includes('account is suspended') || lower.includes('suspended') || lower.includes('blocked')) return 'suspended';
  if (lower.includes('attempts exceeded') || lower.includes('too many attempts') || lower.includes('retry after')) return 'rate_limited';
  if (lower.includes('otp expired') || lower.includes('code expired') || lower.includes('expired')) return 'expired';
  if (lower.includes('invalid otp') || lower.includes('is invalid') || lower.includes('otp verification failed')) return 'invalid_otp';
  if (lower.includes('already registered') || lower.includes('only allows logging in new accounts')) return 'already_registered';
  if (lower.includes('invalid number format') || lower.includes('invalid phone') || lower.includes('invalid mobile')) return 'invalid_number';
  if (lower.includes('otp request failed') || lower.includes('login failed') || lower.includes('request failed') ||
      lower.includes('something went wrong') || lower.includes('error occurred')) return 'failed';
  return null;
}

function findLoginButton(message) {
  const markup = message.replyMarkup;
  if (!markup?.rows) return null;
  for (let r = 0; r < markup.rows.length; r++) {
    for (let c = 0; c < markup.rows[r].buttons.length; c++) {
      const btn = markup.rows[r].buttons[c];
      const t = (btn.text || '').toLowerCase();
      if (!t || t.includes('multi')) continue;
      if (t.includes('login via otp') || t.includes('login with otp') || t.includes('login otp') || t.includes('otp login')) {
        return { row: r, col: c, text: btn.text };
      }
    }
  }
  for (let r = 0; r < markup.rows.length; r++) {
    for (let c = 0; c < markup.rows[r].buttons.length; c++) {
      const btn = markup.rows[r].buttons[c];
      const t = (btn.text || '').toLowerCase();
      if (!t || t.includes('multi')) continue;
      if (t.includes('login') && t.includes('otp')) return { row: r, col: c, text: btn.text };
    }
  }
  return null;
}

function formatElapsed(secs) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

describe('Browser Worker Core Logic & Message Parsing', () => {
  test('extracts local 10 digits from various Indian phone formats', () => {
    assert.equal(extractLocal10Digits('+919876543210'), '9876543210');
    assert.equal(extractLocal10Digits('919876543210'), '9876543210');
    assert.equal(extractLocal10Digits('9876543210'), '9876543210');
    assert.equal(extractLocal10Digits('+91 98765 43210'), '9876543210');
    assert.throws(() => extractLocal10Digits('12345'), /Expected 10-digit number/);
  });

  test('extracts OTP code reliably from Swiggy SMS texts', () => {
    assert.equal(extractOtpCode('Your Swiggy verification OTP is 894321. Do not share.'), '894321');
    assert.equal(extractOtpCode('Swiggy: 120934 is your login code.'), '120934');
    assert.equal(extractOtpCode('Use code 009812 to verify your mobile number.'), '009812');
  });

  test('classifies Telegram bot responses accurately', () => {
    assert.equal(classifyBotMessage('login successful! welcome back.'), 'success');
    assert.equal(classifyBotMessage('account is suspended due to violations'), 'suspended');
    assert.equal(classifyBotMessage('too many attempts, please retry after 24 hours'), 'rate_limited');
    assert.equal(classifyBotMessage('the otp has expired. please request a new one.'), 'expired');
    assert.equal(classifyBotMessage('the entered otp is invalid.'), 'invalid_otp');
    assert.equal(classifyBotMessage('this portal only allows logging in new accounts, this number is already registered.'), 'already_registered');
    assert.equal(classifyBotMessage('invalid phone number format provided'), 'invalid_number');
    assert.equal(classifyBotMessage('something went wrong, login failed.'), 'failed');
    assert.equal(classifyBotMessage('hello, how are you?'), null);
  });

  test('finds Login via OTP button from bot reply markup', () => {
    const mockMessage = {
      replyMarkup: {
        rows: [
          { buttons: [{ text: '📊 Dashboard' }, { text: 'ℹ Info' }] },
          { buttons: [{ text: '🔑 Login via OTP' }, { text: '👥 Multi-Login' }] }
        ]
      }
    };
    const found = findLoginButton(mockMessage);
    assert.deepEqual(found, { row: 1, col: 0, text: '🔑 Login via OTP' });
  });

  test('formats elapsed seconds into human readable duration', () => {
    assert.equal(formatElapsed(45), '45s');
    assert.equal(formatElapsed(125), '2m 5s');
    assert.equal(formatElapsed(3665), '1h 1m 5s');
  });
});
