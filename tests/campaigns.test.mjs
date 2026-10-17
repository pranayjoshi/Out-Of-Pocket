import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { createCampaignHandler } from '../server/campaigns-api.mjs';
import { sampleAds } from '../src/lib/sampleAds.mjs';

async function request(handler, { method = 'GET', ads, revision, origin, url = '/api/ads/campaigns' } = {}) {
  const req = Readable.from(ads === undefined ? [] : [JSON.stringify({ ads, revision })]);
  req.url = url; req.method = method; req.headers = { host: '127.0.0.1:5174', ...(origin ? { origin } : {}) };
  let status, body;
  await handler(req, { writeHead(code) { status = code; }, end(raw) { body = JSON.parse(raw); } }, () => { status = 404; });
  return { status, body };
}
async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'relay-campaign-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return { directory, handler: createCampaignHandler({ directory }) };
}

test('web and offline native samples use the same campaign records', async () => {
  const native = JSON.parse(await readFile(new URL('../ios/Packages/RelayCore/Sources/RelayCore/Resources/promotions.json', import.meta.url)));
  assert.deepEqual(native, sampleAds);
  for (const campus of ['Alabama', 'Auburn']) for (const placement of ['Discover', 'Campus board', 'My plans', 'Exchanges']) {
    assert.equal(sampleAds.filter(ad => ad.campus === campus && ad.placements.includes(placement)).length, 1);
  }
});

test('shared feed starts with sample ads, persists writes, and excludes drafts/paused ads from native feed', async t => {
  const { handler, directory } = await fixture(t);
  const initial = await request(handler);
  assert.equal(initial.status, 200);
  assert.equal(initial.body.revision, 0);
  const ads = structuredClone(initial.body.ads);
  ads[0].status = 'paused'; ads[1].status = 'draft';
  const saved = await request(handler, { method: 'PUT', ads, revision: 0 });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.revision, 1);
  const native = await request(createCampaignHandler({ directory }), { url: '/api/ads/campaigns?published=1' });
  assert.equal(native.body.ads.length, 2);
  assert.ok(native.body.ads.every(ad => ad.status === 'live'));
  assert.equal((await request(handler)).body.ads[0].status, 'paused');
});

test('concurrent editors cannot overwrite one another silently', async t => {
  const { handler } = await fixture(t);
  const first = structuredClone(sampleAds); first[0].title = 'First edit';
  const second = structuredClone(sampleAds); second[0].title = 'Second edit';
  const results = await Promise.all([
    request(handler, { method: 'PUT', ads: first, revision: 0 }),
    request(handler, { method: 'PUT', ads: second, revision: 0 }),
  ]);
  assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
  assert.equal((await request(handler)).body.revision, 1);
});

test('campaign service rejects unsafe destinations, foreign origins and invalid artwork', async t => {
  const { handler } = await fixture(t);
  assert.equal((await request(handler, { origin: 'https://other.example' })).status, 403);
  for (const change of [{ url: 'javascript:alert(1)' }, { image: 'https://untrusted.example/image.svg' }, { campus: 'Other' }, { placements: ['Made up'] }, { image: 'data:image/svg+xml;base64,PHN2Zz4=' }, { start: 'bad' }]) {
    const ads = structuredClone(sampleAds); Object.assign(ads[0], change);
    assert.equal((await request(handler, { method: 'PUT', ads, revision: 0 })).status, 400);
  }
  assert.equal((await request(handler)).body.revision, 0);
});
