require('./register.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const { localSecurity } = require('../../apps/backend/src/services/auth/local-security.middleware.ts');
const { isAuthenticationAttempt } = require('../../libraries/helpers/src/security/local-routes.ts');

test('real Express requests cannot bypass local policy using method, case, encoding or path aliases', async () => {
  Object.assign(process.env, { POSTIZ_LOCAL_ONLY: 'true', FRONTEND_URL: 'http://localhost:7443', LOCAL_INTERNAL_SECRET: 'b'.repeat(64) });
  const app = express();
  app.use(localSecurity);
  // Express default routing accepts aliases. No denied request may reach it.
  app.post('/auth/login', (_req, res) => res.sendStatus(204));
  app.post('/media/generate-image', (_req, res) => res.sendStatus(204));
  app.post('/media/:endpoint', (_req, res) => res.sendStatus(204));
  app.post('/posts/generator', (_req, res) => res.sendStatus(204));
  app.get('/user/self', (_req, res) => res.sendStatus(204));
  const server = http.createServer(app);
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const send = (path, method = 'POST', headers = {}) => new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: server.address().port, path, method,
      headers: { host: 'localhost:7443', origin: 'http://localhost:7443', ...headers } }, res => {
      res.resume(); res.on('end', () => resolve(res.statusCode));
    });
    req.on('error', reject); req.end();
  });
  try {
    assert.equal(await send('/auth/login'), 204);
    assert.equal(await send('/auth/login?next=%2Flaunches'), 204);
    assert.equal(await send('/media/upload-server'), 204);
    assert.equal(await send('/user/self', 'GET'), 204);
    for (const path of ['/auth/login/', '/auth/Login', '/auth/%6cogin', '/auth/login//',
      '/media/generate-image', '/media/Generate-image', '/media/anything', '/media/upload-server/',
      '/posts/generator', '/posts/Generator', '/posts/%67enerator',
      '/integrations/extension-refresh', '/integrations/social-connect/instagram']) {
      assert.equal(await send(path), 404, path);
    }
    assert.equal(await send('/auth/login', 'GET'), 404);
    assert.equal(await send('/user/self', 'POST'), 404);
    assert.equal(await send('/user/self', 'HEAD'), 404);
    // Equal character count but unequal UTF-8 byte length must not throw.
    assert.equal(await send('/user/self', 'GET', { 'x-local-internal': 'é'.repeat(64) }), 204);
    assert.equal(await send('/user/self', 'GET', { host: 'attacker.test', 'x-local-internal': 'é'.repeat(64) }), 403);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('authentication throttle includes query strings and Express aliases', () => {
  for (const path of ['/auth/login', '/auth/login/', '/auth/Login', '/auth/login?x=1', '/auth/login/?x=1']) {
    assert.equal(isAuthenticationAttempt('POST', path), true, path);
  }
  assert.equal(isAuthenticationAttempt('GET', '/auth/login'), false);
  assert.equal(isAuthenticationAttempt('POST', '/auth/login-extra'), false);
});
