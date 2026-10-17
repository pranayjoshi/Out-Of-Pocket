import test from 'node:test';
import assert from 'node:assert/strict';
import {
  availableQuantity, cancelEvent, cancelOrder, changeTransferDeadline, checklist, editListing, expireHolds,
  postponeEvent, presentEvent, priceBreakdown, publishListing, reportProblem, reportReceipt, reportTransfer,
  requestEventReview, reserveTicket, seedTickets, simulatePayment, withdrawListing,
} from '../src/lib/tickets.mjs';
import { createSubjectConversation } from '../src/lib/messages.mjs';

const now = new Date('2026-10-17T15:00:00.000Z');

test('sample events expose an open student ticket, a sold ticket, and an expired hold', () => {
  const state = seedTickets(now);
  const football = presentEvent(state, state.events.find((item) => item.id === 'event-football'), now, 'America/Chicago');
  const recital = presentEvent(state, state.events.find((item) => item.id === 'event-recital'), now, 'America/Chicago');
  assert.equal(football.availableCount, 1);
  assert.equal(recital.availableCount, 2);
  assert.equal(state.orders.find((item) => item.id === 'order-sold').status, 'completed');
  assert.equal(state.orders.find((item) => item.id === 'order-expired').status, 'expired');
  assert.equal(availableQuantity(state, 'ticket-football-sold', now), 0);
  assert.equal(football.officialChannel.name, 'SeatGeek');
});

test('reserving the last ticket blocks the next buyer, and the same key does not hold it twice', () => {
  const state = seedTickets(now);
  const first = reserveTicket(state, { listingId: 'ticket-football-open', buyerCampusId: 'alabama', idempotencyKey: 'hold-1' }, now);
  assert.equal(first.order.status, 'reserved');
  assert.equal(first.order.buyerTotalCents, 4500);
  assert.equal(availableQuantity(first.state, 'ticket-football-open', now), 0);
  assert.throws(() => reserveTicket(first.state, { listingId: 'ticket-football-open', buyerId: 'other', buyerCampusId: 'alabama' }, now), /no longer available/);
  const replay = reserveTicket(first.state, { listingId: 'ticket-football-open', buyerCampusId: 'alabama', idempotencyKey: 'hold-1' }, now);
  assert.equal(replay.replayed, true);
  assert.equal(replay.state.orders.filter((item) => item.listingId === 'ticket-football-open' && item.status === 'reserved').length, 1);
  assert.throws(() => reserveTicket(state, { listingId: 'ticket-football-open', buyerCampusId: 'auburn' }, now), /another campus/);
});

test('a seller price edit leaves the reserved snapshot alone, and an expired hold can be listed again', () => {
  let state = seedTickets(now);
  const reserved = reserveTicket(state, { listingId: 'ticket-recital', buyerCampusId: 'alabama', quantity: 1 }, now);
  const priced = editListing(reserved.state, { listingId: 'ticket-recital', sellerId: 'demo-ethan', priceCents: 2000, expectedVersion: 1 });
  assert.equal(priced.state.orders.find((item) => item.id === reserved.order.id).priceCents, 1500);
  assert.equal(priced.listing.priceCents, 2000);
  const later = new Date(now.getTime() + 11 * 60 * 1000);
  const expired = expireHolds(reserved.state, later);
  assert.equal(expired.state.orders.find((item) => item.id === reserved.order.id).status, 'expired');
  assert.equal(availableQuantity(expired.state, 'ticket-recital', later), 2);
  state = cancelOrder(reserved.state, { orderId: reserved.order.id, actorId: 'you', idempotencyKey: 'stop' });
  assert.equal(availableQuantity(state.state, 'ticket-recital', now), 2);
  const replay = cancelOrder(state.state, { orderId: reserved.order.id, actorId: 'you', idempotencyKey: 'stop' });
  assert.equal(replay.replayed, true);
});

