import catalog from '../catalog/rides-tickets.json' with { type: 'json' };
import {
  DomainError, YOU, campusById, campusDayKey, formatCents, formatWhen, inWindow, placeById, resolveDeparture,
} from './campus.mjs';

const ACTIVE = ['requested', 'accepted', 'in_progress'];
const HOLDING = ['accepted', 'in_progress', 'completed'];

/** @param {unknown} blocked @param {string} a @param {string} b */
export function isBlocked(blocked, a, b) {
  return Array.isArray(blocked) && blocked.some((pair) => (pair[0] === a && pair[1] === b) || (pair[0] === b && pair[1] === a));
}

/** @param {Date} [now] */
export function seedRides(now = new Date()) {
  return {
    trips: structuredClone(catalog.rides).map((trip) => ({ ...trip, driverId: trip.driverId })),
    bookings: structuredClone(catalog.bookings).map((booking) => ({
      ...booking,
      createdAt: now.toISOString(),
      acceptedPickupId: booking.status === 'accepted' ? catalog.rides.find((trip) => trip.id === booking.tripId)?.pickupId : null,
      acceptedDestinationId: booking.status === 'accepted' ? catalog.rides.find((trip) => trip.id === booking.tripId)?.destinationId : null,
    })),
    handoffs: [],
    keys: {},
  };
}

/** @param {ReturnType<typeof seedRides> | null | undefined} saved @param {Date} [now] */
export function hydrateRides(saved, now = new Date()) {
  const fresh = seedRides(now);
  if (!saved?.trips) return fresh;
  const trips = [...saved.trips];
  const bookings = [...(saved.bookings ?? [])];
  for (const trip of fresh.trips) if (!trips.some((item) => item.id === trip.id)) trips.push(trip);
  for (const booking of fresh.bookings) if (!bookings.some((item) => item.id === booking.id)) bookings.push(booking);
  return { trips, bookings, handoffs: saved.handoffs ?? [], keys: saved.keys ?? {} };
}

/** @param {ReturnType<typeof seedRides>['trips'][number]} trip @param {Date} now */
export function departureInstant(trip, now) {
  if (trip.departureAt) return new Date(trip.departureAt);
  return resolveDeparture(trip.departure, trip.timezone, now);
}

/** @param {ReturnType<typeof seedRides>} state @param {string} tripId */
function tripOrThrow(state, tripId) {
  const trip = state.trips.find((item) => item.id === tripId);
  if (!trip) throw new DomainError('not_found', 'That ride is no longer available.');
  return trip;
}

/** @param {ReturnType<typeof seedRides>} state @param {string} tripId */
export function acceptedQuantity(state, tripId) {
  return state.bookings.filter((booking) => booking.tripId === tripId && HOLDING.includes(booking.status)).reduce((sum, booking) => sum + booking.quantity, 0);
}

/** @param {ReturnType<typeof seedRides>} state @param {string} tripId */
export function seatsLeft(state, tripId) {
  const trip = tripOrThrow(state, tripId);
  return Math.max(0, trip.capacity - acceptedQuantity(state, tripId));
}

/** @param {ReturnType<typeof seedRides>} state @param {ReturnType<typeof seedRides>['trips'][number]} trip @param {Date} now @param {string} [userTimeZone] */
export function presentTrip(state, trip, now, userTimeZone) {
  const campus = campusById(trip.campusId);
  const pickup = placeById(trip.campusId, trip.pickupId);
  const destination = placeById(trip.campusId, trip.destinationId);
  const when = departureInstant(trip, now);
  const left = trip.kind === 'request' ? trip.capacity : seatsLeft(state, trip.id);
  const whenLabel = formatWhen(when, trip.timezone, now, userTimeZone);
  return {
    ...trip,
    when,
    whenLabel,
    timezoneLabel: campus.timezone,
    pickup,
    destination,
    seatsLeft: left,
    contributionLabel: `${formatCents(trip.contributionCents)} per seat`,
    summary: `${whenLabel} · ${pickup.name} → ${destination.name} · ${left} ${left === 1 ? 'seat' : 'seats'} left · ${formatCents(trip.contributionCents)} per seat`,
    requests: state.bookings.filter((booking) => booking.tripId === trip.id),
  };
}

/**
 * @param {ReturnType<typeof seedRides>} state
 * @param {{campusId: string, pickupId: string, destinationId: string, dayKey: string, windowName: string, seats: number, baggage?: boolean, accessible?: boolean}} query
 * @param {Date} [now]
 */
