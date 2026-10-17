import test from 'node:test';
import assert from 'node:assert/strict';
import { campusByLabel, campusDayKey, flags, formatWhen, mapPresentation } from '../src/lib/campus.mjs';
import {
  acceptBooking, cancelBooking, cancelTrip, completeTrip, confirmRode, createOffer, createRideRequest,
  declineBooking, expireRequests, presentTrip, recordHandoff, requestSeat, searchRides, seedRides,
  seatsLeft, startTrip, updateTrip, withdrawBooking,
} from '../src/lib/rides.mjs';
import { buildUberHandoff } from '../src/lib/uber.mjs';
import { createSubjectConversation, updateConversation } from '../src/lib/messages.mjs';

const now = new Date('2026-10-17T15:00:00.000Z');
const campus = campusByLabel('Alabama');
const day = campusDayKey(now, campus.timezone);

test('UA map falls back to the official page and Auburn keeps its own map', () => {
  const ua = mapPresentation('alabama');
  assert.equal(ua.embedPermitted, false);
  assert.equal(ua.embedUrl, null);
  assert.equal(ua.fallback, 'new-tab');
  assert.equal(ua.officialMapUrl, 'https://www.ua.edu/map/');
  assert.match(ua.instruction, /choose the meeting point/i);
  const au = mapPresentation('auburn');
  assert.equal(au.officialMapUrl, 'https://map.auburn.edu/');
  assert.equal(au.embedPermitted, false);
  assert.equal(flags.paidRides, false);
  assert.equal(flags.liveRideMatching, false);
});

test('airport fixture reads as today at 4:30 with two seats and a demo contribution', () => {
  const state = seedRides(now);
  const trip = state.trips.find((item) => item.id === 'ride-airport');
  const card = presentTrip(state, trip, now, 'America/Chicago');
  assert.equal(card.summary, 'Today, 4:30 PM · Student Center area → Airport · 2 seats left · $12 per seat');
  assert.equal(card.demo, true);
  assert.equal(seatsLeft(state, 'ride-full'), 0);
  assert.equal(state.trips.find((item) => item.id === 'ride-canceled').status, 'canceled');
});

test('search matches campus, endpoints, window, and capacity without consuming request seats', () => {
  const state = seedRides(now);
  const results = searchRides(state, { campusId: 'alabama', pickupId: 'student-center', destinationId: 'airport', dayKey: day, windowName: 'afternoon', seats: 1 }, now);
  assert.deepEqual(results.map((item) => item.id), ['ride-airport']);
  const evening = searchRides(state, { campusId: 'alabama', pickupId: 'student-center', destinationId: 'airport', dayKey: day, windowName: 'evening', seats: 1 }, now);
  assert.equal(evening[0].id, 'ride-full');
  assert.equal(evening[0].seatsLeft, 0);
  assert.equal(searchRides(state, { campusId: 'auburn', pickupId: 'au-student-center', destinationId: 'au-library', dayKey: day, windowName: 'afternoon', seats: 1 }, now).length, 0);
});

test('a seat request does not take capacity, and acceptance of the last seat rejects the other request', () => {
  let state = seedRides(now);
  assert.equal(seatsLeft(state, 'ride-last-seat'), 1);
  const first = acceptBooking(state, { bookingId: 'book-last-a', actorId: 'demo-jordan', idempotencyKey: 'accept-a' }, now);
  assert.equal(seatsLeft(first.state, 'ride-last-seat'), 0);
  assert.equal(first.state.trips.find((item) => item.id === 'ride-last-seat').status, 'full');
  assert.throws(() => acceptBooking(first.state, { bookingId: 'book-last-b', actorId: 'demo-jordan' }, now), /just taken/);
  const replay = acceptBooking(first.state, { bookingId: 'book-last-a', actorId: 'demo-jordan', idempotencyKey: 'accept-a' }, now);
  assert.equal(replay.replayed, true);
  assert.equal(seatsLeft(replay.state, 'ride-last-seat'), 0);
  state = requestSeat(state, { tripId: 'ride-airport', riderCampusId: 'alabama', quantity: 1 }, now).state;
  assert.equal(seatsLeft(state, 'ride-airport'), 2);
  assert.throws(() => requestSeat(state, { tripId: 'ride-airport', riderCampusId: 'alabama', quantity: 1 }, now), /already have a request/);
});

