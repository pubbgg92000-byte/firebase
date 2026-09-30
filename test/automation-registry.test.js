import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  registry,
  normalizeKey,
  markSuccess,
  isSuccessful,
  getRecord,
  removeSuccess,
  removeBatch,
  getAllArray,
  getSuccessCount,
  clearRegistry,
  exportJson,
  importJson
} from '../src/lib/automation-registry.js';

describe('Automation Success Registry', () => {
  beforeEach(() => {
    clearRegistry();
  });

  test('normalizes 10-digit Indian phone numbers', () => {
    assert.equal(normalizeKey('+919876543210'), '9876543210');
    assert.equal(normalizeKey('09876543210'), '9876543210');
    assert.equal(normalizeKey('9876543210'), '9876543210');
    assert.equal(normalizeKey('+91 98765 43210'), '9876543210');
  });

  test('marks a phone number as successful and persists metadata', () => {
    const ok = markSuccess('+91 9876543210', {
      deviceId: 'dev-123',
      database: 'https://test-db.firebaseio.com',
      jobId: 'job-999'
    });
    assert.equal(ok, true);
    assert.equal(isSuccessful('9876543210'), true);
    assert.equal(isSuccessful('+919876543210'), true);

    const rec = getRecord('9876543210');
    assert.ok(rec);
    assert.equal(rec.phone, '9876543210');
    assert.equal(rec.deviceId, 'dev-123');
    assert.equal(rec.database, 'https://test-db.firebaseio.com');
    assert.equal(rec.status, 'success');
  });

  test('prevents duplicate processing check via isSuccessful', () => {
    assert.equal(isSuccessful('9123456780'), false);
    markSuccess('9123456780', { deviceId: 'test-1' });
    assert.equal(isSuccessful('9123456780'), true);
  });

  test('removes number for explicit manual reuse', () => {
    markSuccess('9876543210', { deviceId: 'dev-1' });
    assert.equal(isSuccessful('9876543210'), true);
    assert.equal(getSuccessCount(), 1);

    const removed = removeSuccess('9876543210');
    assert.equal(removed, true);
    assert.equal(isSuccessful('9876543210'), false);
    assert.equal(getSuccessCount(), 0);
  });

  test('removes multiple numbers in batch for explicit manual reuse', () => {
    markSuccess('9876543210', { deviceId: 'dev-1' });
    markSuccess('9876543211', { deviceId: 'dev-2' });
    markSuccess('9876543212', { deviceId: 'dev-3' });
    assert.equal(getSuccessCount(), 3);

    const count = removeBatch(['9876543210', '9876543212', '9999999999']);
    assert.equal(count, 2);
    assert.equal(isSuccessful('9876543210'), false);
    assert.equal(isSuccessful('9876543211'), true);
    assert.equal(isSuccessful('9876543212'), false);
    assert.equal(getSuccessCount(), 1);
  });

  test('exports and imports JSON format correctly', () => {
    markSuccess('9876543210', { deviceId: 'dev-1' });
    markSuccess('9876543211', { deviceId: 'dev-2' });

    const exported = exportJson();
    clearRegistry();
    assert.equal(getSuccessCount(), 0);

    const res = importJson(exported);
    assert.equal(res.success, true);
    assert.equal(getSuccessCount(), 2);
    assert.equal(isSuccessful('9876543210'), true);
    assert.equal(isSuccessful('9876543211'), true);
  });

  test('records various failure statuses and aggregates stats correctly', () => {
    registry.markNumber('9876543201', 'successful', { deviceId: 'dev-1', reason: 'Verified' });
    registry.markNumber('9876543202', 'failed', { deviceId: 'dev-2', reason: 'Network timeout' });
    registry.markNumber('9876543203', 'expired', { deviceId: 'dev-3', reason: 'OTP timeout' });
    registry.markNumber('9876543204', 'suspended', { deviceId: 'dev-4', reason: 'Banned account' });
    registry.markNumber('9876543205', 'rate_limited', { deviceId: 'dev-5', reason: 'Too many attempts' });

    const stats = registry.getStats();
    assert.equal(stats.total, 5);
    assert.equal(stats.successful, 1);
    assert.equal(stats.failed, 1);
    assert.equal(stats.expired, 1);
    assert.equal(stats.suspended, 1);
    assert.equal(stats.rateLimited, 1);

    // Verify trashing/removal of failed items in bulk
    const removedCount = registry.removeBatch(['9876543202', '9876543203', '9876543204']);
    assert.equal(removedCount, 3);
    assert.equal(registry.isAlreadyProcessed('9876543202'), false);
    assert.equal(registry.isAlreadyProcessed('9876543201'), true);
    assert.equal(registry.getStats().total, 2);
  });
});

