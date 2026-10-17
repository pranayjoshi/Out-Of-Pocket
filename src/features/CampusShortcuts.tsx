export function CampusShortcuts({ shop, rides, tickets, current }: { shop: () => void; rides: () => void; tickets: () => void; current?: 'shop' | 'rides' | 'tickets' }) {
  return <nav className="campus-shortcuts" aria-label="Campus shortcuts">
    <button type="button" aria-current={current === 'shop' ? 'page' : undefined} onClick={shop}>Shop</button>
    <button type="button" aria-current={current === 'rides' ? 'page' : undefined} onClick={rides}>Rides</button>
    <button type="button" aria-current={current === 'tickets' ? 'page' : undefined} onClick={tickets}>Tickets</button>
  </nav>;
}
