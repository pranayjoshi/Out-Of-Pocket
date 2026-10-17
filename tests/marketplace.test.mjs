import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { Worker } from 'node:worker_threads';
import { Marketplace, createMarketplace, redact } from '../server/marketplace/domain.mjs';
import { createMarketplaceHandler, signWebhook } from '../server/marketplace/http.mjs';
import { processImage, samplePng, stripJpegMetadata } from '../server/marketplace/images.mjs';

const clock = new Date('2026-10-17T18:00:00.000Z');
const now = () => new Date(clock.getTime());
const root = mkdtempSync(join(tmpdir(), 'relay-market-'));
const logs = [];
const market = createMarketplace({ directory: root, now, log: (line) => logs.push(line) });

test.after(() => {
  market.close();
  rmSync(root, { recursive: true, force: true });
});

async function account(email) {
  const requested = market.requestCode(email, { preview: true, ip: email });
  return market.verifyCode(email, requested.previewCode, { ip: email });
}

function call(handler, { method = 'GET', path, token, body, host = '127.0.0.1:8787', raw, signature }) {
  return new Promise((resolve, reject) => {
    const payload = raw ?? (body == null ? null : JSON.stringify(body));
    const req = Readable.from(payload ? [Buffer.from(payload)] : []);
    req.method = method;
    req.url = path;
    req.headers = {
      host,
      'content-type': 'application/json',
      authorization: token ? `Bearer ${token}` : '',
      origin: `http://${host}`,
      ...(signature ? { 'x-relay-signature': signature } : {}),
    };
    req.socket = { remoteAddress: '127.0.0.1' };
    const res = {
      status: 200,
      chunks: [],
      writeHead(status) { this.status = status; },
      end(chunk) {
        if (chunk) this.chunks.push(Buffer.from(chunk));
        const text = Buffer.concat(this.chunks).toString('utf8');
        let json = null;
        try { json = text ? JSON.parse(text) : null; } catch { json = text; }
        resolve({ status: this.status, json });
      },
    };
    Promise.resolve(handler(req, res, () => resolve({ status: 404, json: null }))).catch(reject);
  });
}

test('email codes preserve one account and campus membership cannot be edited', async () => {
  const first = await account('ada@ua.edu');
  const again = await account('ada@ua.edu');
  assert.equal(again.user.id, first.user.id);
  assert.equal(again.user.campus, 'Alabama');
  assert.match(again.user.campusVerification.proves, /does not prove current enrollment/);
  assert.throws(() => market.updateMe(market.userFromToken(again.token), { campusId: 'Auburn' }), /verified email domain/);
  assert.equal(market.userFromToken(again.token).campus_id, 'Alabama');
  assert.throws(() => market.requestCode('ada@gmail.com', { preview: true }), /approved university email/);
});

test('a live listing is visible to a second campus member and hidden from another campus', async () => {
  const seller = await account('seller@crimson.ua.edu');
  const buyer = await account('buyer@ua.edu');
  const auburn = await account('buyer@auburn.edu');
  const sellerUser = market.userFromToken(seller.token);
  const listing = market.createListing(sellerUser, {
    title: 'Blue desk lamp', description: 'Works, small scuff.', category: 'Dorm & living', condition: 'Good', priceCents: 1500,
    categoryDetails: { widthIn: 6, depthIn: 6, heightIn: 14, transport: 'One hand' }, status: 'active',
  });
  const seen = market.listListings(market.userFromToken(buyer.token), { q: 'lamp', maxPrice: 2000 });
  assert.equal(seen.items.some((item) => item.id === listing.id), true);
  const hidden = market.listListings(market.userFromToken(auburn.token), { q: 'lamp' });
  assert.equal(hidden.items.some((item) => item.id === listing.id), false);
  assert.throws(() => market.updateListing(market.userFromToken(buyer.token), listing.id, { title: 'Stolen lamp' }), /Only the seller/);
});

