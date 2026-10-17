import { createHmac } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { createMarketplace, MarketError } from './domain.mjs';

const JSON_LIMIT = 12 * 1024 * 1024;

export function createMarketplaceHandler({ directory = new URL('../../.relay-data/', import.meta.url).pathname, now, market } = {}) {
  const app = market || createMarketplace({ directory, now });
  if (!market) {
    const timer = setInterval(() => { try { app.tick(); } catch (error) { app.writeLog('error', 'tick', { message: error.message }); } }, 15_000);
    if (timer.unref) timer.unref();
  }

  return async function marketplace(req, res, next) {
    const url = new URL(req.url || '/', 'http://localhost');
    if (!url.pathname.startsWith('/api/v1')) return next();
    if (!originAllowed(req)) return send(res, 403, { error: 'This API accepts local app requests.', code: 'forbidden' });
    try {
      if (req.method === 'GET' && url.pathname.startsWith('/api/v1/media/')) return serveMedia(app, res, url);
      const body = ['POST', 'PUT', 'PATCH'].includes(req.method) ? await readBody(req, url) : undefined;
      const user = app.userFromToken(bearer(req));
      const result = await route(app, req, res, url, user, body);
      if (result?.sse) return;
      send(res, 200, result ?? { ok: true });
    } catch (error) {
      if (error instanceof MarketError || error?.status) return send(res, error.status || 400, { error: error.message, code: error.code || 'error' });
      app.writeLog('error', 'http', { message: error.message });
      send(res, 500, { error: 'Something went wrong. Try again.', code: 'server' });
    }
  };
}

