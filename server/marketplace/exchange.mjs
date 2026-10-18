import { createHmac, randomInt } from 'node:crypto';
import { unlinkSync } from 'node:fs';
import { MarketError, localParts } from './domain.mjs';

const STREET = /\d{1,5}\s+\w+\s+(st|street|ave|avenue|rd|road|blvd|lane|ln|dr|drive)\b/i;

export const exchangeMethods = {
  openConversation(user, listingId) {
    this.requireUser(user);
    const listing = this.listingRow(listingId);
    if (!listing || listing.status === 'draft') throw new MarketError('not_found', 'That listing does not exist.', 404);
    if (listing.owner_id === user.id) throw new MarketError('forbidden', 'Open this conversation from a buyer’s account.', 403);
    if (listing.campus_id !== user.campus_id && !listing.cross_campus) throw new MarketError('forbidden', 'This listing is limited to its campus.', 403);
    if (this.blockedEither(user.id, listing.owner_id) && !this.sharedOpenOrder(user.id, listing.owner_id)) {
      throw new MarketError('blocked', 'Blocking stops new messages. An open exchange can still be resolved.', 403);
    }
    const existing = this.db.prepare('SELECT * FROM conversations WHERE listing_id = ? AND buyer_id = ?').get(listingId, user.id);
    if (existing) return this.presentConversation(existing, user);
    const id = this.rid('con');
    const now = this.iso();
    this.db.prepare(`
      INSERT INTO conversations (id, listing_id, buyer_id, seller_id, created_at, updated_at, buyer_read_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, listingId, user.id, listing.owner_id, now, now, now);
    this.recordMetric('conversation', { user, subjectId: id, consent: Boolean(this.prefs(user.id).metrics_consent) });
    return this.presentConversation(this.db.prepare('SELECT * FROM conversations WHERE id = ?').get(id), user);
  },

  conversations(user) {
    this.requireUser(user);
    return this.db.prepare(`
      SELECT * FROM conversations WHERE buyer_id = ? OR seller_id = ? ORDER BY updated_at DESC
    `).all(user.id, user.id).map((row) => this.presentConversation(row, user));
  },

  conversationFor(user, id) {
    const row = this.db.prepare('SELECT * FROM conversations WHERE id = ?').get(id);
    if (!row || (row.buyer_id !== user.id && row.seller_id !== user.id)) throw new MarketError('not_found', 'That conversation does not exist.', 404);
    return row;
  },

  messages(user, conversationId, { cursor, limit = 30 } = {}) {
    const conversation = this.conversationFor(this.requireUser(user), conversationId);
    const params = { id: conversation.id, limit: Math.min(Number(limit) || 30, 50) };
    let clause = '';
    if (cursor) {
      clause = 'AND (created_at < @cAt OR (created_at = @cAt AND id > @cId))';
      params.cAt = cursor.createdAt;
      params.cId = cursor.id;
    }
    const rows = this.db.prepare(`
      SELECT * FROM messages WHERE conversation_id = @id ${clause} ORDER BY created_at DESC, id ASC LIMIT @limit
    `).all(params).reverse();
    return { messages: rows.map((row) => this.presentMessage(row)), offers: this.offersFor(conversation.id) };
  },

  postMessage(user, conversationId, { body, clientId } = {}) {
    const actor = this.requireUser(user);
    this.rateLimit(`msg:${actor.id}`, 60, 60 * 60_000);
    const conversation = this.conversationFor(actor, conversationId);
    this.assertCanContact(actor, conversation);
    const text = String(body || '').trim();
    if (!text || text.length > 2000) throw new MarketError('invalid_message', 'Write a message under 2000 characters.');
    if (this.suspiciousText(text)) {
      this.db.prepare(`INSERT INTO signals (id, kind, subject_type, subject_id, detail, campus_id, created_at) VALUES (?, 'suspicious_link', 'conversation', ?, ?, ?, ?)`).run(
        this.rid('sig'), conversation.id, 'A message contained a shortened or insecure link.', actor.campus_id, this.iso(),
      );
      throw new MarketError('suspicious_link', 'Remove shortened or non-HTTPS links and send the message again.', 422);
    }
    const recent = this.db.prepare(`
      SELECT COUNT(*) AS n FROM messages WHERE conversation_id = ? AND sender_id = ? AND body = ? AND created_at > ?
    `).get(conversation.id, actor.id, text, new Date(this.now().getTime() - 10 * 60_000).toISOString()).n;
    if (recent >= 3) throw new MarketError('spam', 'That message was already sent. Wait before repeating it.', 429);
    const id = this.rid('msg');
    const now = this.iso();
    try {
      this.db.prepare('INSERT INTO messages (id, conversation_id, sender_id, body, client_id, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
        id, conversation.id, actor.id, text, clientId || null, now,
      );
    } catch (error) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        const prior = this.db.prepare('SELECT * FROM messages WHERE conversation_id = ? AND client_id = ?').get(conversation.id, clientId);
        return this.presentMessage(prior);
      }
      throw error;
    }
    this.db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(now, conversation.id);
    const recipient = actor.id === conversation.buyer_id ? conversation.seller_id : conversation.buyer_id;
    this.notify(recipient, {
      kind: 'message',
      title: 'New message',
      body: text,
      preview: 'You have a new Out of Pocket message',
      href: `/messages/${conversation.id}`,
      dedupeKey: `message:${id}`,
    });
    this.processJobs();
    return this.presentMessage(this.db.prepare('SELECT * FROM messages WHERE id = ?').get(id));
  },

  markRead(user, conversationId) {
    const actor = this.requireUser(user);
    const conversation = this.conversationFor(actor, conversationId);
    const column = actor.id === conversation.buyer_id ? 'buyer_read_at' : 'seller_read_at';
    this.db.prepare(`UPDATE conversations SET ${column} = ? WHERE id = ?`).run(this.iso(), conversation.id);
    return { ok: true };
  },

  postOffer(user, conversationId, { amountCents } = {}) {
    const actor = this.requireUser(user);
    this.rateLimit(`offer:${actor.id}`, 30, 60 * 60_000);
    const conversation = this.conversationFor(actor, conversationId);
    this.assertCanContact(actor, conversation);
    const listing = this.listingRow(conversation.listing_id);
    if (listing.price_cents === 0) throw new MarketError('free', 'Free listings do not take price offers.');
    if (this.openReservation(listing.id)) throw new MarketError('negotiation_closed', 'A handoff has already started for this listing.', 409);
    if (!Number.isInteger(amountCents) || amountCents < 1 || amountCents > 1_000_000) throw new MarketError('invalid_amount', 'Offer a whole number of cents from 1 to 1000000.');
    const pending = this.db.prepare(`SELECT * FROM offers WHERE conversation_id = ? AND status = 'pending'`).get(conversation.id);
    if (pending && pending.proposer_id === actor.id) throw new MarketError('invalid_offer', 'Withdraw your pending offer before sending another.');
    const now = this.iso();
    const expires = new Date(this.now().getTime() + 48 * 3600_000).toISOString();
    const id = this.rid('ofr');
    this.immediate(() => {
      if (pending) this.db.prepare(`UPDATE offers SET status = 'superseded', resolved_at = ? WHERE id = ? AND status = 'pending'`).run(now, pending.id);
      this.db.prepare(`
        INSERT INTO offers (id, conversation_id, proposer_id, amount_cents, status, created_at, expires_at) VALUES (?, ?, ?, ?, 'pending', ?, ?)
      `).run(id, conversation.id, actor.id, amountCents, now, expires);
      this.db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(now, conversation.id);
    });
    const recipient = actor.id === conversation.buyer_id ? conversation.seller_id : conversation.buyer_id;
    this.notify(recipient, {
      kind: 'offer', title: 'New offer', body: `An offer was updated in your conversation.`, preview: 'You have a new Out of Pocket offer',
      href: `/messages/${conversation.id}`, dedupeKey: `offer:${id}`,
    });
    this.processJobs();
    return this.offersFor(conversation.id);
  },

  resolveOffer(user, conversationId, offerId, action) {
    const actor = this.requireUser(user);
    const conversation = this.conversationFor(actor, conversationId);
    const offer = this.db.prepare('SELECT * FROM offers WHERE id = ? AND conversation_id = ?').get(offerId, conversation.id);
    if (!offer || offer.status !== 'pending') throw new MarketError('invalid_offer', 'That offer is no longer pending.', 409);
    if (offer.expires_at <= this.iso()) {
      this.db.prepare(`UPDATE offers SET status = 'expired', resolved_at = ? WHERE id = ?`).run(this.iso(), offer.id);
      throw new MarketError('stale_offer', 'That offer expired.', 409);
    }
    const recipient = offer.proposer_id === conversation.buyer_id ? conversation.seller_id : conversation.buyer_id;
    if (action === 'withdraw') {
      if (offer.proposer_id !== actor.id) throw new MarketError('forbidden', 'Only the person who made the offer can withdraw it.', 403);
    } else if (['accept', 'decline', 'counter'].includes(action)) {
      if (actor.id !== recipient) throw new MarketError('forbidden', 'Only the recipient can accept, decline, or counter.', 403);
    } else throw new MarketError('invalid_offer', 'Unsupported offer action.');
    if (action === 'counter') throw new MarketError('invalid_offer', 'Send the counter as a new offer.');
    const now = this.iso();
    const status = action === 'accept' ? 'accepted' : action === 'decline' ? 'declined' : 'withdrawn';
    const reserveUntil = action === 'accept' ? new Date(this.now().getTime() + 72 * 3600_000).toISOString() : null;
    const info = this.db.prepare(`
      UPDATE offers SET status = ?, resolved_at = ?, reserve_until = ? WHERE id = ? AND status = 'pending'
    `).run(status, now, reserveUntil, offer.id);
    if (info.changes !== 1) throw new MarketError('conflict', 'That offer changed. Reload the conversation.', 409);
    this.db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(now, conversation.id);
    const other = actor.id === conversation.buyer_id ? conversation.seller_id : conversation.buyer_id;
    this.notify(other, {
      kind: 'offer', title: `Offer ${status}`, body: 'An offer in your conversation was updated.', preview: 'An Out of Pocket offer was updated',
      href: `/messages/${conversation.id}`, dedupeKey: `offer-status:${offer.id}:${status}`,
    });
    this.processJobs();
    return { offers: this.offersFor(conversation.id), reserved: false, note: 'Accepting an offer records the price. It does not reserve the item or move money.' };
  },

  reserve(user, { listingId, idempotencyKey, offerId, expectedPriceCents, fulfillment, miles, acknowledgedTotalCents } = {}) {
    const actor = this.requireUser(user);
    if (!idempotencyKey || String(idempotencyKey).length > 80) throw new MarketError('invalid_idempotency', 'Include an idempotency key so a retry cannot create a second reservation.');
    const outcome = this.immediate(() => {
      const existing = this.db.prepare('SELECT id FROM reservations WHERE buyer_id = ? AND idempotency_key = ?').get(actor.id, idempotencyKey);
      if (existing) return { id: existing.id, created: false };
      const listing = this.listingRow(listingId);
      if (!listing) throw new MarketError('not_found', 'That listing does not exist.', 404);
      if (listing.owner_id === actor.id) throw new MarketError('self_purchase', 'You cannot reserve your own listing.', 403);
      if (listing.source === 'fixture') throw new MarketError('fixture', 'Sample inventory cannot be reserved. Publish a live listing to try the exchange.', 403);
      if (listing.campus_id !== actor.campus_id && !listing.cross_campus) throw new MarketError('forbidden', 'This listing is limited to its campus.', 403);
      if (this.blockedEither(actor.id, listing.owner_id)) throw new MarketError('blocked', 'This exchange is not available.', 403);
      if (listing.listing_type === 'service') throw new MarketError('wrong_flow', 'Book a tutoring slot instead of reserving the listing.', 409);
      if (listing.listing_type === 'ride') throw new MarketError('wrong_flow', 'Request a seat instead of reserving the ride listing.', 409);
      const price = this.priceForReservation(listing, actor, offerId);
      if (expectedPriceCents != null && expectedPriceCents !== price) throw new MarketError('conflict', 'The price changed. Review it and try again.', 409);
      let fee = 0;
      let method = 'pickup';
      if (fulfillment === 'seller_delivery') {
        const quote = this.quoteFor(listing, miles);
        if (acknowledgedTotalCents !== price + quote.feeCents) throw new MarketError('conflict', 'Confirm the item price plus delivery fee before reserving.', 409);
        fee = quote.feeCents;
        method = 'seller_delivery';
      }
      const now = this.iso();
      const info = this.db.prepare(`UPDATE listings SET status = 'reserved', version = version + 1, updated_at = ? WHERE id = ? AND status = 'active'`).run(now, listing.id);
      if (info.changes !== 1) throw new MarketError('unavailable', 'This listing is no longer available.', 409);
      const id = this.rid('rsv');
      try {
        this.db.prepare(`
          INSERT INTO reservations (id, listing_id, buyer_id, seller_id, offer_id, idempotency_key, price_cents, fee_cents, fulfillment,
            listing_snapshot, status, created_at, expires_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_seller', ?, ?)
        `).run(
          id, listing.id, actor.id, listing.owner_id, offerId || null, idempotencyKey, price, fee, method,
          JSON.stringify(this.snapshotListing(listing, price)), now, new Date(this.now().getTime() + 2 * 3600_000).toISOString(),
        );
      } catch (error) {
        if (String(error.message).includes('UNIQUE') || error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
          const again = this.db.prepare('SELECT id FROM reservations WHERE buyer_id = ? AND idempotency_key = ?').get(actor.id, idempotencyKey);
          if (again) return { id: again.id, created: false };
          throw new MarketError('unavailable', 'This listing already has a reservation.', 409);
        }
        throw error;
      }
      return { id, created: true };
    });
    const reservation = this.db.prepare('SELECT * FROM reservations WHERE id = ?').get(outcome.id);
    if (outcome.created) {
      this.notify(reservation.seller_id, {
        kind: 'reservation', title: 'Reservation request', body: 'A buyer asked to reserve your listing. Confirm it to hold the item.',
        preview: 'You have a new reservation request', href: `/orders/${reservation.id}`, dedupeKey: `reserve:${reservation.id}`,
      });
      this.recordMetric('reservation', { user: actor, subjectId: reservation.id, consent: Boolean(this.prefs(actor.id).metrics_consent) });
      this.processJobs();
    }
    return this.presentReservation(reservation, actor);
  },

  priceForReservation(listing, buyer, offerId) {
    const conversation = this.db.prepare('SELECT * FROM conversations WHERE listing_id = ? AND buyer_id = ?').get(listing.id, buyer.id);
    const pending = conversation && this.db.prepare(`SELECT * FROM offers WHERE conversation_id = ? AND status = 'pending'`).get(conversation.id);
    if (!offerId) {
      if (pending) throw new MarketError('pending_offer', 'Resolve or withdraw the pending offer before reserving.', 409);
      return listing.price_cents;
    }
    const offer = this.db.prepare('SELECT * FROM offers WHERE id = ?').get(offerId);
    if (!offer || !conversation || offer.conversation_id !== conversation.id) throw new MarketError('stale_offer', 'That accepted offer does not belong to this listing.', 409);
    if (offer.status !== 'accepted' || !offer.reserve_until || offer.reserve_until <= this.iso()) {
      throw new MarketError('stale_offer', 'That accepted offer is stale. Agree on a current price before reserving.', 409);
    }
    return offer.amount_cents;
  },

  confirmReservation(user, id) {
    const actor = this.requireUser(user);
    const reservation = this.reservationRow(id);
    if (reservation.seller_id !== actor.id) throw new MarketError('forbidden', 'The seller confirms the reservation.', 403);
    if (reservation.status !== 'pending_seller') throw new MarketError('conflict', 'This reservation is not waiting for confirmation.', 409);
    const expires = new Date(this.now().getTime() + 72 * 3600_000).toISOString();
    const info = this.db.prepare(`
      UPDATE reservations SET status = 'active', confirmed_at = ?, expires_at = ? WHERE id = ? AND status = 'pending_seller'
    `).run(this.iso(), expires, id);
    if (info.changes !== 1) throw new MarketError('conflict', 'This reservation changed. Reload it.', 409);
    this.notify(reservation.buyer_id, {
      kind: 'reservation', title: 'Reservation confirmed', body: 'The seller confirmed the hold. Agree on a public pickup next.',
      preview: 'Your reservation was confirmed', href: `/orders/${id}`, dedupeKey: `reserve-confirm:${id}`,
    });
    this.processJobs();
    return this.presentReservation(this.reservationRow(id), actor);
  },

  cancelReservation(user, id, { reason } = {}) {
    const actor = this.requireUser(user);
    const reservation = this.reservationRow(id);
    if (reservation.buyer_id !== actor.id && reservation.seller_id !== actor.id) throw new MarketError('not_found', 'That reservation does not exist.', 404);
    if (!['pending_seller', 'active'].includes(reservation.status)) throw new MarketError('conflict', 'This reservation is already closed.', 409);
    const why = String(reason || '').trim();
    if (why.length < 3) throw new MarketError('reason_required', 'Add a short cancellation reason.');
    this.releaseReservation(reservation, actor.id, why);
    this.recordMetric('cancel', { user: actor, subjectId: id, campusId: this.listingRow(reservation.listing_id)?.campus_id, consent: Boolean(this.prefs(actor.id).metrics_consent), props: { reason: why } });
    const other = actor.id === reservation.buyer_id ? reservation.seller_id : reservation.buyer_id;
    this.notify(other, {
      kind: 'reservation', title: 'Reservation canceled', body: why, preview: 'A reservation was canceled',
      href: `/orders/${id}`, dedupeKey: `reserve-cancel:${id}`,
    });
    this.processJobs();
    return this.presentReservation(this.reservationRow(id), actor);
  },

  releaseReservation(reservation, actorId, reason) {
    this.immediate(() => {
      const info = this.db.prepare(`
        UPDATE reservations SET status = 'canceled', canceled_at = ?, cancel_reason = ? WHERE id = ? AND status IN ('pending_seller', 'active')
      `).run(this.iso(), reason, reservation.id);
      if (info.changes !== 1) throw new MarketError('conflict', 'This reservation changed. Reload it.', 409);
      if (!reservation.trade_id) {
        this.db.prepare(`UPDATE listings SET status = 'active', version = version + 1, updated_at = ? WHERE id = ? AND status = 'reserved'`).run(this.iso(), reservation.listing_id);
      }
      const intent = this.db.prepare(`SELECT * FROM payment_intents WHERE reservation_id = ? AND status = 'authorized'`).get(reservation.id);
      if (intent) this.db.prepare(`UPDATE payment_intents SET status = 'canceled' WHERE id = ? AND status = 'authorized'`).run(intent.id);
    });
    if (actorId) this.writeLog('info', 'reservation.cancel', { reservationId: reservation.id, actorId });
  },

  proposePickup(user, id, { startsAt, timezone, placeLabel } = {}) {
    const actor = this.requireUser(user);
    const reservation = this.requireOpenParty(actor, id);
    if (reservation.status !== 'active') throw new MarketError('conflict', 'The seller confirms the reservation before you agree on a pickup.', 409);
    const when = new Date(startsAt);
    if (Number.isNaN(when.getTime()) || when.getTime() < this.now().getTime()) throw new MarketError('invalid_time', 'Choose a future pickup time. Times are stored in UTC.');
    const zone = timezone || 'America/Chicago';
    try { localParts(when.toISOString(), zone); } catch { throw new MarketError('invalid_time', 'Use an IANA timezone such as America/Chicago.'); }
    const place = String(placeLabel || '').trim();
    if (place.length < 3 || place.length > 80 || STREET.test(place)) throw new MarketError('public_place', 'Name a public meeting place, not a home address.');
    const seller = this.userById(reservation.seller_id);
    const windows = this.db.prepare('SELECT * FROM availability WHERE user_id = ?').all(seller.id);
    if (windows.length) {
      const parts = localParts(when.toISOString(), zone);
      const fits = windows.some((window) => window.weekday === parts.weekday && parts.minutes >= window.start_minute && parts.minutes < window.end_minute);
      if (!fits) throw new MarketError('unavailable_time', 'That time is outside the seller’s posted availability.');
    }
    this.db.prepare(`UPDATE pickups SET status = 'canceled' WHERE reservation_id = ? AND status = 'proposed'`).run(id);
    const pickupId = this.rid('pkp');
    this.db.prepare(`
      INSERT INTO pickups (id, reservation_id, proposed_by, starts_at, timezone, place_label, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'proposed', ?)
    `).run(pickupId, id, actor.id, when.toISOString(), zone, place, this.iso());
    const other = actor.id === reservation.buyer_id ? reservation.seller_id : reservation.buyer_id;
    this.notify(other, {
      kind: 'pickup', title: 'Pickup proposed', body: `${place} · ${when.toISOString()}`, preview: 'A pickup time was proposed',
      href: `/orders/${id}`, dedupeKey: `pickup:${pickupId}`,
    });
    this.processJobs();
    return this.presentReservation(this.reservationRow(id), actor);
  },

  acceptPickup(user, id) {
    const actor = this.requireUser(user);
    const reservation = this.requireOpenParty(actor, id);
    const pickup = this.db.prepare(`SELECT * FROM pickups WHERE reservation_id = ? AND status = 'proposed' ORDER BY created_at DESC`).get(id);
    if (!pickup) throw new MarketError('conflict', 'There is no proposed pickup to accept.', 409);
    if (pickup.proposed_by === actor.id) throw new MarketError('forbidden', 'The other person accepts the proposed time.', 403);
    this.db.prepare(`UPDATE pickups SET status = 'accepted' WHERE id = ? AND status = 'proposed'`).run(pickup.id);
    this.db.prepare('UPDATE reservations SET expires_at = ? WHERE id = ?').run(new Date(Date.parse(pickup.starts_at) + 6 * 3600_000).toISOString(), id);
    const other = actor.id === reservation.buyer_id ? reservation.seller_id : reservation.buyer_id;
    this.notify(other, {
      kind: 'pickup', title: 'Pickup confirmed', body: 'You both have the same confirmed pickup.', preview: 'A pickup time was confirmed',
      href: `/orders/${id}`, dedupeKey: `pickup-ok:${pickup.id}`,
    });
    this.enqueue('notify', {
      userId: reservation.buyer_id, kind: 'reminder', title: 'Pickup reminder', body: 'Your confirmed pickup is coming up.',
      preview: 'You have an Out of Pocket pickup reminder', href: `/orders/${id}`, dedupeKey: `remind:${id}:buyer`,
    }, `remind:${id}:buyer`, new Date(Date.parse(pickup.starts_at) - 60 * 60_000).toISOString());
    this.processJobs();
    return this.presentReservation(this.reservationRow(id), actor);
  },

  reportNoShow(user, id) {
    const actor = this.requireUser(user);
    const reservation = this.requireOpenParty(actor, id);
    const other = actor.id === reservation.buyer_id ? reservation.seller_id : reservation.buyer_id;
    this.db.prepare('UPDATE reservations SET no_show_by = ? WHERE id = ?').run(other, id);
    return this.presentReservation(this.reservationRow(id), actor);
  },

  setAvailability(user, windows) {
    this.requireUser(user);
    if (!Array.isArray(windows) || windows.length > 21) throw new MarketError('invalid_availability', 'Add up to 21 weekly windows.');
    this.immediate(() => {
      this.db.prepare('DELETE FROM availability WHERE user_id = ?').run(user.id);
      for (const window of windows) {
        if (!Number.isInteger(window.weekday) || window.weekday < 0 || window.weekday > 6) throw new MarketError('invalid_availability', 'Weekday is 0–6.');
        if (!Number.isInteger(window.startMinute) || !Number.isInteger(window.endMinute) || window.startMinute < 0 || window.endMinute > 24 * 60 || window.startMinute >= window.endMinute) {
          throw new MarketError('invalid_availability', 'Each window needs a start and end minute.');
        }
        this.db.prepare('INSERT INTO availability (id, user_id, weekday, start_minute, end_minute, timezone) VALUES (?, ?, ?, ?, ?, ?)').run(
          this.rid('avl'), user.id, window.weekday, window.startMinute, window.endMinute, window.timezone || 'America/Chicago',
        );
      }
    });
    return this.db.prepare('SELECT weekday, start_minute AS startMinute, end_minute AS endMinute, timezone FROM availability WHERE user_id = ?').all(user.id);
  },

  issueHandoffCode(user, id) {
    const actor = this.requireUser(user);
    const reservation = this.requireOpenParty(actor, id);
    if (reservation.status !== 'active') throw new MarketError('conflict', 'The seller confirms the reservation before either of you shares a code.', 409);
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    this.db.prepare(`
      INSERT INTO handoff_codes (id, reservation_id, code_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)
    `).run(this.rid('hoc'), id, this.hashCode(id, code), new Date(this.now().getTime() + 10 * 60_000).toISOString(), this.iso());
    return { code, expiresInSeconds: 600, charged: false, note: 'This code only identifies the other person for this order. Entering it does not charge anyone.' };
  },

  verifyHandoffCode(user, id, { code } = {}) {
    const actor = this.requireUser(user);
    const reservation = this.requireOpenParty(actor, id);
    const row = this.db.prepare(`SELECT * FROM handoff_codes WHERE reservation_id = ? ORDER BY created_at DESC LIMIT 1`).get(id);
    if (!row) throw new MarketError('invalid_code', 'Ask for a code for this order first.', 401);
    if (row.verified_at) throw new MarketError('reused_code', 'That code was already used.', 401);
    if (row.expires_at <= this.iso()) throw new MarketError('invalid_code', 'That code is expired. Ask for a new one.', 401);
    if (row.attempts >= 5) throw new MarketError('invalid_code', 'Too many attempts. Ask for a new code.', 401);
    if (!this.sameHash(row.code_hash, this.hashCode(id, String(code || '').trim()))) {
      this.db.prepare('UPDATE handoff_codes SET attempts = attempts + 1 WHERE id = ?').run(row.id);
      throw new MarketError('invalid_code', 'That code does not match this order.', 401);
    }
    const info = this.db.prepare('UPDATE handoff_codes SET verified_at = ? WHERE id = ? AND verified_at IS NULL').run(this.iso(), row.id);
    if (info.changes !== 1) throw new MarketError('reused_code', 'That code was already used.', 401);
    this.db.prepare('UPDATE reservations SET identified_at = ? WHERE id = ?').run(this.iso(), id);
    return { identified: true, charged: false, reservation: this.presentReservation(this.reservationRow(id), actor) };
  },

  acceptItem(user, id, { checks } = {}) {
    const actor = this.requireUser(user);
    const reservation = this.reservationRow(id);
    if (reservation.buyer_id !== actor.id) throw new MarketError('forbidden', 'The buyer accepts the item after inspecting it. That acceptance is separate from identifying your partner.', 403);
    if (reservation.status !== 'active') throw new MarketError('conflict', 'This exchange is not ready to accept.', 409);
    if (!reservation.identified_at) throw new MarketError('identify_first', 'Identify each other with the order code before accepting the item.', 409);
    const snapshot = JSON.parse(reservation.listing_snapshot);
    const required = snapshot.checks || [];
    if (!Array.isArray(checks) || checks.length < required.length || checks.slice(0, required.length).some((value) => value !== true)) {
      throw new MarketError('inspection_incomplete', 'Confirm each inspection check before accepting the item.', 409);
    }
    this.db.prepare('UPDATE reservations SET buyer_accepted_at = ? WHERE id = ? AND buyer_accepted_at IS NULL').run(this.iso(), id);
    this.completeReservation(this.reservationRow(id));
    return this.presentReservation(this.reservationRow(id), actor);
  },

  completeReservation(reservation) {
    const amount = reservation.price_cents + reservation.fee_cents;
    if (amount > 0) {
      const intent = this.db.prepare(`SELECT * FROM payment_intents WHERE reservation_id = ? AND status = 'authorized' ORDER BY created_at DESC`).get(reservation.id);
      if (!intent) throw new MarketError('needs_authorization', 'Authorize payment before accepting a paid item. Nothing has been captured.', 409);
      if (!intent.capture_deadline || intent.capture_deadline <= this.iso()) throw new MarketError('authorization_expired', 'The payment authorization expired. Authorize again before accepting. Nothing was captured.', 409);
      this.applyProviderEvent({
        id: `capture_${intent.id}`,
        type: 'payment_intent.captured',
        intentId: intent.id,
        amountCents: intent.amount_cents,
      });
    }
    const now = this.iso();
    this.db.prepare(`UPDATE reservations SET status = 'completed', completed_at = ? WHERE id = ? AND status = 'active'`).run(now, reservation.id);
    this.db.prepare(`UPDATE listings SET status = 'sold', version = version + 1, updated_at = ? WHERE id = ?`).run(now, reservation.listing_id);
    this.recordMetric('completion', { campusId: this.listingRow(reservation.listing_id)?.campus_id, subjectId: reservation.id, props: { amount } });
    for (const person of [reservation.buyer_id, reservation.seller_id]) {
      this.notify(person, {
        kind: 'completed', title: 'Exchange complete', body: 'You can leave one review for this exchange.', preview: 'An Out of Pocket exchange was completed',
        href: `/orders/${reservation.id}`, dedupeKey: `done:${reservation.id}:${person}`,
      });
    }
    this.processJobs();
  },

  checkout(user, id) {
    const actor = this.requireUser(user);
    const reservation = this.reservationRow(id);
    if (reservation.buyer_id !== actor.id) throw new MarketError('forbidden', 'The buyer starts checkout.', 403);
    const amount = reservation.price_cents + reservation.fee_cents;
    if (amount === 0) throw new MarketError('free', 'Free exchanges skip payment setup.', 400);
    if (reservation.status !== 'active') throw new MarketError('conflict', 'The seller confirms the reservation before checkout.', 409);
    const existing = this.db.prepare(`
      SELECT * FROM payment_intents WHERE reservation_id = ? AND status IN ('requires_payment_method', 'authorized') ORDER BY created_at DESC
    `).get(id);
    if (existing?.status === 'authorized' && existing.capture_deadline > this.iso()) return this.presentIntent(existing);
    const intentId = this.rid('pi');
    this.db.prepare(`
      INSERT INTO payment_intents (id, reservation_id, amount_cents, currency, status, provider, created_at)
      VALUES (?, ?, ?, 'usd', 'requires_payment_method', 'sandbox', ?)
    `).run(intentId, id, amount, this.iso());
    return this.presentIntent(this.db.prepare('SELECT * FROM payment_intents WHERE id = ?').get(intentId));
  },

  confirmPayment(user, intentId, body = {}) {
    const actor = this.requireUser(user);
    const intent = this.db.prepare('SELECT * FROM payment_intents WHERE id = ?').get(intentId);
    if (!intent) throw new MarketError('not_found', 'That payment does not exist.', 404);
    if (intent.reservation_id) {
      const reservation = this.reservationRow(intent.reservation_id);
      if (reservation.buyer_id !== actor.id) throw new MarketError('forbidden', 'Only the buyer can confirm this payment method.', 403);
    } else {
      const trade = this.tradeRow(intent.trade_id);
      if (trade.cash_payer_id !== actor.id) throw new MarketError('forbidden', 'Only the person paying the cash difference can confirm it.', 403);
    }
    if (body.paid === true && body.paymentMethodToken !== 'sandbox_pm_ok') {
      this.writeLog('warn', 'payment.forged_client', { intentId });
    }
    if (body.paymentMethodToken !== 'sandbox_pm_ok') throw new MarketError('payment_declined', 'The payment method was declined. No charge was made.', 402);
    const deadline = new Date(this.now().getTime() + 5 * 24 * 3600_000).toISOString();
    this.applyProviderEvent({
      id: `auth_${intent.id}`,
      type: 'payment_intent.authorized',
      intentId: intent.id,
      amountCents: intent.amount_cents,
      captureDeadline: deadline,
    });
    return this.presentIntent(this.db.prepare('SELECT * FROM payment_intents WHERE id = ?').get(intent.id));
  },

  applyProviderEvent(event) {
    const hash = this.hashToken(JSON.stringify(event));
    try {
      this.db.prepare('INSERT INTO webhook_events (id, payload_hash, type, received_at) VALUES (?, ?, ?, ?)').run(event.id, hash, event.type, this.iso());
    } catch (error) {
      if (String(error.message).includes('UNIQUE') || error.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') return { duplicate: true };
      throw error;
    }
    if (event.type === 'payment_intent.authorized' || event.type === 'payment_intent.captured' || event.type === 'charge.refunded' || event.type === 'refund.settled') {
      const intent = event.intentId ? this.db.prepare('SELECT * FROM payment_intents WHERE id = ?').get(event.intentId) : null;
      if (!intent && event.type.startsWith('payment_intent')) return { ignored: true };
      if (event.type === 'payment_intent.authorized') {
        if (intent.status !== 'requires_payment_method') return { ignored: true };
        this.db.prepare(`UPDATE payment_intents SET status = 'authorized', authorized_at = ?, capture_deadline = ?, provider_ref = ? WHERE id = ? AND status = 'requires_payment_method'`).run(
          this.iso(), event.captureDeadline, event.providerRef || `sandbox_${intent.id}`, intent.id,
        );
        this.postLedger(event.id, intent.reservation_id, [
          { account: 'funds_held', direction: 'debit', amount: intent.amount_cents },
          { account: 'buyer_authorized', direction: 'credit', amount: intent.amount_cents },
        ], 'Authorization hold');
      }
      if (event.type === 'payment_intent.captured') {
        if (intent.status !== 'authorized') return { ignored: true };
        if (intent.reservation_id) {
          const accepted = this.db.prepare('SELECT buyer_accepted_at FROM reservations WHERE id = ?').get(intent.reservation_id);
          if (!accepted?.buyer_accepted_at) return { ignored: true };
        }
        const info = this.db.prepare(`UPDATE payment_intents SET status = 'captured', captured_at = ? WHERE id = ? AND status = 'authorized'`).run(this.iso(), intent.id);
        if (info.changes !== 1) return { ignored: true };
        const fee = 0;
        const entries = [
          { account: 'buyer_authorized', direction: 'debit', amount: intent.amount_cents },
          { account: 'seller_payable', direction: 'credit', amount: intent.amount_cents - fee },
        ];
        if (fee) entries.push({ account: 'platform_fee', direction: 'credit', amount: fee });
        this.postLedger(event.id, intent.reservation_id, entries, 'Capture after explicit acceptance');
      }
      if (event.type === 'charge.refunded') this.markRefund(event, false);
      if (event.type === 'refund.settled') this.markRefund(event, true);
    }
    if (event.type === 'charge.dispute.created') {
      this.db.prepare(`INSERT OR IGNORE INTO provider_disputes (id, reservation_id, provider_ref, status, amount_cents, created_at) VALUES (?, ?, ?, 'open', ?, ?)`).run(
        event.id, event.reservationId || null, event.providerRef || event.id, event.amountCents || 0, this.iso(),
      );
    }
    if (event.type === 'payout.paid' || event.type === 'payout.failed') this.settlePayout(event);
    return { duplicate: false };
  },

  markRefund(event, settled) {
    const dispute = event.disputeId ? this.db.prepare('SELECT * FROM disputes WHERE id = ?').get(event.disputeId) : null;
    if (!dispute || !dispute.refund_cents) return { ignored: true };
    if (!settled) return { submitted: true };
    if (dispute.bank_confirmed) return { ignored: true };
    this.postLedger(event.id, dispute.reservation_id, [
      { account: 'refund_pending', direction: 'debit', amount: dispute.refund_cents },
      { account: 'funds_released', direction: 'credit', amount: dispute.refund_cents },
    ], 'Provider reported refund settlement');
    this.db.prepare('UPDATE disputes SET bank_confirmed = 1, updated_at = ? WHERE id = ? AND bank_confirmed = 0').run(this.iso(), dispute.id);
    return { settled: true };
  },

  postLedger(groupId, reservationId, entries, memo) {
    const net = entries.reduce((sum, entry) => sum + (entry.direction === 'credit' ? entry.amount : -entry.amount), 0);
    if (net !== 0) throw new Error('Unbalanced ledger entries.');
    const existing = this.db.prepare('SELECT COUNT(*) AS n FROM ledger_entries WHERE group_id = ?').get(groupId).n;
    if (existing) return;
    for (const entry of entries) {
      if (!Number.isInteger(entry.amount) || entry.amount < 0) throw new Error('Ledger amounts must be integer cents.');
      if (entry.amount === 0) continue;
      this.db.prepare(`
        INSERT INTO ledger_entries (id, group_id, reservation_id, account, direction, amount_cents, memo, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(this.rid('led'), groupId, reservationId, entry.account, entry.direction, entry.amount, memo, this.iso());
    }
  },

  receipt(user, id) {
    const reservation = this.presentReservation(this.reservationRow(id), this.requireUser(user));
    const entries = this.db.prepare('SELECT account, direction, amount_cents, memo, created_at FROM ledger_entries WHERE reservation_id = ? ORDER BY created_at').all(id);
    return {
      ...reservation,
      studentFeeCents: 0,
      feePolicy: 'Out of Pocket does not add a student marketplace fee. The total is the agreed price plus any delivery fee you accepted before reserving.',
      bankConfirmed: false,
      ledger: entries,
    };
  },

  onboardSeller(user, body = {}) {
    this.requireUser(user);
    const destination = String(body.destinationLabel || '').trim();
    const requirements = [];
    if (!body.acceptTerms) requirements.push('Accept the payout terms.');
    if (destination.length < 4) requirements.push('Add the destination label from your payout provider.');
    const status = requirements.length ? 'pending' : 'enabled';
    this.db.prepare(`
      INSERT INTO seller_accounts (user_id, provider, status, destination_label, requirements, updated_at)
      VALUES (?, 'sandbox', ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET status = excluded.status, destination_label = excluded.destination_label,
        requirements = excluded.requirements, updated_at = excluded.updated_at
    `).run(user.id, status, status === 'enabled' ? destination : null, JSON.stringify(requirements), this.iso());
    return this.sellerAccount(user);
  },

  sellerAccount(user) {
    const account = this.db.prepare('SELECT * FROM seller_accounts WHERE user_id = ?').get(user.id);
    const payouts = this.db.prepare('SELECT id, amount_cents AS amountCents, status, destination_label AS destinationLabel, failure_reason AS failureReason, created_at AS createdAt, updated_at AS updatedAt FROM payouts WHERE user_id = ? ORDER BY created_at DESC').all(user.id);
    return {
      status: account?.status || 'not_started',
      destinationLabel: account?.status === 'enabled' ? account.destination_label : null,
      requirements: account ? JSON.parse(account.requirements || '[]') : ['Start payout setup.'],
      availableCents: this.availableBalance(user.id),
      payouts,
      note: 'A payout is complete only after the provider reports it paid. Pending setup is not a completed payout.',
    };
  },

  availableBalance(userId) {
    const credits = this.db.prepare(`SELECT COALESCE(SUM(amount_cents), 0) AS n FROM ledger_entries WHERE account = 'seller_payable' AND direction = 'credit' AND reservation_id IN (SELECT id FROM reservations WHERE seller_id = ?)`).get(userId).n;
    const debits = this.db.prepare(`SELECT COALESCE(SUM(amount_cents), 0) AS n FROM ledger_entries WHERE account = 'seller_payable' AND direction = 'debit' AND reservation_id IN (SELECT id FROM reservations WHERE seller_id = ?)`).get(userId).n;
    const pending = this.db.prepare(`SELECT COALESCE(SUM(amount_cents), 0) AS n FROM payouts WHERE user_id = ? AND status IN ('pending', 'in_transit', 'paid')`).get(userId).n;
    return credits - debits - pending;
  },

  requestPayout(user, { amountCents } = {}) {
    this.requireUser(user);
    const account = this.sellerAccount(user);
    if (account.status !== 'enabled') throw new MarketError('payout_unavailable', 'Payout setup is not complete, so no payout was sent.', 409);
    if (!Number.isInteger(amountCents) || amountCents <= 0 || amountCents > account.availableCents) throw new MarketError('invalid_amount', 'That amount is not available to pay out.');
    const id = this.rid('pay');
    this.db.prepare(`
      INSERT INTO payouts (id, user_id, amount_cents, status, destination_label, created_at, updated_at) VALUES (?, ?, ?, 'pending', ?, ?, ?)
    `).run(id, user.id, amountCents, account.destinationLabel, this.iso(), this.iso());
    return this.sellerAccount(user);
  },

  settlePayout(event) {
    const payout = this.db.prepare('SELECT * FROM payouts WHERE id = ?').get(event.payoutId);
    if (!payout || payout.status === 'paid' || payout.status === 'failed') return { ignored: true };
    if (event.type === 'payout.failed') {
      this.db.prepare(`UPDATE payouts SET status = 'failed', failure_reason = ?, updated_at = ? WHERE id = ? AND status IN ('pending', 'in_transit')`).run(event.reason || 'The provider rejected the payout.', this.iso(), payout.id);
      return { failed: true };
    }
    this.db.prepare(`UPDATE payouts SET status = 'paid', updated_at = ? WHERE id = ? AND status IN ('pending', 'in_transit')`).run(this.iso(), payout.id);
    return { paid: true };
  },

  openDispute(user, id, { reason, details } = {}) {
    const actor = this.requireUser(user);
    const reservation = this.reservationRow(id);
    if (reservation.buyer_id !== actor.id && reservation.seller_id !== actor.id) throw new MarketError('not_found', 'That reservation does not exist.', 404);
    if (!['active', 'completed'].includes(reservation.status)) throw new MarketError('conflict', 'Disputes attach to an active or completed exchange.', 409);
    const text = String(reason || '').trim();
    if (text.length < 3) throw new MarketError('reason_required', 'Add a dispute reason.');
    const disputeId = this.rid('dsp');
    this.db.prepare(`
      INSERT INTO disputes (id, reservation_id, opener_id, reason, status, deadline_at, created_at, updated_at) VALUES (?, ?, ?, ?, 'open', ?, ?, ?)
    `).run(disputeId, id, actor.id, text, new Date(this.now().getTime() + 3 * 24 * 3600_000).toISOString(), this.iso(), this.iso());
    if (details) this.db.prepare('INSERT INTO dispute_notes (id, dispute_id, author_id, body, created_at) VALUES (?, ?, ?, ?, ?)').run(this.rid('note'), disputeId, actor.id, String(details).slice(0, 4000), this.iso());
    return { dispute: this.presentDispute(disputeId), refunded: false, note: 'Opening a dispute does not refund the payment.' };
  },

  addDisputeNote(user, disputeId, { body } = {}) {
    const actor = this.requireUser(user);
    const dispute = this.db.prepare('SELECT * FROM disputes WHERE id = ?').get(disputeId);
    if (!dispute) throw new MarketError('not_found', 'That dispute does not exist.', 404);
    const reservation = this.reservationRow(dispute.reservation_id);
    const staff = ['admin', 'finance', 'support', 'moderator'].includes(actor.role);
    if (!staff && actor.id !== reservation.buyer_id && actor.id !== reservation.seller_id) throw new MarketError('not_found', 'That dispute does not exist.', 404);
    const text = String(body || '').trim();
    if (text.length < 1) throw new MarketError('invalid_message', 'Add a note.');
    this.db.prepare('INSERT INTO dispute_notes (id, dispute_id, author_id, body, created_at) VALUES (?, ?, ?, ?, ?)').run(this.rid('note'), disputeId, actor.id, text.slice(0, 4000), this.iso());
    if (actor.id === reservation.seller_id && dispute.status === 'open') {
      this.db.prepare(`UPDATE disputes SET status = 'seller_responded', updated_at = ? WHERE id = ?`).run(this.iso(), disputeId);
    }
    return this.presentDispute(disputeId);
  },

  resolveDispute(user, disputeId, { remedy, refundCents, reason } = {}) {
    this.assertRole(user, ['finance', 'admin']);
    const dispute = this.db.prepare('SELECT * FROM disputes WHERE id = ?').get(disputeId);
    if (!dispute) throw new MarketError('not_found', 'That dispute does not exist.', 404);
    const why = String(reason || '').trim();
    this.audit(user, 'resolve_dispute', why, 'dispute', disputeId);
    let bankConfirmed = false;
    let refundState = null;
    if (remedy === 'full_refund' || remedy === 'partial_refund') {
      const reservation = this.reservationRow(dispute.reservation_id);
      const captured = this.db.prepare(`SELECT * FROM payment_intents WHERE reservation_id = ? AND status = 'captured'`).get(reservation.id);
      const amount = remedy === 'full_refund' ? captured?.amount_cents : refundCents;
      if (!captured || !Number.isInteger(amount) || amount <= 0 || amount > captured.amount_cents) throw new MarketError('invalid_amount', 'Refund an amount the provider has captured.', 409);
      this.postLedger(`refund_${dispute.id}`, reservation.id, [
        { account: 'seller_payable', direction: 'debit', amount },
        { account: 'refund_pending', direction: 'credit', amount },
      ], 'Refund submitted to the provider');
      this.db.prepare(`UPDATE disputes SET status = 'remedy', remedy = ?, refund_cents = ?, bank_confirmed = 0, updated_at = ? WHERE id = ?`).run(remedy, amount, this.iso(), disputeId);
      refundState = 'submitted';
    } else if (remedy === 'none') {
      this.db.prepare(`UPDATE disputes SET status = 'closed', remedy = 'none', updated_at = ? WHERE id = ?`).run(this.iso(), disputeId);
    } else throw new MarketError('invalid_remedy', 'Choose none, partial_refund, or full_refund.');
    return {
      dispute: this.presentDispute(disputeId),
      refundState,
      bankConfirmed,
      message: refundState ? 'Refund submitted to the payment provider. Bank confirmation is not available until the provider reports settlement.' : 'The dispute was closed without a refund.',
    };
  },

  presentDispute(id) {
    const dispute = this.db.prepare('SELECT * FROM disputes WHERE id = ?').get(id);
    const notes = this.db.prepare('SELECT author_id AS authorId, body, created_at AS createdAt FROM dispute_notes WHERE dispute_id = ? ORDER BY created_at').all(id);
    return {
      id: dispute.id,
      reservationId: dispute.reservation_id,
      reason: dispute.reason,
      status: dispute.status,
      remedy: dispute.remedy,
      refundCents: dispute.refund_cents,
      bankConfirmed: Boolean(dispute.bank_confirmed),
      deadlineAt: dispute.deadline_at,
      notes,
    };
  },

  webhook(raw, signature) {
    const relay = String(signature || '').replace(/^v1=/, '');
    const expected = createHmac('sha256', this.webhookSecret).update(raw).digest('hex');
    let valid = false;
    try { valid = this.sameHash(expected, relay); } catch { valid = false; }
    if (!valid) throw new MarketError('invalid_signature', 'The webhook signature does not match.', 401);
    const event = JSON.parse(raw);
    if (!event.id || !event.type) throw new MarketError('invalid_event', 'Webhook events need an id and type.');
    return this.applyProviderEvent(event);
  },

  expireReservations() {
    const due = this.db.prepare(`SELECT * FROM reservations WHERE status IN ('pending_seller', 'active') AND expires_at <= ?`).all(this.iso());
    for (const reservation of due) this.releaseReservation(reservation, null, 'The hold expired.');
  },

  expireOffers() {
    this.db.prepare(`UPDATE offers SET status = 'expired', resolved_at = ? WHERE status = 'pending' AND expires_at <= ?`).run(this.iso(), this.iso());
  },

  expireListings() {
    this.db.prepare(`UPDATE listings SET status = 'expired', updated_at = ? WHERE status = 'active' AND expires_at IS NOT NULL AND expires_at <= ?`).run(this.iso(), this.iso());
  },

  expireUploads() {
    const stale = this.db.prepare(`SELECT * FROM photos WHERE listing_id IS NULL AND expires_at IS NOT NULL AND expires_at <= ?`).all(this.iso());
    for (const photo of stale) {
      this.db.prepare('DELETE FROM photos WHERE id = ?').run(photo.id);
      for (const path of [photo.blob_path, photo.thumb_path]) {
        if (!path.startsWith('/images/')) try { rmFile(path); } catch { /* already gone */ }
      }
    }
  },

  reservationRow(id) {
    const row = this.db.prepare('SELECT * FROM reservations WHERE id = ?').get(id);
    if (!row) throw new MarketError('not_found', 'That reservation does not exist.', 404);
    return row;
  },

  requireOpenParty(user, id) {
    const reservation = this.reservationRow(id);
    if (reservation.buyer_id !== user.id && reservation.seller_id !== user.id) throw new MarketError('not_found', 'That reservation does not exist.', 404);
    if (!['pending_seller', 'active'].includes(reservation.status)) throw new MarketError('conflict', 'This exchange is closed.', 409);
    return reservation;
  },

  openReservation(listingId) {
    return this.db.prepare(`SELECT * FROM reservations WHERE listing_id = ? AND status IN ('pending_seller', 'active')`).get(listingId);
  },

  sharedOpenOrder(a, b) {
    return Boolean(this.db.prepare(`
      SELECT 1 FROM reservations WHERE status IN ('pending_seller', 'active')
      AND ((buyer_id = ? AND seller_id = ?) OR (buyer_id = ? AND seller_id = ?))
    `).get(a, b, b, a));
  },

  assertCanContact(actor, conversation) {
    const other = actor.id === conversation.buyer_id ? conversation.seller_id : conversation.buyer_id;
    if (this.blockedEither(actor.id, other) && !this.sharedOpenOrder(actor.id, other)) {
      throw new MarketError('blocked', 'Blocking stops new messages. An open exchange can still be resolved.', 403);
    }
  },

  presentConversation(row, user) {
    const last = this.db.prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 1').get(row.id);
    const readAt = user.id === row.buyer_id ? row.buyer_read_at : row.seller_read_at;
    const unread = this.db.prepare(`
      SELECT COUNT(*) AS n FROM messages WHERE conversation_id = ? AND sender_id != ? AND created_at > COALESCE(?, '')
    `).get(row.id, user.id, readAt || '').n;
    return {
      id: row.id,
      listing: this.presentListing(this.listingRow(row.listing_id), user),
      buyerId: row.buyer_id,
      sellerId: row.seller_id,
      updatedAt: row.updated_at,
      unread,
      lastMessage: last ? this.presentMessage(last) : null,
      offers: this.offersFor(row.id),
    };
  },

  presentMessage(row) {
    return { id: row.id, senderId: row.sender_id, body: row.body, createdAt: row.created_at, clientId: row.client_id };
  },

  offersFor(conversationId) {
    return this.db.prepare('SELECT * FROM offers WHERE conversation_id = ? ORDER BY created_at').all(conversationId).map((offer) => ({
      id: offer.id, proposerId: offer.proposer_id, amountCents: offer.amount_cents, status: offer.status,
      createdAt: offer.created_at, expiresAt: offer.expires_at, reserveUntil: offer.reserve_until,
    }));
  },

  presentReservation(row, user) {
    if (row.buyer_id !== user.id && row.seller_id !== user.id && !['admin', 'support', 'finance', 'moderator'].includes(user.role)) {
      throw new MarketError('not_found', 'That reservation does not exist.', 404);
    }
    const pickup = this.db.prepare(`SELECT * FROM pickups WHERE reservation_id = ? AND status IN ('proposed', 'accepted') ORDER BY created_at DESC`).get(row.id);
    const intent = this.db.prepare('SELECT * FROM payment_intents WHERE reservation_id = ? ORDER BY created_at DESC').get(row.id);
    return {
      id: row.id,
      listingId: row.listing_id,
      buyerId: row.buyer_id,
      sellerId: row.seller_id,
      status: row.status,
      priceCents: row.price_cents,
      feeCents: row.fee_cents,
      totalCents: row.price_cents + row.fee_cents,
      fulfillment: row.fulfillment,
      snapshot: JSON.parse(row.listing_snapshot),
      expiresAt: row.expires_at,
      identified: Boolean(row.identified_at),
      buyerAccepted: Boolean(row.buyer_accepted_at),
      sellerAccepted: Boolean(row.seller_accepted_at),
      cancelReason: row.cancel_reason,
      noShowBy: row.no_show_by,
      pickup: pickup ? {
        id: pickup.id, startsAt: pickup.starts_at, timezone: pickup.timezone, placeLabel: pickup.place_label, status: pickup.status, proposedBy: pickup.proposed_by,
      } : null,
      payment: intent ? this.presentIntent(intent) : null,
    };
  },

  presentIntent(intent) {
    return {
      id: intent.id,
      amountCents: intent.amount_cents,
      currency: intent.currency,
      status: intent.status,
      provider: intent.provider,
      captureDeadline: intent.capture_deadline,
      sandbox: intent.provider === 'sandbox',
      studentFeeCents: 0,
      note: intent.provider === 'sandbox' ? 'Sandbox authorization. No bank charge.' : 'Provider payment.',
    };
  },

  snapshotListing(listing, priceCents) {
    return {
      id: listing.id,
      title: listing.title,
      description: listing.description,
      category: listing.category,
      condition: listing.condition,
      priceCents,
      categoryDetails: JSON.parse(listing.category_details || '{}'),
      checks: JSON.parse(listing.checks || '[]'),
      version: listing.version,
    };
  },

  orders(user) {
    this.requireUser(user);
    return this.db.prepare(`SELECT * FROM reservations WHERE buyer_id = ? OR seller_id = ? ORDER BY created_at DESC`).all(user.id, user.id).map((row) => this.presentReservation(row, user));
  },
};

function rmFile(path) {
  try { unlinkSync(path); } catch { /* The abandoned upload is already gone. */ }
}
