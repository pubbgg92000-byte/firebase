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
});