export function searchRides(state, query, now = new Date()) {
  const seats = Number(query.seats) || 1;
  if (query.pickupId === query.destinationId) throw new DomainError('same_place', 'Choose a destination that is different from the pickup.');
  placeById(query.campusId, query.pickupId);
  placeById(query.campusId, query.destinationId);
  const matches = state.trips.filter((trip) => {
    if (trip.kind !== 'offer' || trip.campusId !== query.campusId) return false;
    if (trip.status === 'canceled' || trip.status === 'expired' || trip.status === 'completed') return false;
    if (trip.pickupId !== query.pickupId || trip.destinationId !== query.destinationId) return false;
    if (!inWindow(departureInstant(trip, now), query.dayKey, query.windowName, trip.timezone)) return false;
    if (query.baggage && !trip.luggage) return false;
    if (query.accessible && !trip.accessibilityNotes) return false;
    return true;
  }).sort((a, b) => departureInstant(a, now).getTime() - departureInstant(b, now).getTime());
  return matches.map((trip) => presentTrip(state, trip, now));
}

function nextId(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function remember(state, key, payload) {
  if (!key) return;
  state.keys[key] = payload;
}

function replay(state, key) {
  if (key && state.keys[key]) return state.keys[key];
  return null;
}

/** @template T @param {T} original @returns {T} */
function draft(original) {
  return structuredClone(original);
}

function assertFuture(instant, now) {
  if (instant.getTime() <= now.getTime()) throw new DomainError('invalid_time', 'Choose a departure that is still ahead.');
}

/**
 * @param {ReturnType<typeof seedRides>} original
 * @param {{campusId: string, pickupId: string, destinationId: string, departureAt: string, capacity: number, contributionCents: number, vehicleSummary: string, luggage?: string, accessibilityNotes?: string, driverName?: string, idempotencyKey?: string}} input
 * @param {Date} [now]
 */
export function createOffer(original, input, now = new Date()) {
  const prior = replay(original, input.idempotencyKey);
  if (prior) return { state: original, trip: original.trips.find((item) => item.id === prior.tripId), replayed: true };
  const campus = campusById(input.campusId);
  if (input.pickupId === input.destinationId) throw new DomainError('same_place', 'Choose a destination that is different from the pickup.');
  placeById(input.campusId, input.pickupId);
  placeById(input.campusId, input.destinationId);
  const capacity = Number(input.capacity);
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 6) throw new DomainError('invalid_capacity', 'Offer 1 to 6 seats.');
  if (!Number.isInteger(input.contributionCents) || input.contributionCents < 0 || input.contributionCents > 100000) throw new DomainError('invalid_amount', 'Enter a contribution from Free to $1,000.');
  const when = new Date(input.departureAt);
  if (Number.isNaN(when.getTime())) throw new DomainError('invalid_time', 'Choose a departure time.');
  assertFuture(when, now);
  const state = draft(original);
  const trip = {
    id: nextId('ride'), kind: 'offer', driverId: YOU, driverName: input.driverName || 'You', driverInitials: 'Y',
    emailVerified: false, drivingCheck: 'not_checked', campusId: input.campusId, pickupId: input.pickupId, destinationId: input.destinationId,
    departure: null, departureAt: when.toISOString(), timezone: campus.timezone, capacity, contributionCents: input.contributionCents,
    vehicleSummary: String(input.vehicleSummary || '').trim().slice(0, 80), luggage: String(input.luggage || '').trim().slice(0, 120),
    accessibilityNotes: String(input.accessibilityNotes || '').trim().slice(0, 200), status: 'open',
    meetingInstructions: 'Meet at the named area. This demo point has not been approved for vehicle pickup.',
    cancellationTerms: 'Cancel before departure. An accepted cancellation releases the seat once. This demo does not collect payment.',
    demo: true, version: 1,
  };
  if (!trip.vehicleSummary) throw new DomainError('invalid_vehicle', 'Add a short vehicle description.');
  state.trips.unshift(trip);
  remember(state, input.idempotencyKey, { tripId: trip.id });
  return { state, trip, replayed: false };
}

/**
 * A ride request is its own post. It does not open an item listing.
 * @param {ReturnType<typeof seedRides>} original
 * @param {{campusId: string, pickupId: string, destinationId: string, departureAt: string, seats: number, idempotencyKey?: string}} input
 * @param {Date} [now]
 */
