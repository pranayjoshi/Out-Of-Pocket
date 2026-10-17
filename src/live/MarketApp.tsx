import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowLeftRight, Bell, Compass, Heart, LayoutGrid, Menu, MessageCircle, Shield, Store, X } from "lucide-react";
import { ApiError, api, money, saveSession, sessionToken, toBase64, type Listing, type Reservation, type User } from "./api";
import "../market.css";
import { DemoCampus } from "../features/DemoCampus";
import { CampusShortcuts } from "../features/CampusShortcuts";
import ActivityPanel from "../features/ActivityPanel";
import { hydrateRides } from "../lib/rides.mjs";
import { hydrateTickets } from "../lib/tickets.mjs";

const categories = ["All finds", "Dorm & living", "Textbooks", "Tech", "Getting around", "Free stuff", "Lab supplies", "Tickets", "Tutoring", "Rides"];

const detailLabels: Record<string, string> = {
  widthIn: "Width", depthIn: "Depth", heightIn: "Height", transport: "Moving it",
  isbn: "ISBN", edition: "Edition", course: "Course", model: "Model", storage: "Storage",
  accessories: "Accessories", size: "Size", ownership: "Ownership", eventName: "Event",
  seat: "Seat", transfer: "Transfer", subject: "Subject", durationMinutes: "Minutes",
  rateCents: "Rate", seats: "Seats", destination: "Destination",
};
function detailLabel(key: string) {
  return detailLabels[key] || key.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase());
}

function go(path: string) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function MarketApp() {
  const [path, setPath] = useState(window.location.pathname);
  const [token, setToken] = useState(sessionToken());
  const [me, setMe] = useState<User | null>(null);
  const [toast, setToast] = useState("");
  const [offline, setOffline] = useState("");
  const [menu, setMenu] = useState(false);
  const [nextPath, setNextPath] = useState(sessionStorage.getItem("relay-next") || "/");

  useEffect(() => {
    const sync = () => setPath(window.location.pathname);
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);
  useEffect(() => {
    if (!token) { setMe(null); return; }
    api<User>("/me").then(setMe).catch((error: ApiError) => {
      if (error.status === 401) { saveSession(null); setToken(null); }
      else setOffline(error.message);
    });
  }, [token]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 3200);
    return () => clearTimeout(timer);
  }, [toast]);

  function signIn(nextToken: string) {
    saveSession(nextToken);
    setToken(nextToken);
    const destination = sessionStorage.getItem("relay-next") || "/";
    sessionStorage.removeItem("relay-next");
    go(destination);
  }
  function signOut() {
    api("/auth/logout", { method: "POST" }).catch(() => undefined);
    saveSession(null);
    setToken(null);
    setMe(null);
    go("/");
  }
  function requireSignIn() {
    sessionStorage.setItem("relay-next", path);
    setNextPath(path);
    go("/sign-in");
  }

  const nav = [
    ["/", "Discover", Compass],
    ["/messages", "Messages", MessageCircle],
    ["/orders", "Exchanges", ArrowLeftRight],
    ["/plans", "Plans", LayoutGrid],
    ["/board", "Campus board", Store],
    ["/selling", "Selling", Store],
    ["/alerts", "Alerts", Bell],
    ["/account", "Account", Shield],
  ] as const;

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to campus content</a>
      <aside className={`sidebar ${menu ? "is-open" : ""}`}>
        <button className="brand-button" onClick={() => { go("/"); setMenu(false); }} aria-label="Relay home">
          <span className="brand">relay<span className="brand-period">.</span></span>
        </button>
        <div className="sidebar-caption">A LITTLE MORE LOCAL.</div>
        <nav className="main-nav" aria-label="Main navigation">
          {nav.map(([href, label, Icon]) => (
            <button key={href} className={`nav-item ${path === href ? "active" : ""}`} onClick={() => { go(href); setMenu(false); }}>
              <Icon size={16} /> {label}
            </button>
          ))}
          {me && me.role && me.role !== "student" && <button className="nav-item" onClick={() => go("/staff")}><Shield size={16} /> Staff</button>}
          <button className="nav-item" onClick={() => { window.location.assign("/admin/ads"); }}>Promotions portal</button>
        </nav>
      </aside>
      {menu && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setMenu(false)} />}
      <div className="main-shell">
        <header className="topbar">
          <div className="topbar-start">
            <button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setMenu(true)}><Menu size={22} /></button>
            <span className="campus-status">{me ? `${me.campusVerification?.badge ?? me.campus}` : "Sign in with a campus email"}</span>
          </div>
          <div className="topbar-actions">
            <button className="notification-button icon-button" aria-label="Notifications" onClick={() => go("/notifications")}><Bell size={19} /></button>
            {me ? <button className="top-avatar" onClick={() => go("/account")} aria-label="Account">{me.initials}</button> : <button className="button primary" onClick={() => go("/sign-in")}>Sign in</button>}
          </div>
        </header>
        <main id="main-content" className="market-main">
          {offline && <div className="banner" role="status">{offline} <button onClick={() => setOffline("")}>Dismiss</button></div>}
          <Screen path={path} me={me} token={token} onSignIn={signIn} onSignOut={signOut} onNeedAuth={requireSignIn} toast={setToast} nextPath={nextPath} />
        </main>
      </div>
      {toast && <div className="toast" role="status"><span>{toast}</span><button aria-label="Dismiss" onClick={() => setToast("")}><X size={16} /></button></div>}
    </div>
  );
}