test('search finds an available used desk under $50 and ignores a bad upload', async () => {
  const buyer = market.userFromToken((await account('desk@ua.edu')).token);
  const page = market.listListings(buyer, { q: 'desk', maxPrice: 5000, category: 'Dorm & living', condition: 'Good', area: 'North campus', sort: 'newest' });
  assert.equal(page.items.some((item) => item.title === 'Used dorm desk' && item.categoryDetails.widthIn === 42), true);
  const edition = market.listListings(buyer, { category: 'Textbooks', edition: '3rd' });
  assert.equal(edition.items.some((item) => item.categoryDetails.course === 'BSC 114'), true);
  assert.throws(() => market.savePhoto(buyer, Buffer.from('not an image')), /JPEG or PNG/);
  const before = market.getListing(buyer, 'lst_desk').photos.length;
  assert.throws(() => market.savePhoto(buyer, Buffer.from('nope')), /JPEG or PNG/);
  assert.equal(market.getListing(buyer, 'lst_desk').photos.length, before);
});

test('photos strip location metadata and attach only after a successful upload', async () => {
  const seller = market.userFromToken((await account('photos@ua.edu')).token);
  const jpeg = Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    Buffer.from([0xff, 0xe1, 0x00, 0x10]),
    Buffer.from('Exif\0GPSSECRET!!'),
    Buffer.from([0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x40, 0x00, 0x40, 0x01, 0x01, 0x11, 0x00]),
    Buffer.from([0xff, 0xda, 0x00, 0x02, 0x00, 0xff, 0xd9]),
  ]);
  assert.equal(stripJpegMetadata(jpeg).includes(Buffer.from('GPSSECRET')), false);
  const png = samplePng();
  const processed = processImage(png);
  assert.ok(processed.width >= 32);
  const upload = market.savePhoto(seller, png);
  const listing = market.createListing(seller, { title: 'Photo lamp', description: 'Has a photo.', category: 'Tech', condition: 'Good', priceCents: 1000, categoryDetails: { model: 'Lamp', storage: 'n/a', accessories: 'Bulb' } });
  assert.equal(market.getListing(seller, listing.id).photos.length, 0);
  const attached = market.attachPhotos(seller, listing.id, { photoIds: [upload.id] });
  assert.equal(attached.photos.length, 1);
  assert.equal(attached.status, 'draft');
});

test('two accounts negotiate, and a third cannot read or impersonate', async () => {
  const seller = await account('talk-seller@ua.edu');
  const buyer = await account('talk-buyer@ua.edu');
  const stranger = await account('talk-stranger@ua.edu');
  const sellerUser = market.userFromToken(seller.token);
  const buyerUser = market.userFromToken(buyer.token);
  const listing = market.transitionListing(sellerUser, market.createListing(sellerUser, {
    title: 'Negotiation chair', description: 'Sturdy.', category: 'Dorm & living', condition: 'Good', priceCents: 5000,
    categoryDetails: { widthIn: 20, depthIn: 20, heightIn: 30, transport: 'Carry' },
  }).id, 'active');
  const thread = market.openConversation(buyerUser, listing.id);
  const message = market.postMessage(buyerUser, thread.id, { body: 'Still available?', clientId: 'client-1' });
  assert.equal(message.senderId, buyerUser.id);
  const duplicate = market.postMessage(buyerUser, thread.id, { body: 'ignored', clientId: 'client-1' });
  assert.equal(duplicate.id, message.id);
  market.postOffer(buyerUser, thread.id, { amountCents: 4000 });
  const offers = market.postOffer(sellerUser, thread.id, { amountCents: 4500 });
  assert.equal(offers[0].status, 'superseded');
  const accepted = market.resolveOffer(buyerUser, thread.id, offers[1].id, 'accept');
  assert.equal(accepted.reserved, false);
  assert.equal(accepted.offers.at(-1).amountCents, 4500);
  assert.throws(() => market.messages(market.userFromToken(stranger.token), thread.id), /does not exist/);
  const sellerNotes = market.notifications(sellerUser);
  assert.equal(sellerNotes.filter((note) => note.href === `/messages/${thread.id}`).length >= 1, true);
  assert.equal(sellerNotes[0].preview.includes('Still available'), false);
});

