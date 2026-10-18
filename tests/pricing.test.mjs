import test from 'node:test';
import assert from 'node:assert/strict';
import { predictPrice, parseSellingPrice } from '../src/lib/pricing.mjs';
const item = { title: 'Desk lamp', category: 'Dorm & living', condition: 'Good', campus: 'Alabama' };
const listing = (id, priceCents, overrides = {}) => ({ ...item, id, priceCents, ...overrides });

test('prediction uses the median of comparable asking prices and adjusts condition', () => {
  const listings = [listing('a', 2000), listing('b', 3000), listing('c', 90000)];
  const estimate = predictPrice(item, listings);
  assert.equal(estimate.priceCents, 3000);
  assert.equal(estimate.count, 3);
  assert.equal(predictPrice({ ...item, condition: 'Well-loved' }, listings).priceCents, 2100);
  assert.match(estimate.basis, /Not completed sales/);
});
test('unrelated, own, edited, free, fixture and other-campus listings do not influence estimates', () => {
  const listings = [listing('a', 1000), listing('b', 999900, { mine: true }), listing('c', 999900, { campus: 'Auburn' }), listing('d', 999900, { source: 'fixture' }), listing('e', 999900, { title: 'Reading chair' }), listing('f', 0), listing('edit', 999900)];
  const estimate = predictPrice({ ...item, id: 'edit' }, listings);
  assert.equal(estimate.priceCents, 1000);
  assert.equal(estimate.count, 1);
});
test('category fallback is explicit; empty titles wait; free is always zero', () => {
  assert.equal(predictPrice({ ...item, title: '' }), null);
  assert.equal(predictPrice(item).priceCents, 3500);
  assert.match(predictPrice(item).basis, /Rough category guide/);
  assert.equal(predictPrice({ ...item, category: 'Free stuff' }).priceCents, 0);
  assert.equal(predictPrice({ ...item, category: 'unknown' }), null);
});
test('manual selling prices preserve cents, accept free and reject blank or invalid amounts', () => {
  assert.equal(parseSellingPrice('27.49'), 2749);
  assert.equal(parseSellingPrice('0'), 0);
  assert.equal(parseSellingPrice('10000.00'), 1000000);
  for (const value of ['', ' ', '-1', '10000.01', '2.345', 'NaN', 'Infinity', '1e3']) assert.equal(parseSellingPrice(value), null);
});
