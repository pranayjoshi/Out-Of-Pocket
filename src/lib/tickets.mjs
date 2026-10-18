import catalog from '../catalog/rides-tickets.json' with { type: 'json' };
import { DomainError, YOU, campusById, formatCents, formatWhen, resolveDeparture } from './campus.mjs';

export const HOLD_MS = 10 * 60 * 1000;
const HOLDING = ['reserved', 'payment_pending', 'awaiting_transfer', 'transfer_reported', 'receipt_reported', 'completed', 'disputed'];

/** @param {Date} [now] */
export function seedTickets(now = new Date()) {
  const events = structuredClone(catalog.events);
  const listings = structuredClone(catalog.ticketListings);
  const orders = structuredClone(catalog.ticketOrders).map((order) => {
    const event = events.find((item) => item.id === order.eventId);
    const when = resolveDeparture(event.start, event.timezone, now);
    return {
      ...order,
      bowl: '',
      buyerTotalCents: order.priceCents * order.quantity,
      sellerProceedsCents: order.priceCents * order.quantity,
      policyVersion: event.policyVersion,
      eventName: event.name,
      venue: event.venue,
      eventStart: when.toISOString(),
      originalEventStart: when.toISOString(),
      transferDeadline: new Date(when.getTime() - event.transferDeadlineHoursBefore * 3600 * 1000).toISOString(),
      transferRoute: event.transferRoute,
      scheduleChange: null,
      expiresAt: order.status === 'expired' ? new Date(now.getTime() - 60 * 1000).toISOString() : null,
      recipientLabel: 'Demo recipient · Jordan L.',
      createdAt: now.toISOString(),
    };
  });
  return { events, listings, orders, eventRequests: [], keys: {} };
}

/** @param {ReturnType<typeof seedTickets> | null | undefined} saved @param {Date} [now] */
export function hydrateTickets(saved, now = new Date()) {
  const fresh = seedTickets(now);
  if (!saved?.events) return fresh;
  const events = [...saved.events];
  const listings = [...(saved.listings ?? [])];
  const orders = [...(saved.orders ?? [])];
  for (const event of fresh.events) if (!events.some((item) => item.id === event.id)) events.push(event);
  for (const listing of fresh.listings) if (!listings.some((item) => item.id === listing.id)) listings.push(listing);
  for (const order of fresh.orders) if (!orders.some((item) => item.id === order.id)) orders.push(order);
  return { events, listings, orders, eventRequests: saved.eventRequests ?? [], keys: saved.keys ?? {} };
}

function eventOrThrow(state, eventId) {
  const event = state.events.find((item) => item.id === eventId);
  if (!event) throw new DomainError('not_found', 'That event is not in the campus catalog.');
  return event;
}

function listingOrThrow(state, listingId) {
  const listing = state.listings.find((item) => item.id === listingId);
  if (!listing) throw new DomainError('not_found', 'That ticket listing is no longer available.');
  return listing;
}

function typeOf(event, typeId) {
  const type = event.ticketTypes.find((item) => item.id === typeId);
  if (!type) throw new DomainError('unsupported_type', event.officialChannel
    ? `${event.officialChannel.note}`
    : 'That ticket type is not offered for this event.');
  return type;
}

/** @param {ReturnType<typeof seedTickets>} state @param {string} listingId @param {Date} [now] */
export function availableQuantity(state, listingId, now = new Date()) {
  const listing = listingOrThrow(state, listingId);
  if (listing.status !== 'active') return 0;
  const event = eventOrThrow(state, listing.eventId);
  if (event.status === 'canceled') return 0;
  const held = state.orders.filter((order) => {
    if (order.listingId !== listingId || !HOLDING.includes(order.status)) return false;
    if (order.status === 'reserved' && order.expiresAt && new Date(order.expiresAt).getTime() <= now.getTime()) return false;
    return true;
  }).reduce((sum, order) => sum + order.quantity, 0);
  return Math.max(0, listing.quantity - held);
}

