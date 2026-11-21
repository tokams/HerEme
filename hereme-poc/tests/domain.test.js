'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {configure}=require('../scripts/configure-domain');
test('domain cutover requires expected old domain and preserves secrets and settings verbatim',()=>{
  const source='HEREME_DOMAIN=hereme.46.251.249.110.nip.io\r\nVAPID_PRIVATE_KEY=preserve-this-value\r\nWEB_PUSH_ENABLED=0\r\n# operator comment\r\n';
  assert.throws(()=>configure(source,'hereme.no',''),/expected previous/);
  const result=configure(source,'hereme.no','hereme.46.251.249.110.nip.io');
  assert.ok(result.includes('VAPID_PRIVATE_KEY=preserve-this-value\r\nWEB_PUSH_ENABLED=0\r\n# operator comment\r\n'));
  assert.equal(configure(result,'hereme.no',''),result);
  assert.throws(()=>configure(source+'HEREME_DOMAIN=other\n','hereme.no',''),/exactly one/);
});