test('simultaneous reservations produce one winner and retries do not duplicate it', async () => {
  const seller = market.userFromToken((await account('race-seller@ua.edu')).token);
  const first = await account('race-a@ua.edu');
  const second = await account('race-b@ua.edu');
  const listing = market.transitionListing(seller, market.createListing(seller, {
    title: 'Race bike', description: 'One speed.', category: 'Getting around', condition: 'Good', priceCents: 8000,
    categoryDetails: { size: 'M', ownership: 'Bought new, I still have the receipt.' },
  }).id, 'active');
  const workers = [first.token, second.token].map((token, index) => new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./reserve-worker.mjs', import.meta.url), {
      workerData: { directory: root, now: clock.toISOString(), listingId: listing.id, token, key: `race-${index}` },
    });
    worker.on('message', resolve);
    worker.on('error', reject);
  }));
  const results = await Promise.all(workers);
  const wins = results.filter((result) => result.ok);
  assert.equal(wins.length, 1);
  assert.equal(results.some((result) => !result.ok), true);
  const winnerToken = results[0].ok ? first.token : second.token;
  const loserToken = results[0].ok ? second.token : first.token;
  const repeat = market.reserve(market.userFromToken(winnerToken), { listingId: listing.id, idempotencyKey: results[0].ok ? 'race-0' : 'race-1' });
  assert.equal(repeat.id, wins[0].id);
  assert.equal(market.orders(market.userFromToken(winnerToken)).filter((order) => order.listingId === listing.id).length, 1);
  assert.throws(() => market.reserve(market.userFromToken(loserToken), { listingId: listing.id, idempotencyKey: 'race-loser' }), /no longer available|already has a reservation/);
});

test('pickup codes identify a partner and do not capture payment', async () => {
  const sellerAuth = await account('hand-seller@ua.edu');
  const buyerAuth = await account('hand-buyer@ua.edu');
  const seller = market.userFromToken(sellerAuth.token);
  const buyer = market.userFromToken(buyerAuth.token);
  const listing = market.transitionListing(seller, market.createListing(seller, {
    title: 'Handoff table', description: 'Small.', category: 'Dorm & living', condition: 'Good', priceCents: 3000,
    categoryDetails: { widthIn: 18, depthIn: 18, heightIn: 18, transport: 'Carry' },
  }).id, 'active');
  const thread = market.openConversation(buyer, listing.id);
  const offer = market.postOffer(buyer, thread.id, { amountCents: 2500 }).at(-1);
  market.resolveOffer(seller, thread.id, offer.id, 'accept');
  const reservation = market.reserve(buyer, { listingId: listing.id, idempotencyKey: 'hand-1', offerId: offer.id });
  assert.equal(reservation.priceCents, 2500);
  assert.equal(reservation.status, 'pending_seller');
  const confirmed = market.confirmReservation(seller, reservation.id);
  const proposed = market.proposePickup(buyer, confirmed.id, { startsAt: '2026-10-18T20:00:00.000Z', timezone: 'America/Chicago', placeLabel: 'Gorgas Library steps' });
  const agreed = market.acceptPickup(seller, proposed.id);
  assert.equal(agreed.pickup.status, 'accepted');
  assert.equal(market.presentReservation(market.reservationRow(agreed.id), buyer).pickup.startsAt, agreed.pickup.startsAt);
  const issued = market.issueHandoffCode(buyer, agreed.id);
  assert.equal(issued.charged, false);
  const verified = market.verifyHandoffCode(seller, agreed.id, { code: issued.code });
  assert.equal(verified.charged, false);
  assert.equal(verified.identified, true);
  assert.throws(() => market.verifyHandoffCode(seller, agreed.id, { code: issued.code }), /already used/);
  assert.equal(market.reservationRow(agreed.id).status, 'active');
});

