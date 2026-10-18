import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, MapPin } from 'lucide-react';
import { campusByLabel, campusDayKey, formatCents, parseDollars, searchPlaces, zonedInstant } from '../lib/campus.mjs';
import { buildUberHandoff } from '../lib/uber.mjs';
import {
  acceptBooking, cancelBooking, createOffer, createRideRequest, declineBooking, expireRequests,
  presentTrip, reconfirmBooking, recordHandoff, requestSeat, searchRides, seatsLeft, withdrawBooking, YOU,
} from '../lib/rides.mjs';
import '../features/rides-tickets.css';

type RideState = ReturnType<typeof expireRequests>['state'];
export type RideOpening = { intent?: 'offer' | 'home'; destinationId?: string; tripId?: string };
type Subject = { kind: 'ride_booking' | 'ride_request'; id: string; tripId?: string; title: string; detail?: string };
type Screen = 'home' | 'results' | 'detail' | 'offer' | 'activity' | 'map';

const clientId = import.meta.env.VITE_UBER_CLIENT_ID || '';

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong. Nothing was saved.';
}

export default function RidesView({
  campusLabel, state, onChange, onBack, onConversation, opening,
}: {
  campusLabel: string;
  state: RideState;
  onChange: (state: RideState) => void;
  onBack: () => void;
  onConversation: (subject: Subject, open?: boolean) => void;
  opening?: RideOpening;
}) {
  const campus = campusByLabel(campusLabel);
  const today = campusDayKey(new Date(), campus.timezone);
  const [screen, setScreen] = useState<Screen>(opening?.intent === 'offer' ? 'offer' : opening?.tripId ? 'detail' : 'home');
  const [tripId, setTripId] = useState(opening?.tripId || '');
  const [mode, setMode] = useState<'student' | 'uber'>('student');
  const [pickupId, setPickupId] = useState('');
  const [destinationId, setDestinationId] = useState(opening?.destinationId || '');
  const [day, setDay] = useState(today);
  const [windowName, setWindowName] = useState('afternoon');
  const [seats, setSeats] = useState(1);
  const [more, setMore] = useState(false);
  const [baggage, setBaggage] = useState(false);
  const [accessible, setAccessible] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<string[]>([]);
  const [offerStep, setOfferStep] = useState(1);
  const [offerWhen, setOfferWhen] = useState(`${today}T16:30`);
  const [offerSeats, setOfferSeats] = useState(2);
  const [offerPay, setOfferPay] = useState('12');
  const [offerFree, setOfferFree] = useState(false);
  const [offerVehicle, setOfferVehicle] = useState('');
  const [offerLuggage, setOfferLuggage] = useState('');
  const [offerAccess, setOfferAccess] = useState('');
  const [offerPickup, setOfferPickup] = useState('');
  const [offerDestination, setOfferDestination] = useState(opening?.destinationId || '');
  const [asDriver, setAsDriver] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [handoffNote, setHandoffNote] = useState('');
  const places = searchPlaces(campus.campusId, query);
  const showZone = Intl.DateTimeFormat().resolvedOptions().timeZone !== campus.timezone;

  useEffect(() => {
    const expired = expireRequests(state);
    if (expired.changed) onChange(expired.state);
  }, []);

  const trip = state.trips.find((item) => item.id === tripId);
  const card = trip ? presentTrip(state, trip, new Date()) : null;
  const mine = state.bookings.find((item) => item.tripId === tripId && item.riderId === YOU && ['requested', 'accepted', 'in_progress', 'completed'].includes(item.status));

  const placeOptions = useMemo(() => places.map((place) => <option key={place.id} value={place.id}>{place.name}{place.reviewStatus === 'unreviewed' ? ' · unreviewed' : ''}</option>), [places]);

  function run(action: () => void) {
    try { action(); setError(''); }
    catch (caught) { setError(messageOf(caught)); setStatus(''); }
  }
  function openTrip(id: string, next: Screen = 'detail') {
    setTripId(id); setScreen(next); setError(''); setStatus(''); setAsDriver(false);
  }
  function find() {
    run(() => {
      if (!pickupId || !destinationId) throw new Error('Choose a pickup and a destination.');
      const found = searchRides(state, { campusId: campus.campusId, pickupId, destinationId, dayKey: day, windowName, seats, baggage, accessible });
      setResults(found.map((item) => item.id));
      setScreen('results');
      setStatus(found.length ? `${found.length} rides` : 'No rides in that window');
    });
  }
  function askForRide() {
    run(() => {
      const [year, month, dayPart] = day.split('-');
      const hour = windowName === 'morning' ? 8 : windowName === 'evening' ? 17 : 12;
      const when = zonedInstant({ year, month, day: dayPart, hour, minute: 0 }, campus.timezone).toISOString();
      const created = createRideRequest(state, { campusId: campus.campusId, pickupId, destinationId, departureAt: when, seats });
      if (!created.trip) throw new Error('That ride request could not be saved.');
      onChange(created.state);
      onConversation({ kind: 'ride_request', id: created.trip.id, tripId: created.trip.id, title: 'Ride request', detail: `${places.find((p) => p.id === pickupId)?.name} → ${places.find((p) => p.id === destinationId)?.name}` });
      setTripId(created.trip.id);
      setScreen('activity');
      setStatus('Ride request posted. A driver still has to offer a seat.');
    });
  }
  function openUber() {
    run(() => {
      if (!pickupId || !destinationId) throw new Error('Choose a pickup and a destination.');
      const pickup = places.find((place) => place.id === pickupId) || campus.places.find((place) => place.id === pickupId);
      const dropoff = campus.places.find((place) => place.id === destinationId);
      if (!pickup || !dropoff) throw new Error('Choose a pickup and a destination.');
      if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error('Uber needs a connection. Your pickup and destination are still here.');
      const link = buildUberHandoff({ pickup, dropoff, clientId });
      const opened = window.open(link.url, '_blank', 'noopener,noreferrer');
      const recorded = recordHandoff(state, { campusId: campus.campusId, pickupId, destinationId, coordinatesIncluded: link.coordinatesIncluded });
      onChange(recorded.state);
      setHandoffNote(opened ? link.message : 'The Uber window did not open. Copy the locations and open Uber yourself. Out of Pocket did not book a ride.');
      setStatus(opened ? 'Opened in Uber. No ride was booked in Out of Pocket.' : 'The Uber window did not open. No ride was booked in Out of Pocket.');
      if (!opened) navigator.clipboard?.writeText(link.copyText).catch(() => {});
    });
  }
  function viewMap() {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setError('The campus map needs a connection. You can still choose a meeting point from the list.');
      return;
    }
    setScreen('map'); setError(''); setStatus('');
  }
  function useLocation() {
    if (!navigator.geolocation) { setError('Location isn’t available. Choose a meeting point from the list.'); return; }
    navigator.geolocation.getCurrentPosition(
      () => setStatus('No reviewed pickup coordinates are available. Choose a meeting point from the list.'),
      () => setError('Location access is off. Choose a meeting point from the list.'),
      { maximumAge: 60000, timeout: 8000 },
    );
  }

  return <section className="rt-page">
    <button className="rt-back" type="button" onClick={() => {
      if (screen === 'home' || (screen === 'offer' && offerStep === 1)) onBack();
      else if (screen === 'offer') setOfferStep((step) => (step - 1) as 1 | 2 | 3);
      else if (screen === 'detail' || screen === 'activity') { setStatus(''); setError(''); setScreen(results.length ? 'results' : 'home'); }
      else { setStatus(''); setError(''); setScreen('home'); }
    }}>
      <ArrowLeft size={18} /> Back
    </button>
    <div className="eyebrow">DEMO · {campus.shortName} RIDES</div>
    <h1>{screen === 'offer' ? 'Offer a ride' : 'Rides'}</h1>
    <p className="rt-banner" role="status">{status || 'Sample carpools stay in this browser. Nothing is dispatched and no one is charged.'}</p>
    {error && <p className="rt-error" role="alert">{error}</p>}
    {showZone && <p className="rt-note">Times use {campus.timezone.replace('_', ' ')}.</p>}

    {screen === 'home' && <>
      <div className="rt-switch" role="tablist" aria-label="Ride type">
        <button type="button" role="tab" aria-selected={mode === 'student'} onClick={() => setMode('student')}>Student rides</button>
        <button type="button" role="tab" aria-selected={mode === 'uber'} onClick={() => setMode('uber')}>Uber</button>
      </div>
      <form className="rt-form" onSubmit={(event) => { event.preventDefault(); mode === 'uber' ? openUber() : find(); }}>
        <label htmlFor="place-search">Search campus places</label>
        <input id="place-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Student Center, library, airport" />
        <label htmlFor="pickup">Pickup</label>
        <select id="pickup" value={pickupId} onChange={(event) => setPickupId(event.target.value)} required>
          <option value="">Choose a pickup</option>{placeOptions}
        </select>
        <label htmlFor="destination">Destination</label>
        <select id="destination" value={destinationId} onChange={(event) => setDestinationId(event.target.value)} required>
          <option value="">Choose a destination</option>{placeOptions}
        </select>
        <label htmlFor="ride-day">Departure day</label>
        <input id="ride-day" type="date" value={day} onChange={(event) => setDay(event.target.value)} required />
        <label htmlFor="ride-window">Departure window</label>
        <select id="ride-window" value={windowName} onChange={(event) => setWindowName(event.target.value)}>
          <option value="morning">Morning</option><option value="afternoon">Afternoon</option><option value="evening">Evening</option>
        </select>
        <span id="seat-label">Passengers</span>
        <div className="rt-stepper" role="group" aria-labelledby="seat-label">
          <button type="button" aria-label="Fewer passengers" onClick={() => setSeats((value) => Math.max(1, value - 1))}>−</button>
          <strong>{seats}</strong>
          <button type="button" aria-label="More passengers" onClick={() => setSeats((value) => Math.min(6, value + 1))}>+</button>
        </div>
        <button className="rt-text" type="button" aria-expanded={more} onClick={() => setMore((value) => !value)}>More filters</button>
        {more && <div className="rt-note">
          <label><input type="checkbox" checked={baggage} onChange={(event) => setBaggage(event.target.checked)} /> Needs luggage space</label>
          <label><input type="checkbox" checked={accessible} onChange={(event) => setAccessible(event.target.checked)} /> Accessibility note required</label>
        </div>}
        <div className="rt-actions">
          {mode === 'student'
            ? <button className="button primary" type="submit">Find rides</button>
            : <button className="button primary" type="submit">Open in Uber</button>}
        </div>
        {mode === 'uber' && <p className="rt-note">{handoffNote || 'Review your pickup, fare, and booking in Uber. Returning here will not show a booked ride.'}</p>}
        <button className="button secondary" type="button" onClick={viewMap}><MapPin size={16} /> View campus map</button>
        <button className="rt-text" type="button" onClick={useLocation}>Use my location</button>
        <p className="rt-note"><a href={campus.officialMapUrl} target="_blank" rel="noreferrer">{campus.attribution}</a>. Out of Pocket is not the university map.</p>
      </form>
      <div className="rt-note"><strong>Demo rides</strong>
        {state.trips.filter((item) => item.campusId === campus.campusId && item.kind === 'offer').map((item) => <button key={item.id} className="rt-text" type="button" onClick={() => openTrip(item.id)}>{presentTrip(state, item, new Date()).summary}</button>)}
      </div>
    </>}

    {screen === 'map' && <div className="rt-card">
      <h2>View campus map</h2>
      <p>Find your location, then choose the meeting point below.</p>
      <p>{campus.framingNote}</p>
      <a className="button primary" href={campus.officialMapUrl} target="_blank" rel="noreferrer">Open {campus.shortName} map</a>
      <button className="button secondary" type="button" onClick={() => setScreen('home')}>Choose a meeting point</button>
    </div>}

    {screen === 'results' && <>
      <h2>Student ride results</h2>
      {results.length === 0 ? <div className="rt-card">
        <p>No student rides match that campus, route, and window.</p>
        <button className="button primary" type="button" onClick={() => setScreen('home')}>Change time</button>
        <button className="button secondary" type="button" onClick={askForRide}>Post a ride request</button>
        <button className="button secondary" type="button" onClick={openUber}>Open in Uber</button>
      </div> : results.map((id) => {
        const item = state.trips.find((tripItem) => tripItem.id === id);
        if (!item) return null;
        const row = presentTrip(state, item, new Date());
        return <button className="rt-row" key={id} type="button" onClick={() => openTrip(id)}>
          <span className="rt-pill">{item.demo ? 'Demo' : 'Ride'}{row.seatsLeft === 0 ? ' · Full' : ''}</span>
          <strong>{row.summary}</strong>
          <small>{item.driverName} · {item.vehicleSummary}</small>
        </button>;
      })}
    </>}

    {screen === 'detail' && card && <article className="rt-card">
      <span className="rt-pill">{card.demo ? 'Demo' : 'Ride'}</span>
      <h2>{card.pickup.name} → {card.destination.name}</h2>
      <p>{card.whenLabel}{showZone ? ` · ${campus.timezone}` : ''}</p>
      <p><strong>{card.driverName}</strong></p>
      <div className="rt-meta">
        <span className="rt-pill neutral">{card.emailVerified ? 'Demo · student email' : 'Email not verified'}</span>
        <span className="rt-pill neutral">Driving check not done</span>
        {card.pickup.reviewStatus !== 'reviewed' && <span className="rt-pill neutral">Unreviewed meeting point</span>}
      </div>
      <p>{card.meetingInstructions}</p>
      <p>{card.seatsLeft} {card.seatsLeft === 1 ? 'seat' : 'seats'} left · {card.contributionLabel}</p>
      <p>Total for {seats} {seats === 1 ? 'seat' : 'seats'}: {formatCents(card.contributionCents * seats)}</p>
      {card.luggage && <p>Luggage: {card.luggage}</p>}
      <label className="rt-note"><input type="checkbox" checked={asDriver} onChange={(event) => setAsDriver(event.target.checked)} /> Demo: act as driver <small>Try the other side. No request is delivered.</small></label>
      {card.status === 'canceled' ? <p>This ride is canceled.</p> : asDriver ? <button className="button primary" type="button" onClick={() => setScreen('activity')}>Review requests</button> : card.seatsLeft < seats ? <p>Not enough seats left.</p> : <button className="button primary" type="button" onClick={() => run(() => {
        const saved = requestSeat(state, { tripId: card.id, riderCampusId: campus.campusId, quantity: seats });
        if (!saved.booking) throw new Error('That request could not be saved.');
        onChange(saved.state);
        onConversation({ kind: 'ride_booking', id: saved.booking.id, tripId: card.id, title: `${card.pickup.name} → ${card.destination.name}`, detail: card.summary });
        setScreen('activity');
        setStatus('Waiting for driver. A request is not a confirmed seat.');
      })}>Request seat</button>}
    </article>}

    {screen === 'activity' && card && <article className="rt-card">
      <h2>{mine?.status === 'accepted' ? 'Seat confirmed' : mine?.status === 'requested' ? 'Waiting for driver' : card.status === 'canceled' ? 'Ride canceled' : 'Ride activity'}</h2>
      <p>{card.summary}</p>
      <p>{card.meetingInstructions}</p>
      {mine?.needsReconfirm && <p role="status">The driver changed this ride. Reconfirm the new plan or cancel. Your confirmed stop was {campus.places.find((place) => place.id === mine.acceptedDestinationId)?.name}.</p>}
      <div className="rt-actions">
        {mine?.status === 'requested' && <button className="button secondary" type="button" onClick={() => run(() => { onChange(withdrawBooking(state, { bookingId: mine.id, actorId: YOU }).state); setStatus('Request withdrawn.'); })}>Withdraw request</button>}
        {mine?.needsReconfirm && <button className="button primary" type="button" onClick={() => run(() => { onChange(reconfirmBooking(state, { bookingId: mine.id, actorId: YOU }).state); setStatus('Seat reconfirmed.'); })}>Reconfirm seat</button>}
        {mine && ['requested', 'accepted', 'in_progress'].includes(mine.status) && <button className="button secondary" type="button" onClick={() => run(() => { onChange(cancelBooking(state, { bookingId: mine.id, actorId: YOU }).state); setStatus('Seat canceled.'); })}>Cancel seat</button>}
        <button className="button secondary" type="button" onClick={() => onConversation({ kind: card.kind === 'request' ? 'ride_request' : 'ride_booking', id: mine?.id || card.id, tripId: card.id, title: `${card.pickup.name} → ${card.destination.name}`, detail: card.summary }, true)}>Open conversation</button>
        {mine?.status === 'accepted' && <button className="rt-text" type="button" onClick={() => navigator.clipboard?.writeText(card.summary)}>Copy trip summary</button>}
      </div>
      <label className="rt-note"><input type="checkbox" checked={asDriver} onChange={(event) => setAsDriver(event.target.checked)} /> Demo: act as driver</label>
      {asDriver && card.requests.filter((booking) => booking.status === 'requested').map((booking) => <div className="rt-row" key={booking.id}>
        <strong>{booking.riderName} · {booking.quantity} {booking.quantity === 1 ? 'seat' : 'seats'}</strong>
        <button className="button primary" type="button" onClick={() => run(() => {
          const saved = acceptBooking(state, { bookingId: booking.id, actorId: card.driverId, expectedTripVersion: card.version });
          onChange(saved.state);
          setStatus(`Accepted ${booking.riderName}. Seats left: ${seatsLeft(saved.state, card.id)}.`);
        })}>Accept</button>
        <button className="button secondary" type="button" onClick={() => run(() => { onChange(declineBooking(state, { bookingId: booking.id, actorId: card.driverId }).state); setStatus(`Declined ${booking.riderName}.`); })}>Decline</button>
      </div>)}
      {asDriver && <p className="rt-note">{seatsLeft(state, card.id)} {seatsLeft(state, card.id) === 1 ? 'seat' : 'seats'} left. Accepting checks the seat at that moment.</p>}
    </article>}

    {screen === 'offer' && <form className="rt-form" onSubmit={(event) => {
      event.preventDefault();
      if (offerStep < 3) { setOfferStep((step) => step + 1); return; }
      run(() => {
        const [date, time] = offerWhen.split('T');
        const [year, month, dayPart] = date.split('-');
        const [hour, minute] = time.split(':').map(Number);
        const created = createOffer(state, {
          campusId: campus.campusId, pickupId: offerPickup, destinationId: offerDestination,
          departureAt: zonedInstant({ year, month, day: dayPart, hour, minute }, campus.timezone).toISOString(),
          capacity: offerSeats, contributionCents: offerFree ? 0 : parseDollars(offerPay), vehicleSummary: offerVehicle,
          luggage: offerLuggage, accessibilityNotes: offerAccess,
        });
        onChange(created.state);
        if (!created.trip) throw new Error('That ride could not be saved.');
        setTripId(created.trip.id);
        setScreen('activity');
        setStatus('Ride posted. Requests will wait here for you to accept.');
      });
    }}>
      <div className="rt-steps" aria-label="Offer steps"><span className={offerStep === 1 ? 'now' : ''}>1 Route and time</span><span className={offerStep === 2 ? 'now' : ''}>2 Seats and details</span><span className={offerStep === 3 ? 'now' : ''}>3 Review</span></div>
      {offerStep === 1 && <>
        <label htmlFor="offer-pickup">Pickup</label>
        <select id="offer-pickup" value={offerPickup} onChange={(event) => setOfferPickup(event.target.value)} required><option value="">Choose a pickup</option>{campus.places.map((place) => <option key={place.id} value={place.id}>{place.name}</option>)}</select>
        <label htmlFor="offer-destination">Destination</label>
        <select id="offer-destination" value={offerDestination} onChange={(event) => setOfferDestination(event.target.value)} required><option value="">Choose a destination</option>{campus.places.map((place) => <option key={place.id} value={place.id}>{place.name}</option>)}</select>
        <label htmlFor="offer-when">Departure</label>
        <input id="offer-when" type="datetime-local" value={offerWhen} onChange={(event) => setOfferWhen(event.target.value)} required />
        <small>Entered in {campus.shortName} campus time.</small>
      </>}
      {offerStep === 2 && <>
        <span id="offer-seats">Seats you can take</span>
        <div className="rt-stepper"><button type="button" aria-label="Fewer seats" onClick={() => setOfferSeats((value) => Math.max(1, value - 1))}>−</button><strong>{offerSeats}</strong><button type="button" aria-label="More seats" onClick={() => setOfferSeats((value) => Math.min(6, value + 1))}>+</button></div>
        <label><input type="checkbox" checked={offerFree} onChange={(event) => setOfferFree(event.target.checked)} /> Free</label>
        {!offerFree && <><label htmlFor="offer-pay">Contribution per seat</label><input id="offer-pay" inputMode="decimal" value={offerPay} onChange={(event) => setOfferPay(event.target.value)} required /></>}
        <label htmlFor="offer-vehicle">Vehicle</label>
        <input id="offer-vehicle" value={offerVehicle} onChange={(event) => setOfferVehicle(event.target.value)} required placeholder="Gray sedan" />
        <button className="rt-text" type="button" onClick={() => setMore((value) => !value)}>More options</button>
        {more && <>
          <label htmlFor="offer-bags">Luggage</label><input id="offer-bags" value={offerLuggage} onChange={(event) => setOfferLuggage(event.target.value)} />
          <label htmlFor="offer-access">Accessibility notes</label><textarea id="offer-access" value={offerAccess} onChange={(event) => setOfferAccess(event.target.value)} />
        </>}
      </>}
      {offerStep === 3 && <>
        <p>{campus.places.find((place) => place.id === offerPickup)?.name} → {campus.places.find((place) => place.id === offerDestination)?.name}</p>
        <p>{offerWhen.replace('T', ' ')} · {offerSeats} seats · {offerFree ? 'Free' : offerPay || '0'} per seat</p>
        <p>Passenger total is the contribution times the seats. This demo does not collect it.</p>
        <p>Cancel before departure. An accepted cancellation releases the seat once.</p>
      </>}
      <button className="button primary" type="submit">{offerStep === 3 ? 'Post ride' : 'Continue'}</button>
    </form>}
  </section>;
}
