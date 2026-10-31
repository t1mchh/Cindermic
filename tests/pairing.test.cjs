const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parsePairing } = require('../shared/pairing.mjs');
const valid = `cindermic://pair?host=192.168.1.2&port=43129&token=${'a'.repeat(64)}&fingerprint=${'B'.repeat(64)}`;
test('manual and scanned links preserve the pinned receiver identity', () => {
  assert.deepEqual(parsePairing(valid), {
    host: '192.168.1.2',
    port: 43129,
    token: 'a'.repeat(64),
    fingerprint: 'b'.repeat(64),
  });
});
test('pairing rejects wrong schemes, malformed addresses, duplicate fields, and missing credentials', () => {
  for (const link of [
    valid.replace('cindermic:', 'https:'),
    valid + '&host=example.com',
    valid.replace('43129', '0'),
    valid.replace('192.168.1.2', 'x%2Fy'),
    valid.replace('192.168.1.2', 'x%40y'),
    valid.replace('token=', 'other='),
    valid + '#fragment',
    valid.replace('pair?', 'pair/path?'),
    '192.168.1.2',
    'x'.repeat(2049),
  ])
    assert.throws(() => parsePairing(link), /invalid/);
});