test('a forged paid flag does not capture, and replayed webhooks do not double charge', async () => {
  const seller = market.userFromToken((await account('pay-seller@ua.edu')).token);
  const buyer = market.userFromToken((await account('pay-buyer@ua.edu')).token);
  const listing = market.transitionListing(seller, market.createListing(seller, {
    title: 'Paid headphones', description: 'Both sides work.', category: 'Tech', condition: 'Good', priceCents: 4000,
    categoryDetails: { model: 'Cans', storage: 'n/a', accessories: 'Cable' },
  }).id, 'active');
  const reservation = market.confirmReservation(seller, market.reserve(buyer, { listingId: listing.id, idempotencyKey: 'pay-1' }).id);
  const checkout = market.checkout(buyer, reservation.id);
  assert.throws(() => market.confirmPayment(buyer, checkout.id, { paid: true }), /declined/);
  assert.equal(market.db.prepare('SELECT status FROM payment_intents WHERE id = ?').get(checkout.id).status, 'requires_payment_method');
  const authorized = market.confirmPayment(buyer, checkout.id, { paymentMethodToken: 'sandbox_pm_ok' });
  assert.equal(authorized.status, 'authorized');
  assert.ok(authorized.captureDeadline);
  const handler = createMarketplaceHandler({ market });
  const event = JSON.stringify({ id: 'auth_again', type: 'payment_intent.captured', intentId: checkout.id, amountCents: checkout.amountCents });
  const signature = signWebhook(market.webhookSecret, event);
  const early = await call(handler, { method: 'POST', path: '/api/v1/payments/webhook', raw: event, signature });
  assert.equal(early.json.ignored, true);
  const issued = market.issueHandoffCode(seller, reservation.id);
  market.verifyHandoffCode(buyer, reservation.id, { code: issued.code });
  const checks = market.reservationRow(reservation.id);
  const required = JSON.parse(checks.listing_snapshot).checks.map(() => true);
  const done = market.acceptItem(buyer, reservation.id, { checks: required });
  assert.equal(done.status, 'completed');
  assert.equal(done.payment.status, 'captured');
  const replay = JSON.stringify({ id: `capture_${checkout.id}`, type: 'payment_intent.captured', intentId: checkout.id, amountCents: checkout.amountCents });
  const replayed = await call(handler, { method: 'POST', path: '/api/v1/payments/webhook', raw: replay, signature: signWebhook(market.webhookSecret, replay) });
  assert.equal(replayed.json.duplicate, true);
  const credits = market.db.prepare(`SELECT COUNT(*) AS n FROM ledger_entries WHERE reservation_id = ? AND account = 'seller_payable' AND direction = 'credit'`).get(reservation.id).n;
  assert.equal(credits, 1);
  const dispute = market.openDispute(buyer, reservation.id, { reason: 'Item was not as described' });
  assert.equal(dispute.refunded, false);
  assert.equal(market.db.prepare('SELECT status FROM payment_intents WHERE id = ?').get(checkout.id).status, 'captured');
  assert.throws(() => market.resolveDispute(seller, dispute.dispute.id, { remedy: 'full_refund', reason: 'Student tried' }), /do not have access|finance/);
  market.db.prepare(`UPDATE users SET role = 'finance' WHERE id = ?`).run(seller.id);
  const finance = market.userById(seller.id);
  const remedy = market.resolveDispute(finance, dispute.dispute.id, { remedy: 'full_refund', reason: 'Photos did not match the item.' });
  assert.equal(remedy.bankConfirmed, false);
  assert.match(remedy.message, /Bank confirmation is not available/);
  const settled = JSON.stringify({ id: 'refund_settled_1', type: 'refund.settled', disputeId: dispute.dispute.id });
  market.webhook(settled, signWebhook(market.webhookSecret, settled));
  assert.equal(market.presentDispute(dispute.dispute.id).bankConfirmed, true);
});