export function createRideRequest(original, input, now = new Date()) {
  const prior = replay(original, input.idempotencyKey);
  if (prior) return { state: original, trip: original.trips.find((item) => item.id === prior.tripId), replayed: true };
  const campus = campusById(input.campusId);
  placeById(input.campusId, input.pickupId);
  placeById(input.campusId, input.destinationId);
  const when = new Date(input.departureAt);
  if (Number.isNaN(when.getTime())) throw new DomainError('invalid_time', 'Choose a departure time.');
  assertFuture(when, now);
  const seats = Number(input.seats) || 1;
  if (!Number.isInteger(seats) || seats < 1 || seats > 6) throw new DomainError('invalid_capacity', 'Request 1 to 6 seats.');
  const state = draft(original);
  const trip = {
    id: nextId('request'), kind: 'request', driverId: YOU, driverName: 'You', driverInitials: 'Y',
    emailVerified: false, drivingCheck: 'not_checked', campusId: input.campusId, pickupId: input.pickupId, destinationId: input.destinationId,
    departure: null, departureAt: when.toISOString(), timezone: campus.timezone, capacity: seats, contributionCents: 0,
    vehicleSummary: '', luggage: '', accessibilityNotes: '', status: 'open',
    meetingInstructions: 'Waiting for a student driver. This request does not book a seat.',
    cancellationTerms: 'You can withdraw this request until someone offers a ride.',
    demo: true, version: 1,
  };
  state.trips.unshift(trip);
  remember(state, input.idempotencyKey, { tripId: trip.id });
  return { state, trip, replayed: false };
}

function syncFull(state, trip) {
  if (['canceled', 'expired', 'completed', 'in_progress'].includes(trip.status)) return;
  const taken = acceptedQuantity(state, trip.id);
  if (taken > trip.capacity) throw new DomainError('capacity', 'Accepted seats cannot exceed the seats you offer.');
  trip.status = taken >= trip.capacity ? 'full' : 'open';
}

/**
 * @param {ReturnType<typeof seedRides>} original
 * @param {{tripId: string, actorId: string, expectedVersion: number, capacity?: number, destinationId?: string, departureAt?: string, vehicleSummary?: string}} input
 * @param {Date} [now]
 */
export function updateTrip(original, input, now = new Date()) {
  const state = draft(original);
  const trip = tripOrThrow(state, input.tripId);
  if (trip.driverId !== input.actorId) throw new DomainError('forbidden', 'Only the driver can edit this ride.');
  if (trip.version !== input.expectedVersion) throw new DomainError('conflict', 'This ride changed. Review it again.');
  if (['canceled', 'completed', 'expired'].includes(trip.status)) throw new DomainError('closed', 'This ride can no longer be edited.');
  const accepted = state.bookings.filter((booking) => booking.tripId === trip.id && ['accepted', 'in_progress'].includes(booking.status));
  if (input.capacity != null) {
    if (!Number.isInteger(input.capacity) || input.capacity < 1 || input.capacity > 6) throw new DomainError('invalid_capacity', 'Offer 1 to 6 seats.');
    const taken = acceptedQuantity(state, trip.id);
    if (input.capacity < taken) throw new DomainError('capacity', 'You can’t offer fewer seats than the ones already accepted.');
    trip.capacity = input.capacity;
  }
  let material = false;
  if (input.destinationId && input.destinationId !== trip.destinationId) {
    placeById(trip.campusId, input.destinationId);
    if (input.destinationId === trip.pickupId) throw new DomainError('same_place', 'Choose a destination that is different from the pickup.');
    for (const booking of accepted) {
      booking.acceptedDestinationId = booking.acceptedDestinationId || trip.destinationId;
      booking.needsReconfirm = true;
      booking.version += 1;
    }
    trip.destinationId = input.destinationId;
    material = true;
  }
  if (input.departureAt && input.departureAt !== trip.departureAt) {
    const when = new Date(input.departureAt);
    if (Number.isNaN(when.getTime())) throw new DomainError('invalid_time', 'Choose a departure time.');
    assertFuture(when, now);
    for (const booking of accepted) {
      booking.needsReconfirm = true;
      booking.version += 1;
    }
    trip.departure = null;
    trip.departureAt = when.toISOString();
    material = true;
  }
  if (input.vehicleSummary != null) trip.vehicleSummary = String(input.vehicleSummary).trim().slice(0, 80);
  syncFull(state, trip);
  trip.version += 1;
  return { state, trip, reconfirm: material && accepted.length > 0 };
}