test('demo payment and transfer reports advance the checklist, and a missing transfer opens a case', () => {
  let state = seedTickets(now);
  const reserved = reserveTicket(state, { listingId: 'ticket-football-open', buyerCampusId: 'alabama' }, now);
  state = simulatePayment(reserved.state, { orderId: reserved.order.id, actorId: 'you' }, now).state;
  let order = state.orders.find((item) => item.id === reserved.order.id);
  assert.equal(order.status, 'awaiting_transfer');
  assert.equal(order.payment, 'simulated');
  state = reportTransfer(state, { orderId: order.id, actorId: 'demo-jordan' }).state;
  order = state.orders.find((item) => item.id === reserved.order.id);
  const steps = checklist(order, state.events.find((item) => item.id === 'event-football'));
  assert.equal(steps[2].label, 'Accept in MyTickets');
  assert.equal(steps[2].state, 'current');
  state = reportReceipt(state, { orderId: order.id, actorId: 'you' }).state;
  order = state.orders.find((item) => item.id === reserved.order.id);
  assert.equal(order.status, 'receipt_reported');
  assert.equal(order.confirmation, 'Reported by buyer');
  assert.notEqual(order.confirmation, 'University verified');
  const problem = reportProblem(simulatePayment(reserved.state, { orderId: reserved.order.id, actorId: 'you' }, now).state, { orderId: reserved.order.id, actorId: 'you' });
  assert.equal(problem.order.status, 'disputed');
  assert.notEqual(problem.order.status, 'completed');
});

test('student football listings stay at one ticket, and event changes do not rewrite order snapshots', () => {
  const state = seedTickets(now);
  assert.throws(() => publishListing(state, { eventId: 'event-football', typeId: 'student', bowl: 'Student section', quantity: 2, priceCents: 4000, attestation: true }), /one ticket/);
  assert.throws(() => publishListing(state, { eventId: 'event-football', typeId: 'general_admission', quantity: 1, priceCents: 4000, attestation: true }), /SeatGeek/);
  const published = publishListing(state, { eventId: 'event-recital', typeId: 'general_admission', quantity: 2, priceCents: 1000, attestation: true });
  assert.equal(published.listing.sellerId, 'you');
  assert.equal(priceBreakdown(1000, 2).platformFeeCents, 0);
  const review = requestEventReview(state, { campusId: 'alabama', name: 'Late night film' });
  assert.equal(review.request.status, 'pending_review');
  assert.equal(review.state.events.some((item) => item.name === 'Late night film'), false);
  const reserved = reserveTicket(state, { listingId: 'ticket-football-open', buyerCampusId: 'alabama' }, now);
  const deadline = reserved.order.transferDeadline;
  const shifted = changeTransferDeadline(reserved.state, { eventId: 'event-football', hoursBefore: 12 });
  assert.equal(shifted.unchanged, true);
  assert.equal(shifted.state.orders.find((item) => item.id === reserved.order.id).transferDeadline, deadline);
  const moved = postponeEvent(reserved.state, { eventId: 'event-football', startAt: '2026-11-07T19:30:00.000Z' });
  const order = moved.state.orders.find((item) => item.id === reserved.order.id);
  assert.equal(order.eventStart, reserved.order.eventStart);
  assert.equal(order.scheduleChange, '2026-11-07T19:30:00.000Z');
  const paused = cancelEvent(state, 'event-recital');
  assert.equal(paused.state.listings.find((item) => item.id === 'ticket-recital').status, 'paused');
  assert.throws(() => reserveTicket(paused.state, { listingId: 'ticket-recital', buyerCampusId: 'alabama' }, now), /canceled/);
  assert.throws(() => withdrawListing(reserved.state, { listingId: 'ticket-football-open', sellerId: 'demo-jordan' }), /Finish or resolve/);
});

test('ticket conversations use their own subject', () => {
  const thread = createSubjectConversation({ kind: 'ticket_order', id: 'order-1', title: 'UA Student Football · Demo Opponent' });
  assert.equal(thread.subject.kind, 'ticket_order');
  assert.equal(thread.product, undefined);
});
