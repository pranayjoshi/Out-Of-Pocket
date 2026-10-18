import { MarketError } from './domain.mjs';

export const communityMethods = {
  notifications(user) {
    this.requireUser(user);
    this.processJobs();
    return this.db.prepare(`
      SELECT id, kind, title, body, preview, href, created_at AS createdAt, read_at AS readAt
      FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 100
    `).all(user.id);
  },

  markNotification(user, id) {
    this.requireUser(user);
    const info = this.db.prepare('UPDATE notifications SET read_at = ? WHERE id = ? AND user_id = ?').run(this.iso(), id, user.id);
    if (info.changes !== 1) throw new MarketError('not_found', 'That notification does not exist.', 404);
    return { ok: true };
  },

  registerDevice(user, { token, platform } = {}) {
    this.requireUser(user);
    if (!token || !['ios', 'web'].includes(platform)) throw new MarketError('invalid_device', 'Register an iOS or web device token.');
    this.db.prepare(`
      INSERT INTO device_tokens (id, user_id, token, platform, created_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id, token) DO UPDATE SET platform = excluded.platform
    `).run(this.rid('dev'), user.id, String(token).slice(0, 400), platform, this.iso());
    return { ok: true };
  },

  registerPush(user, { endpoint } = {}) {
    this.requireUser(user);
    if (!endpoint || String(endpoint).length > 1000) throw new MarketError('invalid_device', 'Add a web push endpoint.');
    this.db.prepare(`
      INSERT INTO push_subscriptions (id, user_id, endpoint, created_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id, endpoint) DO NOTHING
    `).run(this.rid('push'), user.id, endpoint, this.iso());
    return { ok: true, configured: Boolean(process.env.VAPID_PUBLIC_KEY) };
  },

  report(user, { targetType, targetId, reason, details } = {}) {
    const actor = this.requireUser(user);
    if (!['listing', 'profile', 'message', 'exchange'].includes(targetType)) throw new MarketError('invalid_report', 'Choose a listing, profile, message, or exchange.');
    const why = String(reason || '').trim();
    if (why.length < 3) throw new MarketError('reason_required', 'Add a report reason.');
    const evidence = this.reportEvidence(actor, targetType, targetId);
    const id = this.rid('rpt');
    this.db.prepare(`
      INSERT INTO reports (id, reporter_id, target_type, target_id, reason, details, evidence, campus_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, actor.id, targetType, targetId, why, String(details || '').slice(0, 2000), JSON.stringify(evidence), evidence.campusId || actor.campus_id, this.iso());
    this.recordMetric('report', { user: actor, subjectId: id, campusId: evidence.campusId || actor.campus_id, consent: Boolean(this.prefs(actor.id).metrics_consent), props: { targetType } });
    return { id, status: 'open' };
  },

  reportEvidence(user, targetType, targetId) {
    if (targetType === 'listing') {
      const listing = this.listingRow(targetId);
      if (!listing) throw new MarketError('not_found', 'That listing does not exist.', 404);
      return { campusId: listing.campus_id, title: listing.title, ownerId: listing.owner_id, snapshot: listing.description.slice(0, 500) };
    }
    if (targetType === 'profile') {
      const person = this.userById(targetId);
      if (!person) throw new MarketError('not_found', 'That profile does not exist.', 404);
      return { campusId: person.campus_id, displayName: person.display_name };
    }
    if (targetType === 'message') {
      const message = this.db.prepare('SELECT * FROM messages WHERE id = ?').get(targetId);
      if (!message) throw new MarketError('not_found', 'That message does not exist.', 404);
      this.conversationFor(user, message.conversation_id);
      return { body: message.body, senderId: message.sender_id, conversationId: message.conversation_id, campusId: user.campus_id };
    }
    const reservation = this.reservationRow(targetId);
    if (reservation.buyer_id !== user.id && reservation.seller_id !== user.id) throw new MarketError('not_found', 'That exchange does not exist.', 404);
    return { reservationId: reservation.id, snapshot: JSON.parse(reservation.listing_snapshot), campusId: user.campus_id };
  },

  block(user, blockedId) {
    const actor = this.requireUser(user);
    if (blockedId === actor.id) throw new MarketError('invalid_block', 'You cannot block yourself.');
    if (!this.userById(blockedId)) throw new MarketError('not_found', 'That person does not exist.', 404);
    this.db.prepare('INSERT OR IGNORE INTO blocks (blocker_id, blocked_id, created_at) VALUES (?, ?, ?)').run(actor.id, blockedId, this.iso());
    return { blocked: true, note: 'New messages are stopped. An exchange that is already open can still be finished.' };
  },

  unblock(user, blockedId) {
    this.requireUser(user);
    this.db.prepare('DELETE FROM blocks WHERE blocker_id = ? AND blocked_id = ?').run(user.id, blockedId);
    return { blocked: false };
  },

  blocks(user) {
    this.requireUser(user);
    return this.db.prepare('SELECT blocked_id AS userId, created_at AS createdAt FROM blocks WHERE blocker_id = ?').all(user.id);
  },

  staffQueue(user) {
    this.assertRole(user, ['admin', 'moderator', 'support', 'finance']);
    const campusFilter = user.role === 'moderator' ? JSON.parse(user.moderator_campuses || '[]') : null;
    const allow = (campusId) => !campusFilter || campusFilter.includes(campusId);
    return {
      reports: this.db.prepare(`SELECT * FROM reports WHERE status = 'open' ORDER BY created_at`).all().filter((row) => allow(row.campus_id)).map(presentReport),
      signals: this.db.prepare(`SELECT * FROM signals WHERE status = 'open' ORDER BY created_at`).all().filter((row) => allow(row.campus_id)),
      tickets: this.db.prepare(`SELECT * FROM support_tickets WHERE status = 'open' ORDER BY created_at`).all().filter((row) => allow(row.campus_id)),
      disputes: user.role === 'finance' || user.role === 'admin' ? this.db.prepare(`SELECT id, reservation_id, status, reason FROM disputes WHERE status IN ('open', 'seller_responded', 'staff_review')`).all() : [],
    };
  },

  staffDecision(user, { action, targetType, targetId, reason, until } = {}) {
    this.assertRole(user, ['admin', 'moderator', 'support']);
    if (action === 'refund') throw new MarketError('forbidden', 'Refunds use the finance dispute action.', 403);
    const why = String(reason || '').trim();
    if (action === 'remove_listing') {
      const listing = this.listingRow(targetId);
      if (!listing) throw new MarketError('not_found', 'That listing does not exist.', 404);
      this.campusScope(user, listing.campus_id);
      this.db.prepare(`UPDATE listings SET status = 'withdrawn', updated_at = ? WHERE id = ?`).run(this.iso(), listing.id);
    } else if (action === 'suspend_user') {
      const person = this.userById(targetId);
      if (!person) throw new MarketError('not_found', 'That account does not exist.', 404);
      this.campusScope(user, person.campus_id);
      const untilAt = until || new Date(this.now().getTime() + 7 * 24 * 3600_000).toISOString();
      this.db.prepare('UPDATE users SET restricted_until = ? WHERE id = ?').run(untilAt, person.id);
      this.notify(person.id, { kind: 'account', title: 'Account restricted', body: why, preview: 'Your Out of Pocket account was restricted', href: '/account', dedupeKey: `suspend:${person.id}:${untilAt}` });
    } else if (action === 'reinstate_user') {
      const person = this.userById(targetId);
      if (!person) throw new MarketError('not_found', 'That account does not exist.', 404);
      this.campusScope(user, person.campus_id);
      this.db.prepare('UPDATE users SET restricted_until = NULL WHERE id = ?').run(person.id);
    } else if (action === 'dismiss_report' || action === 'resolve_report') {
      const report = this.db.prepare('SELECT * FROM reports WHERE id = ?').get(targetId);
      if (!report) throw new MarketError('not_found', 'That report does not exist.', 404);
      this.campusScope(user, report.campus_id);
      this.db.prepare(`UPDATE reports SET status = ? WHERE id = ?`).run(action === 'dismiss_report' ? 'dismissed' : 'resolved', report.id);
    } else if (action === 'message_user') {
      this.notify(targetId, { kind: 'support', title: 'Message from Out of Pocket support', body: why, preview: 'You have a message from Out of Pocket support', href: '/notifications', dedupeKey: `staff-msg:${targetId}:${this.iso()}` });
    } else if (action === 'close_signal') {
      this.db.prepare(`UPDATE signals SET status = 'closed' WHERE id = ?`).run(targetId);
    } else throw new MarketError('invalid_action', 'That staff action is not available.');
    this.audit(user, action, why, targetType || action, targetId);
    this.processJobs();
    return { ok: true };
  },

  createTicket(user, { subject, body } = {}) {
    const actor = this.requireUser(user);
    const title = String(subject || '').trim();
    const text = String(body || '').trim();
    if (title.length < 3 || text.length < 3) throw new MarketError('invalid_ticket', 'Add a subject and a message.');
    const id = this.rid('tck');
    this.db.prepare(`INSERT INTO support_tickets (id, user_id, subject, body, campus_id, created_at) VALUES (?, ?, ?, ?, ?, ?)`).run(id, actor.id, title.slice(0, 120), text.slice(0, 4000), actor.campus_id, this.iso());
    return { id, status: 'open' };
  },

  appeal(user, { actionId, reason } = {}) {
    const actor = this.requireUser(user);
    const action = this.db.prepare('SELECT * FROM staff_actions WHERE id = ?').get(actionId);
    if (!action) throw new MarketError('not_found', 'That decision does not exist.', 404);
    return this.createTicket(actor, { subject: `Appeal ${action.action}`, body: `${reason || ''}\n\nDecision ${action.id}: ${action.reason}` });
  },

  exportAccount(user) {
    const actor = this.requireUser(user);
    return {
      exportedAt: this.iso(),
      profile: this.presentSelf(actor),
      listings: this.db.prepare('SELECT id, title, status, price_cents, created_at FROM listings WHERE owner_id = ?').all(actor.id),
      messages: this.db.prepare('SELECT id, conversation_id, body, created_at FROM messages WHERE sender_id = ?').all(actor.id),
      reservations: this.db.prepare('SELECT id, listing_id, status, price_cents, listing_snapshot, created_at FROM reservations WHERE buyer_id = ? OR seller_id = ?').all(actor.id, actor.id),
      notifications: this.notifications(actor),
    };
  },

  requestDeletion(user) {
    const actor = this.requireUser(user);
    const open = this.db.prepare(`SELECT COUNT(*) AS n FROM reservations WHERE status IN ('pending_seller', 'active') AND (buyer_id = ? OR seller_id = ?)`).get(actor.id, actor.id).n;
    const disputes = this.db.prepare(`SELECT COUNT(*) AS n FROM disputes d JOIN reservations r ON r.id = d.reservation_id WHERE d.status NOT IN ('closed', 'remedy') AND (r.buyer_id = ? OR r.seller_id = ?)`).get(actor.id, actor.id).n;
    if (open || disputes) {
      const id = this.rid('del');
      this.db.prepare(`INSERT INTO deletion_requests (id, user_id, status, detail, created_at) VALUES (?, ?, 'blocked', ?, ?)`).run(
        id, actor.id, 'Deletion waits until open exchanges and disputes are finished. Completed exchange records stay for the other person.', this.iso(),
      );
      return { status: 'blocked', detail: 'Finish open exchanges and disputes first. Public sign-in stays available until then.' };
    }
    const now = this.iso();
    this.db.prepare(`UPDATE users SET display_name = 'Deleted account', bio = '', email = ?, deleted_at = ?, visibility = 'private' WHERE id = ?`).run(`deleted+${actor.id}@invalid.relay`, now, actor.id);
    this.db.prepare(`UPDATE listings SET status = 'withdrawn', updated_at = ? WHERE owner_id = ? AND status IN ('draft', 'active')`).run(now, actor.id);
    this.db.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').run(now, actor.id);
    this.db.prepare(`INSERT INTO deletion_requests (id, user_id, status, detail, created_at, completed_at) VALUES (?, ?, 'completed', ?, ?, ?)`).run(
      this.rid('del'), actor.id, 'Public identity and sessions were removed. Completed exchange snapshots remain.', now, now,
    );
    return { status: 'completed', detail: 'Your public name, bio, and sign-in were removed. People in completed exchanges still see “Deleted account.”' };
  },

  saveSearch(user, { query, frequency = 'immediate' } = {}) {
    this.requireUser(user);
    if (!query || typeof query !== 'object') throw new MarketError('invalid_search', 'Save a search query.');
    if (!['immediate', 'digest'].includes(frequency)) throw new MarketError('invalid_search', 'Frequency is immediate or digest.');
    const id = this.rid('srch');
    this.db.prepare('INSERT INTO saved_searches (id, user_id, query, frequency, created_at) VALUES (?, ?, ?, ?, ?)').run(id, user.id, JSON.stringify(query), frequency, this.iso());
    return { id, query, frequency };
  },

  savedSearches(user) {
    this.requireUser(user);
    return this.db.prepare('SELECT id, query, frequency, created_at AS createdAt FROM saved_searches WHERE user_id = ?').all(user.id).map((row) => ({ ...row, query: JSON.parse(row.query) }));
  },

  deleteSearch(user, id) {
    this.requireUser(user);
    const info = this.db.prepare('DELETE FROM saved_searches WHERE id = ? AND user_id = ?').run(id, user.id);
    if (info.changes !== 1) throw new MarketError('not_found', 'That saved search does not exist.', 404);
    return { ok: true };
  },

  matchSavedSearches(listing) {
    if (listing.status !== 'active') return;
    const searches = this.db.prepare('SELECT * FROM saved_searches').all();
    for (const search of searches) {
      if (search.user_id === listing.owner_id) continue;
      const query = JSON.parse(search.query);
      if (!searchMatches(query, listing)) continue;
      const runAt = search.frequency === 'digest' ? new Date(this.now().getTime() + 12 * 3600_000).toISOString() : this.iso();
      this.enqueue('notify', {
        userId: search.user_id, kind: 'alert', title: 'A saved search matched', body: listing.title,
        preview: 'A saved Out of Pocket search matched a listing', href: `/listing/${listing.id}`, dedupeKey: `alert:${search.id}:${listing.id}`,
      }, `alert:${search.id}:${listing.id}`, runAt);
    }
    this.processJobs();
  },

  review(user, reservationId, body = {}) {
    const actor = this.requireUser(user);
    const reservation = this.reservationRow(reservationId);
    if (reservation.status !== 'completed') throw new MarketError('conflict', 'Reviews open after a completed exchange, not after a cancellation or no-show.', 409);
    if (actor.id !== reservation.buyer_id && actor.id !== reservation.seller_id) throw new MarketError('forbidden', 'Only the buyer and seller can review this exchange.', 403);
    const score = (value, label) => {
      if (!Number.isInteger(value) || value < 1 || value > 5) throw new MarketError('invalid_review', `${label} is a score from 1 to 5.`);
      return value;
    };
    const reviewee = actor.id === reservation.buyer_id ? reservation.seller_id : reservation.buyer_id;
    const publishAt = new Date(Date.parse(reservation.completed_at) + 7 * 24 * 3600_000).toISOString();
    try {
      this.db.prepare(`
        INSERT INTO reviews (id, reservation_id, reviewer_id, reviewee_id, accuracy, communication, punctuality, body, created_at, publish_at, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'held')
      `).run(this.rid('rev'), reservation.id, actor.id, reviewee, score(body.accuracy, 'Accuracy'), score(body.communication, 'Communication'), score(body.punctuality, 'Punctuality'), String(body.body || '').slice(0, 1000), this.iso(), publishAt);
    } catch (error) {
      if (String(error.message).includes('UNIQUE')) throw new MarketError('duplicate_review', 'You already reviewed this exchange.', 409);
      throw error;
    }
    const count = this.db.prepare('SELECT COUNT(*) AS n FROM reviews WHERE reservation_id = ?').get(reservation.id).n;
    if (count >= 2) this.db.prepare(`UPDATE reviews SET status = 'published', publish_at = ? WHERE reservation_id = ? AND status = 'held'`).run(this.iso(), reservation.id);
    return { status: count >= 2 ? 'published' : 'held', note: 'A review stays hidden until both people submit one or the review window ends.' };
  },

  publishDueReviews() {
    this.db.prepare(`UPDATE reviews SET status = 'published' WHERE status = 'held' AND publish_at <= ?`).run(this.iso());
  },

  dashboard(user) {
    const actor = this.requireUser(user);
    const groups = Object.fromEntries(['draft', 'active', 'reserved', 'sold', 'withdrawn', 'expired'].map((status) => [
      status, this.db.prepare('SELECT * FROM listings WHERE owner_id = ? AND status = ? ORDER BY updated_at DESC').all(actor.id, status).map((row) => this.presentListing(row, actor)),
    ]));
    const needs = [];
    const offers = this.db.prepare(`
      SELECT o.*, c.listing_id, c.buyer_id, c.seller_id FROM offers o JOIN conversations c ON c.id = o.conversation_id
      WHERE o.status = 'pending' AND o.proposer_id != ?
    `).all(actor.id).filter((offer) => offer.buyer_id === actor.id || offer.seller_id === actor.id);
    for (const offer of offers) needs.push({ type: 'offer', href: `/messages/${offer.conversation_id}`, listingId: offer.listing_id });
    const holds = this.db.prepare(`SELECT * FROM reservations WHERE seller_id = ? AND status = 'pending_seller'`).all(actor.id);
    for (const hold of holds) needs.push({ type: 'confirm_reservation', href: `/orders/${hold.id}`, listingId: hold.listing_id });
    const pickups = this.db.prepare(`
      SELECT p.*, r.listing_id FROM pickups p JOIN reservations r ON r.id = p.reservation_id
      WHERE p.status = 'proposed' AND p.proposed_by != ? AND (r.buyer_id = ? OR r.seller_id = ?)
    `).all(actor.id, actor.id, actor.id);
    for (const pickup of pickups) needs.push({ type: 'confirm_pickup', href: `/orders/${pickup.reservation_id}`, listingId: pickup.listing_id });
    return { listings: groups, needsResponse: needs, purchases: this.orders(actor).filter((order) => order.buyerId === actor.id), sales: this.orders(actor).filter((order) => order.sellerId === actor.id) };
  },

  createPost(user, body = {}) {
    const actor = this.requireUser(user);
    const title = String(body.title || '').trim();
    if (!['find', 'offer', 'trade'].includes(body.intent)) throw new MarketError('invalid_post', 'A post is a find, offer, or trade.');
    if (title.length < 3) throw new MarketError('invalid_title', 'Add a title.');
    const id = this.rid('post');
    this.db.prepare(`
      INSERT INTO posts (id, owner_id, campus_id, intent, title, details, category, budget_cents, exchange_for, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, actor.id, actor.campus_id, body.intent, title.slice(0, 80), String(body.details || '').slice(0, 1000), body.category || 'Dorm & living', Number.isInteger(body.budgetCents) ? body.budgetCents : 0, body.exchangeFor || null, new Date(this.now().getTime() + 14 * 24 * 3600_000).toISOString(), this.iso());
    return this.presentPost(this.db.prepare('SELECT * FROM posts WHERE id = ?').get(id), actor);
  },

  posts(user, { campus } = {}) {
    this.requireUser(user);
    return this.db.prepare(`SELECT * FROM posts WHERE status = 'open' AND (campus_id = ? OR ? = 1) ORDER BY created_at DESC`).all(user.campus_id, campus === 'all' ? 1 : 0)
      .filter((post) => post.campus_id === user.campus_id)
      .map((post) => this.presentPost(post, user));
  },

  updatePost(user, id, body = {}) {
    const post = this.ownPost(user, id);
    if (post.status !== 'open') throw new MarketError('conflict', 'Closed posts stay as they were.', 409);
    const title = body.title == null ? post.title : String(body.title).trim();
    this.db.prepare('UPDATE posts SET title = ?, details = ?, version = version + 1 WHERE id = ? AND owner_id = ?').run(title.slice(0, 80), body.details == null ? post.details : String(body.details).slice(0, 1000), id, user.id);
    return this.presentPost(this.db.prepare('SELECT * FROM posts WHERE id = ?').get(id), user);
  },

  closePost(user, id) {
    this.ownPost(user, id);
    this.db.prepare(`UPDATE posts SET status = 'closed', version = version + 1 WHERE id = ?`).run(id);
    return { status: 'closed' };
  },

  respondToPost(user, id, { listingId } = {}) {
    const actor = this.requireUser(user);
    const post = this.db.prepare('SELECT * FROM posts WHERE id = ?').get(id);
    if (!post || post.status !== 'open') throw new MarketError('not_found', 'That post is not open.', 404);
    if (post.owner_id === actor.id) throw new MarketError('forbidden', 'Someone else responds to your post.', 403);
    if (post.campus_id !== actor.campus_id) throw new MarketError('forbidden', 'This post is limited to its campus.', 403);
    const listing = this.listingRow(listingId);
    if (!listing || listing.owner_id !== actor.id || listing.status !== 'active') throw new MarketError('invalid_listing', 'Respond with one of your active listings.', 409);
    const thread = this.ensureThread(post.owner_id, listing);
    const responseId = this.rid('rsp');
    this.db.prepare(`
      INSERT INTO post_responses (id, post_id, responder_id, listing_id, conversation_id, created_at) VALUES (?, ?, ?, ?, ?, ?)
    `).run(responseId, post.id, actor.id, listing.id, thread.id, this.iso());
    this.notify(post.owner_id, {
      kind: 'post', title: 'Someone responded to your post', body: listing.title, preview: 'Your campus post got a response',
      href: `/messages/${thread.id}`, dedupeKey: `post-response:${responseId}`,
    });
    this.processJobs();
    return { id: responseId, conversationId: thread.id, listingId: listing.id };
  },

  ensureThread(buyerId, listing) {
    const existing = this.db.prepare('SELECT * FROM conversations WHERE listing_id = ? AND buyer_id = ?').get(listing.id, buyerId);
    if (existing) return existing;
    const id = this.rid('con');
    const now = this.iso();
    this.db.prepare('INSERT INTO conversations (id, listing_id, buyer_id, seller_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(id, listing.id, buyerId, listing.owner_id, now, now);
    return this.db.prepare('SELECT * FROM conversations WHERE id = ?').get(id);
  },

  acceptPostResponse(user, responseId) {
    const response = this.db.prepare('SELECT * FROM post_responses WHERE id = ?').get(responseId);
    if (!response) throw new MarketError('not_found', 'That response does not exist.', 404);
    const post = this.ownPost(user, response.post_id);
    this.db.prepare(`UPDATE post_responses SET status = 'accepted' WHERE id = ?`).run(response.id);
    this.db.prepare(`UPDATE posts SET status = 'fulfilled' WHERE id = ?`).run(post.id);
    this.notify(response.responder_id, {
      kind: 'post', title: 'Your response was accepted', body: post.title, preview: 'A campus post response was accepted',
      href: `/messages/${response.conversation_id}`, dedupeKey: `post-accept:${response.id}`,
    });
    this.processJobs();
    return this.presentPost(this.db.prepare('SELECT * FROM posts WHERE id = ?').get(post.id), user);
  },

  ownPost(user, id) {
    this.requireUser(user);
    const post = this.db.prepare('SELECT * FROM posts WHERE id = ?').get(id);
    if (!post || post.owner_id !== user.id) throw new MarketError('not_found', 'That post does not exist.', 404);
    return post;
  },

  presentPost(post, viewer) {
    const responses = this.db.prepare('SELECT id, responder_id AS responderId, listing_id AS listingId, conversation_id AS conversationId, status FROM post_responses WHERE post_id = ?').all(post.id);
    return {
      id: post.id, ownerId: post.owner_id, campus: post.campus_id, intent: post.intent, title: post.title, details: post.details,
      category: post.category, budgetCents: post.budget_cents, exchangeFor: post.exchange_for, status: post.status, expiresAt: post.expires_at,
      responses: viewer?.id === post.owner_id ? responses : responses.filter((response) => response.responderId === viewer?.id),
    };
  },

  proposeTrade(user, { listingId, theirListingId, cashCents = 0 } = {}) {
    const actor = this.requireUser(user);
    if (!this.flags().cash_on_trades.enabled && cashCents) throw new MarketError('cash_disabled', 'Cash adjustments are off until the payment foundation is enabled.', 409);
    const mine = this.listingRow(listingId);
    const theirs = this.listingRow(theirListingId);
    if (!mine || mine.owner_id !== actor.id || mine.status !== 'active') throw new MarketError('invalid_listing', 'Offer one of your active listings.', 409);
    if (!theirs || theirs.owner_id === actor.id || theirs.status !== 'active') throw new MarketError('invalid_listing', 'Choose the other person’s active listing.', 409);
    if (cashCents && (!Number.isInteger(cashCents) || cashCents < 0)) throw new MarketError('invalid_amount', 'Cash adjustments use integer cents.');
    const id = this.rid('trd');
    this.db.prepare(`
      INSERT INTO trades (id, proposer_id, counterparty_id, listing_a_id, listing_b_id, snapshot_a, snapshot_b, cash_cents, cash_payer_id, proposer_accepted_at, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'proposed', ?)
    `).run(id, actor.id, theirs.owner_id, mine.id, theirs.id, JSON.stringify(this.snapshotListing(mine, mine.price_cents)), JSON.stringify(this.snapshotListing(theirs, theirs.price_cents)), cashCents || 0, cashCents ? actor.id : null, this.iso(), this.iso());
    this.notify(theirs.owner_id, { kind: 'trade', title: 'Trade proposed', body: mine.title, preview: 'You have an Out of Pocket trade proposal', href: `/board`, dedupeKey: `trade:${id}` });
    this.processJobs();
    return this.presentTrade(this.db.prepare('SELECT * FROM trades WHERE id = ?').get(id));
  },

  acceptTrade(user, id) {
    const actor = this.requireUser(user);
    const trade = this.tradeRow(id);
    if (trade.counterparty_id !== actor.id) throw new MarketError('forbidden', 'The other person accepts the trade.', 403);
    if (trade.status !== 'proposed') throw new MarketError('conflict', 'This trade is no longer a proposal.', 409);
    this.immediate(() => {
      for (const listingId of [trade.listing_a_id, trade.listing_b_id]) {
        const info = this.db.prepare(`UPDATE listings SET status = 'reserved', version = version + 1, updated_at = ? WHERE id = ? AND status = 'active'`).run(this.iso(), listingId);
        if (info.changes !== 1) throw new MarketError('unavailable', 'One of the items is no longer available, so neither was reserved.', 409);
      }
      const info = this.db.prepare(`UPDATE trades SET status = 'reserved', counterparty_accepted_at = ? WHERE id = ? AND status = 'proposed'`).run(this.iso(), id);
      if (info.changes !== 1) throw new MarketError('conflict', 'This trade changed.', 409);
    });
    return this.presentTrade(this.tradeRow(id));
  },

  confirmTrade(user, id) {
    const actor = this.requireUser(user);
    const trade = this.tradeRow(id);
    if (![trade.proposer_id, trade.counterparty_id].includes(actor.id)) throw new MarketError('not_found', 'That trade does not exist.', 404);
    if (trade.status !== 'reserved') throw new MarketError('conflict', 'Both people accept the trade before either confirms the handoff.', 409);
    if (trade.cash_cents > 0) {
      const paid = this.db.prepare(`SELECT 1 FROM payment_intents WHERE trade_id = ? AND status = 'authorized'`).get(trade.id);
      if (!paid) throw new MarketError('needs_authorization', 'Authorize the cash difference before completing the trade.', 409);
    }
    const column = actor.id === trade.proposer_id ? 'proposer_confirmed_at' : 'counterparty_confirmed_at';
    this.db.prepare(`UPDATE trades SET ${column} = ? WHERE id = ?`).run(this.iso(), id);
    const current = this.tradeRow(id);
    if (current.proposer_confirmed_at && current.counterparty_confirmed_at) {
      if (current.cash_cents > 0) {
        const intent = this.db.prepare(`SELECT * FROM payment_intents WHERE trade_id = ? AND status = 'authorized'`).get(id);
        this.applyProviderEvent({ id: `capture_${intent.id}`, type: 'payment_intent.captured', intentId: intent.id, amountCents: intent.amount_cents });
      }
      this.db.prepare(`UPDATE trades SET status = 'completed' WHERE id = ?`).run(id);
      this.db.prepare(`UPDATE listings SET status = 'sold', updated_at = ? WHERE id IN (?, ?)`).run(this.iso(), trade.listing_a_id, trade.listing_b_id);
    }
    return this.presentTrade(this.tradeRow(id));
  },

  cancelTrade(user, id, { reason } = {}) {
    const trade = this.tradeRow(id);
    if (![trade.proposer_id, trade.counterparty_id].includes(user.id)) throw new MarketError('not_found', 'That trade does not exist.', 404);
    if (!['proposed', 'reserved'].includes(trade.status)) throw new MarketError('conflict', 'This trade is already closed.', 409);
    this.immediate(() => {
      this.db.prepare(`UPDATE trades SET status = 'canceled' WHERE id = ?`).run(id);
      if (trade.status === 'reserved') {
        this.db.prepare(`UPDATE listings SET status = 'active', updated_at = ? WHERE id IN (?, ?) AND status = 'reserved'`).run(this.iso(), trade.listing_a_id, trade.listing_b_id);
      }
    });
    return { status: 'canceled', reason: reason || '' };
  },

  authorizeTrade(user, id) {
    const actor = this.requireUser(user);
    const trade = this.tradeRow(id);
    if (trade.cash_payer_id !== actor.id) throw new MarketError('forbidden', 'Only the person paying the cash difference can authorize it.', 403);
    if (!trade.cash_cents) throw new MarketError('free', 'This trade has no cash difference.', 400);
    const intentId = this.rid('pi');
    this.db.prepare(`
      INSERT INTO payment_intents (id, trade_id, amount_cents, currency, status, provider, created_at)
      VALUES (?, ?, ?, 'usd', 'requires_payment_method', 'sandbox', ?)
    `).run(intentId, trade.id, trade.cash_cents, this.iso());
    return this.presentIntent(this.db.prepare('SELECT * FROM payment_intents WHERE id = ?').get(intentId));
  },

  tradeRow(id) {
    const trade = this.db.prepare('SELECT * FROM trades WHERE id = ?').get(id);
    if (!trade) throw new MarketError('not_found', 'That trade does not exist.', 404);
    return trade;
  },

  presentTrade(trade) {
    return {
      id: trade.id, proposerId: trade.proposer_id, counterpartyId: trade.counterparty_id, listingAId: trade.listing_a_id, listingBId: trade.listing_b_id,
      snapshotA: JSON.parse(trade.snapshot_a), snapshotB: JSON.parse(trade.snapshot_b), cashCents: trade.cash_cents, status: trade.status,
      proposerAccepted: Boolean(trade.proposer_accepted_at), counterpartyAccepted: Boolean(trade.counterparty_accepted_at),
      proposerConfirmed: Boolean(trade.proposer_confirmed_at), counterpartyConfirmed: Boolean(trade.counterparty_confirmed_at),
    };
  },

  createPlan(user, { name, budgetCents } = {}) {
    this.requireUser(user);
    const title = String(name || '').trim();
    if (title.length < 2) throw new MarketError('invalid_plan', 'Name the plan.');
    if (!Number.isInteger(budgetCents) || budgetCents < 1) throw new MarketError('invalid_amount', 'Set a budget in cents.');
    const id = this.rid('pln');
    this.db.prepare('INSERT INTO plans (id, owner_id, name, budget_cents, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(id, user.id, title.slice(0, 60), budgetCents, this.iso(), this.iso());
    return this.presentPlan(this.db.prepare('SELECT * FROM plans WHERE id = ?').get(id), user);
  },

  plans(user) {
    this.requireUser(user);
    return this.db.prepare('SELECT * FROM plans WHERE owner_id = ? ORDER BY updated_at DESC').all(user.id).map((plan) => this.presentPlan(plan, user));
  },

  addPlanItem(user, planId, listingId) {
    const plan = this.ownPlan(user, planId);
    const listing = this.getListing(user, listingId);
    this.db.prepare('INSERT OR REPLACE INTO plan_items (plan_id, listing_id, saved_price_cents) VALUES (?, ?, ?)').run(plan.id, listingId, listing.priceCents);
    this.db.prepare('UPDATE plans SET updated_at = ? WHERE id = ?').run(this.iso(), plan.id);
    return this.presentPlan(this.db.prepare('SELECT * FROM plans WHERE id = ?').get(plan.id), user);
  },

  removePlanItem(user, planId, listingId) {
    const plan = this.ownPlan(user, planId);
    this.db.prepare('DELETE FROM plan_items WHERE plan_id = ? AND listing_id = ?').run(plan.id, listingId);
    return this.presentPlan(this.db.prepare('SELECT * FROM plans WHERE id = ?').get(plan.id), user);
  },

  ownPlan(user, id) {
    this.requireUser(user);
    const plan = this.db.prepare('SELECT * FROM plans WHERE id = ? AND owner_id = ?').get(id, user.id);
    if (!plan) throw new MarketError('not_found', 'That plan does not exist.', 404);
    return plan;
  },

  presentPlan(plan, user) {
    const items = this.db.prepare('SELECT * FROM plan_items WHERE plan_id = ?').all(plan.id).map((item) => {
      const listing = this.listingRow(item.listing_id);
      const available = listing?.status === 'active';
      return {
        listingId: item.listing_id,
        savedPriceCents: item.saved_price_cents,
        currentPriceCents: listing?.price_cents ?? null,
        status: listing?.status || 'missing',
        available,
        priceChanged: listing ? listing.price_cents !== item.saved_price_cents : false,
        title: listing?.title || 'Removed listing',
      };
    });
    const actionableTotal = items.filter((item) => item.available).reduce((sum, item) => sum + item.currentPriceCents, 0);
    return { id: plan.id, name: plan.name, budgetCents: plan.budget_cents, items, actionableTotalCents: actionableTotal, reservedSpendCents: 0, completedSpendCents: 0 };
  },

  addSlot(user, listingId, { startsAt, durationMinutes, priceCents } = {}) {
    const listing = this.ownService(user, listingId);
    if (!Number.isInteger(durationMinutes) || durationMinutes < 15) throw new MarketError('invalid_slot', 'Duration is at least 15 minutes.');
    if (!Number.isInteger(priceCents) || priceCents < 0) throw new MarketError('invalid_amount', 'Set the session price in cents.');
    const when = new Date(startsAt);
    if (Number.isNaN(when.getTime())) throw new MarketError('invalid_time', 'Choose a start time.');
    const id = this.rid('slot');
    try {
      this.db.prepare(`INSERT INTO service_slots (id, listing_id, starts_at, duration_minutes, price_cents) VALUES (?, ?, ?, ?, ?)`).run(id, listing.id, when.toISOString(), durationMinutes, priceCents);
    } catch (error) {
      if (String(error.message).includes('UNIQUE')) throw new MarketError('unavailable', 'That start time is already on the calendar.', 409);
      throw error;
    }
    return { id, startsAt: when.toISOString(), durationMinutes, priceCents, totalCents: priceCents, status: 'open' };
  },

  bookSlot(user, slotId) {
    const actor = this.requireUser(user);
    const slot = this.immediate(() => {
      const current = this.db.prepare('SELECT * FROM service_slots WHERE id = ?').get(slotId);
      if (!current) throw new MarketError('not_found', 'That session does not exist.', 404);
      const info = this.db.prepare(`UPDATE service_slots SET status = 'booked', booked_by = ? WHERE id = ? AND status = 'open'`).run(actor.id, slotId);
      if (info.changes !== 1) throw new MarketError('unavailable', 'That session is already booked.', 409);
      return this.db.prepare('SELECT * FROM service_slots WHERE id = ?').get(slotId);
    });
    return { id: slot.id, startsAt: slot.starts_at, durationMinutes: slot.duration_minutes, priceCents: slot.price_cents, totalCents: slot.price_cents, status: slot.status };
  },

  ownService(user, listingId) {
    const listing = this.listingRow(listingId);
    if (!listing || listing.owner_id !== user.id || listing.listing_type !== 'service') throw new MarketError('not_found', 'That service listing does not exist.', 404);
    return listing;
  },

  bookRide(user, listingId) {
    const actor = this.requireUser(user);
    return this.immediate(() => {
      const listing = this.listingRow(listingId);
      if (!listing || listing.listing_type !== 'ride' || listing.status !== 'active') throw new MarketError('unavailable', 'That ride is not open.', 409);
      if (listing.owner_id === actor.id) throw new MarketError('self_purchase', 'You cannot book your own ride.', 403);
      const details = JSON.parse(listing.category_details || '{}');
      const left = details.seatsLeft ?? details.seats ?? 0;
      if (left < 1) throw new MarketError('unavailable', 'That ride has no seats left.', 409);
      const info = this.db.prepare(`
        UPDATE listings SET category_details = ?, version = version + 1, updated_at = ?
        WHERE id = ? AND status = 'active' AND category_details = ?
      `).run(JSON.stringify({ ...details, seatsLeft: left - 1 }), this.iso(), listing.id, listing.category_details);
      if (info.changes !== 1) throw new MarketError('unavailable', 'That ride changed. Try again.', 409);
      try {
        this.db.prepare('INSERT INTO ride_bookings (id, listing_id, rider_id, created_at) VALUES (?, ?, ?, ?)').run(this.rid('ride'), listing.id, actor.id, this.iso());
      } catch (error) {
        if (String(error.message).includes('UNIQUE')) throw new MarketError('duplicate', 'You already have a seat.', 409);
        throw error;
      }
      return { listingId: listing.id, seatsLeft: left - 1, destination: details.destination || '' };
    });
  },

  claimTicket(user, listingId) {
    const actor = this.requireUser(user);
    const listing = this.listingRow(listingId);
    if (!listing || listing.listing_type !== 'ticket') throw new MarketError('not_found', 'That ticket listing does not exist.', 404);
    return this.reserve(actor, { listingId, idempotencyKey: `ticket:${actor.id}:${listingId}` });
  },

  setFulfillment(user, listingId, body = {}) {
    const listing = this.listingRow(listingId);
    if (!listing || listing.owner_id !== user.id) throw new MarketError('forbidden', 'Only the seller sets fulfillment.', 403);
    const method = body.method === 'seller_delivery' ? 'seller_delivery' : 'pickup';
    const fee = method === 'seller_delivery' ? body.feeCents : 0;
    if (!Number.isInteger(fee) || fee < 0) throw new MarketError('invalid_amount', 'Delivery fee uses integer cents.');
    this.db.prepare(`
      INSERT INTO fulfillment (listing_id, method, max_miles, fee_cents, transport_notes) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(listing_id) DO UPDATE SET method = excluded.method, max_miles = excluded.max_miles, fee_cents = excluded.fee_cents, transport_notes = excluded.transport_notes
    `).run(listingId, method, body.maxMiles ?? null, fee, String(body.transportNotes || '').slice(0, 200));
    return this.presentListing(this.listingRow(listingId), user);
  },

  quoteFor(listing, miles) {
    const row = this.db.prepare('SELECT * FROM fulfillment WHERE listing_id = ?').get(listing.id);
    if (!row || row.method !== 'seller_delivery') throw new MarketError('pickup_only', 'This listing is pickup only.', 409);
    if (!Number.isFinite(Number(miles)) || Number(miles) < 0) throw new MarketError('invalid_distance', 'Add the delivery distance in miles.');
    if (row.max_miles != null && Number(miles) > row.max_miles) throw new MarketError('too_far', 'That distance is outside the seller’s delivery limit.', 409);
    return { method: 'seller_delivery', miles: Number(miles), feeCents: row.fee_cents, itemCents: listing.price_cents, totalCents: listing.price_cents + row.fee_cents };
  },

  deliveryQuote(user, listingId, { miles } = {}) {
    this.requireUser(user);
    const listing = this.listingRow(listingId);
    if (!listing) throw new MarketError('not_found', 'That listing does not exist.', 404);
    return this.quoteFor(listing, miles);
  },

  saveAddress(user, { label, line } = {}) {
    this.requireUser(user);
    const text = String(line || '').trim();
    if (text.length < 4) throw new MarketError('invalid_address', 'Add an address.');
    const id = this.rid('addr');
    this.db.prepare('INSERT INTO addresses (id, user_id, label, line, created_at) VALUES (?, ?, ?, ?, ?)').run(id, user.id, String(label || 'Delivery').slice(0, 40), text.slice(0, 200), this.iso());
    return { id, note: 'The address is hidden until a seller-delivery reservation is active, and then only the seller in that reservation can read it.' };
  },

  addressForOrder(user, reservationId) {
    const reservation = this.reservationRow(reservationId);
    if (reservation.seller_id !== user.id || reservation.fulfillment !== 'seller_delivery' || !['active', 'pending_seller'].includes(reservation.status)) {
      throw new MarketError('forbidden', 'The delivery address opens for the seller only during an active delivery reservation.', 403);
    }
    return this.db.prepare('SELECT id, label, line FROM addresses WHERE user_id = ? ORDER BY created_at DESC LIMIT 1').get(reservation.buyer_id) || null;
  },

  saveCampaign(user, body = {}) {
    this.assertRole(user, ['advertiser', 'admin']);
    const campus = body.campus || user.campus_id;
    if (user.role === 'advertiser' && campus !== user.campus_id) throw new MarketError('forbidden', 'You can only edit campaigns for your university.', 403);
    const existing = body.id ? this.db.prepare('SELECT * FROM promotion_campaigns WHERE id = ?').get(body.id) : null;
    if (existing && user.role !== 'admin' && existing.campus_id !== user.campus_id) throw new MarketError('forbidden', 'You can only edit campaigns for your university.', 403);
    const id = existing?.id || this.rid('cmp');
    const title = String(body.title || '').trim();
    if (title.length < 2) throw new MarketError('invalid_campaign', 'Add a campaign title.');
    const status = existing?.status || 'pending';
    this.db.prepare(`
      INSERT INTO promotion_campaigns (id, campus_id, owner_id, title, body, destination, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET title = excluded.title, body = excluded.body, destination = excluded.destination, updated_at = excluded.updated_at
    `).run(id, campus, existing?.owner_id || user.id, title.slice(0, 80), String(body.body || '').slice(0, 300), String(body.destination || '').slice(0, 500), status, this.iso(), this.iso());
    return this.db.prepare('SELECT * FROM promotion_campaigns WHERE id = ?').get(id);
  },

  approveCampaign(user, id, { reason } = {}) {
    this.assertRole(user, ['admin', 'moderator']);
    const campaign = this.db.prepare('SELECT * FROM promotion_campaigns WHERE id = ?').get(id);
    if (!campaign) throw new MarketError('not_found', 'That campaign does not exist.', 404);
    this.campusScope(user, campaign.campus_id);
    this.audit(user, 'approve_campaign', reason || 'Approved for campus publication.', 'campaign', id);
    this.db.prepare(`UPDATE promotion_campaigns SET status = 'approved', updated_at = ? WHERE id = ?`).run(this.iso(), id);
    return this.db.prepare('SELECT * FROM promotion_campaigns WHERE id = ?').get(id);
  },

  recordPromotionEvent(user, campaignId, { kind, dedupeKey } = {}) {
    if (!['impression', 'click'].includes(kind)) throw new MarketError('invalid_event', 'Record an impression or a click.');
    const campaign = this.db.prepare(`SELECT * FROM promotion_campaigns WHERE id = ? AND status = 'approved'`).get(campaignId);
    if (!campaign) throw new MarketError('not_found', 'That published campaign does not exist.', 404);
    const key = String(dedupeKey || '').slice(0, 200);
    if (!key) throw new MarketError('invalid_event', 'Include a dedupe key so a refresh is not another impression.');
    this.db.prepare(`
      INSERT INTO promotion_events (id, campaign_id, user_id, kind, dedupe_key, created_at) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(dedupe_key) DO NOTHING
    `).run(this.rid('imp'), campaignId, user?.id || null, kind, key, this.iso());
    return { ok: true };
  },

  promotionMetrics(user, campaignId) {
    this.assertRole(user, ['admin', 'moderator', 'advertiser']);
    const campaign = this.db.prepare('SELECT * FROM promotion_campaigns WHERE id = ?').get(campaignId);
    if (!campaign) throw new MarketError('not_found', 'That campaign does not exist.', 404);
    if (user.role === 'advertiser' && campaign.campus_id !== user.campus_id) throw new MarketError('forbidden', 'You can only read metrics for your university.', 403);
    this.campusScope(user, campaign.campus_id);
    const rows = this.db.prepare('SELECT kind, COUNT(*) AS n FROM promotion_events WHERE campaign_id = ? GROUP BY kind').all(campaignId);
    return { campaignId, impressions: rows.find((row) => row.kind === 'impression')?.n || 0, clicks: rows.find((row) => row.kind === 'click')?.n || 0, note: 'Counts include only recorded events. Nothing is estimated.' };
  },

  metrics(user) {
    this.assertRole(user, ['admin', 'support']);
    const events = this.db.prepare(`SELECT campus_id AS campus, kind, COUNT(*) AS n FROM metrics_events GROUP BY campus_id, kind`).all();
    const zero = this.db.prepare(`SELECT COUNT(*) AS n FROM metrics_events WHERE kind = 'search' AND json_extract(props, '$.zero') = 1`).get().n;
    const replies = this.db.prepare(`
      SELECT c.created_at, (SELECT MIN(m.created_at) FROM messages m WHERE m.conversation_id = c.id AND m.sender_id = c.seller_id) AS reply
      FROM conversations c
    `).all().filter((row) => row.reply);
    const responseHours = replies.length ? Math.round((replies.reduce((sum, row) => sum + (Date.parse(row.reply) - Date.parse(row.created_at)) / 3_600_000, 0) / replies.length) * 10) / 10 : null;
    const sold = this.db.prepare(`SELECT COUNT(*) AS n FROM listings WHERE status = 'sold' AND source = 'live'`).get().n;
    const considered = this.db.prepare(`SELECT COUNT(*) AS n FROM listings WHERE source = 'live' AND status IN ('sold', 'active', 'withdrawn', 'expired')`).get().n;
    return { events, zeroResultSearches: zero, meanHoursToFirstReply: responseHours, sellThrough: considered ? sold / considered : null, cancellations: this.db.prepare(`SELECT COUNT(*) AS n FROM reservations WHERE status = 'canceled'`).get().n };
  },

  jobs(user) {
    this.assertRole(user, ['admin', 'support']);
    return this.db.prepare('SELECT id, kind, status, attempts, last_error, run_at FROM jobs ORDER BY created_at DESC LIMIT 100').all();
  },
};

function presentReport(row) {
  return { id: row.id, targetType: row.target_type, targetId: row.target_id, reason: row.reason, details: row.details, evidence: JSON.parse(row.evidence || '{}'), status: row.status, campusId: row.campus_id, createdAt: row.created_at };
}

function searchMatches(query, listing) {
  if (query.category && query.category !== listing.category) return false;
  if (query.campus && query.campus !== listing.campus_id && !listing.cross_campus) return false;
  if (query.maxPrice != null && listing.price_cents > Number(query.maxPrice)) return false;
  if (query.minPrice != null && listing.price_cents < Number(query.minPrice)) return false;
  if (query.condition && query.condition !== listing.condition) return false;
  if (query.q) {
    const haystack = `${listing.title} ${listing.description} ${listing.category}`.toLowerCase();
    if (!haystack.includes(String(query.q).toLowerCase())) return false;
  }
  return listing.status === 'active';
}
