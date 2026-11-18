import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';

// Loads the real Express app, so syntax or wiring errors in app.js fail the suite.
test('API boots and serves the main routes', async () => {
  delete process.env.SERPAPI_KEY;
  const server = createApp().listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api`;
  try {
    assert.equal((await fetch(`${base}/health`)).status, 200);
    const cmp = await (await fetch(`${base}/search/compare?q=pizza`)).json();
    assert.equal(cmp.classic[0].id, 6);
    assert.equal(cmp.modern[0].id, 2);
    assert.equal((await fetch(`${base}/search/compare`)).status, 400);
    assert.equal((await fetch(`${base}/web/search?q=pizza`)).status, 503);
    assert.equal((await fetch(`${base}/trending`)).status, 503);
    assert.equal((await fetch(`${base}/examples`)).status, 200);
  } finally { server.close(); }
});
