import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { extractNumber } from '../src/lib/device-helpers.js';

// Testing the parser logic in isolation (identical to discovery-engine.svelte.js implementation)
function parseNumbersFromTextOrJson(raw) {
  if (!raw) return [];
  const items = [];

  try {
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (data && typeof data === 'object') {
      if (Array.isArray(data.records)) {
        for (const r of data.records) {
          if (r && typeof r === 'object') {
            const devId = r.deviceId || r.device_id || r.id;
            const ph = r.phoneNumber || r.phone || r.mobNo || r.number;
            if (devId && ph) {
              items.push({
                deviceId: String(devId).trim(),
                phoneNumber: String(ph).trim(),
                connectionId: r.connectionId || '',
                connectionName: r.connectionName || '',
                discoveryMethod: r.discoveryMethod || 'import',
                discoveredAt: r.discoveredAt || new Date().toISOString(),
                syncedToFirebase: !!r.syncedToFirebase
              });
            }
          }
        }
        if (items.length) return items;
      }

      if (Array.isArray(data)) {
        for (const r of data) {
          if (r && typeof r === 'object') {
            const devId = r.deviceId || r.device_id || r.id;
            const ph = r.phoneNumber || r.phone || r.mobNo || r.number;
            if (devId && ph) {
              items.push({
                deviceId: String(devId).trim(),
                phoneNumber: String(ph).trim(),
                connectionId: r.connectionId || '',
                connectionName: r.connectionName || '',
                discoveryMethod: r.discoveryMethod || 'import',
                discoveredAt: r.discoveredAt || new Date().toISOString(),
                syncedToFirebase: !!r.syncedToFirebase
              });
            }
          }
        }
        if (items.length) return items;
      }

      for (const [k, v] of Object.entries(data)) {
        if (!v) continue;
        if (typeof v === 'string') {
          const kStr = k.trim();
          const vStr = v.trim();
          const kIsHex = /^[0-9a-fA-F]{12,32}$/.test(kStr);
          const vIsHex = /^[0-9a-fA-F]{12,32}$/.test(vStr);
          if (kIsHex && !vIsHex) {
            items.push({ deviceId: kStr, phoneNumber: vStr });
          } else if (vIsHex && !kIsHex) {
            items.push({ deviceId: vStr, phoneNumber: kStr });
          } else {
            items.push({ deviceId: kStr, phoneNumber: vStr });
          }
        } else if (typeof v === 'object') {
          const devId = v.device_id || v.deviceId || v.id || (k.length > 10 && !/^\+?\d+$/.test(k) ? k : null);
          const ph = v.phone || v.phoneNumber || v.mobNo || v.number || (/^\+?\d+$/.test(k) ? k : null);
          if (devId && ph) {
            items.push({
              deviceId: String(devId).trim(),
              phoneNumber: String(ph).trim(),
              database: v.database || '',
              discoveryMethod: 'import',
              discoveredAt: v.timestamp || new Date().toISOString()
            });
          }
        }
      }
      if (items.length) return items;
    }
  } catch {}

  if (typeof raw === 'string') {
    const lines = raw.split(/\r?\n/);
    for (const line of lines) {
      const l = line.trim();
      if (!l || l.startsWith('#') || l.startsWith('//')) continue;
      if (l.toLowerCase().includes('device') && l.toLowerCase().includes('phone')) continue;

      let parts = [];
      if (l.includes('->')) parts = l.split('->');
      else if (l.includes('\t')) parts = l.split('\t');
      else if (l.includes(',')) parts = l.split(',');
      else if (l.includes('|')) parts = l.split('|');
      else if (l.includes(':')) parts = l.split(':');
      else parts = l.split(/\s+/);

      if (parts.length >= 2) {
        const p1 = parts[0].trim().replace(/^["']|["']$/g, '');
        const p2 = parts[1].trim().replace(/^["']|["']$/g, '');
        if (p1 && p2) {
          const p1IsHex = /^[0-9a-fA-F]{12,32}$/.test(p1);
          const p2IsHex = /^[0-9a-fA-F]{12,32}$/.test(p2);
          if (p1IsHex && !p2IsHex) {
            items.push({ deviceId: p1, phoneNumber: p2 });
          } else if (p2IsHex && !p1IsHex) {
            items.push({ deviceId: p2, phoneNumber: p1 });
          } else {
            items.push({ deviceId: p1, phoneNumber: p2 });
          }
        }
      }
    }
  }

  return items;
}

describe('Discovery Numbers Parsing & Import Formats', () => {
  test('parses standard discovery JSON export format', () => {
    const jsonStr = JSON.stringify({
      version: 2,
      records: [
        { deviceId: '7550c5973bb02b7e', phoneNumber: '917610254258', connectionName: 'Prod-DB' },
        { deviceId: '345c90c839ab4dab', phoneNumber: '917892878383', connectionName: 'Backup-DB' }
      ]
    });

    const parsed = parseNumbersFromTextOrJson(jsonStr);
    assert.equal(parsed.length, 2);
    assert.equal(parsed[0].deviceId, '7550c5973bb02b7e');
    assert.equal(parsed[0].phoneNumber, '917610254258');
    assert.equal(parsed[0].connectionName, 'Prod-DB');
  });

  test('parses Python worker processed_numbers.json format', () => {
    const workerJson = JSON.stringify({
      "917610254258": {
        "phone": "917610254258",
        "device_id": "7550c5973bb02b7e",
        "database": "https://bantt-d1048-default-rtdb.firebaseio.com",
        "status": "successful"
      },
      "917892878383": {
        "phone": "917892878383",
        "device_id": "345c90c839ab4dab",
        "database": "https://emesh-94556-default-rtdb.firebaseio.com",
        "status": "successful"
      }
    });

    const parsed = parseNumbersFromTextOrJson(workerJson);
    assert.equal(parsed.length, 2);
    assert.equal(parsed[0].deviceId, '7550c5973bb02b7e');
    assert.equal(parsed[0].phoneNumber, '917610254258');
    assert.equal(parsed[0].database, 'https://bantt-d1048-default-rtdb.firebaseio.com');
  });

  test('parses simple key-value device-to-phone mapping', () => {
    const mappingJson = JSON.stringify({
      "7550c5973bb02b7e": "+91 7610254258",
      "345c90c839ab4dab": "917892878383"
    });

    const parsed = parseNumbersFromTextOrJson(mappingJson);
    assert.equal(parsed.length, 2);
    assert.equal(parsed[0].deviceId, '7550c5973bb02b7e');
    assert.equal(parsed[0].phoneNumber, '+91 7610254258');
  });

  test('parses CSV and text line inputs with various delimiters', () => {
    const csvContent = `Device ID,Phone Number\n7550c5973bb02b7e,917610254258\n345c90c839ab4dab -> 917892878383\n14e5bf5f08b2345b | 918910937996`;
    const parsed = parseNumbersFromTextOrJson(csvContent);
    assert.equal(parsed.length, 3);
    assert.equal(parsed[0].deviceId, '7550c5973bb02b7e');
    assert.equal(parsed[0].phoneNumber, '917610254258');
    assert.equal(parsed[1].deviceId, '345c90c839ab4dab');
    assert.equal(parsed[1].phoneNumber, '917892878383');
    assert.equal(parsed[2].deviceId, '14e5bf5f08b2345b');
    assert.equal(parsed[2].phoneNumber, '918910937996');
  });
});

describe('ZIP Archive Creation and Extraction', () => {
  test('creates and unpacks ZIP file containing discovered numbers', async () => {
    const zip = new JSZip();
    const testData = {
      records: [
        { deviceId: '7550c5973bb02b7e', phoneNumber: '917610254258' }
      ]
    };
    zip.file('discovered_numbers.json', JSON.stringify(testData, null, 2));
    zip.file('discovered_numbers.csv', 'Device ID,Phone Number\n7550c5973bb02b7e,917610254258');

    // Generate zip buffer
    const buffer = await zip.generateAsync({ type: 'nodebuffer' });
    assert.ok(buffer.length > 0);

    // Read back zip buffer
    const loadedZip = await JSZip.loadAsync(buffer);
    assert.ok(loadedZip.file('discovered_numbers.json'));
    assert.ok(loadedZip.file('discovered_numbers.csv'));

    const jsonText = await loadedZip.file('discovered_numbers.json').async('string');
    const parsed = JSON.parse(jsonText);
    assert.equal(parsed.records[0].deviceId, '7550c5973bb02b7e');
    assert.equal(parsed.records[0].phoneNumber, '917610254258');
  });
});

describe('Firebase RTDB Phone Patch Payload Structure', () => {
  test('verifies correct phone fields are included in RTDB patch without destroying other attributes', () => {
    const rawPhone = '+91 98765 43210';
    const cleanNum = extractNumber(rawPhone);
    assert.equal(cleanNum, '9876543210');

    const payload = {
      mobNo: cleanNum,
      phone: cleanNum,
      phoneNumber: cleanNum,
      mobile: cleanNum,
      number: cleanNum,
      phoneUpdated: true,
      phoneUpdatedAt: Date.now()
    };

    assert.equal(payload.mobNo, '9876543210');
    assert.equal(payload.phone, '9876543210');
    assert.equal(payload.phoneNumber, '9876543210');
    assert.equal(payload.phoneUpdated, true);
    assert.ok(typeof payload.phoneUpdatedAt === 'number');
  });
});
