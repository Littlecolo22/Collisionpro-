import assert from 'node:assert/strict';
import test from 'node:test';
import { partsRoutes } from '../src/partsapi.js';

function testHandler() {
  let handler;
  partsRoutes({
    get() {},
    post(path, fn) {
      if (path === '/api/parts/test') handler = fn;
    },
  });
  return handler;
}

function envWith(provider, values = {}) {
  return {
    ...values,
    DB: {
      prepare(sql) {
        return {
          bind() { return this; },
          async first() {
            return sql.includes('SELECT value FROM settings') ? { value: provider } : null;
          },
          async run() { return {}; },
        };
      },
    },
  };
}

test('PartsTech test connection does not send incomplete auth credentials', async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = async () => {
    fetchCalled = true;
    throw new Error('unexpected network request');
  };

  try {
    const response = await testHandler()({ env: envWith('partstech_autodoc', {
      PARTSTECH_USER_ID: 'shop-user',
      PARTSTECH_USER_KEY: 'user-key',
    }), need() {} });
    const result = await response.json();

    assert.equal(result.ok, false);
    assert.match(result.partstech, /integration partner ID and key are required/i);
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('PartsTech test connection sends user and partner credentials together', async () => {
  const originalFetch = globalThis.fetch;
  let authRequest;
  globalThis.fetch = async (url, init) => {
    authRequest = { url, body: JSON.parse(init.body) };
    return new Response(JSON.stringify({ accessToken: 'test-token' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  try {
    const response = await testHandler()({ env: envWith('partstech_autodoc', {
      PARTSTECH_USER_ID: 'shop-user',
      PARTSTECH_USER_KEY: 'user-key',
      PARTSTECH_PARTNER_ID: 'partner-id',
      PARTSTECH_PARTNER_KEY: 'partner-key',
    }), need() {} });
    const result = await response.json();

    assert.equal(authRequest.url, 'https://api.partstech.com/oauth/access');
    assert.deepEqual(authRequest.body, {
      accessType: 'user',
      credentials: {
        user: { id: 'shop-user', key: 'user-key' },
        partner: { id: 'partner-id', key: 'partner-key' },
      },
    });
    assert.equal(result.partstech, 'signed in');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
