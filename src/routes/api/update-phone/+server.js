import { json } from '@sveltejs/kit';
import fs from 'node:fs';
import path from 'node:path';

function getWorkerCwd() {
  return path.resolve(process.cwd(), '_python_worker_ref');
}

function getWorkerConfig() {
  try {
    const configPath = path.resolve(getWorkerCwd(), 'worker_config.json');
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
  } catch {}
  return null;
}

function updateProcessedNumbersFile(deviceId, phoneNumber, firebaseUrl) {
  try {
    const pPath = path.resolve(getWorkerCwd(), 'processed_numbers.json');
    let data = {};
    if (fs.existsSync(pPath)) {
      try {
        data = JSON.parse(fs.readFileSync(pPath, 'utf8')) || {};
      } catch {
        data = {};
      }
    }
    const cleanPhone = String(phoneNumber).replace(/\D/g, '');
    data[cleanPhone] = {
      phone: cleanPhone,
      status: 'successful',
      reason: 'Updated via API / Discovery panel',
      device_id: deviceId,
      database: firebaseUrl || '',
      timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
      attempts: 1
    };
    fs.writeFileSync(pPath, JSON.stringify(data, null, 2), 'utf8');
  } catch {}
}

async function patchFirebaseDevice(dbUrl, token, infoPath, deviceId, phoneNumber) {
  const base = dbUrl.replace(/\/+$/, '');
  const p = String(infoPath || 'clients').replace(/^\/+|\/+$/g, '');
  let url = `${base}/${p}/${encodeURIComponent(deviceId)}.json`;
  if (token && token.trim()) {
    url += `?auth=${encodeURIComponent(token.trim())}`;
  }

  const cleanPhone = String(phoneNumber).trim();
  const payload = {
    mobNo: cleanPhone,
    phone: cleanPhone,
    phoneNumber: cleanPhone,
    mobile: cleanPhone,
    number: cleanPhone,
    phoneUpdated: true,
    phoneUpdatedAt: Date.now(),
    phoneUpdateSource: 'api-update'
  };

  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const resJson = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(resJson?.error ?? `HTTP ${res.status}`);
  }
  return resJson;
}

async function locateDeviceInDatabases(deviceId, databases, infoPath = 'clients') {
  for (const dbUrl of databases) {
    if (!dbUrl || typeof dbUrl !== 'string') continue;
    const base = dbUrl.replace(/\/+$/, '');
    try {
      // Check infoPath/deviceId
      const testUrl = `${base}/${infoPath}/${encodeURIComponent(deviceId)}.json?shallow=true`;
      const res = await fetch(testUrl);
      if (res.ok) {
        const val = await res.json();
        if (val !== null) return dbUrl;
      }

      // Check messages/deviceId
      const msgUrl = `${base}/messages/${encodeURIComponent(deviceId)}.json?shallow=true`;
      const msgRes = await fetch(msgUrl);
      if (msgRes.ok) {
        const msgVal = await msgRes.json();
        if (msgVal !== null) return dbUrl;
      }
    } catch {}
  }
  return null;
}

/** @type {import('./$types').RequestHandler} */
export async function GET() {
  return json({
    ok: true,
    endpoint: '/api/update-phone',
    description: 'POST device phone numbers to update directly into Firebase RTDB across databases',
    usage: {
      method: 'POST',
      body: {
        deviceId: 'required string (e.g. 7550c5973bb02b7e)',
        phoneNumber: 'required string (e.g. +919876543210)',
        firebaseUrl: 'optional target Firebase RTDB URL (if omitted, searches all configured databases)',
        token: 'optional Firebase database auth token',
        infoPath: 'optional device info path (default: clients)'
      },
      bulkSupport: {
        records: [
          { deviceId: '...', phoneNumber: '...', firebaseUrl: '...' }
        ]
      }
    }
  });
}

/** @type {import('./$types').RequestHandler} */
export async function POST({ request }) {
  try {
    const body = await request.json();
    const config = getWorkerConfig();
    const databases = config?.firebase_databases || [];

    // Normalize inputs into a list of tasks
    let items = [];
    if (Array.isArray(body.records)) {
      items = body.records;
    } else if (body.deviceId && body.phoneNumber) {
      items = [body];
    } else if (Array.isArray(body)) {
      items = body;
    } else {
      return json({ ok: false, error: 'Expected { deviceId, phoneNumber } or { records: [...] }' }, { status: 400 });
    }

    const results = [];
    let successCount = 0;
    let failedCount = 0;

    for (const item of items) {
      const deviceId = String(item.deviceId || item.device_id || item.id || '').trim();
      const phoneNumber = String(item.phoneNumber || item.phone || item.mobNo || item.number || '').trim();
      const token = item.token || body.token || '';
      const infoPath = item.infoPath || body.infoPath || 'clients';

      if (!deviceId || !phoneNumber) {
        results.push({ deviceId, phoneNumber, ok: false, error: 'Missing deviceId or phoneNumber' });
        failedCount++;
        continue;
      }

      let targetDb = item.firebaseUrl || item.database || body.firebaseUrl;

      // If database not explicitly given, search configured databases
      if (!targetDb && databases.length > 0) {
        targetDb = await locateDeviceInDatabases(deviceId, databases, infoPath);
      }

      if (!targetDb) {
        results.push({
          deviceId,
          phoneNumber,
          ok: false,
          error: 'No target Firebase database specified and device was not found in configured databases'
        });
        failedCount++;
        continue;
      }

      try {
        await patchFirebaseDevice(targetDb, token, infoPath, deviceId, phoneNumber);
        updateProcessedNumbersFile(deviceId, phoneNumber, targetDb);
        results.push({
          deviceId,
          phoneNumber,
          firebaseUrl: targetDb,
          ok: true,
          message: 'Successfully updated in Firebase RTDB'
        });
        successCount++;
      } catch (patchErr) {
        results.push({
          deviceId,
          phoneNumber,
          firebaseUrl: targetDb,
          ok: false,
          error: patchErr.message
        });
        failedCount++;
      }
    }

    return json({
      ok: true,
      total: items.length,
      successCount,
      failedCount,
      results
    });
  } catch (err) {
    return json({ ok: false, error: err.message }, { status: 500 });
  }
}
