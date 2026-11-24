'use strict';
// Both transports dial only loopback. Host and TLS SNI select the instance under test.
const assert = require('node:assert/strict');
const http = require('node:http');
const https = require('node:https');
const WebSocket = require('ws');
const sharp = require('sharp');

function site(host, port, ca) {
  const origin = 'https://' + host;
  const connection = { hostname: '127.0.0.1', port, servername: host, ca, agent: false };
  async function request(path, {method = 'GET', body, user, headers = {}} = {}) {
    const fields = {host, origin, ...user?.headers, ...headers};
    let payload;
    if (body instanceof FormData) {
      const form = new Response(body);
      fields['content-type'] = form.headers.get('content-type');
      payload = Buffer.from(await form.arrayBuffer());
    } else if (body !== undefined) {
      fields['content-type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    return new Promise((resolve, reject) => {
      const req = (ca ? https : http).request({...connection, path, method, headers: fields}, res => {
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('error', reject);
        res.on('end', () => {
          const bytes = Buffer.concat(chunks);
          try {
            const result = res.headers['content-type']?.includes('json') ? JSON.parse(bytes) : bytes;
            resolve({status:res.statusCode, headers:res.headers, body:result});
          } catch (error) { reject(error); }
        });
      });
      req.setTimeout(12000, () => req.destroy(new Error('Timed out requesting ' + path)));
      req.on('error', reject);
      req.end(payload);
    });
  }
  function handshake(user, suppliedOrigin = origin, suppliedHost = host) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket((ca ? 'wss' : 'ws') + '://127.0.0.1:' + port + '/api/chat-socket', {
        ca, servername: host, handshakeTimeout: 5000,
        headers: {Host:suppliedHost, Origin:suppliedOrigin, Cookie:user.headers.cookie}
      });
      ws.once('message', frame => { ws.close(); resolve(JSON.parse(frame).type); });
      ws.once('unexpected-response', (req, res) => { res.resume(); req.destroy(); resolve(res.statusCode); });
      ws.once('error', reject);
    });
  }
  return {request, handshake, origin};
}

async function register(instance, name, headers = {}) {
  const response = await instance.request('/api/session', {method:'POST', body:{name}, headers});
  assert.equal(response.status, 201);
  const cookies = response.headers['set-cookie'];
  assert.ok(cookies.some(cookie => cookie.startsWith('hereme_session=') && cookie.includes('HttpOnly')));
  for (const cookie of cookies) {
    assert.doesNotMatch(cookie, /;\s*Domain=/i);
    assert.match(cookie, /; Secure/i);
  }
  return {id:response.body.user.id, headers:{
    cookie:cookies.map(value => value.split(';')[0]).join('; '),
    'x-csrf-token':response.body.csrf_token
  }};
}

async function isolation(main, community, existingMainTitles = []) {
  const publicKeys = [];
  for (const instance of [main, community]) {
    assert.equal((await instance.request('/api/ready')).status, 200);
    assert.equal((await instance.request('/api/meta')).body.public_origin, instance.origin);
    assert.equal((await instance.request('/api/passkeys/config')).body.rp_id, new URL(instance.origin).hostname);
    assert.deepEqual((await instance.request('/api/posts')).body.posts.map(p=>p.title), instance===main?existingMainTitles:[]);
    const push = (await instance.request('/api/push/config')).body;
    assert.equal(push.enabled, true);
    publicKeys.push(push.public_key);
  }
  assert.notEqual(publicKeys[0],publicKeys[1]);
  const author = await register(main, 'LocalAuthor');
  const recipient = await register(main, 'Neighbour');
  const other = await register(community, 'LocalAuthor');
  assert.notEqual(author.id, other.id);
  assert.equal((await community.request('/api/me', {user:author})).status, 401);
  assert.equal((await main.request('/api/me', {user:other})).status, 401);
  assert.equal((await community.request('/api/users/' + author.id + '/public')).status, 404);

  const form = new FormData();
  form.set('title','M1 photo'); form.set('type','image'); form.set('category','story');
  const bytes = await sharp({create:{width:32,height:24,channels:3,background:'#468'}}).jpeg().toBuffer();
  form.set('image', new Blob([bytes], {type:'image/jpeg'}), 'photo.jpg');
  const post = await main.request('/api/posts', {method:'POST', body:form, user:author});
  assert.equal(post.status, 201);
  const postPath = '/api/posts/' + post.body.id;
  const media = (await main.request(postPath)).body.post.media_url;
  assert.ok(media.startsWith('/media/'));
  assert.equal((await main.request(media)).status, 200);
  assert.equal((await community.request(media)).status, 404);
  assert.equal((await community.request(postPath)).status, 404);
  const create = {method:'POST', body:{category:'tip',title:'Private to B',type:'text'}, user:other};
  assert.equal((await community.request('/api/posts', {...create, headers:{origin:main.origin}})).status, 403);
  assert.equal((await community.request('/api/posts', {...create, headers:{'x-csrf-token':'incorrect'}})).status, 403);
  const second = await community.request('/api/posts', create);
  assert.equal(second.status, 201);
  assert.deepEqual((await main.request('/api/posts')).body.posts.map(post => post.title).sort(), ['M1 photo',...existingMainTitles].sort());

  const message = await main.request('/api/chats/direct', {method:'POST', user:author, body:{
    target_user_id:recipient.id, body:'Private first message', client_key:'m1-private-message'
  }});
  assert.equal(message.status, 201);
  assert.ok((await main.request('/api/notifications',{user:recipient})).body.unread > 0);
  assert.equal((await community.request('/api/notifications',{user:other})).body.unread,0);
  const messages = '/api/chats/' + message.body.chat_id + '/messages';
  assert.equal((await main.request(messages, {user:author})).status, 200);
  assert.equal((await community.request(messages, {user:other})).status, 403);
  assert.equal(await main.handshake(author), 'connected');
  assert.equal(await community.handshake(other), 'connected');
  assert.equal(await community.handshake(author), 401);
  assert.equal(await main.handshake(author, community.origin), 403);
  return {author, other, media, postPath, messages};
}
module.exports = {site, register, isolation};