/** @param {ReturnType<typeof seedRides>} original @param {{tripId: string, actorId: string, idempotencyKey?: string}} input */
export function cancelTrip(original, input) {
  const prior = replay(original, input.idempotencyKey);
  if (prior) return { state: original, replayed: true };
  const state = draft(original);
  const trip = tripOrThrow(state, input.tripId);
  if (trip.driverId !== input.actorId) throw new DomainError('forbidden', 'Only the driver can cancel this ride.');
  if (trip.status === 'canceled') throw new DomainError('already_canceled', 'This ride is already canceled.');
  if (trip.status === 'completed') throw new DomainError('closed', 'A completed ride can’t be canceled.');
  trip.status = 'canceled';
  trip.version += 1;
  for (const booking of state.bookings) {
    if (booking.tripId !== trip.id || ['canceled', 'declined', 'withdrawn', 'expired', 'no_show'].includes(booking.status)) continue;
    booking.status = 'canceled';
    booking.version += 1;
  }
  remember(state, input.idempotencyKey, { tripId: trip.id });
  return { state, trip, replayed: false };
}

/**
 * @param {ReturnType<typeof seedRides>} original
 * @param {{tripId: string, riderId?: string, riderName?: string, riderCampusId: string, quantity: number, idempotencyKey?: string, blocked?: string[][]}} input
 * @param {Date} [now]
 */
export function requestSeat(original, input, now = new Date()) {
  const prior = replay(original, input.idempotencyKey);
  if (prior) return { state: original, booking: original.bookings.find((item) => item.id === prior.bookingId), replayed: true };
  const state = draft(original);
  const trip = tripOrThrow(state, input.tripId);
  const riderId = input.riderId || YOU;
  if (trip.kind !== 'offer') throw new DomainError('wrong_flow', 'Respond to a ride request from its conversation.');
  if (trip.campusId !== input.riderCampusId) throw new DomainError('cross_campus', 'This ride is for another campus.');
  if (trip.driverId === riderId) throw new DomainError('self', 'You can’t request a seat in your own car.');
  if (isBlocked(input.blocked, riderId, trip.driverId)) throw new DomainError('blocked', 'This ride isn’t available.');
  if (!['open', 'full'].includes(trip.status)) throw new DomainError('closed', 'This ride is not taking requests.');
  const quantity = Number(input.quantity) || 1;
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 6) throw new DomainError('invalid_capacity', 'Request 1 to 6 seats.');
  if (state.bookings.some((booking) => booking.tripId === trip.id && booking.riderId === riderId && ACTIVE.includes(booking.status))) {
    throw new DomainError('duplicate', 'You already have a request on this ride.');
  }
  const when = departureInstant(trip, now);
  if (when.getTime() <= now.getTime()) throw new DomainError('expired', 'This ride has already departed.');
  const booking = {
    id: nextId('book'), tripId: trip.id, riderId, riderName: input.riderName || 'You', quantity, status: 'requested',
    needsReconfirm: false, acceptedPickupId: null, acceptedDestinationId: null, createdAt: now.toISOString(),
    expiresAt: when.toISOString(), demo: true, version: 1,
  };
  state.bookings.push(booking);
  remember(state, input.idempotencyKey, { bookingId: booking.id });
  return { state, booking, replayed: false };
}

function bookingOrThrow(state, bookingId) {
  const booking = state.bookings.find((item) => item.id === bookingId);
  if (!booking) throw new DomainError('not_found', 'That request is no longer available.');
  return booking;
}

/**
 * Acceptance checks capacity atomically. A retry with the same key does not take another seat.
 * @param {ReturnType<typeof seedRides>} original
 * @param {{bookingId: string, actorId: string, idempotencyKey?: string, expectedTripVersion?: number}} input
 * @param {Date} [now]
 */
