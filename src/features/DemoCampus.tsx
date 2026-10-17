import { useMemo, useState } from 'react';
import Messages from '../Messages';
import type { Product } from '../data';
import { createSubjectConversation } from '../lib/messages.mjs';
import type { Conversation } from '../lib/messages.mjs';
import { cancelTrip, hydrateRides } from '../lib/rides.mjs';
import { hydrateTickets, withdrawListing } from '../lib/tickets.mjs';
import MyPosts from './MyPosts';
import RidesView from './RidesView';
import TicketsView from './TicketsView';
import './rides-tickets.css';

function useStored<T>(key: string, initial: T) {
  const [state, setState] = useState<T>(() => {
    try { return JSON.parse(localStorage.getItem(key) || 'null') ?? initial; }
    catch { return initial; }
  });
  const save = (value: T | ((prev: T) => T)) => {
    setState((prev) => {
      const next = typeof value === 'function' ? (value as (prev: T) => T)(prev) : value;
      try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* Storage is optional. */ }
      return next;
    });
  };
  return [state, save] as const;
}

function go(path: string) {
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function DemoCampus({ path, campus }: { path: string; campus: string }) {
  const [rideState, setRideState] = useStored<Parameters<typeof hydrateRides>[0]>('relay-rides-v1', null);
  const [ticketState, setTicketState] = useStored<Parameters<typeof hydrateTickets>[0]>('relay-tickets-v1', null);
  const [threads, setThreads] = useStored<Conversation[]>('relay-conversations-v1', []);
  const [activeThread, setActiveThread] = useState<string | null>(null);
  const [products, setProducts] = useStored<Product[]>('relay-listings', []);
  const rides = useMemo(() => hydrateRides(rideState), [rideState]);
  const tickets = useMemo(() => hydrateTickets(ticketState), [ticketState]);
  const params = new URLSearchParams(window.location.search);

  function openSubject(subject: { kind: 'ride_booking' | 'ride_request' | 'ticket_order'; id: string; tripId?: string; title: string; detail?: string }, open = false) {
    const existing = threads.find((thread) => thread.subject?.kind === subject.kind && thread.subject.id === subject.id);
    if (existing) setActiveThread(existing.id);
    else {
      const thread = createSubjectConversation(subject);
      setThreads((prev) => [thread, ...prev]);
      setActiveThread(thread.id);
    }
    if (open) go('/demo-messages');
  }

  if (path === '/create') return <section className="rt-page">
    <button className="rt-back" type="button" onClick={() => go('/')}>Back</button>
    <h1>What do you want to add?</h1>
    <button className="button primary" type="button" onClick={() => go('/sell')}>Sell an item</button>
    <button className="button secondary" type="button" onClick={() => go('/rides?offer=1')}>Offer a ride</button>
    <button className="button secondary" type="button" onClick={() => go('/tickets?sell=1')}>Sell a ticket</button>
  </section>;

  if (path === '/posts') return <MyPosts campusLabel={campus} products={products} rides={rides} tickets={tickets} onClose={() => go('/')} onRemoveItem={(id) => setProducts((prev) => prev.filter((item) => item.id !== id))} onOpenRide={(tripId) => go(`/rides?trip=${tripId}`)} onCancelRide={(tripId) => { try { setRideState(cancelTrip(rides, { tripId, actorId: 'you' }).state); } catch { /* The ride view explains a failed cancel. */ } }} onOpenTicket={() => go('/tickets')} onWithdrawTicket={(id) => { try { setTicketState(withdrawListing(tickets, { listingId: id, sellerId: 'you' }).state); } catch { /* Withdraw explains itself on the ticket. */ } }} />;

  if (path === '/demo-messages') return <Messages threads={threads} activeId={activeThread} onSelect={setActiveThread} onUpdate={(thread) => setThreads((prev) => prev.map((item) => item.id === thread.id ? thread : item))} locked={() => false} onReserve={() => undefined} onExplore={() => go('/')} />;

  if (path === '/tickets') return <TicketsView campusLabel={campus} state={tickets} opening={{ intent: params.get('sell') ? 'sell' : undefined, orderId: params.get('order') || undefined }} onChange={setTicketState} onBack={() => go('/')} onConversation={openSubject} onNeedRide={(destinationId) => go(`/rides?destination=${destinationId}`)} />;

  return <RidesView campusLabel={campus} state={rides} opening={{ intent: params.get('offer') ? 'offer' : undefined, destinationId: params.get('destination') || undefined, tripId: params.get('trip') || undefined }} onChange={setRideState} onBack={() => go('/')} onConversation={openSubject} />;
}