test('cancellation releases a seat once, blocks a second release, and preserves cross-campus and block rules', () => {
  let state = seedRides(now);
  const accepted = acceptBooking(state, { bookingId: 'book-last-a', actorId: 'demo-jordan' }, now).state;
  const canceled = cancelBooking(accepted, { bookingId: 'book-last-a', actorId: 'demo-sam', idempotencyKey: 'cancel-1' });
  assert.equal(seatsLeft(canceled.state, 'ride-last-seat'), 1);
  assert.equal(canceled.state.trips.find((item) => item.id === 'ride-last-seat').status, 'open');
  const again = cancelBooking(canceled.state, { bookingId: 'book-last-a', actorId: 'demo-sam', idempotencyKey: 'cancel-1' });
  assert.equal(again.replayed, true);
  assert.equal(seatsLeft(again.state, 'ride-last-seat'), 1);
  assert.throws(() => cancelBooking(canceled.state, { bookingId: 'book-last-a', actorId: 'demo-sam' }), /already canceled/);
  assert.throws(() => requestSeat(state, { tripId: 'ride-airport', riderCampusId: 'auburn', quantity: 1 }, now), /another campus/);
  assert.throws(() => requestSeat(state, { tripId: 'ride-airport', riderCampusId: 'alabama', blocked: [['you', 'demo-maya']] }, now), /isn’t available/);
});

test('drivers cannot shrink past accepted seats, and a destination change asks riders to reconfirm', () => {
  const state = seedRides(now);
  assert.throws(() => updateTrip(state, { tripId: 'ride-full', actorId: 'demo-ethan', expectedVersion: 1, capacity: 1 }, now), /fewer seats/);
  const changed = updateTrip(state, { tripId: 'ride-full', actorId: 'demo-ethan', expectedVersion: 1, destinationId: 'stadium' }, now);
  const booking = changed.state.bookings.find((item) => item.id === 'book-full-a');
  assert.equal(booking.needsReconfirm, true);
  assert.equal(booking.acceptedDestinationId, 'airport');
  assert.equal(changed.state.trips.find((item) => item.id === 'ride-full').destinationId, 'stadium');
  assert.throws(() => updateTrip(state, { tripId: 'ride-full', actorId: 'you', expectedVersion: 1, capacity: 2 }, now), /Only the driver/);
});

test('departure expires unanswered requests and trip completion does not mark every passenger as having ridden', () => {
  let state = seedRides(now);
  state = acceptBooking(state, { bookingId: 'book-last-a', actorId: 'demo-jordan' }, now).state;
  const later = new Date('2026-10-18T02:00:00.000Z');
  const expired = expireRequests(state, later);
  assert.equal(expired.state.bookings.find((item) => item.id === 'book-last-b').status, 'expired');
  assert.equal(expired.state.bookings.find((item) => item.id === 'book-last-a').status, 'accepted');
  state = startTrip(expired.state, { tripId: 'ride-last-seat', actorId: 'demo-jordan' }, later).state;
  state = completeTrip(state, { tripId: 'ride-last-seat', actorId: 'demo-jordan' }).state;
  assert.equal(state.bookings.find((item) => item.id === 'book-last-a').status, 'in_progress');
  state = confirmRode(state, { bookingId: 'book-last-a', actorId: 'demo-sam' }).state;
  assert.equal(state.bookings.find((item) => item.id === 'book-last-a').status, 'completed');
});

