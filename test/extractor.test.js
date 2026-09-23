import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  universalExtract,
  validateFirebaseUrl,
  scanFirebaseUrls,
  nameFromFbUrl,
  tryBase64Decode,
  deepExtract,
} from '../src/lib/firebase-extractor.js';

describe('Firebase URL Validation', () => {
  test('validates standard firebaseio.com URLs', () => {
    assert.equal(validateFirebaseUrl('https://my-app.firebaseio.com'), 'https://my-app.firebaseio.com');
    assert.equal(validateFirebaseUrl('https://my-app-default-rtdb.firebaseio.com/'), 'https://my-app-default-rtdb.firebaseio.com');
    assert.equal(validateFirebaseUrl('https://demo-123.firebaseio.com/messages/key.json'), 'https://demo-123.firebaseio.com');
  });

  test('validates firebasedatabase.app and regional endpoints', () => {
    assert.equal(
      validateFirebaseUrl('https://my-proj-default-rtdb.europe-west1.firebasedatabase.app'),
      'https://my-proj-default-rtdb.europe-west1.firebasedatabase.app'
    );
    assert.equal(
      validateFirebaseUrl('https://asia-db.asia-southeast1.firebasedatabase.app/'),
      'https://asia-db.asia-southeast1.firebasedatabase.app'
    );
    assert.equal(
      validateFirebaseUrl('https://myapp.firebasedatabase.app'),
      'https://myapp.firebasedatabase.app'
    );
  });

  test('rejects non-Firebase or invalid URLs', () => {
    assert.equal(validateFirebaseUrl('https://google.com'), null);
    assert.equal(validateFirebaseUrl('https://firebaseio.com'), null); // Root domain without subdomain
    assert.equal(validateFirebaseUrl('https://firebasedatabase.app'), null);
    assert.equal(validateFirebaseUrl('javascript:alert(1)'), null);
    assert.equal(validateFirebaseUrl('not a url'), null);
    assert.equal(validateFirebaseUrl(''), null);
  });
});

describe('Base64 Decoding (Standard and URL-Safe)', () => {
  test('decodes standard Base64 with padding', () => {
    const raw = 'https://app-1-default-rtdb.firebaseio.com';
    const b64 = Buffer.from(raw).toString('base64');
    assert.equal(tryBase64Decode(b64), raw);
  });

  test('decodes URL-safe Base64 without padding', () => {
    const raw = 'https://urlsafe-project-default-rtdb.firebaseio.com';
    const b64UrlSafe = Buffer.from(raw).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    assert.equal(tryBase64Decode(b64UrlSafe), raw);
  });
});

describe('Universal Single-Link Extraction', () => {
  test('extracts from arbitrary domains with query parameters: s, m, zeniths, data, custom', () => {
    const targetUrl = 'https://production-db-default-rtdb.firebaseio.com';
    const b64 = Buffer.from(targetUrl).toString('base64');

    // 1. ?s= parameter
    const res1 = universalExtract(`https://arbitrary-panel.vercel.app/?s=${b64}`);
    assert.equal(res1.results.length, 1);
    assert.equal(res1.results[0].url, targetUrl);

    // 2. ?zeniths= parameter
    const res2 = universalExtract(`https://myportal.xyz/dashboard?zeniths=${encodeURIComponent(b64)}`);
    assert.equal(res2.results.length, 1);
    assert.equal(res2.results[0].url, targetUrl);

    // 3. ?m= parameter
    const res3 = universalExtract(`https://custom-gateway.io/view?m=${b64}`);
    assert.equal(res3.results.length, 1);
    assert.equal(res3.results[0].url, targetUrl);

    // 4. ?data= parameter
    const res4 = universalExtract(`https://another-domain.net/check?data=${b64}`);
    assert.equal(res4.results.length, 1);
    assert.equal(res4.results[0].url, targetUrl);

    // 5. any arbitrary parameter name
    const res5 = universalExtract(`https://random-site.org/app?config_payload=${b64}`);
    assert.equal(res5.results.length, 1);
    assert.equal(res5.results[0].url, targetUrl);
  });

  test('extracts direct raw Firebase URLs without modification', () => {
    const url1 = 'https://alpha-default-rtdb.firebaseio.com';
    const url2 = 'https://beta.europe-west1.firebasedatabase.app';
    const res = universalExtract(`${url1}\n${url2}`);
    assert.equal(res.results.length, 2);
    assert.equal(res.results[0].url, url1);
    assert.equal(res.results[1].url, url2);
  });
});