async function route(app, req, res, url, user, body) {
  const { pathname } = url;
  const q = Object.fromEntries(url.searchParams);
  const method = req.method;
  if (method === 'GET' && pathname === '/api/v1/health') return app.health();
  if (method === 'GET' && pathname === '/api/v1/flags') return app.flags();
  if (method === 'POST' && pathname === '/api/v1/auth/code') {
    return app.requestCode(body.email, { preview: loopback(req), ip: req.socket?.remoteAddress || 'local' });
  }
  if (method === 'POST' && pathname === '/api/v1/auth/verify') {
    return app.verifyCode(body.email, body.code, { userAgent: req.headers['user-agent'] || '', ip: req.socket?.remoteAddress || 'local' });
  }
  if (method === 'POST' && pathname === '/api/v1/payments/webhook') {
    return app.webhook(body.raw, req.headers['x-relay-signature'] || req.headers['stripe-signature']);
  }
  if (method === 'GET' && pathname === '/api/v1/stream') return stream(app, req, res, user);
  const id = pathname.split('/').filter(Boolean);
  // id[0]=api id[1]=v1
  const a = id[2];
  const b = id[3];
  const c = id[4];
  if (method === 'POST' && pathname === '/api/v1/auth/logout') return app.logout(user);
  if (method === 'GET' && pathname === '/api/v1/auth/sessions') return app.sessions(user);
  if (method === 'DELETE' && a === 'auth' && b === 'sessions' && c) return app.revokeSession(user, c);
  if (method === 'GET' && pathname === '/api/v1/me') return app.presentSelf(app.requireUser(user));
  if (method === 'PATCH' && pathname === '/api/v1/me') return app.updateMe(user, body);
  if (method === 'GET' && pathname === '/api/v1/me/export') return app.exportAccount(user);
  if (method === 'POST' && pathname === '/api/v1/me/deletion') return app.requestDeletion(user);
  if (method === 'GET' && pathname === '/api/v1/me/dashboard') return app.dashboard(user);
  if (method === 'GET' && pathname === '/api/v1/me/blocks') return app.blocks(user);
  if (method === 'POST' && pathname === '/api/v1/me/devices') return app.registerDevice(user, body);
  if (method === 'POST' && pathname === '/api/v1/me/push') return app.registerPush(user, body);
  if (method === 'POST' && pathname === '/api/v1/me/availability') return app.setAvailability(user, body.windows || []);
  if (method === 'GET' && a === 'users' && b) return app.profile(user, b);
  if (method === 'GET' && pathname === '/api/v1/listings') return app.listListings(user, q);
  if (method === 'POST' && pathname === '/api/v1/listings') return app.createListing(user, body);
  if (method === 'GET' && a === 'listings' && b && !c) return app.getListing(user, b, { preview: q.preview === '1' && !user });
  if (method === 'PATCH' && a === 'listings' && b && !c) return app.updateListing(user, b, body);
  if (method === 'POST' && a === 'listings' && c === 'transition') return app.transitionListing(user, b, body.status);
  if (method === 'POST' && a === 'listings' && c === 'photos') return app.attachPhotos(user, b, body);
  if (method === 'POST' && a === 'listings' && c === 'fulfillment') return app.setFulfillment(user, b, body);
  if (method === 'POST' && a === 'listings' && c === 'quote') return app.deliveryQuote(user, b, body);
  if (method === 'POST' && a === 'listings' && c === 'slots') return app.addSlot(user, b, body);
  if (method === 'POST' && a === 'listings' && c === 'ride') return app.bookRide(user, b);
  if (method === 'POST' && a === 'listings' && c === 'claim') return app.claimTicket(user, b);
  if (method === 'POST' && pathname === '/api/v1/uploads') return app.savePhoto(user, Buffer.from(body.data || '', 'base64'));
  if (method === 'POST' && a === 'favorites' && b) return app.favorite(user, b, true);
  if (method === 'DELETE' && a === 'favorites' && b) return app.favorite(user, b, false);
  if (method === 'GET' && pathname === '/api/v1/conversations') return app.conversations(user);
  if (method === 'POST' && pathname === '/api/v1/conversations') return app.openConversation(user, body.listingId);
  if (method === 'GET' && a === 'conversations' && c === 'messages') return app.messages(user, b, q);
  if (method === 'POST' && a === 'conversations' && c === 'messages') return app.postMessage(user, b, body);
  if (method === 'POST' && a === 'conversations' && c === 'read') return app.markRead(user, b);
  if (method === 'POST' && a === 'conversations' && c === 'offers' && !id[5]) return app.postOffer(user, b, body);
  if (method === 'POST' && a === 'conversations' && c === 'offers' && id[6]) return app.resolveOffer(user, b, id[5], id[6]);
  if (method === 'GET' && pathname === '/api/v1/reservations') return app.orders(user);
  if (method === 'POST' && pathname === '/api/v1/reservations') return app.reserve(user, body);
  if (method === 'GET' && a === 'reservations' && b && !c) return app.presentReservation(app.reservationRow(b), app.requireUser(user));
  if (method === 'POST' && a === 'reservations' && c === 'confirm') return app.confirmReservation(user, b);
  if (method === 'POST' && a === 'reservations' && c === 'cancel') return app.cancelReservation(user, b, body);
  if (method === 'POST' && a === 'reservations' && c === 'pickup' && !id[5]) return app.proposePickup(user, b, body);
  if (method === 'POST' && a === 'reservations' && c === 'pickup' && id[5] === 'accept') return app.acceptPickup(user, b);
  if (method === 'POST' && a === 'reservations' && c === 'noshow') return app.reportNoShow(user, b);
  if (method === 'POST' && a === 'reservations' && c === 'handoff' && id[5] === 'issue') return app.issueHandoffCode(user, b);
  if (method === 'POST' && a === 'reservations' && c === 'handoff' && id[5] === 'verify') return app.verifyHandoffCode(user, b, body);
  if (method === 'POST' && a === 'reservations' && c === 'accept-item') return app.acceptItem(user, b, body);
  if (method === 'POST' && a === 'reservations' && c === 'checkout') return app.checkout(user, b);
  if (method === 'GET' && a === 'reservations' && c === 'receipt') return app.receipt(user, b);
  if (method === 'POST' && a === 'reservations' && c === 'address') return app.saveAddress(user, body);
  if (method === 'GET' && a === 'reservations' && c === 'address') return app.addressForOrder(user, b);
  if (method === 'POST' && a === 'payments' && c === 'confirm') return app.confirmPayment(user, b, body);
  if (method === 'POST' && pathname === '/api/v1/payouts/onboarding') return app.onboardSeller(user, body);
  if (method === 'GET' && pathname === '/api/v1/payouts') return app.sellerAccount(app.requireUser(user));
  if (method === 'POST' && pathname === '/api/v1/payouts') return app.requestPayout(user, body);
  if (method === 'POST' && a === 'reservations' && c === 'disputes') return app.openDispute(user, b, body);
  if (method === 'POST' && a === 'disputes' && c === 'notes') return app.addDisputeNote(user, b, body);
  if (method === 'POST' && a === 'disputes' && c === 'resolve') return app.resolveDispute(user, b, body);
  if (method === 'GET' && pathname === '/api/v1/notifications') return app.notifications(user);
  if (method === 'POST' && a === 'notifications' && c === 'read') return app.markNotification(user, b);
  if (method === 'POST' && pathname === '/api/v1/reports') return app.report(user, body);
  if (method === 'POST' && pathname === '/api/v1/blocks') return app.block(user, body.userId);
  if (method === 'DELETE' && a === 'blocks' && b) return app.unblock(user, b);
  if (method === 'GET' && pathname === '/api/v1/staff/queue') return app.staffQueue(user);
  if (method === 'POST' && pathname === '/api/v1/staff/actions') return app.staffDecision(user, body);
  if (method === 'GET' && pathname === '/api/v1/staff/metrics') return app.metrics(user);
  if (method === 'GET' && pathname === '/api/v1/staff/jobs') return app.jobs(user);
  if (method === 'POST' && a === 'staff' && b === 'jobs' && id[5] === 'replay') return app.replayJob(user, c);
  if (method === 'POST' && pathname === '/api/v1/tickets') return app.createTicket(user, body);
  if (method === 'POST' && pathname === '/api/v1/appeals') return app.appeal(user, body);
  if (method === 'GET' && pathname === '/api/v1/saved-searches') return app.savedSearches(user);
  if (method === 'POST' && pathname === '/api/v1/saved-searches') return app.saveSearch(user, body);
  if (method === 'DELETE' && a === 'saved-searches' && b) return app.deleteSearch(user, b);
  if (method === 'POST' && a === 'reservations' && c === 'reviews') return app.review(user, b, body);
  if (method === 'GET' && pathname === '/api/v1/posts') return app.posts(user, q);
  if (method === 'POST' && pathname === '/api/v1/posts') return app.createPost(user, body);
  if (method === 'PATCH' && a === 'posts' && b && !c) return app.updatePost(user, b, body);
  if (method === 'POST' && a === 'posts' && c === 'close') return app.closePost(user, b);
  if (method === 'POST' && a === 'posts' && c === 'responses') return app.respondToPost(user, b, body);
  if (method === 'POST' && a === 'responses' && c === 'accept') return app.acceptPostResponse(user, b);
  if (method === 'POST' && pathname === '/api/v1/trades') return app.proposeTrade(user, body);
  if (method === 'POST' && a === 'trades' && c === 'accept') return app.acceptTrade(user, b);
  if (method === 'POST' && a === 'trades' && c === 'confirm') return app.confirmTrade(user, b);
  if (method === 'POST' && a === 'trades' && c === 'cancel') return app.cancelTrade(user, b, body);
  if (method === 'POST' && a === 'trades' && c === 'checkout') return app.authorizeTrade(user, b);
  if (method === 'GET' && pathname === '/api/v1/plans') return app.plans(user);
  if (method === 'POST' && pathname === '/api/v1/plans') return app.createPlan(user, body);
  if (method === 'POST' && a === 'plans' && c === 'items') return app.addPlanItem(user, b, body.listingId);
  if (method === 'DELETE' && a === 'plans' && c === 'items' && id[5]) return app.removePlanItem(user, b, id[5]);
  if (method === 'POST' && a === 'slots' && c === 'book') return app.bookSlot(user, b);
  if (method === 'POST' && pathname === '/api/v1/promotions') return app.saveCampaign(user, body);
  if (method === 'POST' && a === 'promotions' && c === 'approve') return app.approveCampaign(user, b, body);
  if (method === 'POST' && a === 'promotions' && c === 'events') return app.recordPromotionEvent(user, b, body);
  if (method === 'GET' && a === 'promotions' && c === 'metrics') return app.promotionMetrics(user, b);
  throw new MarketError('not_found', 'That API route does not exist.', 404);
}