test('blocking, reports, deletion, alerts, reviews, trades, plans, and bookings', async () => {
  const seller = market.userFromToken((await account('life-seller@ua.edu')).token);
  const buyer = market.userFromToken((await account('life-buyer@ua.edu')).token);
  const search = market.saveSearch(buyer, { query: { q: 'alert desk', maxPrice: 5000, category: 'Dorm & living' } });
  const draft = market.createListing(seller, {
    title: 'Alert desk', description: 'A used desk under fifty dollars.', category: 'Dorm & living', condition: 'Good', priceCents: 4200,
    categoryDetails: { widthIn: 40, depthIn: 20, heightIn: 30, transport: 'Two people' },
  });
  const listing = market.transitionListing(seller, draft.id, 'active');
  assert.equal(market.db.prepare(`SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND dedupe_key = ?`).get(buyer.id, `alert:${search.id}:${listing.id}`).n, 1);
  market.transitionListing(seller, draft.id, 'withdrawn');
  market.transitionListing(seller, draft.id, 'active');
  assert.equal(market.db.prepare(`SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND dedupe_key = ?`).get(buyer.id, `alert:${search.id}:${listing.id}`).n, 1);
  market.block(buyer, seller.id);
  assert.throws(() => market.openConversation(buyer, listing.id), /Blocking stops new messages/);
  const report = market.report(buyer, { targetType: 'listing', targetId: listing.id, reason: 'Spam listing', details: 'Repeated desks' });
  assert.throws(() => market.staffQueue(buyer), /do not have access/);
  market.db.prepare(`UPDATE users SET role = 'moderator', moderator_campuses = ? WHERE id = ?`).run(JSON.stringify(['Alabama']), buyer.id);
  const moderator = market.userById(buyer.id);
  const queue = market.staffQueue(moderator);
  assert.equal(queue.reports.some((item) => item.id === report.id), true);
  const decision = market.staffDecision(moderator, { action: 'dismiss_report', targetType: 'report', targetId: report.id, reason: 'Not spam.' });
  assert.equal(decision.ok, true);
  assert.ok(market.db.prepare('SELECT * FROM staff_actions WHERE target_id = ?').get(report.id));
  market.unblock(moderator, seller.id);

  const plan = market.addPlanItem(buyer, market.createPlan(buyer, { name: 'Dorm setup', budgetCents: 15000 }).id, listing.id);
  market.db.prepare(`UPDATE listings SET status = 'sold' WHERE id = ?`).run(listing.id);
  const refreshed = market.plans(buyer).find((item) => item.id === plan.id);
  assert.equal(refreshed.items[0].available, false);
  assert.equal(refreshed.actionableTotalCents, 0);

  const tutor = market.transitionListing(seller, market.createListing(seller, {
    title: 'Calculus tutoring', description: 'One hour sessions.', category: 'Tutoring', condition: 'Good', priceCents: 2000,
    categoryDetails: { subject: 'Calculus', durationMinutes: 60, rateCents: 2000 },
  }).id, 'active');
  const slot = market.addSlot(seller, tutor.id, { startsAt: '2026-10-20T18:00:00.000Z', durationMinutes: 60, priceCents: 2000 });
  const booked = market.bookSlot(buyer, slot.id);
  assert.equal(booked.durationMinutes, 60);
  assert.equal(booked.totalCents, 2000);
  const other = market.userFromToken((await account('life-other@ua.edu')).token);
  assert.throws(() => market.bookSlot(other, slot.id), /already booked/);

  const mine = market.transitionListing(buyer, market.createListing(buyer, {
    title: 'Trade lamp', description: 'Warm bulb.', category: 'Tech', condition: 'Good', priceCents: 1000,
    categoryDetails: { model: 'Bulb', storage: 'n/a', accessories: 'None' },
  }).id, 'active');
  const theirs = market.transitionListing(seller, market.createListing(seller, {
    title: 'Trade chair', description: 'Wood chair.', category: 'Dorm & living', condition: 'Good', priceCents: 2000,
    categoryDetails: { widthIn: 16, depthIn: 16, heightIn: 32, transport: 'Carry' },
  }).id, 'active');
  const trade = market.proposeTrade(buyer, { listingId: mine.id, theirListingId: theirs.id });
  assert.throws(() => market.confirmTrade(buyer, trade.id), /Both people accept/);
  const accepted = market.acceptTrade(seller, trade.id);
  assert.equal(accepted.status, 'reserved');
  assert.equal(market.listingRow(mine.id).status, 'reserved');
  assert.equal(market.listingRow(theirs.id).status, 'reserved');
  market.confirmTrade(buyer, trade.id);
  assert.equal(market.tradeRow(trade.id).status, 'reserved');
  const finished = market.confirmTrade(seller, trade.id);
  assert.equal(finished.status, 'completed');

  const reviewReservation = market.db.prepare(`SELECT id FROM reservations WHERE status = 'completed' LIMIT 1`).get();
  if (reviewReservation) {
    const row = market.reservationRow(reviewReservation.id);
    market.review(market.userById(row.buyer_id), row.id, { accuracy: 5, communication: 5, punctuality: 4, body: 'As described.' });
    assert.throws(() => market.review(market.userById(row.buyer_id), row.id, { accuracy: 5, communication: 5, punctuality: 5 }), /already reviewed/);
    assert.throws(() => market.review(seller, row.id, { accuracy: 5, communication: 5, punctuality: 5 }), /Only the buyer and seller|already reviewed/);
  }

  const created = await account('delete-me@ua.edu');
  const deleting = market.userFromToken(created.token);
  market.createListing(deleting, { title: 'Going away', description: 'Draft only.', category: 'Free stuff', condition: 'Good', priceCents: 0 });
  const removed = market.requestDeletion(deleting);
  assert.equal(removed.status, 'completed');
  assert.equal(market.userFromToken(created.token), null);
  assert.equal(market.profile(buyer, deleting.id).user.displayName, 'Deleted account');
});