function Screen(props: { path: string; me: User | null; token: string | null; onSignIn: (token: string) => void; onSignOut: () => void; onNeedAuth: () => void; toast: (message: string) => void; nextPath: string }) {
  const listing = props.path.match(/^\/listing\/([^/]+)/);
  const profile = props.path.match(/^\/profile\/([^/]+)/);
  const post = props.path.match(/^\/post\/([^/]+)/);
  const order = props.path.match(/^\/orders\/([^/]+)/);
  const thread = props.path.match(/^\/messages\/([^/]+)/);
  if (props.path === "/sign-in") return <SignIn onSignIn={props.onSignIn} />;
  if (["/rides", "/tickets", "/posts", "/demo-messages", "/create"].includes(props.path)) return <DemoCampus path={props.path} campus={props.me?.campus?.includes("Auburn") ? "Auburn" : "Alabama"} />;
  if (!props.token && !listing) return <SignIn onSignIn={props.onSignIn} intro={props.nextPath !== "/" ? "Sign in to open that page. You’ll come back here." : undefined} />;
  if (listing) return <ListingPage id={listing[1]} me={props.me} onNeedAuth={props.onNeedAuth} toast={props.toast} />;
  if (profile) return <ProfilePage id={profile[1]} />;
  if (post) return <PostPage id={post[1]} me={props.me} toast={props.toast} />;
  if (order) return <OrderPage id={order[1]} me={props.me} toast={props.toast} />;
  if (props.path === "/messages") return <Messages me={props.me} />;
  if (thread) return <Messages me={props.me} activeId={thread[1]} />;
  if (props.path === "/orders") return <Orders />;
  if (props.path === "/sell" || props.path.startsWith("/sell/")) return <Sell me={props.me} id={props.path.split("/")[2]} toast={props.toast} />;
  if (props.path === "/selling") return <Selling />;
  if (props.path === "/plans") return <Plans toast={props.toast} />;
  if (props.path === "/board") return <Board me={props.me} toast={props.toast} />;
  if (props.path === "/alerts") return <Alerts toast={props.toast} />;
  if (props.path === "/account") return <Account me={props.me} onSignOut={props.onSignOut} toast={props.toast} />;
  if (props.path === "/notifications") return <Notifications />;
  if (props.path === "/staff") return <Staff toast={props.toast} />;
  return <Discover me={props.me} />;
}

