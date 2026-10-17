import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

export const SCHEMA_VERSION = 2;

const SCHEMA = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL,
  bio TEXT NOT NULL DEFAULT '',
  campus_id TEXT,
  browse_campus TEXT,
  joined_at TEXT NOT NULL,
  deleted_at TEXT,
  visibility TEXT NOT NULL DEFAULT 'campus',
  role TEXT NOT NULL DEFAULT 'student',
  moderator_campuses TEXT NOT NULL DEFAULT '[]',
  restricted_until TEXT,
  is_fixture INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  user_agent TEXT NOT NULL DEFAULT '',
  last_seen_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_codes (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  attempts INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS listings (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id),
  campus_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  condition TEXT NOT NULL,
  price_cents INTEGER NOT NULL,
  original_price_cents INTEGER,
  status TEXT NOT NULL,
  listing_type TEXT NOT NULL DEFAULT 'item',
  area TEXT NOT NULL DEFAULT '',
  cross_campus INTEGER NOT NULL DEFAULT 0,
  category_details TEXT NOT NULL DEFAULT '{}',
  checks TEXT NOT NULL DEFAULT '[]',
  version INTEGER NOT NULL DEFAULT 1,
  source TEXT NOT NULL DEFAULT 'live',
  expires_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  published_at TEXT,
  view_count INTEGER NOT NULL DEFAULT 0
);

CREATE VIRTUAL TABLE IF NOT EXISTS listings_fts USING fts5(
  title, description, category, content='listings', content_rowid='rowid'
);

CREATE TABLE IF NOT EXISTS photos (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id),
  listing_id TEXT REFERENCES listings(id),
  position INTEGER,
  is_cover INTEGER NOT NULL DEFAULT 0,
  blob_path TEXT NOT NULL,
  thumb_path TEXT NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  content_type TEXT NOT NULL,
  moderation_status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  expires_at TEXT
);

