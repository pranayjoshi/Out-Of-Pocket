import test from 'node:test';
import assert from 'node:assert/strict';
import { createConversation, updateConversation, pendingOffer, agreedProduct, parseOffer, unreadCount } from '../src/lib/messages.mjs';
const product = { id: 'chair', title: 'Chair', price: 50, seller: 'Jamie' };
const make = () => createConversation(product);

test('messages validate, trim, persist and track incoming unread messages', () => {
  const original = make();
  assert.throws(() => updateConversation(original, { type: 'message', party: 'buyer', text: '  ' }));
  assert.throws(() => updateConversation(original, { type: 'message', party: 'buyer', text: 'a'.repeat(2001) }));
  let thread = updateConversation(original, { type: 'message', party: 'buyer', text: '  Still available? ' });
  assert.equal(thread.messages[0].text, 'Still available?');
  assert.equal(original.messages.length, 0);
  thread = updateConversation(thread, { type: 'message', party: 'seller', text: 'Yes!' });
  assert.equal(unreadCount(thread), 1);
  thread = updateConversation(thread, { type: 'read', party: 'buyer' });
  assert.equal(unreadCount(thread), 0);
  assert.deepEqual(JSON.parse(JSON.stringify(thread)), thread);
});
test('precise offer parsing rejects fractional cents, exponent and invalid amounts', () => {
  assert.equal(parseOffer('12.34'), 1234);
  assert.equal(parseOffer('10000'), 1000000);
  for (const input of ['0', '-1', '1.001', '10001', '1e2', 'NaN', '']) assert.throws(() => parseOffer(input));
});
test('counteroffer supersedes the original and only its recipient can accept', () => {
  let thread = updateConversation(make(), { type: 'offer', party: 'buyer', amountCents: 3000 });
  const first = pendingOffer(thread);
  assert.throws(() => updateConversation(thread, { type: 'accepted', party: 'buyer', offerId: first.id }));
  assert.throws(() => updateConversation(thread, { type: 'offer', party: 'buyer', amountCents: 2000 }));
  thread = updateConversation(thread, { type: 'offer', party: 'seller', amountCents: 3500 });
  assert.equal(thread.offers[0].status, 'superseded');
  assert.throws(() => updateConversation(thread, { type: 'accepted', party: 'seller', offerId: first.id }));
  const counter = pendingOffer(thread);
  thread = updateConversation(thread, { type: 'accepted', party: 'buyer', offerId: counter.id });
  assert.equal(agreedProduct(thread).price, 35);
  assert.equal(thread.product.price, 50);
  assert.throws(() => updateConversation(thread, { type: 'offer', party: 'buyer', amountCents: 4000 }));
  assert.throws(() => updateConversation(thread, { type: 'declined', party: 'buyer', offerId: counter.id }));
});
test('decline and withdraw preserve history and allow another offer', () => {
  let thread = updateConversation(make(), { type: 'offer', party: 'buyer', amountCents: 3000 });
  const first = pendingOffer(thread);
  assert.throws(() => updateConversation(thread, { type: 'withdrawn', party: 'seller', offerId: first.id }));
  thread = updateConversation(thread, { type: 'withdrawn', party: 'buyer', offerId: first.id });
  thread = updateConversation(thread, { type: 'offer', party: 'buyer', amountCents: 3500 });
  thread = updateConversation(thread, { type: 'declined', party: 'seller', offerId: pendingOffer(thread).id });
  assert.equal(pendingOffer(thread), undefined);
  assert.equal(agreedProduct(thread).price, 50);
  assert.equal(thread.offers.length, 2);
});
test('free listings and active handoffs cannot negotiate, but can message', () => {
  const free = createConversation({ ...product, price: 0 });
  assert.throws(() => updateConversation(free, { type: 'offer', party: 'buyer', amountCents: 100 }));
  assert.throws(() => updateConversation(make(), { type: 'offer', party: 'buyer', amountCents: 100 }, true));
  const thread = updateConversation(make(), { type: 'offer', party: 'buyer', amountCents: 100 });
  assert.throws(() => updateConversation(thread, { type: 'accepted', party: 'seller', offerId: pendingOffer(thread).id }, true));
  assert.equal(updateConversation(thread, { type: 'message', party: 'buyer', text: 'See you there' }, true).messages.length, 2);
});
