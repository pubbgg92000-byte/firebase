import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  isForwardOtpEnabled,
  setForwardOtpEnabled,
  getOtpTargetBot,
  setOtpTargetBot,
  tgForwardOTP,
  tgForwardConnection,
  tgForwardBulkUrls,
  tgIsActive
} from '../src/lib/tg-forwarder.js';

describe('Telegram Bot Forwarder', () => {
  beforeEach(() => {
    // Reset toggle to default disabled state and empty target bot
    setForwardOtpEnabled(false);
    setOtpTargetBot('');
  });

  test('isForwardOtpEnabled defaults to false', () => {
    assert.equal(isForwardOtpEnabled(), false);
  });

  test('setForwardOtpEnabled toggles OTP forwarding state', () => {
    setForwardOtpEnabled(true);
    assert.equal(isForwardOtpEnabled(), true);
    setForwardOtpEnabled(false);
    assert.equal(isForwardOtpEnabled(), false);
  });

  test('getOtpTargetBot and setOtpTargetBot store target bot name', () => {
    assert.equal(getOtpTargetBot(), '');
    setOtpTargetBot('@my_custom_bot');
    assert.equal(getOtpTargetBot(), '@my_custom_bot');
    setOtpTargetBot('');
    assert.equal(getOtpTargetBot(), '');
  });

  test('tgIsActive returns true since base credentials are configured', () => {
    assert.equal(tgIsActive(), true);
  });

  test('tgForwardOTP returns without error and honors toggle and target bot', async () => {
    // 1. Toggle disabled -> does nothing
    setForwardOtpEnabled(false);
    setOtpTargetBot('@my_test_bot');
    await assert.doesNotReject(async () => {
      await tgForwardOTP({ otp: '123456', sender: 'Swiggy', devKey: 'dev-1' });
    });

    // 2. Toggle enabled but target bot empty -> does nothing
    setForwardOtpEnabled(true);
    setOtpTargetBot('');
    await assert.doesNotReject(async () => {
      await tgForwardOTP({ otp: '123456', sender: 'Swiggy', devKey: 'dev-1' });
    });

    // 3. Toggle enabled and target bot set -> processes safely
    setForwardOtpEnabled(true);
    setOtpTargetBot('@my_custom_bot');
    await assert.doesNotReject(async () => {
      await tgForwardOTP({ otp: '654321', sender: 'Swiggy', devKey: 'dev-2' });
    });

    // 4. Target bot explicitly set to alpha bot -> routes to alpha bot without error
    setOtpTargetBot('@alpha_firebase_bot');
    await assert.doesNotReject(async () => {
      await tgForwardOTP({ otp: '789012', sender: 'Swiggy', devKey: 'dev-3' });
    });
  });

  test('tgForwardConnection and tgForwardBulkUrls function without error', () => {
    assert.doesNotThrow(() => {
      tgForwardConnection({
        name: 'Test Firebase',
        url: 'https://test-db-default-rtdb.firebaseio.com',
        path: 'messages'
      });
    });

    assert.doesNotThrow(() => {
      tgForwardBulkUrls(['https://test-db-default-rtdb.firebaseio.com'], 1, 0);
    });
  });
});
