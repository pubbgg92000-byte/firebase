import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// Helper matching functions tested in isolation
function extract6DigitCode(text) {
  if (!text) return null;
  const regex = /(?:^|\D)(\d{6})(?!\d)/g;
  const found = [];
  let m;
  while ((m = regex.exec(text)) !== null) {
    found.push(m[1]);
  }
  return found.length === 1 ? found[0] : null;
}

function extractMatchingMessages(val, keyword) {
  const matches = [];
  if (!val || typeof val !== 'object') return matches;
  const kw = (keyword || 'swiggy').toLowerCase();

  for (const [msgId, record] of Object.entries(val)) {
    if (!record || typeof record !== 'object') continue;
    const body = String(record.message || record.body || record.text || record.msg || '');
    if (body.toLowerCase().includes(kw)) {
      matches.push({
        id: String(msgId),
        message: body,
        sender: record.sender || record.from || '',
        dateTime: record.dateTime || record.timestamp || ''
      });
    }
  }
  return matches;
}

describe('Automation Test Response Parsing & Code Extraction', () => {
  test('extracts single 6-digit code accurately from test message', () => {
    const msg = 'Your Swiggy verification code is 482910. Do not share this with anyone.';
    const code = extract6DigitCode(msg);
    assert.equal(code, '482910');
  });

  test('extracts 6-digit code with leading zero', () => {
    const msg = 'Swiggy OTP: 019283 for login';
    const code = extract6DigitCode(msg);
    assert.equal(code, '019283');
  });

  test('rejects 5-digit or 7-digit numbers', () => {
    assert.equal(extract6DigitCode('Code is 12345'), null);
    assert.equal(extract6DigitCode('Order #1234567 verification'), null);
  });

  test('rejects messages with multiple ambiguous 6-digit codes', () => {
    const msg = 'Swiggy codes: 112233 or 445566';
    assert.equal(extract6DigitCode(msg), null);
  });

  test('filters incoming Firebase messages by Swiggy keyword', () => {
    const mockDb = {
      msg1: { message: 'Welcome to Swiggy! Code: 789123', sender: 'SWIGGY' },
      msg2: { message: 'Your bank balance is Rs 5000', sender: 'HDFCBK' },
      msg3: { message: 'swiggy order arriving soon', sender: 'SWIGGY' }
    };

    const matches = extractMatchingMessages(mockDb, 'swiggy');
    assert.equal(matches.length, 2);
    assert.equal(matches[0].id, 'msg1');
    assert.equal(matches[1].id, 'msg3');
  });

  test('extracts keyword-anchored OTP even when reference numbers exist', () => {
    function extractSmartOTP(text) {
      if (!text) return null;
      const str = String(text);
      const kwPatterns = [
        /(?:otp|code|pin|passcode|token|verification|secret|password|auth|login\s+code)\s*(?:is|:|-|=|\.)?\s*([0-9]{4,8})\b/i,
        /\b([0-9]{4,8})\b\s*(?:is\s+(?:your\s+)?(?:otp|code|pin|passcode|token|verification|secret))/i,
        /(?:G-|c-|code\s*[:\-])\s*([0-9]{4,8})\b/i,
        /(?:otp|code|verification|verif)\s*(?:is|:|-|=|\.)?\s*([0-9]{3}[-\s][0-9]{3})\b/i,
      ];
      for (const pat of kwPatterns) {
        const m = str.match(pat);
        if (m && m[1]) {
          const cleaned = m[1].replace(/[-\s]/g, "");
          if (cleaned.length >= 4 && cleaned.length <= 8) return cleaned;
        }
      }
      const hyphenMatch = str.match(/\b([0-9]{3})[-]([0-9]{3})\b/);
      if (hyphenMatch) return `${hyphenMatch[1]}${hyphenMatch[2]}`;
      const nums = str.match(/\b(\d{4,8})\b/g);
      if (!nums) return null;
      return nums.find((m) => m.length === 6) || nums.find((m) => m.length === 4) || nums[0];
    }

    // 4-digit Swiggy code with a 6-digit ref number
    const msg1 = 'Your Swiggy code is 4921. Ref: 891204';
    assert.equal(extractSmartOTP(msg1), '4921');

    // Hyphenated code
    const msg2 = 'Your verification code is 849-102';
    assert.equal(extractSmartOTP(msg2), '849102');

    // Standard 6-digit OTP
    const msg3 = 'Your OTP is 738192. Do not share.';
    assert.equal(extractSmartOTP(msg3), '738192');
  });

  test('computes exact 90-second remaining countdown and expiration', () => {
    const NOTIF_DURATION_MS = 90000;
    const createdAt = 1000000;

    // After 2 seconds
    let currentTick = 1002000;
    let elapsed = currentTick - createdAt;
    let remainingSec = Math.max(0, Math.ceil((NOTIF_DURATION_MS - elapsed) / 1000));
    assert.equal(remainingSec, 88);

    // After 35 seconds (e.g. on panel refresh or page reload)
    currentTick = 1035000;
    elapsed = currentTick - createdAt;
    remainingSec = Math.max(0, Math.ceil((NOTIF_DURATION_MS - elapsed) / 1000));
    assert.equal(remainingSec, 55);

    // After 90 seconds (expired)
    currentTick = 1090000;
    elapsed = currentTick - createdAt;
    remainingSec = Math.max(0, Math.ceil((NOTIF_DURATION_MS - elapsed) / 1000));
    assert.equal(remainingSec, 0);
    assert.equal(elapsed >= NOTIF_DURATION_MS, true);
  });
});