function replay(state, key) {
  return key && state.keys[key] ? state.keys[key] : null;
}
function remember(state, key, payload) {
  if (key) state.keys[key] = payload;
}
/** @template T @param {T} original @returns {T} */
function draft(original) {
  return structuredClone(original);
}
function nextId(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

/** @param {ReturnType<typeof seedTickets>} state @param {typeof catalog.events[number]} event @param {Date} now @param {string} [userTimeZone] */
export function presentEvent(state, event, now, userTimeZone) {
  const when = event.startAt ? new Date(event.startAt) : event.timeTbd ? null : resolveDeparture(event.start, event.timezone, now);
  const listings = state.listings.filter((listing) => listing.eventId === event.id && availableQuantity(state, listing.id, now) > 0);
  const count = listings.reduce((sum, listing) => sum + availableQuantity(state, listing.id, now), 0);
  return {
    ...event,
    when,
    whenLabel: event.timeTbd || !when ? 'Time TBD' : formatWhen(when, event.timezone, now, userTimeZone),
    availableCount: count,
    paused: event.status === 'canceled' || event.status === 'paused',
  };
}

/**
 * @param {ReturnType<typeof seedTickets>} original
 * @param {{eventId: string, typeId: string, bowl?: string, quantity: number, priceCents: number, attestation: boolean, sellerName?: string, idempotencyKey?: string}} input
 */
export function publishListing(original, input) {
  const prior = replay(original, input.idempotencyKey);
  if (prior) return { state: original, listing: original.listings.find((item) => item.id === prior.listingId), replayed: true };
  const state = draft(original);
  const event = eventOrThrow(state, input.eventId);
  if (event.status === 'canceled' || event.status === 'paused') throw new DomainError('paused', 'Listings are paused while this event is resolved.');
  if (input.attestation !== true) throw new DomainError('attestation', 'Confirm that you are eligible to transfer this ticket.');
  const type = typeOf(event, input.typeId);
  const quantity = Number(input.quantity);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > type.maxPerListing) {
    throw new DomainError('invalid_quantity', type.maxPerListing === 1 ? 'List one ticket for this event.' : `List 1 to ${type.maxPerListing} tickets.`);
  }
  if (!Number.isInteger(input.priceCents) || input.priceCents < 0 || input.priceCents > 100000) throw new DomainError('invalid_amount', 'Enter a price from Free to $1,000.');
  const bowl = String(input.bowl || '').trim().slice(0, 80);
  if (type.fields.includes('bowl') && !bowl) throw new DomainError('missing_bowl', 'Add the bowl or section. Don’t invent a row or seat.');
  const listing = {
    id: nextId('ticket'), sellerId: YOU, sellerName: input.sellerName || 'You', eventId: event.id, typeId: type.id,
    bowl, quantity, priceCents: input.priceCents, status: 'active', attestation: true, demo: true, version: 1,
  };
  state.listings.unshift(listing);
  remember(state, input.idempotencyKey, { listingId: listing.id });
  return { state, listing, replayed: false };
}

/** Missing events go to review. They are not published. @param {ReturnType<typeof seedTickets>} original @param {{name: string, campusId: string}} input */
export function requestEventReview(original, input) {
  const name = String(input.name || '').trim().slice(0, 120);
  if (name.length < 3) throw new DomainError('invalid_event', 'Name the event you want reviewed.');
  campusById(input.campusId);
  const state = draft(original);
  const request = { id: nextId('event-request'), name, campusId: input.campusId, status: 'pending_review', createdAt: new Date().toISOString() };
  state.eventRequests.unshift(request);
  return { state, request };
}

/** A price edit never changes an existing order snapshot. @param {ReturnType<typeof seedTickets>} original @param {{listingId: string, sellerId: string, priceCents: number, expectedVersion: number}} input */
export function editListing(original, input) {
  const state = draft(original);
  const listing = listingOrThrow(state, input.listingId);
  if (listing.sellerId !== input.sellerId) throw new DomainError('forbidden', 'Only the seller can edit this listing.');
  if (listing.version !== input.expectedVersion) throw new DomainError('conflict', 'This listing changed. Review it again.');
  if (listing.status !== 'active') throw new DomainError('closed', 'This listing can no longer be edited.');
  if (!Number.isInteger(input.priceCents) || input.priceCents < 0 || input.priceCents > 100000) throw new DomainError('invalid_amount', 'Enter a price from Free to $1,000.');
  const orders = state.orders.filter((order) => order.listingId === listing.id && HOLDING.includes(order.status));
  listing.priceCents = input.priceCents;
  listing.version += 1;
  return { state, listing, unchangedOrders: orders.map((order) => order.priceCents) };
}