export function acceptBooking(original, input, now = new Date()) {
  const prior = replay(original, input.idempotencyKey);
  if (prior) return { state: original, booking: original.bookings.find((item) => item.id === prior.bookingId), replayed: true };
  const state = draft(original);
  const booking = bookingOrThrow(state, input.bookingId);
  const trip = tripOrThrow(state, booking.tripId);
  if (trip.driverId !== input.actorId) throw new DomainError('forbidden', 'Only the driver can accept a request.');
  if (input.expectedTripVersion != null && trip.version !== input.expectedTripVersion) throw new DomainError('conflict', 'This ride changed. Review the request again.');
  if (booking.status === 'accepted') throw new DomainError('already_accepted', 'This request is already accepted.');
  if (booking.status !== 'requested') throw new DomainError('closed', 'This request can no longer be accepted.');
  if (new Date(booking.expiresAt || departureInstant(trip, now)).getTime() <= now.getTime()) throw new DomainError('expired', 'This request expired.');
  const left = trip.capacity - acceptedQuantity(state, trip.id);
  if (booking.quantity > left) throw new DomainError('full', 'That seat was just taken.');
  booking.status = 'accepted';
  booking.acceptedPickupId = trip.pickupId;
  booking.acceptedDestinationId = trip.destinationId;
  booking.needsReconfirm = false;
  booking.version += 1;
  syncFull(state, trip);
  trip.version += 1;
  remember(state, input.idempotencyKey, { bookingId: booking.id });
  return { state, booking, trip, replayed: false };
}

/** @param {ReturnType<typeof seedRides>} original @param {{bookingId: string, actorId: string, idempotencyKey?: string}} input */
export function declineBooking(original, input) {
  const prior = replay(original, input.idempotencyKey);
  if (prior) return { state: original, replayed: true };
  const state = draft(original);
  const booking = bookingOrThrow(state, input.bookingId);
  const trip = tripOrThrow(state, booking.tripId);
  if (trip.driverId !== input.actorId) throw new DomainError('forbidden', 'Only the driver can decline a request.');
  if (booking.status !== 'requested') throw new DomainError('closed', 'This request can no longer be declined.');
  booking.status = 'declined';
  booking.version += 1;
  remember(state, input.idempotencyKey, { bookingId: booking.id });
  return { state, booking, replayed: false };
}

/** @param {ReturnType<typeof seedRides>} original @param {{bookingId: string, actorId: string, idempotencyKey?: string}} input */
export function withdrawBooking(original, input) {
  const prior = replay(original, input.idempotencyKey);
  if (prior) return { state: original, replayed: true };
  const state = draft(original);
  const booking = bookingOrThrow(state, input.bookingId);
  if (booking.riderId !== input.actorId) throw new DomainError('forbidden', 'Only the rider can withdraw this request.');
  if (booking.status !== 'requested') throw new DomainError('closed', 'Withdraw is only available while the driver is deciding.');
  booking.status = 'withdrawn';
  booking.version += 1;
  remember(state, input.idempotencyKey, { bookingId: booking.id });
  return { state, booking, replayed: false };
}

/**
 * Accepted cancellations release capacity once. A second cancel does not free another seat.
 * @param {ReturnType<typeof seedRides>} original
 * @param {{bookingId: string, actorId: string, idempotencyKey?: string}} input
 */
export function cancelBooking(original, input) {
  const prior = replay(original, input.idempotencyKey);
  if (prior) return { state: original, replayed: true };
  const state = draft(original);
  const booking = bookingOrThrow(state, input.bookingId);
  const trip = tripOrThrow(state, booking.tripId);
  if (booking.riderId !== input.actorId && trip.driverId !== input.actorId) throw new DomainError('forbidden', 'Only the rider or driver can cancel this seat.');
  if (booking.status === 'canceled') throw new DomainError('already_canceled', 'This seat is already canceled.');
  if (!['requested', 'accepted', 'in_progress'].includes(booking.status)) throw new DomainError('closed', 'This seat can no longer be canceled.');
  booking.status = 'canceled';
  booking.version += 1;
  syncFull(state, trip);
  trip.version += 1;
  remember(state, input.idempotencyKey, { bookingId: booking.id });
  return { state, booking, trip, replayed: false };
}

/** @param {ReturnType<typeof seedRides>} original @param {{bookingId: string, actorId: string}} input */
export function reconfirmBooking(original, input) {
  const state = draft(original);
  const booking = bookingOrThrow(state, input.bookingId);
  const trip = tripOrThrow(state, booking.tripId);
  if (booking.riderId !== input.actorId) throw new DomainError('forbidden', 'Only the rider can reconfirm this seat.');
  if (booking.status !== 'accepted' || !booking.needsReconfirm) throw new DomainError('closed', 'This seat does not need reconfirmation.');
  booking.acceptedPickupId = trip.pickupId;
  booking.acceptedDestinationId = trip.destinationId;
  booking.needsReconfirm = false;
  booking.version += 1;
  return { state, booking };
}

