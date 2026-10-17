import { campusByLabel, formatCents } from '../lib/campus.mjs';
import { presentTrip, YOU as rideYou } from '../lib/rides.mjs';
import { YOU as ticketYou } from '../lib/tickets.mjs';
import type { Product } from '../data';
import './rides-tickets.css';

export default function MyPosts({
  campusLabel, products, rides, tickets, onClose, onRemoveItem, onOpenRide, onCancelRide, onOpenTicket, onWithdrawTicket,
}: {
  campusLabel: string;
  products: Product[];
  rides: Parameters<typeof presentTrip>[0];
  tickets: { listings: { id: string; sellerId: string; eventId: string; bowl: string; priceCents: number; status: string }[]; events: { id: string; name: string }[] };
  onClose: () => void;
  onRemoveItem: (id: string) => void;
  onOpenRide: (id: string) => void;
  onCancelRide: (id: string) => void;
  onOpenTicket: (id: string) => void;
  onWithdrawTicket: (id: string) => void;
}) {
  const campus = campusByLabel(campusLabel);
  const mine = products.filter((item) => item.seller === 'You');
  const trips = rides.trips.filter((item) => item.driverId === rideYou && item.campusId === campus.campusId);
  const listings = tickets.listings.filter((item) => item.sellerId === ticketYou);
  return <section className="rt-page">
    <button className="rt-back" type="button" onClick={onClose}>Back</button>
    <div className="eyebrow">YOU · MY POSTS</div>
    <h1>My posts</h1>
    <h2>Items</h2>
    {mine.length === 0 && <p className="rt-note">No item listings yet.</p>}
    {mine.map((item) => <div className="rt-row" key={item.id}><strong>{item.title}</strong><small>${item.price}</small><button className="button secondary" type="button" onClick={() => onRemoveItem(item.id)}>Cancel listing</button></div>)}
    <h2>Rides</h2>
    {trips.length === 0 && <p className="rt-note">No ride posts yet.</p>}
    {trips.map((item) => <div className="rt-row" key={item.id}><strong>{presentTrip(rides, item, new Date()).summary}</strong><button className="button secondary" type="button" onClick={() => onOpenRide(item.id)}>Edit</button>{item.status !== 'canceled' && <button className="button secondary" type="button" onClick={() => onCancelRide(item.id)}>Cancel ride</button>}</div>)}
    <h2>Tickets</h2>
    {listings.length === 0 && <p className="rt-note">No ticket listings yet.</p>}
    {listings.map((item) => <div className="rt-row" key={item.id}><strong>{tickets.events.find((event) => event.id === item.eventId)?.name}</strong><small>{item.bowl || 'General admission'} · {formatCents(item.priceCents)} · {item.status}</small><button className="button secondary" type="button" onClick={() => onOpenTicket(item.id)}>Edit</button>{item.status === 'active' && <button className="button secondary" type="button" onClick={() => onWithdrawTicket(item.id)}>Withdraw</button>}</div>)}
  </section>;
}