/** @param {ReturnType<typeof seedTickets>} original @param {{listingId: string, sellerId: string, idempotencyKey?: string}} input */
export function withdrawListing(original, input) {
  const prior = replay(original, input.idempotencyKey);
  if (prior) return { state: original, replayed: true };
  const state = draft(original);
  const listing = listingOrThrow(state, input.listingId);
  if (listing.sellerId !== input.sellerId) throw new DomainError('forbidden', 'Only the seller can withdraw this listing.');
  if (state.orders.some((order) => order.listingId === listing.id && ['reserved', 'payment_pending', 'awaiting_transfer', 'transfer_reported', 'receipt_reported', 'disputed'].includes(order.status))) {
    throw new DomainError('in_progress', 'Finish or resolve the current order before withdrawing the listing.');
  }
  listing.status = 'withdrawn';
  listing.version += 1;
  remember(state, input.idempotencyKey, { listingId: listing.id });
  return { state, listing, replayed: false };
}

function snapshotOrder(event, listing, quantity, buyerId, buyerName, now) {
  const when = event.startAt ? new Date(event.startAt) : resolveDeparture(event.start, event.timezone, now);
  return {
    id: nextId('order'), listingId: listing.id, eventId: event.id, buyerId, buyerName, sellerId: listing.sellerId,
    quantity, priceCents: listing.priceCents, buyerTotalCents: listing.priceCents * quantity,
    sellerProceedsCents: listing.priceCents * quantity, policyVersion: event.policyVersion, eventName: event.name,
    venue: event.venue, bowl: listing.bowl, typeId: listing.typeId, eventStart: when.toISOString(),
    originalEventStart: event.originalStartAt || when.toISOString(),
    transferDeadline: new Date(when.getTime() - event.transferDeadlineHoursBefore * 3600 * 1000).toISOString(),
    transferRoute: event.transferRoute, status: 'reserved', confirmation: null,
    expiresAt: new Date(now.getTime() + HOLD_MS).toISOString(), recipientLabel: `Demo recipient · ${buyerName}`,
    createdAt: now.toISOString(), demo: true, version: 1,
  };
}

/**
 * @param {ReturnType<typeof seedTickets>} original
 * @param {{listingId: string, buyerId?: string, buyerName?: string, buyerCampusId: string, quantity?: number, idempotencyKey?: string, blocked?: string[][]}} input
 * @param {Date} [now]
 */
export function reserveTicket(original, input, now = new Date()) {
  const prior = replay(original, input.idempotencyKey);
  if (prior) return { state: original, order: original.orders.find((item) => item.id === prior.orderId), replayed: true };
  const state = draft(original);
  const listing = listingOrThrow(state, input.listingId);
  const event = eventOrThrow(state, listing.eventId);
  const buyerId = input.buyerId || YOU;
  if (event.campusId !== input.buyerCampusId) throw new DomainError('cross_campus', 'This ticket is for another campus.');
  if (listing.sellerId === buyerId) throw new DomainError('self', 'You can’t reserve your own ticket.');
  if (Array.isArray(input.blocked) && input.blocked.some((pair) => (pair[0] === buyerId && pair[1] === listing.sellerId) || (pair[1] === buyerId && pair[0] === listing.sellerId))) {
    throw new DomainError('blocked', 'This listing isn’t available.');
  }
  if (event.status === 'canceled') throw new DomainError('paused', 'This event was canceled. Listings are paused.');
  const quantity = Number(input.quantity) || 1;
  const type = typeOf(event, listing.typeId);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > type.maxPerListing) throw new DomainError('invalid_quantity', 'Choose a quantity this event allows.');
  const left = availableQuantity(state, listing.id, now);
  if (left < quantity) throw new DomainError('unavailable', 'Those tickets are no longer available.');
  const order = snapshotOrder(event, listing, quantity, buyerId, input.buyerName || 'You', now);
  state.orders.unshift(order);
  remember(state, input.idempotencyKey, { orderId: order.id });
  return { state, order, replayed: false };
}

/** @param {ReturnType<typeof seedTickets>} original @param {Date} [now] */
export function expireHolds(original, now = new Date()) {
  const state = draft(original);
  let changed = false;
  for (const order of state.orders) {
    if (order.status !== 'reserved' || !order.expiresAt) continue;
    if (new Date(order.expiresAt).getTime() > now.getTime()) continue;
    order.status = 'expired';
    order.version += 1;
    changed = true;
  }
  return { state, changed };
}