/** Unaccepted requests expire at departure. Accepted seats stay. @param {ReturnType<typeof seedRides>} original @param {Date} [now] */
export function expireRequests(original, now = new Date()) {
  const state = draft(original);
  let changed = false;
  for (const booking of state.bookings) {
    if (booking.status !== 'requested') continue;
    const trip = state.trips.find((item) => item.id === booking.tripId);
    if (!trip) continue;
    const deadline = new Date(booking.expiresAt || departureInstant(trip, now));
    if (deadline.getTime() > now.getTime()) continue;
    booking.status = 'expired';
    booking.version += 1;
    changed = true;
  }
  return { state, changed };
}

/** @param {ReturnType<typeof seedRides>} original @param {{tripId: string, actorId: string}} input @param {Date} [now] */
export function startTrip(original, input, now = new Date()) {
  const state = draft(original);
  const trip = tripOrThrow(state, input.tripId);
  if (trip.driverId !== input.actorId) throw new DomainError('forbidden', 'Only the driver can start this ride.');
  if (!['open', 'full'].includes(trip.status)) throw new DomainError('closed', 'This ride can’t be started.');
  trip.status = 'in_progress';
  trip.version += 1;
  for (const booking of state.bookings) {
    if (booking.tripId !== trip.id) continue;
    if (booking.status === 'requested') {
      booking.status = 'expired';
      booking.version += 1;
    } else if (booking.status === 'accepted') {
      booking.status = 'in_progress';
      booking.version += 1;
    }
  }
  return { state, trip, now };
}

/** Completing a trip does not claim that every passenger rode. @param {ReturnType<typeof seedRides>} original @param {{tripId: string, actorId: string}} input */
export function completeTrip(original, input) {
  const state = draft(original);
  const trip = tripOrThrow(state, input.tripId);
  if (trip.driverId !== input.actorId) throw new DomainError('forbidden', 'Only the driver can complete this ride.');
  if (trip.status !== 'in_progress') throw new DomainError('closed', 'Start the ride before completing it.');
  trip.status = 'completed';
  trip.version += 1;
  return { state, trip };
}

/** @param {ReturnType<typeof seedRides>} original @param {{bookingId: string, actorId: string}} input */
export function confirmRode(original, input) {
  const state = draft(original);
  const booking = bookingOrThrow(state, input.bookingId);
  const trip = tripOrThrow(state, booking.tripId);
  if (booking.riderId !== input.actorId && trip.driverId !== input.actorId) throw new DomainError('forbidden', 'Only a participant can confirm this ride.');
  if (booking.status !== 'in_progress') throw new DomainError('closed', 'Confirm the ride after it is underway.');
  booking.status = 'completed';
  booking.version += 1;
  return { state, booking };
}

/** @param {ReturnType<typeof seedRides>} original @param {{bookingId: string, actorId: string}} input */
export function reportNoShow(original, input) {
  const state = draft(original);
  const booking = bookingOrThrow(state, input.bookingId);
  const trip = tripOrThrow(state, booking.tripId);
  if (trip.driverId !== input.actorId) throw new DomainError('forbidden', 'Only the driver can report a no-show.');
  if (!['accepted', 'in_progress'].includes(booking.status)) throw new DomainError('closed', 'A no-show can be reported for an accepted seat.');
  booking.status = 'no_show';
  booking.version += 1;
  return { state, booking };
}

/**
 * An outbound Uber open is only a handoff. It never creates a booking.
 * @param {ReturnType<typeof seedRides>} original
 * @param {{pickupId: string, destinationId: string, campusId: string, coordinatesIncluded: boolean}} input
 * @param {Date} [now]
 */
export function recordHandoff(original, input, now = new Date()) {
  const state = draft(original);
  const handoff = {
    id: nextId('handoff'), userId: YOU, provider: 'uber', campusId: input.campusId,
    pickupId: input.pickupId, destinationId: input.destinationId,
    coordinatesIncluded: input.coordinatesIncluded === true, openedAt: now.toISOString(), bookingState: null,
  };
  state.handoffs.unshift(handoff);
  return { state, handoff };
}

export { formatCents, YOU };
