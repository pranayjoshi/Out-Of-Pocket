import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createAgentHandler, searchCatalog } from '../server/agent-api.mjs';

const catalog = [{ id: 'book', title: 'Artificial Intelligence textbook', priceCents: 6000, campus: 'Alabama', seller: 'Sample seller', courseCode: 'CS 465' }];
const body = { campus: 'Alabama', catalog, messages: [{ role: 'user', content: 'Find my AI textbook under $55' }] };
async function request(handler, input = body, extra = {}) {
  const req = Readable.from([typeof input === 'string' ? input : JSON.stringify(input)]);
  Object.assign(req, { url: '/api/agent/chat', method: 'POST', headers: { host: 'localhost:5174' } }, extra);
  let status, result;
  await handler(req, { writeHead(value) { status = value; }, end(value) { result = JSON.parse(value); } }, () => { status = 404; });
  return { status, result };
}
const provider = message => ({ ok: true, json: async () => ({ choices: [{ message }] }) });

test('Big Al search returns matching listings and excludes unrelated inventory', () => {
  assert.equal(searchCatalog(catalog, 'intelligence textbook', 'CS 465', 'Alabama')[0].id, 'book');
  assert.deepEqual(searchCatalog(catalog, 'headphones', undefined, 'Alabama'), []);
});

test('Big Al chat handles missing configuration and invalid requests without calling the provider', async () => {
  const noCalls = () => assert.fail('Unexpected provider request');
  assert.equal((await request(createAgentHandler({ apiKey: '', fetchImpl: noCalls }))).status, 503);
  const handler = createAgentHandler({ apiKey: 'test-key', fetchImpl: noCalls });
  assert.equal((await request(handler, '{')).status, 400);
  assert.equal((await request(handler, {})).status, 400);
  assert.equal((await request(handler, body, { method: 'GET' })).status, 405);
  assert.equal((await request(handler, body, { headers: { host: 'localhost:5174', origin: 'https://example.invalid' } })).status, 403);
});

test('Big Al returns a local trade action and preserves the requested maximum in cents', async () => {
  let calls = 0;
  const handler = createAgentHandler({ apiKey: 'test-key', model: 'test-model', fetchImpl: async (_url, options) => {
    assert.equal(JSON.parse(options.body).model, 'test-model');
    if (++calls === 1) return provider({ content: null, tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'open_trade', arguments: JSON.stringify({ listing_id: 'book', max_price: 54.95 }) } }] });
    return provider({ content: 'The trade is open for review.' });
  } });
  const { status, result } = await request(handler);
  assert.equal(status, 200);
  assert.deepEqual(result.actions, [{ type: 'open_trade', listingId: 'book', item: catalog[0].title, maxCents: 5495 }]);
  assert.equal(calls, 2);
});