function orderOrThrow(state, orderId) {
  const order = state.orders.find((item) => item.id === orderId);
  if (!order) throw new DomainError('not_found', 'That order is no longer available.');
  return order;
}

/** @param {ReturnType<typeof seedTickets>} original @param {{orderId: string, actorId: string, idempotencyKey?: string}} input @param {Date} [now] */
export function simulatePayment(original, input, now = new Date()) {
  if (catalog.flags.ticketCheckout) throw new DomainError('live_disabled', 'Live ticket checkout is not enabled.');
  const prior = replay(original, input.idempotencyKey);
  if (prior) return { state: original, replayed: true };
  const state = draft(original);
  const order = orderOrThrow(state, input.orderId);
  if (order.buyerId !== input.actorId) throw new DomainError('forbidden', 'Only the buyer can continue this order.');
  if (order.status === 'expired' || (order.expiresAt && order.status === 'reserved' && new Date(order.expiresAt).getTime() <= now.getTime())) {
    order.status = 'expired';
    throw new DomainError('expired', 'That hold expired. The ticket can be reserved again.');
  }
  if (order.status !== 'reserved' && order.status !== 'payment_pending') throw new DomainError('closed', 'Payment simulation is no longer available for this order.');
  order.status = 'awaiting_transfer';
  order.payment = 'simulated';
  order.version += 1;
  remember(state, input.idempotencyKey, { orderId: order.id });
  return { state, order, replayed: false };
}

/** @param {ReturnType<typeof seedTickets>} original @param {{orderId: string, actorId: string, idempotencyKey?: string}} input */
export function reportTransfer(original, input) {
  const prior = replay(original, input.idempotencyKey);
  if (prior) return { state: original, replayed: true };
  const state = draft(original);
  const order = orderOrThrow(state, input.orderId);
  if (order.sellerId !== input.actorId) throw new DomainError('forbidden', 'Only the seller can report a transfer.');
  if (order.status !== 'awaiting_transfer') throw new DomainError('closed', 'Report the transfer after the demo payment step.');
  order.status = 'transfer_reported';
  order.transferReport = 'Reported by seller';
  order.version += 1;
  remember(state, input.idempotencyKey, { orderId: order.id });
  return { state, order, replayed: false };
}

/** @param {ReturnType<typeof seedTickets>} original @param {{orderId: string, actorId: string, idempotencyKey?: string}} input */
export function reportReceipt(original, input) {
  const prior = replay(original, input.idempotencyKey);
  if (prior) return { state: original, replayed: true };
  const state = draft(original);
  const order = orderOrThrow(state, input.orderId);
  if (order.buyerId !== input.actorId) throw new DomainError('forbidden', 'Only the buyer can report receipt.');
  if (order.status !== 'transfer_reported') throw new DomainError('closed', 'Wait for the seller to report the transfer.');
  order.status = 'receipt_reported';
  order.confirmation = 'Reported by buyer';
  order.version += 1;
  remember(state, input.idempotencyKey, { orderId: order.id });
  return { state, order, replayed: false };
}

/** A missing transfer opens a case and does not complete the order. @param {ReturnType<typeof seedTickets>} original @param {{orderId: string, actorId: string, idempotencyKey?: string}} input */
export function reportProblem(original, input) {
  const prior = replay(original, input.idempotencyKey);
  if (prior) return { state: original, replayed: true };
  const state = draft(original);
  const order = orderOrThrow(state, input.orderId);
  if (order.buyerId !== input.actorId && order.sellerId !== input.actorId) throw new DomainError('forbidden', 'Only the buyer or seller can open a case.');
  if (!['awaiting_transfer', 'transfer_reported', 'receipt_reported', 'completed'].includes(order.status)) {
    throw new DomainError('closed', 'This order can’t be disputed from its current step.');
  }
  if (order.status === 'completed') order.status = 'disputed';
  else order.status = 'disputed';
  order.confirmation = null;
  order.dispute = 'Open case';
  order.version += 1;
  remember(state, input.idempotencyKey, { orderId: order.id });
  return { state, order, replayed: false };
}

