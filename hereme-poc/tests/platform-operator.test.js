'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {openRegistry, login, totp} = require('../server/platform/operator');

test('operator authenticator uses six-digit SHA-1 TOTP with big-endian time steps', () => {
  const secret = Buffer.from('12345678901234567890');
  assert.equal(totp(secret, Math.floor(59 / 30)), '287082');
  assert.equal(totp(secret, Math.floor(1111111109 / 30)), '081804');
});

test('operator login throttling is scoped to the gateway peer and expires', () => {
  const registry = openRegistry(':memory:');
  const fields = {name:'operator', password:'incorrect', code:'123456'};
  try {
    for(let i=0; i<12; i++) assert.equal(login(registry,'peer-a',fields,1000),null);
    assert.throws(()=>login(registry,'peer-a',fields,1000), {status:429});
    assert.equal(login(registry,'peer-b',fields,1000),null);
    assert.equal(login(registry,'peer-a',fields,301001),null);
    assert.equal(login(registry,'peer-a',null),null);
  } finally {registry.close();}
});