function SignIn({ onSignIn, intro }: { onSignIn: (token: string) => void; intro?: string }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  async function send(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const result = await api<{ previewCode?: string }>("/auth/code", { method: "POST", body: { email }, token: null });
      setPreview(result.previewCode || "");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Try again."); }
  }
  async function verify(event: FormEvent) {
    event.preventDefault();
    try {
      const result = await api<{ token: string }>("/auth/verify", { method: "POST", body: { email, code }, token: null });
      onSignIn(result.token);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Try again."); }
  }
  return (
    <form className="stack" onSubmit={preview ? verify : send}>
      <div className="page-heading"><h1>Sign in with your campus email.</h1><p>{intro || "A verified ua.edu, crimson.ua.edu, or auburn.edu address is your campus membership. Choosing a campus later only changes what you browse."}</p></div>
      <CampusShortcuts rides={() => go("/rides")} tickets={() => go("/tickets")} shop={() => go("/")} />
      <label>Email<input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required autoComplete="email" /></label>
      {preview && <label>Code<input value={code} onChange={(event) => setCode(event.target.value)} inputMode="numeric" required /></label>}
      {preview && <p className="notice">Local preview code: <strong>{preview}</strong>. This is shown only on localhost because email delivery is not configured.</p>}
      {error && <p className="field-error" role="alert">{error}</p>}
      <button className="button primary" type="submit">{preview ? "Verify and continue" : "Email me a code"}</button>
    </form>
  );
}

function Discover({ me }: { me: User | null }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All finds");
  const [maxPrice, setMaxPrice] = useState("");
  const [condition, setCondition] = useState("");
  const [sort, setSort] = useState("relevance");
  const [area, setArea] = useState("");
  const [items, setItems] = useState<Listing[]>([]);
  const [note, setNote] = useState("");
  const [recovery, setRecovery] = useState<Listing[]>([]);
  useEffect(() => {
    const params = new URLSearchParams({ sort });
    if (query) params.set("q", query);
    if (category !== "All finds") params.set("category", category);
    if (maxPrice) params.set("maxPrice", String(Math.round(Number(maxPrice) * 100)));
    if (condition) params.set("condition", condition);
    if (area) params.set("area", area);
    if (me?.browseCampus) params.set("campus", me.browseCampus);
    api<{ items: Listing[]; relevance: string; recovery: { items: Listing[] } | null }>(`/listings?${params}`).then((page) => {
      setItems(page.items);
      setNote(page.relevance);
      setRecovery(page.recovery?.items ?? []);
      localStorage.setItem("relay-market-cache", JSON.stringify(page.items));
    }).catch(() => {
      const cached = localStorage.getItem("relay-market-cache");
      setItems(cached ? JSON.parse(cached) : []);
      setNote("Showing the last listings saved on this device.");
    });
  }, [query, category, maxPrice, condition, sort, area, me?.browseCampus]);
  return (
    <section>
      <div className="page-heading"><h1>Good things, still on campus.</h1><p>{note}</p></div>
      <CampusShortcuts current="shop" shop={() => document.querySelector(".cards")?.scrollIntoView({ block: "start" })} rides={() => go("/rides")} tickets={() => go("/tickets")} />
      <div className="market-filters">
        <label>Search<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Desk, textbook, bike" /></label>
        <label>Category<select value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>Max price<input value={maxPrice} onChange={(event) => setMaxPrice(event.target.value)} inputMode="decimal" placeholder="50" /></label>
        <label>Condition<input value={condition} onChange={(event) => setCondition(event.target.value)} placeholder="Good" /></label>
        <label>Area<input value={area} onChange={(event) => setArea(event.target.value)} placeholder="North campus" /></label>
        <label>Sort<select value={sort} onChange={(event) => setSort(event.target.value)}><option value="relevance">Campus, then newest</option><option value="newest">Newest</option><option value="price_asc">Price: low to high</option><option value="price_desc">Price: high to low</option></select></label>
        <button className="button primary" onClick={() => go("/create")}>Pass something on</button>
      </div>
      <div className="cards">
        {items.map((item) => <ListingCard key={item.id} item={item} />)}
      </div>
      {!items.length && <div className="empty-state"><span><Heart size={28} /></span><h2>Nothing matched.</h2><p>Clear a filter, or look at these recent listings you can still see.</p></div>}
      {!!recovery.length && !items.length && <div className="cards">{recovery.map((item) => <ListingCard key={item.id} item={item} />)}</div>}
    </section>
  );
}

function ListingCard({ item }: { item: Listing }) {
  return (
    <button className="card" onClick={() => go(`/listing/${item.id}`)}>
      <img src={item.photos[0]?.thumbUrl || "/images/room.jpg"} alt="" />
      <div>
        <span className="pill">{item.status === "active" ? item.condition : item.status}</span>
        <h3>{item.title}</h3>
        <p>{money(item.priceCents)} · {item.area || item.campus}</p>
      </div>
    </button>
  );
}

function ListingPage({ id, me, onNeedAuth, toast }: { id: string; me: User | null; onNeedAuth: () => void; toast: (message: string) => void }) {
  const [item, setItem] = useState<Listing | null>(null);
  const [error, setError] = useState("");
  const [photo, setPhoto] = useState(0);
  useEffect(() => {
    const path = me ? `/listings/${id}` : `/listings/${id}?preview=1`;
    api<Listing>(path, { token: me ? undefined : null }).then(setItem).catch((caught) => setError(caught instanceof Error ? caught.message : "Unavailable"));
  }, [id, me]);
  if (error) return <p role="alert">{error}</p>;
  if (!item) return <p>Loading listing…</p>;
  const image = item.photos[photo];
  return (
    <article className="listing-hero">
      <div>
        <img src={image?.url || "/images/room.jpg"} alt={item.title} />
        <div className="gallery">{item.photos.map((entry, index) => <button key={entry.id} onClick={() => setPhoto(index)}><img src={entry.thumbUrl} alt="" /></button>)}</div>
      </div>
      <div className="stack">
        <span className="pill">{item.status === "active" ? item.condition : item.status}</span>
        <h1>{item.title}</h1>
        <p className="notice">{money(item.priceCents)} · {item.campus} · {item.area || "Campus area shown after you sign in"}</p>
        {item.status !== "active" && <p className="banner">This listing is {item.status}. The page stays available so a shared link does not go dead.</p>}
        <p>{item.description}</p>
        <dl className="details">{Object.entries(item.categoryDetails).map(([key, value]) => <div key={key}><dt>{detailLabel(key)}</dt><dd>{String(value)}</dd></div>)}</dl>
        <p className="notice">{item.fulfillment.method === "seller_delivery" ? `Seller delivery up to ${item.fulfillment.maxMiles ?? "a limited"} miles, ${money(item.fulfillment.feeCents)}.` : "Pickup only. You’ll agree on a public place."}</p>
        <button className="button secondary" onClick={() => go(`/profile/${item.seller.id}`)}>{item.seller.displayName} · {item.seller.campusVerification?.badge}</button>
        {item.seller.responseTimeHours != null && <p className="notice">Typical first reply: {item.seller.responseTimeHours} hours, from at least five conversations.</p>}
        <div className="market-row">
          <button className="button primary" onClick={async () => { if (!me) return onNeedAuth(); const thread = await api<{ id: string }>("/conversations", { body: { listingId: item.id } }); go(`/messages/${thread.id}`); }}>Message</button>
          <button className="button secondary" onClick={async () => { if (!me) return onNeedAuth(); await api(`/favorites/${item.id}`, { method: item.saved ? "DELETE" : "POST" }); toast(item.saved ? "Removed from saved finds." : "Saved."); }}>{item.saved ? "Unsave" : "Save"}</button>
          {item.status === "active" && item.listingType === "item" && <button className="button dark" onClick={async () => {
            if (!me) return onNeedAuth();
            try {
              const order = await api<Reservation>("/reservations", { body: { listingId: item.id, idempotencyKey: crypto.randomUUID() } });
              go(`/orders/${order.id}`);
            } catch (caught) { toast(caught instanceof Error ? caught.message : "Could not reserve."); }
          }}>Reserve</button>}
          {item.mine && <button className="button secondary" onClick={() => go(`/sell/${item.id}`)}>Edit</button>}
          <ReportButton targetType="listing" targetId={item.id} toast={toast} />
        </div>
      </div>
    </article>
  );
}

function Messages({ me, activeId }: { me: User | null; activeId?: string }) {
  const [threads, setThreads] = useState<{ id: string; listing: Listing; unread: number; lastMessage: { body: string } | null }[]>([]);
  const [messages, setMessages] = useState<{ id: string; senderId: string; body: string }[]>([]);
  const [offers, setOffers] = useState<{ id: string; amountCents: number; status: string; proposerId: string }[]>([]);
  const [text, setText] = useState("");
  const [offer, setOffer] = useState("");
  useEffect(() => { api<typeof threads>("/conversations").then(setThreads).catch(() => setThreads([])); }, [activeId]);
  useEffect(() => {
    if (!activeId) return;
    api<{ messages: typeof messages; offers: typeof offers }>(`/conversations/${activeId}/messages`).then((page) => { setMessages(page.messages); setOffers(page.offers); });
    api(`/conversations/${activeId}/read`, { method: "POST" }).catch(() => undefined);
  }, [activeId]);
  const thread = threads.find((item) => item.id === activeId);
  return (
    <div className="thread">
      <div className="thread-list">{threads.map((item) => <button key={item.id} onClick={() => go(`/messages/${item.id}`)}><strong>{item.listing.title}</strong><br />{item.lastMessage?.body || "No messages yet"} {item.unread ? `· ${item.unread} new` : ""}</button>)}</div>
      <div className="panel" style={{ padding: 16 }}>
        {!thread && <p>Choose a conversation. Accepting an offer records a price. It does not reserve the item or take payment.</p>}
        {messages.map((message) => <div key={message.id} className={`bubble ${message.senderId === me?.id ? "mine" : ""}`}>{message.body}</div>)}
        {offers.map((item) => <p key={item.id} className="notice">Offer {money(item.amountCents)} · {item.status} {item.status === "pending" && item.proposerId !== me?.id && <button onClick={() => api(`/conversations/${activeId}/offers/${item.id}/accept`, { method: "POST" }).then(() => go(window.location.pathname))}>Accept</button>}</p>)}
        {activeId && <form className="market-row" onSubmit={async (event) => { event.preventDefault(); await api(`/conversations/${activeId}/messages`, { body: { body: text, clientId: crypto.randomUUID() } }); setText(""); const page = await api<{ messages: typeof messages; offers: typeof offers }>(`/conversations/${activeId}/messages`); setMessages(page.messages); }}>
          <input value={text} onChange={(event) => setText(event.target.value)} placeholder="Write a message" />
          <button className="button primary" type="submit">Send</button>
        </form>}
        {activeId && thread && thread.listing.priceCents > 0 && <form className="market-row" onSubmit={async (event) => { event.preventDefault(); await api(`/conversations/${activeId}/offers`, { body: { amountCents: Math.round(Number(offer) * 100) } }); setOffer(""); }}>
          <input value={offer} onChange={(event) => setOffer(event.target.value)} placeholder="Offer in dollars" />
          <button className="button secondary" type="submit">Offer</button>
        </form>}
      </div>
    </div>
  );
}

function OrderPage({ id, me, toast }: { id: string; me: User | null; toast: (message: string) => void }) {
  const [order, setOrder] = useState<Reservation | null>(null);
  const [place, setPlace] = useState("Gorgas Library steps");
  const [when, setWhen] = useState("2026-10-18T20:00");
  const [code, setCode] = useState("");
  const [issued, setIssued] = useState("");
  const [reason, setReason] = useState("");
  async function reload() { setOrder(await api<Reservation>(`/reservations/${id}`)); }
  useEffect(() => { reload().catch((error) => toast(error.message)); }, [id]);
  if (!order) return <p>Loading exchange…</p>;
  const seller = me?.id === order.sellerId;
  async function run(path: string, body?: unknown) {
    try { await api(path, { body }); await reload(); }
    catch (error) { toast(error instanceof Error ? error.message : "Try again."); }
  }
  return (
    <section className="stack">
      <h1>{order.snapshot.title}</h1>
      <p className="notice">{money(order.totalCents)} · {order.fulfillment} · {order.status}. The price is the snapshot from when this reservation started.</p>
      {seller && order.status === "pending_seller" && <button className="button primary" onClick={() => run(`/reservations/${id}/confirm`)}>Confirm reservation</button>}
      {order.status === "active" && <>
        <label>Public place<input value={place} onChange={(event) => setPlace(event.target.value)} /></label>
        <label>Time<input type="datetime-local" value={when} onChange={(event) => setWhen(event.target.value)} /></label>
        <button className="button secondary" onClick={() => run(`/reservations/${id}/pickup`, { placeLabel: place, startsAt: new Date(when).toISOString(), timezone: "America/Chicago" })}>Propose pickup</button>
        {order.pickup?.status === "proposed" && order.pickup.proposedBy !== me?.id && <button className="button primary" onClick={() => run(`/reservations/${id}/pickup/accept`)}>Accept {order.pickup.placeLabel}</button>}
        {order.pickup?.status === "accepted" && <p className="banner">Confirmed {new Date(order.pickup.startsAt).toLocaleString()} · {order.pickup.placeLabel} · {order.pickup.timezone}</p>}
        <button className="button secondary" onClick={async () => { const result = await api<{ code: string; charged: boolean }>(`/reservations/${id}/handoff/issue`, { method: "POST" }); setIssued(result.code); toast(result.charged ? "Charged" : "Code issued. Scanning does not charge anyone."); }}>Show one-time code</button>
        {issued && <p className="notice">Code {issued}. The other person enters it. This does not capture payment.</p>}
        <form className="market-row" onSubmit={async (event) => { event.preventDefault(); const result = await api<{ charged: boolean }>(`/reservations/${id}/handoff/verify`, { body: { code } }); toast(result.charged ? "Charged" : "Partner identified. No charge."); await reload(); }}>
          <input value={code} onChange={(event) => setCode(event.target.value)} placeholder="Enter their code" />
          <button className="button secondary">Verify</button>
        </form>
        {!seller && order.totalCents > 0 && <button className="button secondary" onClick={async () => {
          const payment = await api<{ id: string; note: string }>(`/reservations/${id}/checkout`, { method: "POST" });
          await api(`/payments/${payment.id}/confirm`, { body: { paymentMethodToken: "sandbox_pm_ok" } });
          toast(`${payment.note} Authorized, not captured.`);
          await reload();
        }}>Authorize sandbox payment</button>}
        {!seller && <button className="button primary" onClick={() => run(`/reservations/${id}/accept-item`, { checks: order.snapshot.checks.map(() => true) })}>Accept item after inspection</button>}
      </>}
      {order.payment && <p className="notice">{order.payment.note} Status: {order.payment.status}. {order.payment.captureDeadline ? `Hold deadline ${new Date(order.payment.captureDeadline).toLocaleString()}.` : ""}</p>}
      <label>Cancel reason<input value={reason} onChange={(event) => setReason(event.target.value)} /></label>
      <button className="button secondary" onClick={() => run(`/reservations/${id}/cancel`, { reason })}>Cancel exchange</button>
      <ReportButton targetType="exchange" targetId={id} toast={toast} />
      <DisputeForm id={id} toast={toast} />
    </section>
  );
}

function DisputeForm({ id, toast }: { id: string; toast: (message: string) => void }) {
  const [reason, setReason] = useState("");
  return <form className="stack" onSubmit={async (event) => { event.preventDefault(); const result = await api<{ note: string }>(`/reservations/${id}/disputes`, { body: { reason } }); toast(result.note); }}>
    <label>Dispute reason<input value={reason} onChange={(event) => setReason(event.target.value)} /></label>
    <button className="button secondary">Report a problem. This does not refund.</button>
  </form>;
}

function Orders() {
  const [orders, setOrders] = useState<Reservation[]>([]);
  const [filter, setFilter] = useState<"all" | "items" | "rides" | "tickets">("all");
  const rides = useMemo(() => {
    try { return hydrateRides(JSON.parse(localStorage.getItem("relay-rides-v1") || "null")); }
    catch { return hydrateRides(null); }
  }, []);
  const tickets = useMemo(() => {
    try { return hydrateTickets(JSON.parse(localStorage.getItem("relay-tickets-v1") || "null")); }
    catch { return hydrateTickets(null); }
  }, []);
  useEffect(() => { api<Reservation[]>("/reservations").then(setOrders).catch(() => setOrders([])); }, []);
  return <section>
    <ActivityPanel filter={filter} onFilter={setFilter} itemCount={orders.length} rides={rides} tickets={tickets} onOpenRide={(tripId) => go(`/rides?trip=${tripId}`)} onOpenOrder={(orderId) => go(`/tickets?order=${orderId}`)} />
    {(filter === "all" || filter === "items") && orders.map((order) => <button key={order.id} className="panel row" onClick={() => go(`/orders/${order.id}`)}>{order.snapshot.title} · {order.status} · {money(order.totalCents)}</button>)}
  </section>;
}

function Sell({ me, id, toast }: { me: User | null; id?: string; toast: (message: string) => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Dorm & living");
  const [condition, setCondition] = useState("Good");
  const [price, setPrice] = useState("20");
  const [area, setArea] = useState("North campus");
  const [details, setDetails] = useState<Record<string, string>>({});
  const [photos, setPhotos] = useState<string[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!id) return;
    api<Listing>(`/listings/${id}`).then((item) => {
      setTitle(item.title); setDescription(item.description); setCategory(item.category); setCondition(item.condition);
      setPrice(String(item.priceCents / 100)); setArea(item.area || ""); setDetails(Object.fromEntries(Object.entries(item.categoryDetails).map(([key, value]) => [key, String(value)])));
    }).catch(() => undefined);
  }, [id]);
  const fields = detailFields(category);
  async function save(status: "draft" | "active") {
    setError("");
    try {
      const body = { title, description, category, condition, priceCents: Math.round(Number(price) * 100), area, categoryDetails: numberize(details), status: "draft", crossCampus: false };
      const listing = id ? await api<Listing>(`/listings/${id}`, { method: "PATCH", body }) : await api<Listing>("/listings", { body });
      if (photos.length) await api(`/listings/${listing.id}/photos`, { body: { photoIds: photos } });
      if (status === "active" && listing.status !== "active") await api(`/listings/${listing.id}/transition`, { body: { status: "active" } });
      toast(status === "draft" ? "Draft saved." : "Listing is live for your campus.");
      go(`/listing/${listing.id}`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not save."); }
  }
  return (
    <form className="stack" onSubmit={(event) => { event.preventDefault(); save("active"); }}>
      <h1>{id ? "Edit listing" : "Pass something on"}</h1>
      <p className="notice">Signed in as {me?.displayName}. The listing belongs to your verified campus, {me?.campus}.</p>
      <label>Title<input value={title} onChange={(event) => setTitle(event.target.value)} required /></label>
      <label>Description<textarea value={description} onChange={(event) => setDescription(event.target.value)} required /></label>
      <label>Category<select value={category} onChange={(event) => setCategory(event.target.value)}>{categories.filter((item) => item !== "All finds").map((item) => <option key={item}>{item}</option>)}</select></label>
      <label>Condition<input value={condition} onChange={(event) => setCondition(event.target.value)} /></label>
      <label>Price in dollars<input value={price} onChange={(event) => setPrice(event.target.value)} /></label>
      <label>Campus area<input value={area} onChange={(event) => setArea(event.target.value)} /></label>
      {fields.map((field) => <label key={field}>{field}<input value={details[field] || ""} onChange={(event) => setDetails({ ...details, [field]: event.target.value })} /></label>)}
      <label>Photos<input type="file" accept="image/jpeg,image/png" multiple onChange={async (event) => {
        const files = [...(event.target.files || [])];
        const ids: string[] = [];
        for (const file of files) {
          const uploaded = await api<{ id: string }>("/uploads", { body: { data: toBase64(await file.arrayBuffer()) } });
          ids.push(uploaded.id);
        }
        setPhotos(ids);
      }} /></label>
      {error && <p role="alert">{error}</p>}
      <div className="market-row"><button className="button secondary" type="button" onClick={() => save("draft")}>Save draft</button><button className="button primary" type="submit">Publish</button></div>
    </form>
  );
}

function detailFields(category: string) {
  if (category === "Textbooks") return ["isbn", "edition", "course"];
  if (category === "Tech") return ["model", "storage", "accessories"];
  if (category === "Dorm & living") return ["widthIn", "depthIn", "heightIn", "transport"];
  if (category === "Getting around") return ["size", "ownership"];
  if (category === "Tutoring") return ["subject", "durationMinutes", "rateCents"];
  if (category === "Tickets") return ["eventName", "seat", "transfer"];
  if (category === "Rides") return ["seats", "destination"];
  if (category === "Lab supplies") return ["course"];
  return [];
}
function numberize(details: Record<string, string>) {
  const numeric = new Set(["widthIn", "depthIn", "heightIn", "durationMinutes", "rateCents", "seats"]);
  return Object.fromEntries(Object.entries(details).filter(([, value]) => value).map(([key, value]) => [key, numeric.has(key) ? Number(value) : value]));
}

function Selling() {
  const [data, setData] = useState<{ listings: Record<string, Listing[]>; needsResponse: { type: string; href: string }[] } | null>(null);
  useEffect(() => { api<NonNullable<typeof data>>("/me/dashboard").then(setData).catch(() => setData(null)); }, []);
  if (!data) return <p>Loading your selling desk…</p>;
  return <section>
    <h1>What needs you</h1>
    {data.needsResponse.map((item, index) => <button key={index} className="panel row" onClick={() => go(item.href)}>{item.type}</button>)}
    {Object.entries(data.listings).map(([status, listings]) => <div key={status}><h2>{status}</h2><div className="cards">{listings.map((item) => <ListingCard key={item.id} item={item} />)}</div></div>)}
  </section>;
}

function Plans({ toast }: { toast: (message: string) => void }) {
  const [plans, setPlans] = useState<{ id: string; name: string; budgetCents: number; actionableTotalCents: number; items: { listingId: string; title: string; available: boolean; currentPriceCents: number | null; savedPriceCents: number; status: string }[] }[]>([]);
  const [name, setName] = useState("Dorm setup");
  const [budget, setBudget] = useState("150");
  useEffect(() => { api<typeof plans>("/plans").then(setPlans).catch(() => setPlans([])); }, []);
  return <section className="stack">
    <h1>Plans follow live inventory</h1>
    <form className="market-row" onSubmit={async (event) => { event.preventDefault(); await api("/plans", { body: { name, budgetCents: Math.round(Number(budget) * 100) } }); setPlans(await api("/plans")); }}>
      <input value={name} onChange={(event) => setName(event.target.value)} /><input value={budget} onChange={(event) => setBudget(event.target.value)} /><button className="button primary">New plan</button>
    </form>
    {plans.map((plan) => <article key={plan.id} className="panel" style={{ padding: 16 }}>
      <h2>{plan.name}</h2>
      <p className="notice">Budget {money(plan.budgetCents)}. Actionable total {money(plan.actionableTotalCents)}. Sold or unavailable items stay listed and are left out of that total.</p>
      {plan.items.map((item) => <p key={item.listingId}>{item.title} · {item.available ? money(item.currentPriceCents || 0) : `${item.status}, not in the total`}{item.currentPriceCents !== item.savedPriceCents ? ` · was ${money(item.savedPriceCents)}` : ""}</p>)}
      <PlanAdd planId={plan.id} onAdded={async () => setPlans(await api("/plans"))} toast={toast} />
    </article>)}
  </section>;
}
function PlanAdd({ planId, onAdded, toast }: { planId: string; onAdded: () => void; toast: (message: string) => void }) {
  const [listingId, setListingId] = useState("");
  return <form className="market-row" onSubmit={async (event) => { event.preventDefault(); try { await api(`/plans/${planId}/items`, { body: { listingId } }); onAdded(); } catch (error) { toast(error instanceof Error ? error.message : "Could not add."); } }}><input value={listingId} onChange={(event) => setListingId(event.target.value)} placeholder="Listing id" /><button className="button secondary">Add</button></form>;
}

function Board({ me, toast }: { me: User | null; toast: (message: string) => void }) {
  const [posts, setPosts] = useState<{ id: string; title: string; intent: string; budgetCents: number; status: string }[]>([]);
  const [title, setTitle] = useState("");
  const [intent, setIntent] = useState("find");
  useEffect(() => { api<typeof posts>("/posts").then(setPosts).catch(() => setPosts([])); }, []);
  return <section className="stack">
    <h1>Asks, offers, and trades</h1>
    <CampusShortcuts shop={() => go("/")} rides={() => go("/rides")} tickets={() => go("/tickets")} />
    <form className="market-row" onSubmit={async (event) => { event.preventDefault(); await api("/posts", { body: { title, intent, category: "Dorm & living", budgetCents: 5000 } }); setPosts(await api("/posts")); }}>
      <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="What do you need?" />
      <select value={intent} onChange={(event) => setIntent(event.target.value)}><option value="find">Find</option><option value="offer">Offer</option><option value="trade">Trade</option></select>
      <button className="button primary">Post</button>
    </form>
    {posts.map((post) => <button key={post.id} className="panel row" onClick={() => go(`/post/${post.id}`)}>{post.intent}: {post.title} · {money(post.budgetCents)}</button>)}
    <p className="notice">Signed in as {me?.displayName}. A response links one of your listings into a conversation with the person who posted.</p>
    <TradeForm toast={toast} />
  </section>;
}
function PostPage({ id, toast }: { id: string; me: User | null; toast: (message: string) => void }) {
  const [listingId, setListingId] = useState("");
  return <form className="stack" onSubmit={async (event) => {
    event.preventDefault();
    try { const result = await api<{ conversationId: string }>(`/posts/${id}/responses`, { body: { listingId } }); go(`/messages/${result.conversationId}`); }
    catch (error) { toast(error instanceof Error ? error.message : "Could not respond."); }
  }}><h1>Respond with a listing</h1><input value={listingId} onChange={(event) => setListingId(event.target.value)} placeholder="Your listing id" /><button className="button primary">Send listing</button></form>;
}
function TradeForm({ toast }: { toast: (message: string) => void }) {
  const [listingId, setListingId] = useState("");
  const [theirListingId, setTheir] = useState("");
  return <form className="stack" onSubmit={async (event) => { event.preventDefault(); try { await api("/trades", { body: { listingId, theirListingId } }); toast("Trade proposed. Both people still have to accept and confirm."); } catch (error) { toast(error instanceof Error ? error.message : "Could not propose."); } }}>
    <h2>Propose a trade</h2>
    <input value={listingId} onChange={(event) => setListingId(event.target.value)} placeholder="Your listing id" />
    <input value={theirListingId} onChange={(event) => setTheir(event.target.value)} placeholder="Their listing id" />
    <button className="button secondary">Propose. Cash can be added only through the payment ledger.</button>
  </form>;
}

function Alerts({ toast }: { toast: (message: string) => void }) {
  const [searches, setSearches] = useState<{ id: string; query: { q?: string; maxPrice?: number } }[]>([]);
  const [q, setQ] = useState("desk");
  const [maxPrice, setMax] = useState("50");
  useEffect(() => { api<typeof searches>("/saved-searches").then(setSearches).catch(() => setSearches([])); }, []);
  return <section className="stack"><h1>Saved searches</h1>
    <form className="market-row" onSubmit={async (event) => { event.preventDefault(); await api("/saved-searches", { body: { query: { q, maxPrice: Math.round(Number(maxPrice) * 100) }, frequency: "immediate" } }); setSearches(await api("/saved-searches")); toast("You’ll get one alert when a new match is published."); }}>
      <input value={q} onChange={(event) => setQ(event.target.value)} /><input value={maxPrice} onChange={(event) => setMax(event.target.value)} /><button className="button primary">Save search</button>
    </form>
    {searches.map((search) => <p key={search.id}>{search.query.q} under {money(search.query.maxPrice || 0)} <button onClick={async () => { await api(`/saved-searches/${search.id}`, { method: "DELETE" }); setSearches(await api("/saved-searches")); }}>Unsubscribe</button></p>)}
  </section>;
}

function Account({ me, onSignOut, toast }: { me: User | null; onSignOut: () => void; toast: (message: string) => void }) {
  const [name, setName] = useState(me?.displayName || "");
  const [bio, setBio] = useState(me?.bio || "");
  const [sessions, setSessions] = useState<{ id: string; user_agent: string; last_seen_at: string }[]>([]);
  useEffect(() => { api<typeof sessions>("/auth/sessions").then(setSessions).catch(() => setSessions([])); }, []);
  if (!me) return null;
  return <section className="stack">
    <h1>{me.displayName}</h1>
    <button className="button secondary" onClick={() => go("/posts")}>My posts</button>
    <p className="notice">{me.campusVerification?.badge}. {me.campusVerification?.proves}</p>
    <p className="notice">Email stays private: {me.email}. Browsing preference: {me.browseCampus}. That preference does not change your campus membership.</p>
    <label>Display name<input value={name} onChange={(event) => setName(event.target.value)} /></label>
    <label>Bio<textarea value={bio} onChange={(event) => setBio(event.target.value)} /></label>
    <button className="button primary" onClick={async () => { await api("/me", { method: "PATCH", body: { displayName: name, bio } }); toast("Profile saved."); }}>Save profile</button>
    <h2>Sessions</h2>
    {sessions.map((session) => <p key={session.id}>{session.user_agent || "This device"} · {session.last_seen_at} <button onClick={() => api(`/auth/sessions/${session.id}`, { method: "DELETE" })}>Revoke</button></p>)}
    <button className="button secondary" onClick={async () => { const data = await api("/me/export"); const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = "relay-account.json"; link.click(); }}>Download account data</button>
    <button className="button secondary" onClick={onSignOut}>Sign out</button>
    <button className="button secondary" onClick={async () => { const result = await api<{ status: string; detail: string }>("/me/deletion", { method: "POST" }); toast(result.detail); if (result.status === "completed") onSignOut(); }}>Delete account</button>
    <Payouts toast={toast} />
  </section>;
}
function Payouts({ toast }: { toast: (message: string) => void }) {
  const [account, setAccount] = useState<{ status: string; destinationLabel: string | null; requirements: string[]; availableCents: number; payouts: { id: string; amountCents: number; status: string; destinationLabel: string | null }[]; note: string } | null>(null);
  const [destination, setDestination] = useState("Sandbox bank ••42");
  useEffect(() => { api<NonNullable<typeof account>>("/payouts").then(setAccount).catch(() => setAccount(null)); }, []);
  if (!account) return null;
  return <div className="stack"><h2>Payouts</h2><p className="notice">{account.note} Status: {account.status}. Available {money(account.availableCents)}. {account.destinationLabel || account.requirements.join(" ")}</p>
    <form className="market-row" onSubmit={async (event) => { event.preventDefault(); setAccount(await api("/payouts/onboarding", { body: { acceptTerms: true, destinationLabel: destination } })); toast("Payout setup updated."); }}>
      <input value={destination} onChange={(event) => setDestination(event.target.value)} /><button className="button secondary">Save payout destination</button>
    </form>
    {account.payouts.map((payout) => <p key={payout.id}>{money(payout.amountCents)} · {payout.status} · {payout.destinationLabel || "No destination"}</p>)}
  </div>;
}

function ProfilePage({ id }: { id: string }) {
  const [profile, setProfile] = useState<{ user: User; listings: Listing[]; reviews: { count: number; distribution: { accuracy: number | null } } } | null>(null);
  useEffect(() => { api<NonNullable<typeof profile>>(`/users/${id}`).then(setProfile).catch(() => setProfile(null)); }, [id]);
  if (!profile) return <p>Loading profile…</p>;
  return <section><h1>{profile.user.displayName}</h1><p className="notice">{profile.user.campusVerification?.badge}. {profile.user.bio}</p><p>{profile.reviews.count} published reviews{profile.reviews.distribution.accuracy != null ? ` · accuracy ${profile.reviews.distribution.accuracy}` : ""}. {profile.user.completedExchanges} completed exchanges.</p><div className="cards">{profile.listings.map((item) => <ListingCard key={item.id} item={item} />)}</div><BlockButton userId={id} /></section>;
}
function BlockButton({ userId }: { userId: string }) {
  return <button className="button secondary" onClick={() => api("/blocks", { body: { userId } })}>Block new contact</button>;
}
function ReportButton({ targetType, targetId, toast }: { targetType: string; targetId: string; toast: (message: string) => void }) {
  return <button className="button secondary" onClick={async () => { const reason = window.prompt("Why are you reporting this?"); if (!reason) return; await api("/reports", { body: { targetType, targetId, reason } }); toast("Report sent to the campus queue."); }}>Report</button>;
}

function Notifications() {
  const [notes, setNotes] = useState<{ id: string; title: string; preview: string; href: string; readAt: string | null }[]>([]);
  useEffect(() => { api<typeof notes>("/notifications").then(setNotes).catch(() => setNotes([])); }, []);
  return <section>{notes.map((note) => <button key={note.id} className="panel row" onClick={async () => { await api(`/notifications/${note.id}/read`, { method: "POST" }); go(note.href); }}><strong>{note.title}</strong><br />{note.preview}</button>)}{!notes.length && <p>No alerts yet. Lock-screen text stays generic; the detail is in this inbox.</p>}</section>;
}

function Staff({ toast }: { toast: (message: string) => void }) {
  const [queue, setQueue] = useState<{ reports: { id: string; reason: string; targetType: string; targetId: string }[]; signals: { id: string; kind: string; detail: string }[] } | null>(null);
  const [metrics, setMetrics] = useState<string>("");
  useEffect(() => { api<NonNullable<typeof queue>>("/staff/queue").then(setQueue).catch((error) => toast(error.message)); }, []);
  if (!queue) return <p>Staff tools are limited to moderator, support, finance, and admin roles.</p>;
  return <section className="stack"><h1>Review queue</h1>
    {queue.reports.map((report) => <p key={report.id}>{report.targetType} {report.targetId}: {report.reason} <button onClick={async () => { await api("/staff/actions", { body: { action: "resolve_report", targetType: "report", targetId: report.id, reason: "Reviewed the evidence." } }); toast("Decision recorded."); }}>Resolve</button></p>)}
    {queue.signals.map((signal) => <p key={signal.id}>{signal.kind}: {signal.detail}</p>)}
    <button className="button secondary" onClick={async () => setMetrics(JSON.stringify(await api("/staff/metrics"), null, 2))}>Load marketplace metrics</button>
    {metrics && <pre>{metrics}</pre>}
  </section>;
}