/** @param {ReturnType<typeof seedTickets>} original @param {{orderId: string, actorId: string, idempotencyKey?: string}} input */
export function cancelOrder(original, input) {
  const prior = replay(original, input.idempotencyKey);
  if (prior) return { state: original, replayed: true };
  const state = draft(original);
  const order = orderOrThrow(state, input.orderId);
  if (order.buyerId !== input.actorId) throw new DomainError('forbidden', 'Only the buyer can cancel this hold.');
  if (order.status === 'canceled') throw new DomainError('already_canceled', 'This order is already canceled.');
  if (!['reserved', 'payment_pending'].includes(order.status)) throw new DomainError('closed', 'This order has moved past the hold.');
  order.status = 'canceled';
  order.version += 1;
  remember(state, input.idempotencyKey, { orderId: order.id });
  return { state, order, replayed: false };
}

/** @param {ReturnType<typeof seedTickets>} original @param {string} eventId */
export function cancelEvent(original, eventId) {
  const state = draft(original);
  const event = eventOrThrow(state, eventId);
  event.status = 'canceled';
  for (const listing of state.listings) if (listing.eventId === eventId && listing.status === 'active') listing.status = 'paused';
  for (const order of state.orders) {
    if (order.eventId !== eventId || ['completed', 'canceled', 'expired'].includes(order.status)) continue;
    order.resolution = 'event_canceled';
    if (order.status !== 'disputed') order.status = 'disputed';
  }
  return { state, event };
}

/** Postponement keeps the original schedule on the order and shows the new date. @param {ReturnType<typeof seedTickets>} original @param {{eventId: string, startAt: string}} input */
export function postponeEvent(original, input) {
  const state = draft(original);
  const event = eventOrThrow(state, input.eventId);
  const next = new Date(input.startAt);
  if (Number.isNaN(next.getTime())) throw new DomainError('invalid_time', 'Choose the new event time.');
  if (!event.originalStartAt) {
    const current = event.startAt ? new Date(event.startAt) : resolveDeparture(event.start, event.timezone, new Date());
    event.originalStartAt = current.toISOString();
  }
  event.startAt = next.toISOString();
  event.start = null;
  event.status = 'postponed';
  for (const order of state.orders) {
    if (order.eventId !== event.id) continue;
    order.scheduleChange = next.toISOString();
  }
  return { state, event };
}

/** A later policy deadline does not move an order that already snapped its own deadline. @param {ReturnType<typeof seedTickets>} original @param {{eventId: string, hoursBefore: number}} input */
export function changeTransferDeadline(original, input) {
  const state = draft(original);
  const event = eventOrThrow(state, input.eventId);
  const before = state.orders.filter((order) => order.eventId === event.id).map((order) => order.transferDeadline);
  event.transferDeadlineHoursBefore = input.hoursBefore;
  event.policyVersion += 1;
  const after = state.orders.filter((order) => order.eventId === event.id).map((order) => order.transferDeadline);
  return { state, unchanged: before.join('|') === after.join('|') };
}

/** @param {ReturnType<typeof seedTickets>['orders'][number]} order @param {typeof catalog.events[number]} event */
export function checklist(order, event) {
  const rank = { reserved: 0, payment_pending: 0, expired: 0, canceled: 0, awaiting_transfer: 1, transfer_reported: 2, receipt_reported: 4, completed: 4, disputed: -1 };
  const step = rank[order.status] ?? 0;
  const portal = event?.transferLabel || 'Accept in the official system';
  const done = (index) => order.status === 'disputed' ? 'blocked' : step > index ? 'done' : step === index ? 'current' : 'waiting';
  return [
    { id: 'payment', label: 'Payment', actor: 'You', state: order.status === 'expired' ? 'blocked' : done(0), detail: order.payment === 'simulated' ? 'Demo payment recorded. No card was charged.' : 'Simulate payment to continue. No money moves.' },
    { id: 'transfer', label: 'Seller transfer', actor: 'Seller', state: done(1), detail: order.transferReport || 'The seller reports the transfer. That report is not proof the ticket moved.' },
    { id: 'portal', label: portal, actor: 'You', state: done(2), detail: event?.transferInstructions || 'Accept the ticket in the official system.' },
    { id: 'receipt', label: 'Receipt', actor: 'You', state: order.status === 'completed' ? 'done' : done(3), detail: order.confirmation || 'Report receipt yourself. Out of Pocket will not mark this university verified.' },
  ];
}

/** @param {number} cents @param {number} quantity */
export function priceBreakdown(cents, quantity) {
  const total = cents * quantity;
  return { priceCents: cents, quantity, buyerTotalCents: total, sellerProceedsCents: total, platformFeeCents: 0, label: `${formatCents(total)} total · no Out of Pocket fee in this demo` };
}

export { formatCents, YOU };
