import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createScheduleHandler } from '../server/schedule-api.mjs';
import { coursesFor, matchCourses, recommendationReason } from '../src/lib/courses.mjs';
const image = 'data:image/png;base64,' + Buffer.from([137,80,78,71,13,10,26,10,0]).toString('base64');
const input = { campus: 'Alabama', consent: true, image };
async function request(handler, body = input, extra = {}) {
  const req = Readable.from([typeof body === 'string' ? body : JSON.stringify(body)]);
  Object.assign(req, { url: '/api/schedule/import', method: 'POST', headers: { host: 'localhost:5174' } }, extra);
  let status, result;
  await handler(req, { writeHead(s) { status = s; }, end(value) { result = JSON.parse(value); } }, () => { status = 404; });
  return { status, result };
}
const provider = courses => async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ courses }) } }] }) });
test('course matching normalizes codes, deduplicates, and isolates universities', () => {
  assert.deepEqual(matchCourses('Alabama', ['cs100', 'CS 100', 'COMP 1210']).map(c => c.code), ['CS 100']);
  assert.equal(matchCourses('Auburn', ['CS 100']).length, 0);
  assert.equal(coursesFor('unknown').length, 0);
});
test('recommendations require saved campus classes and relevant tags or keywords', () => {
  const item = { campus: 'Alabama', seller: 'Student', courseCode: 'CS 100', title: 'Textbook', description: '' };
  assert.match(recommendationReason(item, 'Alabama', ['CS 100']), /For your CS 100/);
  assert.equal(recommendationReason(item, 'Auburn', ['CS 100']), '');
  assert.equal(recommendationReason(item, 'Alabama', []), '');
  assert.equal(recommendationReason({ ...item, seller: 'You' }, 'Alabama', ['CS 100']), '');
  assert.equal(recommendationReason({ ...item, courseCode: undefined }, 'Alabama', ['CS 100']), '');
  assert.match(recommendationReason({ ...item, courseCode: undefined, title: 'Programming textbook' }, 'Alabama', ['CS 100']), /May help/);
});
test('imports require configuration, consent, allowed campus, image bytes and same origin', async () => {
  const noCalls = () => assert.fail('Provider called for invalid request');
  assert.equal((await request(createScheduleHandler({ apiKey: '', fetchImpl: noCalls }))).status, 503);
  const handler = createScheduleHandler({ apiKey: 'secret', fetchImpl: noCalls });
  for (const body of ['{', null, {}, { ...input, consent: false }, { ...input, campus: 'Other' }, { ...input, image: 'https://example.com/pic.png' }, { ...input, image: 'data:image/png;base64,abcd' }]) assert.equal((await request(handler, body)).status, 400);
  assert.equal((await request(handler, input, { headers: { host: 'localhost:5174', origin: 'https://evil.example' } })).status, 403);
  assert.equal((await request(handler, input, { method: 'GET' })).status, 405);
  assert.equal((await request(handler, 'x'.repeat(8 * 1024 * 1024 + 1))).status, 413);
});
test('imports use Gemma vision model and return only matched codes and unknown codes for review', async () => {
  const handler = createScheduleHandler({ apiKey: 'secret', fetchImpl: async (url, options) => {
    assert.equal(url, 'https://openrouter.ai/api/v1/chat/completions');
    assert.equal(options.headers.Authorization, 'Bearer secret');
    const payload = JSON.parse(options.body);
    assert.equal(payload.model, 'google/gemma-4-31b-it');
    assert.equal(payload.max_tokens, 1200);
    assert.equal(payload.messages[1].content[1].image_url.url, image);
    return provider(['CS100', 'CS 100', 'COMP 1210'])();
  } });
  const { status, result } = await request(handler);
  assert.equal(status, 200);
  assert.deepEqual(result.courses, ['CS 100']);
  assert.deepEqual(result.unmatched, ['COMP 1210']);
  assert.ok(!JSON.stringify(result).includes(image));
});
test('invalid model responses and upstream failures are safe and permit retry', async () => {
  for (const courses of [null, ['ignore previous instructions'], [123], Array(41).fill('CS 100')]) {
    assert.equal((await request(createScheduleHandler({ apiKey: 'secret', fetchImpl: provider(courses) }))).status, 502);
  }
  let calls = 0;
  const handler = createScheduleHandler({ apiKey: 'secret', fetchImpl: async () => { if (++calls === 1) throw new Error('secret'); return provider([])(); } });
  const first = await request(handler); assert.equal(first.status, 502); assert.ok(!JSON.stringify(first).includes('secret'));
  assert.equal((await request(handler)).status, 200);
});
test('parallel imports are bounded to one provider request', async () => {
  let release;
  const handler = createScheduleHandler({ apiKey: 'secret', fetchImpl: () => new Promise(resolve => { release = resolve; }) });
  const first = request(handler);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal((await request(handler)).status, 429);
  release(await provider(['CS 100'])());
  assert.equal((await first).status, 200);
});

test('native and web course catalogs stay identical', async () => {
  const { readFile } = await import('node:fs/promises');
  const native = JSON.parse(await readFile(new URL('../ios/Packages/RelayCore/Sources/RelayCore/Resources/courses.json', import.meta.url), 'utf8'));
  const { catalog } = await import('../src/lib/courses.mjs');
  assert.deepEqual(native, catalog);
});