describe('Nested Encodings and JSON Extraction', () => {
  test('extracts from nested Base64 inside JSON', () => {
    const dbUrl = 'https://nested-secret-default-rtdb.firebaseio.com';
    const innerB64 = Buffer.from(dbUrl).toString('base64');
    const jsonPayload = JSON.stringify({
      status: 'ok',
      config: {
        encodedDatabase: innerB64
      }
    });
    const outerB64 = Buffer.from(jsonPayload).toString('base64');
    
    // URL with outer Base64 that contains JSON that contains inner Base64
    const panelLink = `https://secure-panel.co/view?payload=${outerB64}`;
    const res = universalExtract(panelLink);

    assert.equal(res.results.length, 1);
    assert.equal(res.results[0].url, dbUrl);
  });

  test('extracts from JSON array of objects or strings', () => {
    const urls = [
      'https://proj-one.firebaseio.com',
      'https://proj-two-default-rtdb.firebaseio.com',
      'https://proj-three.asia-southeast1.firebasedatabase.app'
    ];
    const jsonArray = JSON.stringify([
      { name: 'db1', url: urls[0] },
      { name: 'db2', link: urls[1] },
      urls[2]
    ]);

    const res = universalExtract(jsonArray);
    assert.equal(res.results.length, 3);
    assert.equal(res.results[0].url, urls[0]);
    assert.equal(res.results[1].url, urls[1]);
    assert.equal(res.results[2].url, urls[2]);
  });
});

describe('Bulk Input & Upload Formats', () => {
  test('extracts from multi-line mixed input with progress & stats', () => {
    const u1 = 'https://line1-default-rtdb.firebaseio.com';
    const u2 = 'https://line2-default-rtdb.firebaseio.com';
    const b64 = Buffer.from('https://line3.firebasedatabase.app').toString('base64');

    const input = [
      u1,
      'invalid line without firebase',
      `https://panel.org/?s=${b64}`,
      'another bad link https://google.com',
      u2
    ].join('\n');

    const res = universalExtract(input);
    assert.equal(res.results.length, 3);
    assert.equal(res.stats.totalInput, 5);
    assert.equal(res.stats.successCount, 3);
    assert.equal(res.stats.malformedCount, 2);
    assert.equal(res.malformed.length, 2);
  });

  test('extracts from CSV file content', () => {
    const u1 = 'https://csv-proj-1.firebaseio.com';
    const u2 = 'https://csv-proj-2.europe-west1.firebasedatabase.app';
    const csv = `ID,Name,FirebaseURL,Notes\n1,Alpha,"${u1}",active\n2,Beta,"${u2}",backup`;

    const res = universalExtract(csv, 'databases.csv');
    assert.equal(res.results.length, 2);
    assert.equal(res.results[0].url, u1);
    assert.equal(res.results[1].url, u2);
  });
});

describe('Deduplication & Order Preservation', () => {
  test('preserves original order and deduplicates identical entries', () => {
    const u1 = 'https://first-default-rtdb.firebaseio.com';
    const u2 = 'https://second-default-rtdb.firebaseio.com';
    const u3 = 'https://third-default-rtdb.firebaseio.com';

    // Duplicate u1 and u2 in different positions
    const input = [u1, u2, u1, u3, u2, u1].join('\n');
    const res = universalExtract(input);

    assert.equal(res.results.length, 3);
    assert.equal(res.results[0].url, u1);
    assert.equal(res.results[1].url, u2);
    assert.equal(res.results[2].url, u3);
    assert.equal(res.stats.duplicateCount, 3);
  });
});

describe('Safety & Untrusted Text', () => {
  test('safely handles scripts, HTML, and malformed characters without execution', () => {
    const attackString = '<script>alert("xss")</script><a href="https://safe-db.firebaseio.com">link</a>';
    const res = universalExtract(attackString);

    assert.equal(res.results.length, 1);
    assert.equal(res.results[0].url, 'https://safe-db.firebaseio.com');
  });

  test('properly reports malformed entries without crashing', () => {
    const res = universalExtract('random broken text\nhttps://not-firebase.com/test');
    assert.equal(res.results.length, 0);
    assert.equal(res.malformed.length, 2);
    assert.ok(res.errors.length > 0);
  });
});