test('offering, requesting, withdrawing, and declining stay on the ride records', () => {
  let state = seedRides(now);
  const offer = createOffer(state, {
    campusId: 'alabama', pickupId: 'gorgas', destinationId: 'airport', departureAt: '2026-10-17T22:00:00.000Z',
    capacity: 2, contributionCents: 0, vehicleSummary: 'Green hatchback', idempotencyKey: 'offer-1',
  }, now);
  assert.equal(offer.trip.contributionCents, 0);
  const replay = createOffer(offer.state, { idempotencyKey: 'offer-1' }, now);
  assert.equal(replay.replayed, true);
  const request = createRideRequest(state, {
    campusId: 'alabama', pickupId: 'rodgers', destinationId: 'airport', departureAt: '2026-10-17T23:00:00.000Z', seats: 1,
  }, now);
  assert.equal(request.trip.kind, 'request');
  assert.equal(request.trip.driverId, 'you');
  let asked = requestSeat(state, { tripId: 'ride-airport', riderCampusId: 'alabama', quantity: 1 }, now);
  asked = withdrawBooking(asked.state, { bookingId: asked.booking.id, actorId: 'you' });
  assert.equal(asked.booking.status, 'withdrawn');
  const declined = declineBooking(seedRides(now), { bookingId: 'book-last-a', actorId: 'demo-jordan' });
  assert.equal(declined.booking.status, 'declined');
  assert.equal(seatsLeft(declined.state, 'ride-last-seat'), 1);
  const canceled = cancelTrip(seedRides(now), { tripId: 'ride-airport', actorId: 'demo-maya' });
  assert.equal(canceled.trip.status, 'canceled');
});

test('Uber handoff never invents coordinates or a booking, and a return leaves Relay unchanged', () => {
  const place = { name: 'Student Center area', formattedAddress: 'Student Center area', reviewStatus: 'unreviewed', coordinates: { latitude: 33.21, longitude: -87.55 } };
  const airport = { name: 'Airport', reviewStatus: 'unreviewed', coordinates: null };
  const manual = buildUberHandoff({ pickup: place, dropoff: airport, clientId: '' });
  assert.equal(manual.coordinatesIncluded, false);
  assert.equal(manual.bookingState, null);
  assert.equal(manual.url, 'https://m.uber.com/');
  assert.doesNotMatch(manual.url, /33\.21/);
  const confirm = buildUberHandoff({ pickup: place, dropoff: airport, clientId: 'public-client' });
  assert.equal(confirm.coordinatesIncluded, false);
  assert.doesNotMatch(confirm.url, /latitude/);
  const reviewed = buildUberHandoff({
    pickup: { ...place, reviewStatus: 'reviewed' },
    dropoff: { name: 'Airport', reviewStatus: 'reviewed', formattedAddress: 'Tuscaloosa National Airport', coordinates: { latitude: 33.2206, longitude: -87.6114 } },
    clientId: 'public-client',
  });
  assert.equal(reviewed.coordinatesIncluded, true);
  assert.match(reviewed.url, /pickup=/);
  assert.match(reviewed.nativeUrl, /uber:\/\/riderequest/);
  const state = seedRides(now);
  const opened = recordHandoff(state, { campusId: 'alabama', pickupId: 'student-center', destinationId: 'airport', coordinatesIncluded: false }, now);
  assert.equal(opened.handoff.bookingState, null);
  assert.equal(opened.state.bookings.length, state.bookings.length);
  assert.match(formatWhen(now, 'America/Chicago', now, 'America/New_York'), /CDT|CST/);
});

test('ride conversations do not reuse an item id or accept an offer', () => {
  const thread = createSubjectConversation({ kind: 'ride_booking', id: 'book-1', tripId: 'ride-airport', title: 'Student Center area → Airport' });
  assert.equal(thread.product, undefined);
  assert.throws(() => updateConversation(thread, { type: 'offer', party: 'buyer', amountCents: 1200 }), /Offers stay on item listings/);
  assert.equal(updateConversation(thread, { type: 'message', party: 'buyer', text: 'I am at the Student Center area.' }).messages[0].text, 'I am at the Student Center area.');
});