function stream(app, req, res, user) {
  app.requireUser(user);
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.write(':\n\n');
  const stop = app.subscribe(user, res);
  req.on('close', stop);
  return { sse: true };
}

function serveMedia(app, res, url) {
  const id = url.pathname.split('/').pop();
  const file = app.photoFile(id, { thumb: url.searchParams.get('thumb') === '1' });
  if (!file) return send(res, 404, { error: 'That photo is not available.', code: 'not_found' });
  res.writeHead(200, { 'Content-Type': file.contentType, 'Cache-Control': 'private, max-age=3600' });
  const stream = createReadStream(file.path);
  stream.pipe(res);
  return new Promise((resolve, reject) => {
    res.on('finish', resolve);
    stream.on('error', reject);
  });
}

function bearer(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : '';
}

function loopback(req) {
  const host = String(req.headers.host || '');
  return host.startsWith('127.0.0.1') || host.startsWith('localhost');
}

function originAllowed(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    const url = new URL(origin);
    return ['127.0.0.1', 'localhost'].includes(url.hostname);
  } catch {
    return false;
  }
}

function readBody(req, url) {
  if (url.pathname === '/api/v1/payments/webhook') return readRaw(req).then((raw) => ({ raw }));
  return readRaw(req).then((raw) => {
    if (!raw) return {};
    try { return JSON.parse(raw); } catch { throw new MarketError('invalid_json', 'Send JSON.'); }
  });
}

function readRaw(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > JSON_LIMIT) reject(new MarketError('too_large', 'That upload is too large.', 413));
      else chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

export function signWebhook(secret, raw) {
  return createHmac('sha256', secret).update(raw).digest('hex');
}