test('delivery quotes, promotions, jobs, and backups stay honest', async () => {
  const seller = market.userFromToken((await account('ops-seller@ua.edu')).token);
  const buyer = market.userFromToken((await account('ops-buyer@ua.edu')).token);
  const listing = market.createListing(seller, {
    title: 'Delivered shelf', description: 'Light wood.', category: 'Dorm & living', condition: 'Good', priceCents: 2000,
    categoryDetails: { widthIn: 24, depthIn: 10, heightIn: 30, transport: 'Fits in a car' },
    fulfillment: { method: 'seller_delivery', maxMiles: 3, feeCents: 500, transportNotes: 'Ground floor only' },
  });
  const published = market.transitionListing(seller, listing.id, 'active');
  const quote = market.deliveryQuote(buyer, published.id, { miles: 2 });
  assert.equal(quote.totalCents, 2500);
  assert.throws(() => market.reserve(buyer, { listingId: published.id, idempotencyKey: 'del-1', fulfillment: 'seller_delivery', miles: 2, acknowledgedTotalCents: 2000 }), /full delivery|Confirm the item price/);
  const reserved = market.reserve(buyer, { listingId: published.id, idempotencyKey: 'del-2', fulfillment: 'seller_delivery', miles: 2, acknowledgedTotalCents: 2500 });
  assert.equal(reserved.totalCents, 2500);

  market.db.prepare(`UPDATE users SET role = 'advertiser' WHERE id = ?`).run(seller.id);
  const advertiser = market.userById(seller.id);
  assert.throws(() => market.saveCampaign(advertiser, { title: 'Auburn night', campus: 'Auburn', body: 'Nope' }), /your university/);
  const campaign = market.saveCampaign(advertiser, { title: 'Library hours', campus: 'Alabama', body: 'A real campus notice' });
  market.db.prepare(`UPDATE users SET role = 'moderator', moderator_campuses = ? WHERE id = ?`).run(JSON.stringify(['Alabama']), buyer.id);
  market.approveCampaign(market.userById(buyer.id), campaign.id, { reason: 'Campus approved.' });
  market.recordPromotionEvent(buyer, campaign.id, { kind: 'impression', dedupeKey: 'imp-1' });
  market.recordPromotionEvent(buyer, campaign.id, { kind: 'impression', dedupeKey: 'imp-1' });
  market.recordPromotionEvent(buyer, campaign.id, { kind: 'click', dedupeKey: 'clk-1' });
  const metrics = market.promotionMetrics(market.userById(buyer.id), campaign.id);
  assert.deepEqual({ impressions: metrics.impressions, clicks: metrics.clicks }, { impressions: 1, clicks: 1 });

  market.deliverNotification = () => { throw new Error('push provider down'); };
  market.enqueue('notify', { userId: buyer.id, kind: 'message', title: 'Retry me', body: 'Hello', preview: 'You have a new Relay update', href: '/messages/retry', dedupeKey: 'retry-note' }, 'notify-retry-test');
  for (let i = 0; i < 6 && market.db.prepare(`SELECT status FROM jobs WHERE idempotency_key = 'notify-retry-test'`).get().status !== 'dead'; i += 1) {
    clock.setTime(clock.getTime() + 60 * 60_000);
    market.processJobs();
  }
  const job = market.db.prepare(`SELECT * FROM jobs WHERE idempotency_key = 'notify-retry-test'`).get();
  assert.equal(job.status, 'dead');
  market.deliverNotification = Marketplace.prototype.deliverNotification.bind(market);
  market.db.prepare(`UPDATE users SET role = 'admin' WHERE id = ?`).run(seller.id);
  const replayed = market.replayJob(market.userById(seller.id), job.id);
  assert.equal(replayed.status, 'done');
  assert.equal(market.db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE dedupe_key = ?').get('retry-note').n, 1);

  const backup = join(root, 'backup.db');
  await market.backup(backup);
  const before = market.db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  market.db.prepare(`INSERT INTO users (id, email, display_name, campus_id, browse_campus, joined_at) VALUES ('usr_temp', 'temp@ua.edu', 'Temp', 'Alabama', 'Alabama', ?)`).run(market.iso());
  market.restore(backup);
  assert.equal(market.db.prepare('SELECT COUNT(*) AS n FROM users').get().n, before);
  assert.equal(logs.some((line) => line.includes('ada@ua.edu')), false);
  assert.equal(redact({ email: 'ada@ua.edu', title: 'Desk' }).email, '[redacted]');
});