CREATE TABLE IF NOT EXISTS favorites (
  user_id TEXT NOT NULL REFERENCES users(id),
  listing_id TEXT NOT NULL REFERENCES listings(id),
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, listing_id)
);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL REFERENCES listings(id),
  buyer_id TEXT NOT NULL REFERENCES users(id),
  seller_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  buyer_read_at TEXT,
  seller_read_at TEXT,
  UNIQUE (listing_id, buyer_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  sender_id TEXT NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  client_id TEXT,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS messages_client ON messages(conversation_id, client_id) WHERE client_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS offers (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  proposer_id TEXT NOT NULL REFERENCES users(id),
  amount_cents INTEGER NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  reserve_until TEXT,
  resolved_at TEXT
);

CREATE TABLE IF NOT EXISTS reservations (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL REFERENCES listings(id),
  buyer_id TEXT NOT NULL REFERENCES users(id),
  seller_id TEXT NOT NULL REFERENCES users(id),
  offer_id TEXT,
  idempotency_key TEXT NOT NULL,
  price_cents INTEGER NOT NULL,
  fee_cents INTEGER NOT NULL DEFAULT 0,
  fulfillment TEXT NOT NULL DEFAULT 'pickup',
  listing_snapshot TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  confirmed_at TEXT,
  identified_at TEXT,
  buyer_accepted_at TEXT,
  seller_accepted_at TEXT,
  completed_at TEXT,
  canceled_at TEXT,
  cancel_reason TEXT,
  no_show_by TEXT,
  trade_id TEXT,
  UNIQUE (buyer_id, idempotency_key)
);

CREATE UNIQUE INDEX IF NOT EXISTS reservations_one_open ON reservations(listing_id)
  WHERE status IN ('pending_seller', 'active') AND trade_id IS NULL;

CREATE TABLE IF NOT EXISTS pickups (
  id TEXT PRIMARY KEY,
  reservation_id TEXT NOT NULL REFERENCES reservations(id),
  proposed_by TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  timezone TEXT NOT NULL,
  place_label TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS handoff_codes (
  id TEXT PRIMARY KEY,
  reservation_id TEXT NOT NULL REFERENCES reservations(id),
  code_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  verified_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS availability (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  weekday INTEGER NOT NULL,
  start_minute INTEGER NOT NULL,
  end_minute INTEGER NOT NULL,
  timezone TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS payment_intents (
  id TEXT PRIMARY KEY,
  reservation_id TEXT REFERENCES reservations(id),
  trade_id TEXT,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'usd',
  status TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_ref TEXT,
  capture_deadline TEXT,
  created_at TEXT NOT NULL,
  authorized_at TEXT,
  captured_at TEXT
);

CREATE TABLE IF NOT EXISTS ledger_entries (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL,
  reservation_id TEXT,
  account TEXT NOT NULL,
  direction TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  memo TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS webhook_events (
  id TEXT PRIMARY KEY,
  payload_hash TEXT NOT NULL,
  type TEXT NOT NULL,
  received_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS seller_accounts (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  provider TEXT NOT NULL,
  status TEXT NOT NULL,
  destination_label TEXT,
  requirements TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS payouts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  amount_cents INTEGER NOT NULL,
  status TEXT NOT NULL,
  destination_label TEXT,
  failure_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS disputes (
  id TEXT PRIMARY KEY,
  reservation_id TEXT NOT NULL REFERENCES reservations(id),
  opener_id TEXT NOT NULL REFERENCES users(id),
  reason TEXT NOT NULL,
  status TEXT NOT NULL,
  remedy TEXT,
  refund_cents INTEGER,
  bank_confirmed INTEGER NOT NULL DEFAULT 0,
  deadline_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dispute_notes (
  id TEXT PRIMARY KEY,
  dispute_id TEXT NOT NULL REFERENCES disputes(id),
  author_id TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS provider_disputes (
  id TEXT PRIMARY KEY,
  reservation_id TEXT,
  provider_ref TEXT,
  status TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  preview TEXT NOT NULL,
  href TEXT NOT NULL,
  created_at TEXT NOT NULL,
  read_at TEXT,
  dedupe_key TEXT,
  UNIQUE (user_id, dedupe_key)
);

CREATE TABLE IF NOT EXISTS notification_prefs (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  email_enabled INTEGER NOT NULL DEFAULT 1,
  push_enabled INTEGER NOT NULL DEFAULT 1,
  quiet_start TEXT,
  quiet_end TEXT,
  timezone TEXT NOT NULL DEFAULT 'America/Chicago',
  metrics_consent INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS device_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  token TEXT NOT NULL,
  platform TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (user_id, token)
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  endpoint TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (user_id, endpoint)
);

CREATE TABLE IF NOT EXISTS deliveries (
  id TEXT PRIMARY KEY,
  notification_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  status TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS outbox (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  payload TEXT NOT NULL,
  run_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  status TEXT NOT NULL DEFAULT 'pending',
  last_error TEXT,
  idempotency_key TEXT UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS blocks (
  blocker_id TEXT NOT NULL REFERENCES users(id),
  blocked_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  PRIMARY KEY (blocker_id, blocked_id)
);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  reporter_id TEXT NOT NULL REFERENCES users(id),
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  evidence TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'open',
  campus_id TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS signals (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  subject_type TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  detail TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  campus_id TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS staff_actions (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL REFERENCES users(id),
  action TEXT NOT NULL,
  reason TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS support_tickets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  campus_id TEXT,
  related_action_id TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  reservation_id TEXT NOT NULL REFERENCES reservations(id),
  reviewer_id TEXT NOT NULL REFERENCES users(id),
  reviewee_id TEXT NOT NULL REFERENCES users(id),
  accuracy INTEGER NOT NULL,
  communication INTEGER NOT NULL,
  punctuality INTEGER NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  publish_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'held',
  UNIQUE (reservation_id, reviewer_id)
);

CREATE TABLE IF NOT EXISTS saved_searches (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  query TEXT NOT NULL,
  frequency TEXT NOT NULL DEFAULT 'immediate',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id),
  campus_id TEXT NOT NULL,
  intent TEXT NOT NULL,
  title TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL,
  budget_cents INTEGER NOT NULL DEFAULT 0,
  exchange_for TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS post_responses (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES posts(id),
  responder_id TEXT NOT NULL REFERENCES users(id),
  listing_id TEXT REFERENCES listings(id),
  conversation_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS trades (
  id TEXT PRIMARY KEY,
  proposer_id TEXT NOT NULL REFERENCES users(id),
  counterparty_id TEXT NOT NULL REFERENCES users(id),
  listing_a_id TEXT NOT NULL,
  listing_b_id TEXT NOT NULL,
  snapshot_a TEXT NOT NULL,
  snapshot_b TEXT NOT NULL,
  cash_cents INTEGER NOT NULL DEFAULT 0,
  cash_payer_id TEXT,
  proposer_accepted_at TEXT,
  counterparty_accepted_at TEXT,
  proposer_confirmed_at TEXT,
  counterparty_confirmed_at TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  budget_cents INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS plan_items (
  plan_id TEXT NOT NULL REFERENCES plans(id),
  listing_id TEXT NOT NULL REFERENCES listings(id),
  saved_price_cents INTEGER NOT NULL,
  PRIMARY KEY (plan_id, listing_id)
);

CREATE TABLE IF NOT EXISTS service_slots (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL REFERENCES listings(id),
  starts_at TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL,
  price_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  booked_by TEXT REFERENCES users(id),
  UNIQUE (listing_id, starts_at)
);

CREATE TABLE IF NOT EXISTS ride_trips (
  id TEXT PRIMARY KEY,
  driver_id TEXT NOT NULL REFERENCES users(id),
  campus_id TEXT NOT NULL,
  pickup_place_id TEXT,
  destination_place_id TEXT,
  private_destination TEXT,
  departure_utc TEXT NOT NULL,
  timezone TEXT NOT NULL,
  capacity INTEGER NOT NULL CHECK (capacity >= 0),
  contribution_cents INTEGER NOT NULL CHECK (contribution_cents >= 0),
  vehicle_summary TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('draft','open','full','in_progress','completed','canceled','expired')),
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ride_bookings (
  id TEXT PRIMARY KEY,
  listing_id TEXT REFERENCES listings(id),
  trip_id TEXT REFERENCES ride_trips(id),
  rider_id TEXT NOT NULL REFERENCES users(id),
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  status TEXT NOT NULL DEFAULT 'accepted' CHECK (status IN ('requested','accepted','in_progress','completed','declined','withdrawn','expired','canceled','no_show')),
  expires_at TEXT,
  idempotency_key TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  CHECK (listing_id IS NOT NULL OR trip_id IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS ride_booking_listing_rider ON ride_bookings(listing_id, rider_id) WHERE listing_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ride_booking_idempotency ON ride_bookings(idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS ticket_orders (
  id TEXT PRIMARY KEY,
  listing_id TEXT,
  event_id TEXT NOT NULL,
  buyer_id TEXT NOT NULL REFERENCES users(id),
  seller_id TEXT NOT NULL REFERENCES users(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  price_cents INTEGER NOT NULL,
  policy_version INTEGER NOT NULL,
  transfer_deadline TEXT,
  status TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS provider_handoffs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  provider TEXT NOT NULL,
  pickup_place_id TEXT,
  destination_place_id TEXT,
  coordinates_included INTEGER NOT NULL DEFAULT 0,
  opened_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS fulfillment (
  listing_id TEXT PRIMARY KEY REFERENCES listings(id),
  method TEXT NOT NULL,
  max_miles REAL,
  fee_cents INTEGER NOT NULL DEFAULT 0,
  transport_notes TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS addresses (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  label TEXT NOT NULL,
  line TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS metrics_events (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  campus_id TEXT,
  kind TEXT NOT NULL,
  subject_id TEXT,
  props TEXT NOT NULL DEFAULT '{}',
  consent INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS feature_flags (
  key TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL,
  description TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rate_limits (
  bucket TEXT NOT NULL,
  window_start TEXT NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (bucket, window_start)
);

CREATE TABLE IF NOT EXISTS promotion_campaigns (
  id TEXT PRIMARY KEY,
  campus_id TEXT NOT NULL,
  owner_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  destination TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS promotion_events (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  user_id TEXT,
  kind TEXT NOT NULL,
  dedupe_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS deletion_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS listing_views (
  listing_id TEXT NOT NULL,
  viewer_id TEXT NOT NULL,
  day TEXT NOT NULL,
  PRIMARY KEY (listing_id, viewer_id, day)
);

CREATE INDEX IF NOT EXISTS listings_discovery ON listings(status, campus_id, published_at);
CREATE INDEX IF NOT EXISTS jobs_ready ON jobs(status, run_at);
CREATE INDEX IF NOT EXISTS notifications_user ON notifications(user_id, created_at);
`;

const FTS_TRIGGERS = `
CREATE TRIGGER IF NOT EXISTS listings_fts_insert AFTER INSERT ON listings BEGIN
  INSERT INTO listings_fts(rowid, title, description, category)
  VALUES (new.rowid, new.title, new.description, new.category);
END;
CREATE TRIGGER IF NOT EXISTS listings_fts_delete AFTER DELETE ON listings BEGIN
  INSERT INTO listings_fts(listings_fts, rowid, title, description, category)
  VALUES ('delete', old.rowid, old.title, old.description, old.category);
END;
CREATE TRIGGER IF NOT EXISTS listings_fts_update AFTER UPDATE OF title, description, category ON listings BEGIN
  INSERT INTO listings_fts(listings_fts, rowid, title, description, category)
  VALUES ('delete', old.rowid, old.title, old.description, old.category);
  INSERT INTO listings_fts(rowid, title, description, category)
  VALUES (new.rowid, new.title, new.description, new.category);
END;
`;

export function openDatabase(directory) {
  mkdirSync(directory, { recursive: true });
  mkdirSync(join(directory, 'blobs'), { recursive: true });
  mkdirSync(join(directory, 'thumbs'), { recursive: true });
  const path = join(directory, 'marketplace.db');
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  const version = Number(db.pragma('user_version', { simple: true }));
  if (version === 0) {
    db.exec(SCHEMA);
    db.exec(FTS_TRIGGERS);
    db.pragma(`user_version = ${SCHEMA_VERSION}`);
  } else if (version === 1) {
    migrateRideBookings(db);
    db.pragma(`user_version = ${SCHEMA_VERSION}`);
  } else if (version !== SCHEMA_VERSION) {
    throw new Error(`Marketplace database version ${version} does not match this build (${SCHEMA_VERSION}).`);
  }
  return { db, path, directory };
}

function migrateRideBookings(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ride_trips (
      id TEXT PRIMARY KEY,
      driver_id TEXT NOT NULL REFERENCES users(id),
      campus_id TEXT NOT NULL,
      pickup_place_id TEXT,
      destination_place_id TEXT,
      private_destination TEXT,
      departure_utc TEXT NOT NULL,
      timezone TEXT NOT NULL,
      capacity INTEGER NOT NULL CHECK (capacity >= 0),
      contribution_cents INTEGER NOT NULL CHECK (contribution_cents >= 0),
      vehicle_summary TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS ticket_orders (
      id TEXT PRIMARY KEY,
      listing_id TEXT,
      event_id TEXT NOT NULL,
      buyer_id TEXT NOT NULL REFERENCES users(id),
      seller_id TEXT NOT NULL REFERENCES users(id),
      quantity INTEGER NOT NULL,
      price_cents INTEGER NOT NULL,
      policy_version INTEGER NOT NULL,
      transfer_deadline TEXT,
      status TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS provider_handoffs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      provider TEXT NOT NULL,
      pickup_place_id TEXT,
      destination_place_id TEXT,
      coordinates_included INTEGER NOT NULL DEFAULT 0,
      opened_at TEXT NOT NULL
    );
  `);
  const columns = db.prepare('PRAGMA table_info(ride_bookings)').all().map((column) => column.name);
  if (columns.includes('trip_id')) return;
  db.exec(`
    CREATE TABLE ride_bookings_next (
      id TEXT PRIMARY KEY,
      listing_id TEXT REFERENCES listings(id),
      trip_id TEXT REFERENCES ride_trips(id),
      rider_id TEXT NOT NULL REFERENCES users(id),
      quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
      status TEXT NOT NULL DEFAULT 'accepted',
      expires_at TEXT,
      idempotency_key TEXT,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      CHECK (listing_id IS NOT NULL OR trip_id IS NOT NULL)
    );
    INSERT INTO ride_bookings_next (id, listing_id, rider_id, quantity, status, version, created_at)
      SELECT id, listing_id, rider_id, 1, 'accepted', 1, created_at FROM ride_bookings;
    DROP TABLE ride_bookings;
    ALTER TABLE ride_bookings_next RENAME TO ride_bookings;
    CREATE UNIQUE INDEX IF NOT EXISTS ride_booking_listing_rider ON ride_bookings(listing_id, rider_id) WHERE listing_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS ride_booking_idempotency ON ride_bookings(idempotency_key) WHERE idempotency_key IS NOT NULL;
  `);
}
