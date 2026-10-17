import test from 'node:test';
import assert from 'node:assert/strict';
import { cropRect, isAdVisible, validateAd } from '../src/lib/ads.mjs';
import { createAdsHandler } from '../server/ads-api.mjs';
import { Readable } from 'node:stream';

const ad = { title: 'Film night', sponsor: 'Student Life', image: 'banner.jpg', url: 'https://university.edu/event', status: 'live', campus: 'Alabama', placements: ['Discover'], start: '2099-10-01', end: '2099-10-31' };

test('promotions respect campus, placement, status, and inclusive schedule boundaries', () => {
  assert.equal(isAdVisible(ad, 'Alabama', 'Discover', '2099-10-01'), true);
  assert.equal(isAdVisible(ad, 'Alabama', 'Discover', '2099-10-31'), true);
  assert.equal(isAdVisible(ad, 'Auburn', 'Discover', '2099-10-10'), false);
  assert.equal(isAdVisible(ad, 'Alabama', 'Exchanges', '2099-10-10'), false);
  assert.equal(isAdVisible(ad, 'Alabama', 'Discover', '2099-09-30'), false);
  assert.equal(isAdVisible(ad, 'Alabama', 'Discover', '2099-11-01'), false);
  for (const status of ['draft', 'paused']) assert.equal(isAdVisible({ ...ad, status }, 'Alabama', 'Discover', '2099-10-10'), false);
});

test('crops stay inside landscape and portrait sources at every zoom and edge', () => {
  for (const [width, height] of [[2400, 800], [800, 2400], [1200, 1200], [5000, 400]]) {
    for (const zoom of [1, 1.5, 3]) for (const x of [0, 50, 100]) for (const y of [0, 50, 100]) {
      const crop = cropRect(width, height, zoom, x, y);
      assert.equal(crop.width / crop.height, 3);
      assert.ok(crop.x >= 0 && crop.y >= 0);
      assert.ok(crop.x + crop.width <= width + 1e-8);
      assert.ok(crop.y + crop.height <= height + 1e-8);
    }
  }
});

test('publishing requires creative, sponsor, placement and safe destination; partial drafts can be saved', () => {
  assert.equal(validateAd(ad, true), '');
  for (const url of ['javascript:alert(1)', 'data:text/html,bad', 'http://university.edu', 'https://user:password@university.edu', 'not a url']) assert.notEqual(validateAd({ ...ad, url }, true), '');
  for (const change of [{ image: '' }, { sponsor: '' }, { placements: [] }, { url: '' }, { start: '2099-11-01' }]) assert.notEqual(validateAd({ ...ad, ...change }, true), '');
  assert.equal(validateAd({ ...ad, image: '', url: '', placements: [] }, false), '');
});

async function request(handler, { url = '/api/ads/generate', method = 'POST', body = '{"prompt":"Autumn campus festival illustration"}', origin } = {}) {
  const req = Readable.from([body]);
  req.url = url; req.method = method; req.headers = { host: '127.0.0.1:5175', ...(origin ? { origin } : {}) };
  let status, result;
  await handler(req, { writeHead(code) { status = code; }, end(value) { result = JSON.parse(value); } }, () => { status = 404; });
  return { status, result };
}

test('generation handles missing configuration and cross-origin requests without calling a provider', async () => {
  const handler = createAdsHandler({ apiKey: '', fetchImpl: () => assert.fail('Unexpected provider call') });
  assert.equal((await request(handler)).status, 503);
  const status = await request(handler, { url: '/api/ads/status', method: 'GET' });
  assert.deepEqual(status.result, { available: false });
  assert.equal((await request(handler, { origin: 'https://other.example' })).status, 403);
});

test('generation rejects malformed or oversized input before calling a provider', async () => {
  const handler = createAdsHandler({ apiKey: 'test-key', fetchImpl: () => assert.fail('Unexpected provider call') });
  for (const body of ['{', '{}', '{"prompt":9}', '{"prompt":"tiny"}', JSON.stringify({ prompt: 'x'.repeat(3001) })]) {
    assert.equal((await request(handler, { body })).status, 400);
  }
  assert.equal((await request(handler, { body: 'x'.repeat(12001) })).status, 413);
});

test('generation sends a server-authenticated image request and returns only image data', async () => {
  const handler = createAdsHandler({ apiKey: 'test-key', fetchImpl: async (url, options) => {
    assert.equal(url, 'https://openrouter.ai/api/v1/images');
    assert.equal(options.headers.Authorization, 'Bearer test-key');
    const body = JSON.parse(options.body);
    assert.equal(body.aspect_ratio, '21:9');
    assert.equal(body.model, 'black-forest-labs/flux.2-klein-4b');
    assert.equal(body.n, 1);
    assert.match(body.prompt, /Autumn campus festival/);
    return { ok: true, json: async () => ({ data: [{ b64_json: 'test-image-data' }] }) };
  } });
  assert.deepEqual(await request(handler), { status: 200, result: { image: 'data:image/jpeg;base64,test-image-data' } });
});

test('provider failures do not leak credentials or provider internals, and unlock retries', async () => {
  let calls = 0;
  const handler = createAdsHandler({ apiKey: 'test-key', fetchImpl: async () => {
    calls++;
    if (calls === 1) throw new Error('Internal details with secret test-key');
    return { ok: false, status: 429 };
  } });
  const failure = await request(handler);
  assert.equal(failure.status, 502);
  assert.ok(!JSON.stringify(failure).includes('test-key'));
  assert.equal((await request(handler)).status, 429);
  assert.equal(calls, 2);
});

test('overlapping requests allow only one provider generation and release the lock afterward', async () => {
  let resolveProvider;
  let calls = 0;
  const providerResult = new Promise(resolve => { resolveProvider = resolve; });
  const handler = createAdsHandler({ apiKey: 'test-key', fetchImpl: () => { calls++; return providerResult; } });
  const first = request(handler);
  const second = request(handler);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 1);
  resolveProvider({ ok: true, json: async () => ({ data: [{ b64_json: 'test' }] }) });
  const results = await Promise.all([first, second]);
  assert.deepEqual(results.map(result => result.status).sort(), [200, 429]);
  assert.equal((await request(handler)).status, 200);
});

test('OpenRouter image media types are preserved and unsupported formats are rejected', async () => {
  for (const mediaType of ['image/png', 'image/jpeg', 'image/webp']) {
    const handler = createAdsHandler({ apiKey: 'test-key', fetchImpl: async () => ({ ok: true, json: async () => ({ data: [{ b64_json: 'test', media_type: mediaType }] }) }) });
    assert.equal((await request(handler)).result.image, `data:${mediaType};base64,test`);
  }
  const handler = createAdsHandler({ apiKey: 'test-key', fetchImpl: async () => ({ ok: true, json: async () => ({ data: [{ b64_json: 'test', media_type: 'image/svg+xml' }] }) }) });
  assert.equal((await request(handler)).status, 502);
});
