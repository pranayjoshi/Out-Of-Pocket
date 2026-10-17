import { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { campusByLabel, formatCents, formatWhen, parseDollars } from '../lib/campus.mjs';
import {
  availableQuantity, cancelOrder, checklist, expireHolds, hydrateTickets, presentEvent, priceBreakdown, publishListing,
  reportProblem, reportReceipt, reportTransfer, requestEventReview, reserveTicket, simulatePayment, YOU,
} from '../lib/tickets.mjs';
import './rides-tickets.css';

type TicketState = ReturnType<typeof hydrateTickets>;
export type TicketOpening = { intent?: 'sell' | 'home'; orderId?: string; eventId?: string };
type Screen = 'home' | 'event' | 'detail' | 'sell' | 'order';

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong. Nothing was saved.';
}

export default function TicketsView({
  campusLabel, state, onChange, onBack, onConversation, onNeedRide, opening,
}: {
  campusLabel: string;
  state: TicketState;
  onChange: (state: TicketState) => void;
  onBack: () => void;
  onConversation: (subject: { kind: 'ticket_order'; id: string; title: string; detail?: string }, open?: boolean) => void;
  onNeedRide: (destinationId: string) => void;
  opening?: TicketOpening;
}) {
  const campus = campusByLabel(campusLabel);
  const [screen, setScreen] = useState<Screen>(opening?.intent === 'sell' ? 'sell' : opening?.orderId ? 'order' : 'home');
  const [eventId, setEventId] = useState(opening?.eventId || state.events.find((item) => item.campusId === campus.campusId)?.id || '');
  const [listingId, setListingId] = useState('');
  const [orderId, setOrderId] = useState(opening?.orderId || '');
  const [step, setStep] = useState(1);
  const [typeId, setTypeId] = useState('student');
  const [bowl, setBowl] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [price, setPrice] = useState('45');
  const [attest, setAttest] = useState(false);
  const [missing, setMissing] = useState('');
  const [asSeller, setAsSeller] = useState(false);
  const [bowlFilter, setBowlFilter] = useState('any');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const now = new Date();

  useEffect(() => {
    const expired = expireHolds(state);
    if (expired.changed) onChange(expired.state);
  }, []);

  const events = state.events.filter((item) => item.campusId === campus.campusId).map((item) => presentEvent(state, item, now));
  const event = state.events.find((item) => item.id === eventId);
  const shownEvent = event ? presentEvent(state, event, now) : null;
  const listings = state.listings.filter((item) => item.eventId === eventId && (bowlFilter === 'any' || item.bowl === bowlFilter || !item.bowl));
  const listing = state.listings.find((item) => item.id === listingId);
  const order = state.orders.find((item) => item.id === orderId);
  const orderEvent = order ? state.events.find((item) => item.id === order.eventId) : event;

  function run(action: () => void) {
    try { action(); setError(''); }
    catch (caught) { setError(messageOf(caught)); setStatus(''); }
  }

  return <section className="rt-page">
    <button className="rt-back" type="button" onClick={() => screen === 'home' || (screen === 'sell' && step === 1) ? onBack() : setScreen(screen === 'order' || screen === 'detail' ? 'event' : screen === 'sell' ? 'home' : 'home')}><ArrowLeft size={18} /> Back</button>
    <div className="eyebrow">DEMO · {campus.shortName} TICKETS</div>
    <h1>{screen === 'sell' ? 'Sell a ticket' : 'Tickets'}</h1>
    <p className="rt-banner" role="status">{status || 'Sample tickets stay in this browser. No barcode, password, or payment is collected.'}</p>
    {error && <p className="rt-error" role="alert">{error}</p>}

    {screen === 'home' && <>
      {events.map((item) => <button className="rt-row" key={item.id} type="button" onClick={() => { setEventId(item.id); setScreen('event'); }}>
        <span className="rt-pill">Demo{item.status === 'canceled' ? ' · Canceled' : item.status === 'postponed' ? ' · Postponed' : ''}</span>
        <strong>{item.name}</strong>
        <small>{item.whenLabel} · {item.venue}</small>
        <small>{item.availableCount} available</small>
      </button>)}
      <button className="button secondary" type="button" onClick={() => setScreen('sell')}>Sell a ticket</button>
    </>}

    {screen === 'event' && shownEvent && <>
      <h2>{shownEvent.name}</h2>
      <p>{shownEvent.whenLabel} · {shownEvent.venue}</p>
      {shownEvent.officialChannel && <p className="rt-note">{shownEvent.officialChannel.note} <a href={shownEvent.officialChannel.url} target="_blank" rel="noreferrer">Official guidance</a></p>}
      <label htmlFor="bowl-filter">Bowl or type</label>
      <select id="bowl-filter" value={bowlFilter} onChange={(input) => setBowlFilter(input.target.value)}>
        <option value="any">All</option>
        {[...new Set(listings.map((item) => item.bowl).filter(Boolean))].map((bowlName) => <option key={bowlName} value={bowlName}>{bowlName}</option>)}
      </select>
      {listings.length === 0 && <p>No tickets for this filter.</p>}
      {[...listings].sort((a, b) => a.priceCents * a.quantity - b.priceCents * b.quantity).map((item) => {
        const left = availableQuantity(state, item.id, now);
        const total = item.priceCents * Math.max(left, 1);
        return <button className="rt-row" key={item.id} type="button" onClick={() => { setListingId(item.id); setScreen('detail'); }} disabled={item.status === 'sold' || left === 0}>
          <strong>{item.bowl || item.typeId.replaceAll('_', ' ')} · {left} left</strong>
          <small>{item.sellerName} · {formatCents(total)} all-in · {item.status === 'sold' || left === 0 ? 'Unavailable' : 'Eligible listing'}</small>
        </button>;
      })}
      <p className="rt-note">Sorted with the lowest total first when more than one price is listed.</p>
    </>}

    {screen === 'detail' && listing && event && <article className="rt-card">
      <span className="rt-pill">Demo</span>
      <h2>{event.name}</h2>
      <p>{listing.bowl || 'General admission'} · no assigned row or seat</p>
      <p>{event.eligibility}</p>
      <p>{event.transferInstructions}</p>
      <p>{priceBreakdown(listing.priceCents, 1).label}</p>
      <p>{availableQuantity(state, listing.id, now) === 0 ? 'Unavailable' : `${availableQuantity(state, listing.id, now)} available`}</p>
      {listing.status === 'sold' || availableQuantity(state, listing.id, now) === 0
        ? <p>This ticket is unavailable.</p>
        : <button className="button primary" type="button" onClick={() => run(() => {
          const saved = reserveTicket(state, { listingId: listing.id, buyerCampusId: campus.campusId, quantity: 1 });
          if (!saved.order) throw new Error('That hold could not be saved.');
          onChange(saved.state);
          setOrderId(saved.order.id);
          onConversation({ kind: 'ticket_order', id: saved.order.id, title: event.name, detail: saved.order.buyerTotalCents ? formatCents(saved.order.buyerTotalCents) : '' });
          setScreen('order');
          setStatus('Reserved. This hold is not a purchase.');
        })}>Reserve ticket</button>}
    </article>}

    {screen === 'order' && order && orderEvent && <article className="rt-card">
      <h2>{order.eventName}</h2>
      <p>{order.bowl || 'General admission'} · {formatCents(order.buyerTotalCents)} · policy v{order.policyVersion}</p>
      <p>Transfer by {formatWhen(order.transferDeadline, orderEvent.timezone, now)}</p>
      {order.scheduleChange && <p role="status">The event moved to {formatWhen(order.scheduleChange, orderEvent.timezone, now)}. Your reservation still has the original time on file.</p>}
      {order.confirmation && <p>{order.confirmation}. This is not university verified.</p>}
      <div className="rt-check">
        {checklist(order, orderEvent).map((item) => <article key={item.id} className={item.state} aria-current={item.state === 'current' ? 'step' : undefined}>
          <strong>{item.label}</strong>
          <small>{item.actor} · {item.state === 'current' ? 'Do this now' : item.state}</small>
          <p>{item.detail}</p>
        </article>)}
      </div>
      <label className="rt-note"><input type="checkbox" checked={asSeller} onChange={(input) => setAsSeller(input.target.checked)} /> Demo: act as seller <small>The recipient name is only shown on this side.</small></label>
      {asSeller && <p>Recipient for the demo transfer: {order.recipientLabel}</p>}
      <div className="rt-actions">
        {order.buyerId === YOU && order.status === 'reserved' && <button className="button primary" type="button" onClick={() => run(() => { onChange(simulatePayment(state, { orderId: order.id, actorId: YOU }).state); setStatus('Demo payment recorded. No card was charged.'); })}>Simulate payment</button>}
        {order.buyerId === YOU && order.status === 'reserved' && <button className="button secondary" type="button" onClick={() => run(() => { onChange(cancelOrder(state, { orderId: order.id, actorId: YOU }).state); setStatus('Hold canceled.'); })}>Cancel hold</button>}
        {asSeller && order.status === 'awaiting_transfer' && <button className="button primary" type="button" onClick={() => run(() => { onChange(reportTransfer(state, { orderId: order.id, actorId: order.sellerId }).state); setStatus('Transfer reported by the seller. The buyer still has to accept it.'); })}>I sent the transfer</button>}
        {orderEvent.transferPortalUrl && <a className="button secondary" href={orderEvent.transferPortalUrl} target="_blank" rel="noreferrer">{orderEvent.transferLabel}</a>}
        {order.buyerId === YOU && order.status === 'transfer_reported' && <button className="button primary" type="button" onClick={() => run(() => { onChange(reportReceipt(state, { orderId: order.id, actorId: YOU }).state); setStatus('Receipt reported by you. Relay did not verify it with the university.'); })}>I accepted the ticket</button>}
        {['awaiting_transfer', 'transfer_reported', 'receipt_reported'].includes(order.status) && <button className="button secondary" type="button" onClick={() => run(() => { onChange(reportProblem(state, { orderId: order.id, actorId: asSeller ? order.sellerId : YOU }).state); setStatus('Case opened. The order was not completed.'); })}>Report a problem</button>}
        <button className="button secondary" type="button" onClick={() => onConversation({ kind: 'ticket_order', id: order.id, title: order.eventName }, true)}>Open conversation</button>
        {(order.status === 'receipt_reported' || order.status === 'completed') && orderEvent.venuePlaceId && <button className="rt-text" type="button" onClick={() => onNeedRide(orderEvent.venuePlaceId)}>Need a ride?</button>}
      </div>
    </article>}

    {screen === 'sell' && <form className="rt-form" onSubmit={(input) => {
      input.preventDefault();
      if (step === 1 && missing.trim()) {
        run(() => { onChange(requestEventReview(state, { campusId: campus.campusId, name: missing }).state); setStatus('Sent for review. It is not listed yet.'); setMissing(''); });
        return;
      }
      if (step < 3) { setStep((value) => value + 1); return; }
      run(() => {
        const saved = publishListing(state, { eventId, typeId, bowl, quantity, priceCents: parseDollars(price), attestation: attest });
        if (!saved.listing) throw new Error('That listing could not be saved.');
        onChange(saved.state);
        setListingId(saved.listing.id);
        setScreen('detail');
        setStatus('Ticket listed. Buyers reserve it in the demo.');
      });
    }}>
      <div className="rt-steps"><span className={step === 1 ? 'now' : ''}>1 Choose event</span><span className={step === 2 ? 'now' : ''}>2 Describe ticket</span><span className={step === 3 ? 'now' : ''}>3 Review</span></div>
      {step === 1 && <>
        <label htmlFor="sell-event">Event</label>
        <select id="sell-event" value={eventId} onChange={(input) => { setEventId(input.target.value); const next = state.events.find((item) => item.id === input.target.value); setTypeId(next?.ticketTypes[0].id || 'student'); setQuantity(1); }}>{events.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
        <label htmlFor="missing-event">Event not listed?</label>
        <input id="missing-event" value={missing} onChange={(input) => setMissing(input.target.value)} placeholder="Ask for a review" />
      </>}
      {step === 2 && event && <>
        <label htmlFor="ticket-type">Ticket type</label>
        <select id="ticket-type" value={typeId} onChange={(input) => setTypeId(input.target.value)}>{event.ticketTypes.map((type) => <option key={type.id} value={type.id}>{type.label}</option>)}</select>
        {event.ticketTypes.find((type) => type.id === typeId)?.fields.includes('bowl') && <><label htmlFor="bowl">Bowl or section</label><input id="bowl" value={bowl} onChange={(input) => setBowl(input.target.value)} required /></>}
        <label htmlFor="ticket-qty">Quantity</label>
        <input id="ticket-qty" type="number" min={1} max={event.ticketTypes.find((type) => type.id === typeId)?.maxPerListing || 1} value={quantity} onChange={(input) => setQuantity(Number(input.target.value))} />
        <label htmlFor="ticket-price">Price per ticket</label>
        <input id="ticket-price" inputMode="decimal" value={price} onChange={(input) => setPrice(input.target.value)} required />
      </>}
      {step === 3 && event && <>
        <p>{event.name} · {bowl || 'General admission'} · {quantity} × {price || '0'}</p>
        <p>{(() => { try { return priceBreakdown(parseDollars(price), quantity).label; } catch (caught) { return messageOf(caught); } })()}</p>
        <p>Seller proceeds match the buyer total. Relay is not adding a fee in this demo.</p>
        <p>{event.transferInstructions}</p>
        <label><input type="checkbox" checked={attest} onChange={(input) => setAttest(input.target.checked)} required /> I can transfer this ticket and I am not pasting a barcode or student ID.</label>
      </>}
      <button className="button primary" type="submit">{step === 1 && missing.trim() ? 'Request review' : step === 3 ? 'Publish listing' : 'Continue'}</button>
    </form>}
  </section>;
}
