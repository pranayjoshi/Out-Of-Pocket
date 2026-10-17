import { formatCents } from '../lib/campus.mjs';
import { presentTrip, YOU as rideYou } from '../lib/rides.mjs';
import { checklist, hydrateTickets, YOU as ticketYou } from '../lib/tickets.mjs';
import './rides-tickets.css';

type RideState = Parameters<typeof presentTrip>[0];
type TicketState = ReturnType<typeof hydrateTickets>;

export default function ActivityPanel({
  filter, onFilter, itemCount, rides, tickets, onOpenRide, onOpenOrder,
}: {
  filter: 'all' | 'items' | 'rides' | 'tickets';
  onFilter: (filter: 'all' | 'items' | 'rides' | 'tickets') => void;
  itemCount: number;
  rides: RideState;
  tickets: TicketState;
  onOpenRide: (tripId: string) => void;
  onOpenOrder: (orderId: string) => void;
}) {
  const rideRows = [
    ...rides.bookings.filter((booking) => booking.riderId === rideYou).map((booking) => ({ id: booking.id, tripId: booking.tripId, label: `${booking.status.replaceAll('_', ' ')} · ${booking.riderName}` })),
    ...rides.trips.filter((trip) => trip.driverId === rideYou).map((trip) => ({ id: trip.id, tripId: trip.id, label: trip.kind === 'request' ? 'Your ride request' : 'Your ride offer' })),
  ];
  const ticketRows = tickets.orders.filter((order) => order.buyerId === ticketYou || order.sellerId === ticketYou);
  return <div className="rt-page">
    <div className="rt-filters" role="group" aria-label="Activity">
      {(['all', 'items', 'rides', 'tickets'] as const).map((name) => <button key={name} type="button" aria-pressed={filter === name} onClick={() => onFilter(name)}>{name[0].toUpperCase() + name.slice(1)}</button>)}
    </div>
    {(filter === 'all' || filter === 'items') && <p className="rt-note">{itemCount ? `${itemCount} item exchanges are listed with the handoffs below.` : 'No item exchanges yet.'}</p>}
    {(filter === 'all' || filter === 'rides') && (rideRows.length ? rideRows.map((row) => {
      const trip = rides.trips.find((item) => item.id === row.tripId);
      if (!trip) return null;
      return <button className="rt-row" key={row.id} type="button" onClick={() => onOpenRide(trip.id)}><span className="rt-pill">Ride</span><strong>{presentTrip(rides, trip, new Date()).summary}</strong><small>{row.label}</small></button>;
    }) : <p className="rt-note">No ride activity yet. Find a ride to request a seat.</p>)}
    {(filter === 'all' || filter === 'tickets') && (ticketRows.length ? ticketRows.map((order) => {
      const event = tickets.events.find((item) => item.id === order.eventId);
      const step = event ? checklist(order, event).find((item) => item.state === 'current') : null;
      return <button className="rt-row" key={order.id} type="button" onClick={() => onOpenOrder(order.id)}><span className="rt-pill">Ticket</span><strong>{order.eventName}</strong><small>{order.status.replaceAll('_', ' ')} · {formatCents(order.buyerTotalCents)}{step ? ` · Next: ${step.label}` : ''}</small></button>;
    }) : <p className="rt-note">No ticket orders yet.</p>)}
  </div>;
}
