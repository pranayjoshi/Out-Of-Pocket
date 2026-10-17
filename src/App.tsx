import { useState, useEffect, useRef, useMemo } from "react";
import type { FormEvent, ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  ArrowUpRight,
  ArrowRight,
  ArrowLeftRight,
  Check,
  ChevronDown,
  ChevronRight,
  Search,
  Plus,
  X,
  Heart,
  Compass,
  LayoutGrid,
  CalendarDays,
  ShieldCheck,
  GraduationCap,
  MapPin,
  SlidersHorizontal,
  Sparkles,
  Leaf,
  Bell,
  Menu,
  Sofa,
  BookOpen,
  Headphones,
  Bike,
  Gift,
  CheckCheck,
  CircleHelp,
  Settings2,
  Camera,
  Wrench,
  Coffee,
  Ticket,
  Send,
  LockKeyhole,
  PackageCheck,
  ReceiptText,
} from "lucide-react";
import { categories, products as initialProducts, flyers } from "./data";
import type { Category, Product } from "./data";
import { transitionExchange, moneyStatus } from "./lib/exchange.mjs";

type View =
  "Discover" | "My plans" | "Campus board" | "Exchanges" | "Saved finds";
type Order = { product: Product; state: string; meeting: string };
type Plan = { name: string; budget: number; items: string[] };
type Need = { title: string; budget: string; person: string; category: string };
const nav = [
  { name: "Discover", icon: Compass },
  { name: "My plans", icon: LayoutGrid },
  { name: "Campus board", icon: CalendarDays },
  { name: "Exchanges", icon: ArrowLeftRight },
  { name: "Saved finds", icon: Heart },
] as const;
const categoryIcons = [LayoutGrid, Sofa, BookOpen, Headphones, Bike, Gift];
const ease = [0.22, 1, 0.36, 1] as const;
function useStored<T>(key: string, initial: T) {
  const [state, setState] = useState<T>(() => {
    try {
      return JSON.parse(localStorage.getItem(key) || "null") ?? initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {
      /* Storage is optional. */
    }
  }, [key, state]);
  return [state, setState] as const;
}
function Brand({ small = false }: { small?: boolean }) {
  return (
    <span className={`brand ${small ? "small" : ""}`}>
      <span className="brand-symbol">
        <ArrowLeftRight size={23} strokeWidth={2.6} />
      </span>
      relay<span className="brand-period">.</span>
    </span>
  );
}
function Modal({
  children,
  onClose,
  wide = false,
  drawer = false,
  title,
}: {
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  drawer?: boolean;
  title: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    const previous = document.activeElement as HTMLElement;
    el?.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      el?.close();
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? "wide" : ""} ${drawer ? "drawer" : ""}`}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <motion.div
        className="modal-content"
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease }}
      >
        <button
          className="icon-button modal-close"
          onClick={onClose}
          aria-label="Close dialog"
        >
          <X size={20} />
        </button>
        {children}
      </motion.div>
    </dialog>
  );
}
function ProductCard({
  product,
  saved,
  onSave,
  onOpen,
  index = 0,
}: {
  product: Product;
  saved: boolean;
  onSave: () => void;
  onOpen: () => void;
  index?: number;
}) {
  return (
    <motion.article
      className="product-card"
      layout
      initial={{ opacity: 0, y: 22 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.4, delay: Math.min(index * 0.045, 0.25), ease }}
    >
      <div className="product-image-wrap">
        <button
          className={`product-image image-${product.id}`}
          onClick={onOpen}
          aria-label={`View ${product.title}`}
        >
          <img src={product.image} alt={product.title} loading="lazy" />
          {product.tag && (
            <span
              className={`product-tag ${product.price === 0 ? "free" : ""}`}
            >
              {product.price === 0 && <Gift size={12} />} {product.tag}
            </span>
          )}
        </button>
        <motion.button
          whileTap={{ scale: 0.8 }}
          className={`save-button ${saved ? "saved" : ""}`}
          aria-label={
            saved ? `Unsave ${product.title}` : `Save ${product.title}`
          }
          aria-pressed={saved}
          onClick={onSave}
        >
          <Heart size={17} fill={saved ? "currentColor" : "none"} />
        </motion.button>
      </div>
      <div className="product-topline">
        <span>{product.category}</span>
        <span className="condition-dot" />
        {product.condition}
      </div>
      <button className="product-title" onClick={onOpen}>
        {product.title}
      </button>
      <div className="product-bottom">
        <div className="product-price">
          {product.price === 0 ? "On the house" : `$${product.price}`}
          {product.original && <s>${product.original}</s>}
        </div>
        <span className="product-distance">
          <MapPin size={12} />
          {product.location}
        </span>
      </div>
      <div className="product-seller">
        <span className="mini-avatar" style={{ background: product.color }}>
          {product.initials}
        </span>
        <span>{product.seller}</span>
        <ShieldCheck size={12} />
        <span className="seller-school">
          {product.campus === "Alabama" ? "UA" : "AU"}
        </span>
      </div>
    </motion.article>
  );
}
function Empty({
  icon: Icon,
  title,
  description,
  action,
  label,
}: {
  icon: typeof Heart;
  title: string;
  description: string;
  action?: () => void;
  label?: string;
}) {
  return (
    <div className="empty-state">
      <span>
        <Icon size={30} />
      </span>
      <h2>{title}</h2>
      <p>{description}</p>
      {action && (
        <button className="button primary" onClick={action}>
          {label}
          <ArrowRight size={16} />
        </button>
      )}
    </div>
  );
}

export default function App() {
  const [view, setView] = useState<View>("Discover");
  const [category, setCategory] = useState<Category>("All finds");
  const [query, setQuery] = useState("");
  const [campus, setCampus] = useStored("relay-campus", "Alabama");
  const [campusMenu, setCampusMenu] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [isMobile, setIsMobile] = useState(
    () => window.matchMedia("(max-width: 760px)").matches,
  );
  useEffect(() => {
    const media = window.matchMedia("(max-width: 760px)");
    const update = () => setIsMobile(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const menuWasOpen = useRef(false);
  useEffect(() => {
    if (isMobile && mobileMenu) {
      document.querySelector<HTMLButtonElement>(".sidebar .brand-button")?.focus();
    } else if (isMobile && menuWasOpen.current) {
      document.querySelector<HTMLButtonElement>(".mobile-menu")?.focus();
    }
    menuWasOpen.current = mobileMenu;
  }, [isMobile, mobileMenu]);
  const [saved, setSaved] = useStored<string[]>("relay-saved", []);
  const [customProducts, setCustomProducts] = useStored<Product[]>(
    "relay-listings",
    [],
  );
  const [plan, setPlan] = useStored<Plan | null>("relay-plan", null);
  const [orders, setOrders] = useStored<Order[]>("relay-orders", []);
  const [rsvps, setRsvps] = useStored<string[]>("relay-rsvps", []);
  const [needs, setNeeds] = useStored<Need[]>("relay-needs", [
    {
      title: "A desk that fits a tiny dorm",
      budget: "Under $50",
      person: "Jamie",
      category: "Dorm & living",
    },
    {
      title: "A bike for the rest of the semester",
      budget: "Under $100",
      person: "Taylor",
      category: "Getting around",
    },
  ]);
  const [selected, setSelected] = useState<Product | null>(null);
  const [activeOrder, setActiveOrder] = useState<number | null>(null);
  const [modal, setModal] = useState<
    "sell" | "plan" | "request" | "safety" | "notifications" | "settings" | null
  >(null);
  const [selectedFlyer, setSelectedFlyer] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [sort, setSort] = useState("recommended");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [freeOnly, setFreeOnly] = useState(false);
  const [crossCampus, setCrossCampus] = useState(false);
  const [meeting, setMeeting] = useState("Tomorrow · 3:00 PM");
  const [inspection, setInspection] = useState<boolean[]>([
    false,
    false,
    false,
  ]);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState("");
  const reducedMotion = useReducedMotion();
  const products = [...customProducts, ...initialProducts];
  const shownProducts = useMemo(() => {
    let items = products.filter(
      (p) =>
        (crossCampus || p.campus === campus) &&
        (category === "All finds" || p.category === category) &&
        (!freeOnly || p.price === 0) &&
        (!query ||
          `${p.title} ${p.category} ${p.description}`
            .toLowerCase()
            .includes(query.toLowerCase())),
    );
    if (view === "Saved finds")
      items = items.filter((p) => saved.includes(p.id));
    if (sort === "low") items.sort((a, b) => a.price - b.price);
    if (sort === "high") items.sort((a, b) => b.price - a.price);
    return items;
  }, [
    customProducts,
    campus,
    crossCampus,
    category,
    freeOnly,
    query,
    view,
    saved,
    sort,
  ]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    setInspection([false, false, false]);
    setPin("");
    setPinError("");
  }, [activeOrder]);
  function navigate(next: View) {
    setView(next);
    setMobileMenu(false);
    setQuery("");
    setCategory("All finds");
    setFiltersOpen(false);
    window.scrollTo({ top: 0, behavior: reducedMotion ? "instant" : "smooth" });
  }
  function save(id: string) {
    setSaved((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }
  function addToPlan(product: Product) {
    setPlan((prev) =>
      prev
        ? {
            ...prev,
            items: prev.items.includes(product.id)
              ? prev.items
              : [...prev.items, product.id],
          }
        : { name: "My next chapter", budget: 150, items: [product.id] },
    );
    setToast("Added to your plan. A good start.");
    setSelected(null);
  }
  function reserve() {
    if (!selected) return;
    const existing = orders.findIndex(
      (o) =>
        o.product.id === selected.id &&
        !["canceled", "refunded"].includes(o.state),
    );
    if (existing >= 0) {
      setSelected(null);
      setActiveOrder(existing);
      return;
    }
    const order = { product: selected, state: "reserved", meeting };
    setOrders((prev) => [...prev, order]);
    setSelected(null);
    setActiveOrder(orders.length);
    setToast("Exchange reserved in demo. No money collected.");
  }
  function orderAction(event: string) {
    if (activeOrder === null) return;
    setOrders((prev) =>
      prev.map((o, i) =>
        i === activeOrder
          ? { ...o, state: transitionExchange(o.state, event) }
          : o,
      ),
    );
    if (event === "CANCEL")
      setToast("Exchange canceled. No payment was captured.");
  }
  const planProducts = products.filter((p) => plan?.items.includes(p.id));
  const planTotal = planProducts.reduce((n, p) => n + p.price, 0);
  const order = activeOrder === null ? null : orders[activeOrder];
  const currentFlyer = flyers.find((f) => f.id === selectedFlyer);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to campus content
      </a>
      <aside
        className={`sidebar ${mobileMenu ? "is-open" : ""}`}
        role={isMobile && mobileMenu ? "dialog" : undefined}
        aria-modal={isMobile && mobileMenu ? true : undefined}
        aria-label={isMobile && mobileMenu ? "Campus navigation" : undefined}
        inert={isMobile && !mobileMenu ? true : undefined}
        onKeyDown={(event) => {
          if (!isMobile || !mobileMenu) return;
          if (event.key === "Escape") setMobileMenu(false);
          if (event.key !== "Tab") return;
          const buttons =
            event.currentTarget.querySelectorAll<HTMLButtonElement>("button");
          const first = buttons[0];
          const last = buttons[buttons.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }}
      >
        <button
          className="brand-button"
          onClick={() => navigate("Discover")}
          aria-label="Relay home"
        >
          <Brand />
        </button>
        <div className="sidebar-caption">A LITTLE MORE LOCAL.</div>
        <nav className="main-nav" aria-label="Main navigation">
          {nav.map(({ name, icon: Icon }) => (
            <button
              key={name}
              className={`nav-item ${view === name ? "active" : ""}`}
              onClick={() => navigate(name)}
              aria-current={view === name ? "page" : undefined}
            >
              {view === name && (
                <motion.span
                  layoutId="nav-active"
                  className="nav-active"
                  transition={{ type: "spring", stiffness: 450, damping: 38 }}
                />
              )}
              <Icon size={19} />
              <span>{name}</span>
              {name === "Saved finds" && saved.length > 0 && (
                <span className="nav-count">{saved.length}</span>
              )}
              {name === "Exchanges" &&
                orders.filter(
                  (o) => !["canceled", "refunded"].includes(o.state),
                ).length > 0 && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <button
          className="sidebar-sell button primary"
          onClick={() => setModal("sell")}
        >
          <Plus size={18} />
          Give something a next chapter
        </button>
        <div className="sidebar-bottom">
          <button className="trust-card" onClick={() => setModal("safety")}>
            <span className="trust-icon">
              <ShieldCheck size={22} />
            </span>
            <strong>
              Small campus.
              <br />
              Big peace of mind.
            </strong>
            <p>Thoughtful exchanges start with a little trust.</p>
            <span>
              Meet the Relay way
              <ArrowUpRight size={15} />
            </span>
          </button>
          <div className="sidebar-links">
            <button onClick={() => setModal("safety")}>
              <CircleHelp size={16} /> Help & safety
            </button>
            <button onClick={() => setModal("settings")}>
              <Settings2 size={16} /> Your preferences
            </button>
          </div>
          <button className="profile" onClick={() => setModal("settings")}>
            <span className="avatar">Y</span>
            <span>
              <strong>Your campus era</strong>
              <small>Student preview</small>
            </span>
            <ChevronDown size={15} />
          </button>
        </div>
      </aside>
      {mobileMenu && (
        <button
          className="mobile-scrim"
          aria-label="Close navigation"
          onClick={() => setMobileMenu(false)}
        />
      )}
      <div
        className="main-shell"
        inert={isMobile && mobileMenu ? true : undefined}
      >
        <header className="topbar">
          <div className="topbar-start">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMobileMenu(true)}
            >
              <Menu size={22} />
            </button>
            <div className="campus-picker">
              <button
                onClick={() => setCampusMenu(!campusMenu)}
                className="campus-button"
                aria-expanded={campusMenu}
              >
                <span className="campus-icon">
                  <GraduationCap size={19} />
                </span>
                <span>
                  {campus === "Alabama"
                    ? "University of Alabama"
                    : "Auburn University"}
                </span>
                <ChevronDown size={14} />
              </button>
              <AnimatePresence>
                {campusMenu && (
                  <>
                    <button
                      className="dropdown-scrim"
                      aria-label="Close campus selector"
                      onClick={() => setCampusMenu(false)}
                    />
                    <motion.div
                      className="campus-dropdown"
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -5 }}
                    >
                      <span className="eyebrow">YOUR COMMUNITY</span>
                      {["Alabama", "Auburn"].map((c) => (
                        <button
                          key={c}
                          onClick={() => {
                            setCampus(c);
                            setCampusMenu(false);
                            setToast(`You're exploring ${c}.`);
                            setCategory("All finds");
                          }}
                        >
                          <GraduationCap size={17} />
                          {c === "Alabama"
                            ? "University of Alabama"
                            : "Auburn University"}
                          {campus === c && <Check size={16} />}
                        </button>
                      ))}
                      <small>Sample campuses · no university affiliation</small>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
            <span className="topbar-divider" />
            <span className="campus-status">
              <span />
              Campus mode
            </span>
          </div>
          <div className="topbar-actions">
            <span className="prototype-label">INTERACTIVE PREVIEW</span>
            <button
              className="notification-button icon-button"
              aria-label="Notifications"
              onClick={() => setModal("notifications")}
            >
              <Bell size={19} />
              <span />
            </button>
            <button
              className="top-avatar"
              onClick={() => setModal("settings")}
              aria-label="Open your preferences"
            >
              Y
            </button>
          </div>
        </header>
        <main id="main-content">
          <AnimatePresence mode="wait">
            <motion.div
              key={view}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25, ease }}
            >
              {view === "Discover" && (
                <>
                  <div className="page-heading">
                    <div>
                      <div className="eyebrow greeting">
                        <span className="sun-icon">✳</span> GOOD FINDS. GOOD
                        PEOPLE.
                      </div>
                      <h1>
                        Your campus, in circulation<span>.</span>
                      </h1>
                      <p>Less buying new. More finding your kind of thing.</p>
                    </div>
                    <button
                      className="text-button request-link"
                      onClick={() => setModal("request")}
                    >
                      Looking for something?
                      <ArrowUpRight size={16} />
                    </button>
                  </div>
                  <div className="feature-grid">
                    <section className="hero">
                      <div className="hero-text">
                        <span className="hero-kicker">
                          <span /> THE NEXT CHAPTER STARTS HERE
                        </span>
                        <h2>
                          Good things
                          <br />
                          deserve a<br />
                          <span>second story.</span>
                        </h2>
                        <p>
                          From their favorite corner
                          <br />
                          to your new beginning.
                        </p>
                        <button
                          className="button dark"
                          onClick={() => {
                            setCategory("Dorm & living");
                            document.getElementById("finds")?.scrollIntoView({
                              behavior: reducedMotion ? "instant" : "smooth",
                              block: "start",
                            });
                          }}
                        >
                          Find your next thing
                          <ArrowUpRight size={17} />
                        </button>
                        <div className="hero-community">
                          <div className="avatar-stack">
                            <span>J</span>
                            <span>A</span>
                            <span>M</span>
                            <span>S</span>
                          </div>
                          <span>
                            Made for the people
                            <br />
                            <strong>who make your campus.</strong>
                          </span>
                        </div>
                      </div>
                      <div className="hero-art">
                        <div className="hero-orbit" />
                        <motion.div
                          className="hero-photo photo-back"
                          animate={
                            reducedMotion
                              ? {}
                              : { y: [0, -6, 0], rotate: [9, 11, 9] }
                          }
                          transition={{
                            duration: 7,
                            repeat: Infinity,
                            ease: "easeInOut",
                          }}
                        >
                          <img
                            src="/images/lamp.jpg"
                            alt="A warm lamp ready for its next home"
                          />
                          <div>
                            <span>LIGHT UP YOUR SPACE</span>
                            <strong>
                              Late-night companion <span>$18</span>
                            </strong>
                          </div>
                        </motion.div>
                        <motion.button
                          className="hero-photo photo-front"
                          onClick={() => setSelected(initialProducts[0])}
                          animate={
                            reducedMotion
                              ? {}
                              : { y: [0, 7, 0], rotate: [-9, -7, -9] }
                          }
                          transition={{
                            duration: 8,
                            repeat: Infinity,
                            ease: "easeInOut",
                          }}
                          whileHover={{ scale: 1.03 }}
                        >
                          <img
                            src="/images/chair.jpg"
                            alt="Discover a student’s pre-loved reading chair"
                          />
                          <div>
                            <span>A NEW HOME LOOKS GOOD ON IT</span>
                            <strong>
                              Someone’s favorite. Yours next.
                              <ArrowUpRight size={15} />
                            </strong>
                          </div>
                        </motion.button>
                        <motion.div
                          className="round-sticker"
                          animate={reducedMotion ? {} : { rotate: [8, 0, 8] }}
                          transition={{ duration: 9, repeat: Infinity }}
                        >
                          <ArrowLeftRight size={24} />
                          <span>
                            PRE-LOVED.
                            <br />
                            RE-LOVED.
                          </span>
                        </motion.div>
                        <div className="art-scribble">
                          a good kind of
                          <br />
                          <span>hand-me-down ↗</span>
                        </div>
                      </div>
                    </section>
                    <section className="planner-card">
                      <div className="planner-top">
                        <span className="planner-icon">
                          <Sparkles size={20} />
                        </span>
                        <span className="tiny-label">
                          A LITTLE PLANNING, A LOT LESS SPENDING
                        </span>
                      </div>
                      <h2>
                        New chapter?
                        <br />
                        We’ll help you
                        <br />
                        piece it together.
                      </h2>
                      <p>
                        A cozy dorm. A fresh semester.
                        <br />A plan that fits your budget.
                      </p>
                      <div className="planner-visual">
                        <span className="plan-object chair-object">
                          <Sofa size={36} />
                          <span>$45</span>
                        </span>
                        <span className="plan-object book-object">
                          <BookOpen size={30} />
                          <span>$24</span>
                        </span>
                        <span className="plan-object lamp-object">
                          <Leaf size={29} />
                          <span>FREE</span>
                        </span>
                        <span className="plan-plus">+</span>
                        <div className="plan-dotted" />
                      </div>
                      <button
                        className="button planner-button"
                        onClick={() => setModal("plan")}
                      >
                        {plan ? "Open your setup plan" : "Build my setup"}
                        <ArrowUpRight size={17} />
                      </button>
                    </section>
                  </div>
                  <div className="values-strip">
                    <span>
                      <ShieldCheck size={16} />
                      Thoughtful, safer exchanges
                    </span>
                    <span>
                      <ArrowLeftRight size={16} />
                      Buy, sell, or pass it on
                    </span>
                    <span>
                      <Leaf size={16} />
                      Good for your pocket. Better for the planet.
                    </span>
                    <button onClick={() => setModal("safety")}>
                      How Relay works
                      <ArrowUpRight size={14} />
                    </button>
                  </div>
                </>
              )}
              {(view === "Discover" || view === "Saved finds") && (
                <section className="finds-section" id="finds">
                  <div className="section-heading">
                    <div>
                      <span className="eyebrow">
                        {view === "Discover"
                          ? "THE GOOD STUFF, CLOSE BY"
                          : "YOUR LITTLE COLLECTION"}
                      </span>
                      <h2>
                        {view === "Discover"
                          ? "A few finds with your name on them."
                          : "Worth coming back for."}
                        <span className="heading-spark">✳</span>
                      </h2>
                    </div>
                    <div className="sort-control">
                      <span>Sort by</span>
                      <select
                        aria-label="Sort listings"
                        value={sort}
                        onChange={(e) => setSort(e.target.value)}
                      >
                        <option value="recommended">For you</option>
                        <option value="low">Price: low to high</option>
                        <option value="high">Price: high to low</option>
                      </select>
                    </div>
                  </div>
                  <div className="discovery-toolbar">
                    <div
                      className="category-list"
                      aria-label="Listing categories"
                    >
                      {categories.map((c, i) => {
                        const Icon = categoryIcons[i];
                        return (
                          <button
                            key={c}
                            className={`category-chip ${category === c ? "selected" : ""}`}
                            onClick={() => setCategory(c)}
                            aria-pressed={category === c}
                          >
                            <Icon size={15} />
                            {c}
                          </button>
                        );
                      })}
                    </div>
                    <button
                      className={`filter-button ${filtersOpen ? "selected" : ""}`}
                      aria-label="Filters"
                      onClick={() => setFiltersOpen(!filtersOpen)}
                      aria-expanded={filtersOpen}
                    >
                      <SlidersHorizontal size={16} />
                      <span>Filters</span>
                      {(freeOnly || crossCampus) && (
                        <span className="filter-indicator" />
                      )}
                    </button>
                  </div>
                  <div className="search-line">
                    <Search size={17} />
                    <input
                      aria-label="Search campus listings"
                      placeholder="A desk, a textbook, your next favorite thing…"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                    {query && (
                      <button
                        className="icon-button"
                        onClick={() => setQuery("")}
                        aria-label="Clear search"
                      >
                        <X size={15} />
                      </button>
                    )}
                    <span>
                      {shownProducts.length} good{" "}
                      {shownProducts.length === 1 ? "find" : "finds"}
                    </span>
                  </div>
                  <AnimatePresence>
                    {filtersOpen && (
                      <motion.div
                        className="filter-panel"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                      >
                        <label>
                          <input
                            type="checkbox"
                            checked={freeOnly}
                            onChange={(e) => setFreeOnly(e.target.checked)}
                          />
                          Free finds only
                        </label>
                        <label>
                          <input
                            type="checkbox"
                            checked={crossCampus}
                            onChange={(e) => setCrossCampus(e.target.checked)}
                          />
                          Include other campuses
                        </label>
                        <button
                          className="text-button"
                          onClick={() => {
                            setFreeOnly(false);
                            setCrossCampus(false);
                            setCategory("All finds");
                            setQuery("");
                          }}
                        >
                          Reset filters
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  <motion.div className="product-grid" layout>
                    <AnimatePresence mode="popLayout">
                      {shownProducts.map((p, i) => (
                        <ProductCard
                          key={p.id}
                          product={p}
                          index={i}
                          saved={saved.includes(p.id)}
                          onSave={() => save(p.id)}
                          onOpen={() => setSelected(p)}
                        />
                      ))}
                    </AnimatePresence>
                  </motion.div>
                  {!shownProducts.length && (
                    <Empty
                      icon={view === "Saved finds" ? Heart : Search}
                      title={
                        view === "Saved finds"
                          ? "Your next favorite is out there."
                          : "Let’s find another way."
                      }
                      description={
                        view === "Saved finds"
                          ? "Tap a heart on any listing to keep it here."
                          : "Try another search, explore other campuses, or tell the community what you need."
                      }
                      label={
                        view === "Saved finds"
                          ? "Explore campus finds"
                          : "Post a request"
                      }
                      action={() =>
                        view === "Saved finds"
                          ? navigate("Discover")
                          : setModal("request")
                      }
                    />
                  )}
                </section>
              )}
              {view === "Discover" && (
                <>
                  <div className="community-grid">
                    <section className="needs-card">
                      <div className="section-heading">
                        <div>
                          <span className="eyebrow">
                            SOMEONE’S LOOKING FOR YOU
                          </span>
                          <h2>Got just the thing?</h2>
                        </div>
                        <button
                          className="circle-arrow"
                          aria-label="Post your own request"
                          onClick={() => setModal("request")}
                        >
                          <Plus size={20} />
                        </button>
                      </div>
                      {needs.slice(0, 2).map((n, i) => (
                        <div className="need-row" key={i}>
                          <span className="need-avatar">{n.person[0]}</span>
                          <div>
                            <strong>{n.title}</strong>
                            <span>
                              {n.person} is looking · {n.budget}
                            </span>
                          </div>
                          <button
                            aria-label={`Respond to ${n.title}`}
                            onClick={() => {
                              setModal("sell");
                              setToast(
                                `Create a listing for ${n.person}. They'll be able to find it here.`,
                              );
                            }}
                          >
                            <ArrowUpRight size={19} />
                          </button>
                        </div>
                      ))}
                    </section>
                    <button
                      className="sponsor-card"
                      onClick={() => setSelectedFlyer("coffee")}
                    >
                      <span className="eyebrow">
                        SPONSORED · SAMPLE CAMPAIGN
                      </span>
                      <div>
                        <h2>
                          Good finds.
                          <br />
                          Great coffee.
                        </h2>
                        <span className="coffee-illustration">
                          <Coffee size={51} strokeWidth={1.25} />
                        </span>
                      </div>
                      <p>
                        Your neighborhood café could help
                        <br />
                        make the next exchange a little sweeter.
                      </p>
                      <span className="sponsor-bottom">
                        Meet the campus partner idea
                        <ArrowUpRight size={18} />
                      </span>
                    </button>
                  </div>
                  <div className="board-peek">
                    <div>
                      <span className="eyebrow">BEYOND THE BUY & SELL</span>
                      <h2>A little more campus connection.</h2>
                      <p>
                        Good things happening, from swap meets to fix-it
                        afternoons.
                      </p>
                    </div>
                    <button
                      className="button secondary"
                      onClick={() => navigate("Campus board")}
                    >
                      Explore the campus board
                      <ArrowUpRight size={16} />
                    </button>
                  </div>
                </>
              )}
              {view === "My plans" && (
                <>
                  <PageTitle
                    eyebrow="MAKE ROOM FOR WHAT’S NEXT"
                    title="A new chapter. A little plan."
                    description="Piece together the things you need, at a price that feels right."
                  />
                  <div className="plans-layout">
                    <section className="plan-main">
                      <div className="plan-header">
                        <div>
                          <span className="eyebrow">YOUR SETUP</span>
                          <h2>
                            {plan?.name || "Your first setup starts here."}
                          </h2>
                        </div>
                        <button
                          className="button secondary"
                          onClick={() => setModal("plan")}
                        >
                          <Settings2 size={16} />
                          {plan ? "Edit plan" : "Create plan"}
                        </button>
                      </div>
                      {planProducts.length ? (
                        <div className="plan-items">
                          {planProducts.map((p) => (
                            <div className="plan-item" key={p.id}>
                              <img src={p.image} alt={p.title} />
                              <div>
                                <strong>{p.title}</strong>
                                <span>
                                  {p.condition} · {p.campus}
                                </span>
                                <button
                                  className="text-button"
                                  onClick={() => setSelected(p)}
                                >
                                  View find
                                  <ArrowUpRight size={13} />
                                </button>
                              </div>
                              <strong>${p.price}</strong>
                              <button
                                className="icon-button"
                                aria-label={`Remove ${p.title} from plan`}
                                onClick={() =>
                                  setPlan((prev) =>
                                    prev
                                      ? {
                                          ...prev,
                                          items: prev.items.filter(
                                            (id) => id !== p.id,
                                          ),
                                        }
                                      : prev,
                                  )
                                }
                              >
                                <X size={16} />
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <Empty
                          icon={Sofa}
                          title="A space that feels like you."
                          description="Add finds from the marketplace to see your setup come together."
                          action={() => navigate("Discover")}
                          label="Find the first piece"
                        />
                      )}
                      <button
                        className="add-piece"
                        onClick={() => navigate("Discover")}
                      >
                        <Plus size={19} />
                        Find another piece
                      </button>
                    </section>
                    <aside className="budget-card">
                      <span className="eyebrow">BIG PLANS. LITTLE BUDGET.</span>
                      <h3>Room for the good stuff.</h3>
                      <div className="budget-number">
                        ${planTotal}
                        <span> / ${plan?.budget || 150}</span>
                      </div>
                      <div className="budget-track">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{
                            width: `${Math.min((planTotal / (plan?.budget || 150)) * 100, 100)}%`,
                          }}
                        />
                      </div>
                      <p>
                        {planTotal > (plan?.budget || 150)
                          ? `$${planTotal - (plan?.budget || 150)} over budget. Try swapping a piece.`
                          : `$${(plan?.budget || 150) - planTotal} left for whatever’s next.`}
                      </p>
                      <div className="budget-note">
                        <ShieldCheck size={20} />
                        <span>
                          Each item is reserved and inspected separately. Adding
                          to your plan doesn’t commit you to a purchase.
                        </span>
                      </div>
                      <button
                        className="button primary"
                        onClick={() => navigate("Discover")}
                      >
                        Keep exploring
                        <ArrowRight size={16} />
                      </button>
                    </aside>
                  </div>
                  <div className="future-relay">
                    <span>
                      <ArrowLeftRight size={29} />
                    </span>
                    <div>
                      <span className="eyebrow">COMING FULL CIRCLE</span>
                      <h3>Today’s good find. Next semester’s head start.</h3>
                      <p>
                        Your plan stays here. When you’re ready to pass
                        something on, create a new listing with updated photos
                        and condition.
                      </p>
                    </div>
                  </div>
                </>
              )}
              {view === "Campus board" && (
                <>
                  <PageTitle
                    eyebrow="MORE THAN A MARKETPLACE"
                    title="Good things are happening."
                    description="A campus noticeboard with a little more life in it."
                  />
                  <div className="board-banner">
                    <span>
                      <Ticket size={28} />
                    </span>
                    <div>
                      <strong>
                        Less lost in the group chat. More actually showing up.
                      </strong>
                      <p>
                        Explore sample campus events and save the ones that feel
                        like you.
                      </p>
                    </div>
                    <span className="sample-chip">SAMPLE EVENTS</span>
                  </div>
                  <div className="flyer-grid">
                    {flyers.map((f, i) => (
                      <motion.button
                        key={f.id}
                        className={`flyer ${f.theme}`}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.1 }}
                        whileHover={{ y: -6, rotate: i % 2 ? 1 : -1 }}
                        onClick={() => setSelectedFlyer(f.id)}
                      >
                        <span className="flyer-tape" />
                        <div className="flyer-top">
                          <span>{f.type}</span>
                          <ArrowUpRight size={19} />
                        </div>
                        <h2>{f.title}</h2>
                        <div className="flyer-art">
                          {f.icon === "repair" ? (
                            <Wrench size={94} strokeWidth={1.2} />
                          ) : f.icon === "coffee" ? (
                            <Coffee size={94} strokeWidth={1.2} />
                          ) : (
                            <ArrowLeftRight size={94} strokeWidth={1.2} />
                          )}
                          <span className="flyer-star">✳</span>
                        </div>
                        <p>{f.description}</p>
                        <div className="flyer-bottom">
                          <span>{f.date}</span>
                          <span>
                            {rsvps.includes(f.id) ? "SAVED ✓" : f.time}
                          </span>
                        </div>
                      </motion.button>
                    ))}
                  </div>
                  <section className="board-requests">
                    <div className="section-heading">
                      <div>
                        <span className="eyebrow">THE COMMUNITY ASK</span>
                        <h2>A little help goes a long way.</h2>
                      </div>
                      <button
                        className="button secondary"
                        onClick={() => setModal("request")}
                      >
                        <Plus size={16} />
                        Post a request
                      </button>
                    </div>
                    {needs.map((n, i) => (
                      <div className="need-row" key={i}>
                        <span className="need-avatar">{n.person[0]}</span>
                        <div>
                          <strong>{n.title}</strong>
                          <span>
                            {n.person} · {n.budget} · {n.category}
                          </span>
                        </div>
                        <button
                          aria-label={`Respond to ${n.title}`}
                          onClick={() => setModal("sell")}
                        >
                          <ArrowUpRight size={19} />
                        </button>
                      </div>
                    ))}
                  </section>
                </>
              )}
              {view === "Exchanges" && (
                <>
                  <PageTitle
                    eyebrow="A THOUGHTFUL WAY TO HAND THINGS OVER"
                    title="From their hands to yours."
                    description="Clear steps. A little reassurance. Every exchange in one place."
                  />
                  <div className="demo-banner">
                    <LockKeyhole size={18} />
                    <span>
                      <strong>You’re in the payment playground.</strong> All
                      orders and payments are simulated. No cards, charges, or
                      real reservations.
                    </span>
                  </div>
                  {orders.length ? (
                    <div className="orders-list">
                      {orders.map((o, i) => (
                        <button
                          className="order-card"
                          key={i}
                          onClick={() => setActiveOrder(i)}
                        >
                          <img src={o.product.image} alt={o.product.title} />
                          <div>
                            <span
                              className={`status-badge ${["canceled", "case-open"].includes(o.state) ? "neutral" : ""}`}
                            >
                              {o.state.replaceAll("-", " ")}
                            </span>
                            <h3>{o.product.title}</h3>
                            <span>
                              <CalendarDays size={14} />
                              {o.meeting} · {o.product.location}
                            </span>
                          </div>
                          <strong>${o.product.price}</strong>
                          <ArrowUpRight size={20} />
                        </button>
                      ))}
                    </div>
                  ) : (
                    <Empty
                      icon={ArrowLeftRight}
                      title="Your next exchange starts with a good find."
                      description="Reserve a sample listing to try the complete handoff and payment experience."
                      action={() => navigate("Discover")}
                      label="Find something good"
                    />
                  )}
                </>
              )}
            </motion.div>
          </AnimatePresence>
          <footer className="footer">
            <Brand small />
            <span>A little less new. A little more you.</span>
            <button onClick={() => setModal("safety")}>
              Made for thoughtful exchanges
              <ArrowUpRight size={13} />
            </button>
          </footer>
        </main>
      </div>
      <AnimatePresence>
        {toast && (
          <motion.div
            role="status"
            className="toast"
            initial={{ opacity: 0, y: 25, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12 }}
          >
            <span>
              <Check size={15} />
            </span>
            {toast}
            <button
              onClick={() => setToast("")}
              aria-label="Dismiss notification"
            >
              <X size={15} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {selected && (
        <Modal drawer title={selected.title} onClose={() => setSelected(null)}>
          <div className="detail-image">
            <img src={selected.image} alt={selected.title} />
            <span className="detail-condition">{selected.condition}</span>
          </div>
          <div className="detail-body">
            <div className="eyebrow">
              {selected.category} ·{" "}
              {selected.campus === "Alabama"
                ? "UNIVERSITY OF ALABAMA"
                : "AUBURN UNIVERSITY"}
            </div>
            <h2>{selected.title}</h2>
            <div className="detail-price">
              {selected.price ? `$${selected.price}` : "Free to a good home"}
              {selected.original && <s>${selected.original} new</s>}
              <button
                className={`icon-button ${saved.includes(selected.id) ? "heart-active" : ""}`}
                aria-label="Save this find"
                aria-pressed={saved.includes(selected.id)}
                onClick={() => save(selected.id)}
              >
                <Heart
                  size={21}
                  fill={saved.includes(selected.id) ? "currentColor" : "none"}
                />
              </button>
            </div>
            <div className="detail-seller">
              <span className="avatar" style={{ background: selected.color }}>
                {selected.initials}
              </span>
              <span>
                <strong>{selected.seller}</strong>
                <small>Sample student profile · affiliation unverified</small>
              </span>
            </div>
            <p className="detail-description">{selected.description}</p>
            <div className="detail-section">
              <h3>
                <MapPin size={17} />
                Plan a thoughtful handoff
              </h3>
              <p>
                {selected.location} · agree on a public location with the
                seller.
              </p>
              <label className="field-label" htmlFor="meeting">
                Preferred sample time
              </label>
              <select
                id="meeting"
                value={meeting}
                onChange={(e) => setMeeting(e.target.value)}
              >
                <option>Tomorrow · 3:00 PM</option>
                <option>Tomorrow · 5:00 PM</option>
                <option>This Saturday · 11:00 AM</option>
              </select>
            </div>
            <div className="safety-inline">
              <ShieldCheck size={21} />
              <span>
                <strong>Look it over. Then make it yours.</strong>Identification
                is separate from accepting the item. Inspect before approving
                payment.
              </span>
            </div>
            <button className="button primary full" onClick={reserve}>
              Try the exchange demo
              <ArrowUpRight size={17} />
            </button>
            <button
              className="button secondary full"
              onClick={() => addToPlan(selected)}
            >
              <Plus size={17} />
              Add to my setup plan
            </button>
            <small className="disclosure">
              Sample listing · no live reservation or payment.
            </small>
          </div>
        </Modal>
      )}

      {modal === "plan" && (
        <Modal title="Build your setup" onClose={() => setModal(null)}>
          <span className="modal-symbol">
            <Sparkles size={26} />
          </span>
          <span className="eyebrow">LET’S PIECE IT TOGETHER</span>
          <h2>
            A little plan.
            <br />A place that feels like you.
          </h2>
          <p className="modal-intro">
            Give your next chapter a name and a budget. You can add and swap
            pieces as you go.
          </p>
          <form
            onSubmit={(e: FormEvent<HTMLFormElement>) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              setPlan({
                name: String(data.get("name")),
                budget: Number(data.get("budget")),
                items: plan?.items || [],
              });
              setModal(null);
              navigate("My plans");
              setToast("Your next chapter is taking shape.");
            }}
          >
            <label className="field-label" htmlFor="plan-name">
              What are you planning?
            </label>
            <input
              id="plan-name"
              name="name"
              required
              maxLength={70}
              defaultValue={plan?.name || "My cozy campus corner"}
              placeholder="My first dorm, semester essentials…"
            />
            <label className="field-label" htmlFor="budget">
              Your comfortable budget ($)
            </label>
            <input
              id="budget"
              name="budget"
              type="number"
              min="1"
              max="10000"
              required
              defaultValue={plan?.budget || 150}
            />
            <div className="form-note">
              <Leaf size={17} />A good setup doesn’t have to start with brand
              new.
            </div>
            <button className="button primary full" type="submit">
              {plan ? "Save my plan" : "Make a little room for good things"}
              <ArrowRight size={16} />
            </button>
          </form>
        </Modal>
      )}

      {modal === "sell" && (
        <Modal title="Create a listing" onClose={() => setModal(null)}>
          <span className="modal-symbol">
            <Camera size={25} />
          </span>
          <span className="eyebrow">SOMEONE’S NEXT FAVORITE THING</span>
          <h2>Give it a next chapter.</h2>
          <p className="modal-intro">
            Create a local demo listing. Be honest about condition and keep
            personal details out of your description.
          </p>
          <form
            onSubmit={(e: FormEvent<HTMLFormElement>) => {
              e.preventDefault();
              const d = new FormData(e.currentTarget);
              const cat = String(d.get("category")) as Category;
              const image =
                cat === "Tech"
                  ? "/images/headphones.jpg"
                  : cat === "Textbooks"
                    ? "/images/books.jpg"
                    : cat === "Getting around"
                      ? "/images/bike.jpg"
                      : cat === "Free stuff"
                        ? "/images/plant.jpg"
                        : "/images/chair.jpg";
              setCustomProducts((prev) => [
                {
                  id: crypto.randomUUID(),
                  title: String(d.get("title")),
                  category: cat,
                  price: Number(d.get("price")),
                  image,
                  seller: "You",
                  initials: "Y",
                  color: "#d5dfce",
                  condition: String(d.get("condition")),
                  location: "Public location to be agreed",
                  campus,
                  description: String(d.get("description")),
                  checks: [
                    "Item matches the description",
                    "Condition and parts have been checked",
                    "You are comfortable accepting this item",
                  ],
                },
                ...prev,
              ]);
              setModal(null);
              navigate("Discover");
              setToast("Your demo listing is live in this browser.");
            }}
          >
            <label className="field-label" htmlFor="listing-title">
              What are you passing on?
            </label>
            <input
              id="listing-title"
              name="title"
              required
              maxLength={80}
              placeholder="A desk with a lot of good stories…"
            />
            <div className="form-columns">
              <div>
                <label className="field-label" htmlFor="listing-category">
                  Category
                </label>
                <select id="listing-category" name="category">
                  {categories.slice(1).map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="field-label" htmlFor="listing-price">
                  Price ($) · 0 means free
                </label>
                <input
                  id="listing-price"
                  name="price"
                  type="number"
                  min="0"
                  max="10000"
                  required
                  placeholder="35"
                />
              </div>
            </div>
            <label className="field-label" htmlFor="condition">
              Condition
            </label>
            <select name="condition" id="condition">
              <option>Good</option>
              <option>Like new</option>
              <option>Well-loved</option>
              <option>Needs repair</option>
            </select>
            <label className="field-label" htmlFor="description">
              The honest details
            </label>
            <textarea
              id="description"
              name="description"
              required
              minLength={15}
              maxLength={1500}
              rows={3}
              placeholder="What works, what’s included, and any little imperfections…"
            />
            <div className="form-note">
              <Camera size={17} />
              This UI preview uses a category photo. Real photo upload comes
              next.
            </div>
            <button className="button primary full" type="submit">
              Publish sample listing
              <ArrowUpRight size={16} />
            </button>
          </form>
        </Modal>
      )}

      {modal === "request" && (
        <Modal title="Post a request" onClose={() => setModal(null)}>
          <span className="modal-symbol">
            <Send size={25} />
          </span>
          <span className="eyebrow">PUT A LITTLE ASK OUT THERE</span>
          <h2>What’s your missing piece?</h2>
          <p className="modal-intro">
            Tell your campus what you’re looking for. Someone might have just
            the thing.
          </p>
          <form
            onSubmit={(e: FormEvent<HTMLFormElement>) => {
              e.preventDefault();
              const d = new FormData(e.currentTarget);
              setNeeds((prev) => [
                {
                  title: String(d.get("title")),
                  budget: `Under $${d.get("budget")}`,
                  person: "You",
                  category: String(d.get("category")),
                },
                ...prev,
              ]);
              setModal(null);
              navigate("Campus board");
              setToast("Your request is on the demo campus board.");
            }}
          >
            <label className="field-label" htmlFor="need-title">
              I’m looking for…
            </label>
            <input
              id="need-title"
              name="title"
              required
              maxLength={90}
              placeholder="A desk that fits a tiny dorm"
            />
            <div className="form-columns">
              <div>
                <label className="field-label" htmlFor="need-budget">
                  Budget up to ($)
                </label>
                <input
                  id="need-budget"
                  name="budget"
                  type="number"
                  min="1"
                  max="10000"
                  required
                  placeholder="50"
                />
              </div>
              <div>
                <label className="field-label" htmlFor="need-category">
                  Category
                </label>
                <select id="need-category" name="category">
                  {categories.slice(1).map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>
            <button className="button primary full" type="submit">
              Ask your campus
              <ArrowRight size={16} />
            </button>
          </form>
        </Modal>
      )}

      {modal === "safety" && (
        <Modal title="The Relay way" onClose={() => setModal(null)}>
          <span className="modal-symbol">
            <ShieldCheck size={27} />
          </span>
          <span className="eyebrow">A LITTLE TRUST GOES A LONG WAY</span>
          <h2>
            Good exchanges
            <br />
            are thoughtful exchanges.
          </h2>
          <div className="safety-list">
            {[
              {
                icon: GraduationCap,
                title: "Know what’s been verified.",
                text: "This is an interactive prototype. Profiles and verification examples are sample data, and neither university endorses this preview.",
              },
              {
                icon: MapPin,
                title: "A public place. A clear plan.",
                text: "Agree on an accessible public location during open hours. Bring a friend if you prefer. Location suggestions are not promises of supervision.",
              },
              {
                icon: PackageCheck,
                title: "Inspect before you accept.",
                text: "Partner identification never approves a purchase. Check condition, test functionality, and confirm the agreed item before payment.",
              },
              {
                icon: ReceiptText,
                title: "Every money movement, explained.",
                text: "Try simulated holds, payments, cancellation, and refund tracking. No actual payment service is connected.",
              },
            ].map(({ icon: Icon, title, text }) => (
              <div key={title}>
                <span>
                  <Icon size={21} />
                </span>
                <section>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </section>
              </div>
            ))}
          </div>
          <button
            className="button primary full"
            onClick={() => setModal(null)}
          >
            That feels like a good start
            <Check size={17} />
          </button>
        </Modal>
      )}

      {modal === "notifications" && (
        <Modal title="Your updates" onClose={() => setModal(null)}>
          <span className="modal-symbol">
            <Bell size={26} />
          </span>
          <span className="eyebrow">A LITTLE HEADS-UP</span>
          <h2>You’re all caught up.</h2>
          <p className="modal-intro">
            Real-time messages and match alerts are on the roadmap. Your saved
            finds, plans, and sample exchanges are already kept in this browser.
          </p>
          <button
            className="button primary full"
            onClick={() => {
              setModal(null);
              navigate("Saved finds");
            }}
          >
            Revisit your saved finds
            <Heart size={16} />
          </button>
        </Modal>
      )}

      {modal === "settings" && (
        <Modal title="Your preferences" onClose={() => setModal(null)}>
          <span className="modal-symbol">
            <Settings2 size={26} />
          </span>
          <span className="eyebrow">MAKE YOURSELF AT HOME</span>
          <h2>Your campus. Your pace.</h2>
          <div className="preference-row">
            <div>
              <strong>Explore beyond your campus</strong>
              <p>Include opt-in sample listings from other schools.</p>
            </div>
            <button
              className={`toggle ${crossCampus ? "on" : ""}`}
              role="switch"
              aria-checked={crossCampus}
              aria-label="Explore beyond your campus"
              onClick={() => setCrossCampus(!crossCampus)}
            >
              <span />
            </button>
          </div>
          <div className="preference-row">
            <div>
              <strong>Motion that respects your device</strong>
              <p>Animations follow your system’s reduced-motion setting.</p>
            </div>
            <Check size={20} />
          </div>
          <div className="form-note">
            <LockKeyhole size={17} />
            Your demo data stays in this browser. No sign-in or server storage
            is connected.
          </div>
          <button
            className="button primary full"
            onClick={() => setModal(null)}
          >
            All set
            <Check size={17} />
          </button>
        </Modal>
      )}

      {currentFlyer && (
        <Modal
          title={currentFlyer.title.replace("\n", " ")}
          onClose={() => setSelectedFlyer(null)}
        >
          <div className={`flyer-modal-art ${currentFlyer.theme}`}>
            {currentFlyer.icon === "repair" ? (
              <Wrench size={70} />
            ) : currentFlyer.icon === "coffee" ? (
              <Coffee size={70} />
            ) : (
              <ArrowLeftRight size={70} />
            )}
            <span>{currentFlyer.date}</span>
          </div>
          <span className="eyebrow">{currentFlyer.type}</span>
          <h2 className="multiline">{currentFlyer.title}</h2>
          <p className="modal-intro">{currentFlyer.description}</p>
          <div className="event-info">
            <span>
              <CalendarDays size={17} />
              {currentFlyer.time}
            </span>
            <span>
              <MapPin size={17} />
              {currentFlyer.location}
            </span>
            <span>
              <GraduationCap size={17} />
              {currentFlyer.host}
            </span>
          </div>
          <div className="form-note">
            Sample concept. No event booking, live discount, or sponsor funding
            is available.
          </div>
          <button
            className={`button full ${rsvps.includes(currentFlyer.id) ? "secondary" : "primary"}`}
            onClick={() => {
              setRsvps((prev) =>
                prev.includes(currentFlyer.id)
                  ? prev.filter((id) => id !== currentFlyer.id)
                  : [...prev, currentFlyer.id],
              );
              setToast(
                rsvps.includes(currentFlyer.id)
                  ? "Removed from your campus saves."
                  : "Saved to your campus board.",
              );
            }}
          >
            {rsvps.includes(currentFlyer.id)
              ? "Saved to your board"
              : "Save for later"}
            {rsvps.includes(currentFlyer.id) ? (
              <Check size={17} />
            ) : (
              <Heart size={17} />
            )}
          </button>
        </Modal>
      )}

      {order && (
        <Modal
          drawer
          title="Your exchange"
          onClose={() => setActiveOrder(null)}
        >
          <div className="exchange-body">
            <span className="eyebrow">THE RELAY HANDOFF</span>
            <h2>
              A good find.
              <br />A thoughtful exchange.
            </h2>
            <div className="demo-banner compact">
              <LockKeyhole size={17} />
              <span>Simulation only. No money moves.</span>
            </div>
            <div className="exchange-item">
              <img src={order.product.image} alt={order.product.title} />
              <div>
                <strong>{order.product.title}</strong>
                <span>
                  {order.product.seller} · ${order.product.price}
                </span>
                <small>{order.meeting}</small>
              </div>
            </div>
            <ExchangeProgress
              state={order.state}
              free={order.product.price === 0}
            />
            <div className="money-summary" aria-live="polite">
              <div>
                <span>Your payment</span>
                <strong>
                  {moneyStatus(order.state, order.product.price).buyer}
                </strong>
              </div>
              <div>
                <span>Seller’s funds</span>
                <strong>
                  {moneyStatus(order.state, order.product.price).seller}
                </strong>
              </div>
            </div>
            {order.state === "reserved" && (
              <div className="exchange-action">
                <span className="step-overline">
                  FIRST, A LITTLE REASSURANCE
                </span>
                <h3>
                  {order.product.price === 0
                    ? "A little kindness, passed on."
                    : "Keep your money in your corner."}
                </h3>
                <p>
                  {order.product.price === 0
                    ? "This is a free find. No card authorization, payment, or seller transfer is needed. Identify your exchange partner and inspect the item before accepting it."
                    : "At a real handoff, an eligible card could be authorized shortly before the meeting. A hold reserves funds; it isn’t a completed payment."}
                </p>
                <button
                  className="button primary full"
                  onClick={() => orderAction("AUTHORIZE")}
                >
                  {order.product.price === 0
                    ? "Start a free handoff"
                    : `Simulate $${order.product.price} authorization`}
                  <LockKeyhole size={16} />
                </button>
              </div>
            )}
            {order.state === "authorized" && (
              <div className="exchange-action">
                <span className="step-overline">
                  RIGHT PERSON. RIGHT EXCHANGE.
                </span>
                <h3>Say hello. Check the code.</h3>
                <p>
                  For this demo, your partner’s code is <strong>2418</strong>.
                  Identifying the exchange does not accept the item or approve
                  payment.
                </p>
                <label className="field-label" htmlFor="exchange-pin">
                  Partner’s sample exchange code
                </label>
                <input
                  className="pin-input"
                  id="exchange-pin"
                  inputMode="numeric"
                  maxLength={4}
                  value={pin}
                  onChange={(e) => {
                    setPin(e.target.value.replace(/\D/g, ""));
                    setPinError("");
                  }}
                  placeholder="• • • •"
                />
                {pinError && (
                  <p className="field-error" role="alert">
                    {pinError}
                  </p>
                )}
                <button
                  className="button primary full"
                  onClick={() => {
                    if (pin === "2418") orderAction("VERIFY");
                    else
                      setPinError(
                        "That code doesn’t match. Try the sample code 2418.",
                      );
                  }}
                >
                  Identify this exchange
                  <CheckCheck size={17} />
                </button>
              </div>
            )}
            {order.state === "verified" && (
              <div className="exchange-action">
                <span className="step-overline">
                  TAKE YOUR TIME. LOOK IT OVER.
                </span>
                <h3>Does it feel like the right find?</h3>
                <p>
                  Test the item and check it against the original listing. You
                  can walk away before payment.
                </p>
                <div className="inspection-list">
                  {order.product.checks.map((c, i) => (
                    <label key={c}>
                      <input
                        type="checkbox"
                        checked={inspection[i] || false}
                        onChange={(e) =>
                          setInspection((prev) =>
                            prev.map((v, j) =>
                              j === i ? e.target.checked : v,
                            ),
                          )
                        }
                      />
                      <span>{c}</span>
                    </label>
                  ))}
                </div>
                <button
                  className="button primary full"
                  disabled={!inspection.every(Boolean)}
                  onClick={() => orderAction("INSPECT")}
                >
                  Inspection complete
                  <Check size={17} />
                </button>
              </div>
            )}
            {order.state === "inspected" && (
              <div className="exchange-action">
                <span className="step-overline">
                  YOUR CHOICE. YOUR CONFIRMATION.
                </span>
                <h3>Ready for its next chapter?</h3>
                <p>
                  {order.product.price === 0
                    ? "You’ve inspected this free item. Confirm you’re happy to accept it; no payment is needed."
                    : "You’ve inspected the item. In a real exchange, the seller keeps it until both screens confirm a successful payment."}
                </p>
                <button
                  className="button primary full"
                  onClick={() => orderAction("PAY")}
                >
                  {order.product.price === 0
                    ? "Accept this free find"
                    : `Accept item & simulate $${order.product.price} payment`}
                  <ArrowRight size={17} />
                </button>
                <small className="disclosure">
                  No card or payment processor is connected.
                </small>
              </div>
            )}
            {order.state === "paid" && (
              <div className="exchange-action">
                <span className="success-symbol">
                  <Check size={28} />
                </span>
                <h3>And a new story begins.</h3>
                <p>
                  {order.product.price === 0
                    ? "The free handoff is confirmed. A little less waste, a little more kindness. No payment or transfer is involved."
                    : "The sample payment is complete. Seller transfer is scheduled separately after the review window and funds availability. A bank payout has not been confirmed."}
                </p>
                {order.product.price > 0 && (
                  <button
                    className="button secondary full"
                    onClick={() => orderAction("REPORT")}
                  >
                    Explore a post-handoff issue
                    <CircleHelp size={17} />
                  </button>
                )}
              </div>
            )}
            {order.state === "case-open" && (
              <div className="exchange-action">
                <span className="step-overline">
                  A CLEAR PATH TO A RESOLUTION
                </span>
                <h3>Your sample case is open.</h3>
                <p>
                  An unreleased seller transfer is paused. A real case needs
                  evidence, a seller response, and human review. Opening a case
                  does not automatically grant a refund.
                </p>
                <div className="demo-control">
                  <span>DEMO CONTROL</span>
                  <button
                    className="button secondary full"
                    onClick={() => orderAction("APPROVE_RETURN")}
                  >
                    Simulate approved case & verified return
                    <ArrowRight size={16} />
                  </button>
                </div>
              </div>
            )}
            {order.state === "refund-pending" && (
              <div className="exchange-action">
                <span className="step-overline">
                  SUBMITTED ISN’T THE SAME AS RECEIVED
                </span>
                <h3>Your sample refund is pending.</h3>
                <p>
                  In a real exchange, the processor and bank determine when the
                  credit appears. Keep the refund reference and follow its
                  status.
                </p>
                <div className="demo-control">
                  <span>DEMO CONTROL</span>
                  <button
                    className="button secondary full"
                    onClick={() => orderAction("CONFIRM_REFUND")}
                  >
                    Simulate bank confirmation
                    <CheckCheck size={17} />
                  </button>
                </div>
              </div>
            )}
            {order.state === "refunded" && (
              <div className="exchange-action">
                <span className="success-symbol">
                  <CheckCheck size={28} />
                </span>
                <h3>A clear resolution.</h3>
                <p>
                  The simulated bank confirmation is recorded. This concludes
                  the sample refund journey.
                </p>
              </div>
            )}
            {order.state === "canceled" && (
              <div className="exchange-action">
                <h3>It’s okay to pass.</h3>
                <p>
                  No payment was captured. In a real transaction, a pending card
                  hold may take time to disappear from your bank.
                </p>
                <button
                  className="button primary full"
                  onClick={() => {
                    setActiveOrder(null);
                    navigate("Discover");
                  }}
                >
                  Find a better fit
                  <ArrowRight size={17} />
                </button>
              </div>
            )}
            {["reserved", "authorized", "verified", "inspected"].includes(
              order.state,
            ) && (
              <button
                className="cancel-exchange"
                onClick={() => orderAction("CANCEL")}
              >
                {order.state === "reserved"
                  ? "Cancel this sample reservation"
                  : "Reject item & cancel before payment"}
              </button>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
function PageTitle({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="page-heading subpage-heading">
      <div>
        <div className="eyebrow greeting">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
    </div>
  );
}
function ExchangeProgress({
  state,
  free = false,
}: {
  state: string;
  free?: boolean;
}) {
  const states = ["reserved", "authorized", "verified", "inspected", "paid"];
  const step =
    state === "canceled"
      ? -1
      : states.includes(state)
        ? states.indexOf(state)
        : 4;
  return (
    <ol className="exchange-progress" aria-label="Exchange progress">
      {[
        "Reserved",
        free ? "No payment" : "Card hold",
        "Identified",
        "Inspected",
        free ? "Accepted" : "Paid",
      ].map((label, i) => (
        <li
          key={label}
          className={i <= step ? "complete" : ""}
          aria-current={i === step ? "step" : undefined}
        >
          <span>{i < step ? <Check size={12} /> : i + 1}</span>
          <small>{label}</small>
        </li>
      ))}
    </ol>
  );
}
