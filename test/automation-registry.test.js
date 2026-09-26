import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  registry,
  normalizeKey,
  markSuccess,
  isSuccessful,
  getRecord,
  removeSuccess,
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
});
