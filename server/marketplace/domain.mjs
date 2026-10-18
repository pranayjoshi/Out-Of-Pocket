import { createHash, randomBytes, randomInt, scryptSync, timingSafeEqual } from 'node:crypto';
import { copyFileSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { openDatabase } from './db.mjs';
import { processImage } from './images.mjs';
import { exchangeMethods } from './exchange.mjs';
import { communityMethods } from './community.mjs';

const CAMPUS_DOMAINS = [
  ['ua.edu', 'Alabama'],
  ['crimson.ua.edu', 'Alabama'],
  ['auburn.edu', 'Auburn'],
];
const CAMPUS_NAMES = { Alabama: 'University of Alabama', Auburn: 'Auburn University' };
const CATEGORIES = {
  'Dorm & living': { type: 'item', fields: { widthIn: 'number', depthIn: 'number', heightIn: 'number', transport: 'text' } },
  Textbooks: { type: 'item', fields: { isbn: 'text', edition: 'text', course: 'text' } },
  Tech: { type: 'item', fields: { model: 'text', storage: 'text', accessories: 'text' } },
  'Getting around': { type: 'item', fields: { size: 'text', ownership: 'text' } },
  'Free stuff': { type: 'item', fields: {} },
  'Lab supplies': { type: 'item', fields: { course: 'text' } },
  Tickets: { type: 'ticket', fields: { eventName: 'text', seat: 'text', transfer: 'text' } },
  Tutoring: { type: 'service', fields: { subject: 'text', durationMinutes: 'number', rateCents: 'cents' } },
  Rides: { type: 'ride', fields: { seats: 'number', destination: 'text' } },
};
const PROHIBITED = [
  [/\b(gun|firearm|ammo|ammunition|weapon)\b/i, 'Weapons and ammunition are not allowed.'],
  [/\b(alcohol|vape|nicotine|marijuana|cannabis|weed|thc|xanax|adderall)\b/i, 'Alcohol, nicotine, cannabis, and prescription drugs are not allowed.'],
  [/\b(fake id|stolen|counterfeit)\b/i, 'Stolen or counterfeit goods are not allowed.'],
];
const SHORTENERS = new Set(['bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'rb.gy']);

export class MarketError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export function campusForEmail(email) {
  const domain = String(email || '').toLowerCase().split('@')[1] || '';
  const match = CAMPUS_DOMAINS.find(([name]) => domain === name || domain.endsWith(`.${name}`));
  return match ? match[1] : null;
}

export function redact(value, key = '') {
  if (value == null) return value;
  if (/email|token|code|authorization|password|secret|cookie|line|destination/i.test(key)) return '[redacted]';
  if (typeof value === 'string') return value.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted]');
  if (Array.isArray(value)) return value.map((item) => redact(item));
  if (typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, redact(item, name)]));
  return value;
}

function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() || '').join('') || 'R';
}

function cents(value, label) {
  if (!Number.isInteger(value) || value < 0 || value > 1_000_000) {
    throw new MarketError('invalid_amount', `${label} must be a whole number of cents from 0 to 1000000.`);
  }
  return value;
}

export function createMarketplace({ directory, now = () => new Date(), log = (line) => console.log(line) } = {}) {
  return new Marketplace({ directory, now, log });
}

export class Marketplace {
  constructor({ directory, now, log }) {
    this.directory = directory;
    this.now = now;
    this.log = log;
    const opened = openDatabase(directory);
    this.db = opened.db;
    this.path = opened.path;
    this.pepper = this.#fileSecret('pepper');
    this.webhookSecret = this.#fileSecret('webhook-secret').toString('hex');
    this.subscribers = new Map();
    this.#seed();
  }

  close() {
    this.db.close();
  }

  iso(date = this.now()) {
    return date.toISOString();
  }

  rid(prefix) {
    return `${prefix}_${randomBytes(9).toString('hex')}`;
  }

  #fileSecret(name) {
    const path = join(this.directory, name);
    try {
      return readFileSync(path);
    } catch {
      const secret = randomBytes(32);
      writeFileSync(path, secret, { mode: 0o600 });
      return secret;
    }
  }

  writeLog(level, event, fields = {}) {
    this.log(JSON.stringify({ level, event, ...redact(fields), ts: this.iso() }));
  }

  hashToken(token) {
    return createHash('sha256').update(this.pepper).update(token).digest('hex');
  }

  hashCode(email, code) {
    return scryptSync(`${email}:${code}`, this.pepper, 32).toString('hex');
  }

  sameHash(left, right) {
    const a = Buffer.from(left, 'hex');
    const b = Buffer.from(right, 'hex');
    return a.length === b.length && timingSafeEqual(a, b);
  }

  immediate(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      try { this.db.exec('ROLLBACK'); } catch { /* The transaction may already be closed. */ }
      if (error.code === 'SQLITE_BUSY') throw new MarketError('conflict', 'Someone else is updating this. Try again.', 409);
      throw error;
    }
  }

  rateLimit(bucket, limit, windowMs) {
    const start = new Date(Math.floor(this.now().getTime() / windowMs) * windowMs).toISOString();
    const row = this.db.prepare('SELECT count FROM rate_limits WHERE bucket = ? AND window_start = ?').get(bucket, start);
    if (row && row.count >= limit) throw new MarketError('rate_limited', 'Too many requests. Try again shortly.', 429);
    this.db.prepare(`
      INSERT INTO rate_limits (bucket, window_start, count) VALUES (?, ?, 1)
      ON CONFLICT(bucket, window_start) DO UPDATE SET count = count + 1
    `).run(bucket, start);
  }

  userById(id) {
    return this.db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  }

  userFromToken(token) {
    if (!token) return null;
    const session = this.db.prepare(`
      SELECT s.*, u.deleted_at FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > ?
    `).get(this.hashToken(token), this.iso());
    if (!session || session.deleted_at) return null;
    this.db.prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ?').run(this.iso(), session.id);
    const user = this.userById(session.user_id);
    user.sessionId = session.id;
    return user;
  }

  requireUser(user) {
    if (!user || user.deleted_at) throw new MarketError('unauthorized', 'Sign in to continue.', 401);
    if (user.restricted_until && user.restricted_until > this.iso()) {
      throw new MarketError('restricted', 'This account is temporarily restricted.', 403);
    }
    return user;
  }

  assertRole(user, roles) {
    this.requireUser(user);
    if (!roles.includes(user.role)) throw new MarketError('forbidden', 'You do not have access to that.', 403);
    return user;
  }

  campusScope(user, campusId) {
    if (user.role === 'admin' || user.role === 'finance' || user.role === 'support') return;
    const allowed = JSON.parse(user.moderator_campuses || '[]');
    if (user.role === 'moderator' && allowed.includes(campusId)) return;
    if (user.role === 'advertiser' && user.campus_id === campusId) return;
    throw new MarketError('forbidden', 'That campus is outside your staff access.', 403);
  }

  blockedEither(a, b) {
    return Boolean(this.db.prepare(`
      SELECT 1 FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)
    `).get(a, b, b, a));
  }

  recordMetric(kind, { user, campusId, subjectId, props = {}, consent = true } = {}) {
    if (consent === false) return;
    this.db.prepare(`
      INSERT INTO metrics_events (id, user_id, campus_id, kind, subject_id, props, consent, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(this.rid('met'), user?.id || null, campusId || user?.campus_id || null, kind, subjectId || null, JSON.stringify(props), consent ? 1 : 0, this.iso());
  }

  prefs(userId) {
    return this.db.prepare('SELECT * FROM notification_prefs WHERE user_id = ?').get(userId) || {
      email_enabled: 1, push_enabled: 1, quiet_start: null, quiet_end: null, timezone: 'America/Chicago', metrics_consent: 1,
    };
  }

  enqueue(kind, payload, idempotencyKey, runAt = this.iso()) {
    this.db.prepare(`
      INSERT INTO jobs (id, kind, payload, run_at, attempts, max_attempts, status, idempotency_key, created_at, updated_at)
      VALUES (?, ?, ?, ?, 0, 5, 'pending', ?, ?, ?)
      ON CONFLICT(idempotency_key) DO NOTHING
    `).run(this.rid('job'), kind, JSON.stringify(payload), runAt, idempotencyKey, this.iso(), this.iso());
  }

  notify(userId, { kind, title, body, href, dedupeKey, preview }) {
    this.enqueue('notify', {
      userId, kind, title, body, href, dedupeKey,
      preview: preview || 'You have a new Out of Pocket update',
    }, `notify:${userId}:${dedupeKey}`);
    const sockets = this.subscribers.get(userId);
    if (sockets) {
      const data = `data: ${JSON.stringify({ type: kind, href })}\n\n`;
      for (const socket of sockets) socket.write(data);
    }
  }

  deliverNotification(payload) {
    const existing = this.db.prepare('SELECT * FROM notifications WHERE user_id = ? AND dedupe_key = ?').get(payload.userId, payload.dedupeKey);
    let notification = existing;
    if (!existing) {
      notification = {
        id: this.rid('ntf'),
        ...payload,
        created_at: this.iso(),
      };
      this.db.prepare(`
        INSERT INTO notifications (id, user_id, kind, title, body, preview, href, created_at, dedupe_key)
        VALUES (@id, @userId, @kind, @title, @body, @preview, @href, @created_at, @dedupeKey)
      `).run(notification);
    }
    this.#delivery(notification.id, 'inbox', 'delivered', 'Shown in the Out of Pocket inbox.');
    const pref = this.prefs(payload.userId);
    if (this.#inQuietHours(pref)) {
      this.enqueue('push', { notificationId: notification.id }, `push:${notification.id}`, this.#quietEnd(pref));
    } else {
      this.attemptPush(notification.id);
    }
    if (pref.email_enabled) {
      const already = this.db.prepare('SELECT 1 FROM deliveries WHERE notification_id = ? AND channel = ?').get(notification.id, 'email');
      if (!already) {
        this.db.prepare('INSERT INTO outbox (id, user_id, subject, body, status, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
          this.rid('mail'), payload.userId, payload.title, payload.preview, process.env.SMTP_URL ? 'queued' : 'queued_unconfigured', this.iso(),
        );
        this.#delivery(notification.id, 'email', process.env.SMTP_URL ? 'queued' : 'unconfigured', 'Email uses the generic preview, not the message body.');
      }
    }
    return notification.id;
  }

  attemptPush(notificationId) {
    const note = this.db.prepare('SELECT * FROM notifications WHERE id = ?').get(notificationId);
    if (!note) return;
    if (this.db.prepare('SELECT 1 FROM deliveries WHERE notification_id = ? AND channel = ?').get(notificationId, 'push')) return;
    const token = this.db.prepare('SELECT * FROM device_tokens WHERE user_id = ? LIMIT 1').get(note.user_id);
    const configured = Boolean(process.env.APNS_KEY_ID && process.env.APNS_TEAM_ID && process.env.APNS_PRIVATE_KEY);
    if (!token) this.#delivery(notificationId, 'push', 'skipped', 'No device is registered.');
    else if (!configured) this.#delivery(notificationId, 'push', 'unconfigured', 'APNs credentials are not configured. The inbox alert was still saved.');
    else this.#delivery(notificationId, 'push', 'queued', 'Push preview omits message content.');
  }

  #delivery(notificationId, channel, status, detail) {
    if (this.db.prepare('SELECT 1 FROM deliveries WHERE notification_id = ? AND channel = ?').get(notificationId, channel)) return;
    this.db.prepare('INSERT INTO deliveries (id, notification_id, channel, status, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
      this.rid('dlv'), notificationId, channel, status, detail, this.iso(),
    );
  }

  #inQuietHours(pref) {
    if (!pref.quiet_start || !pref.quiet_end) return false;
    const parts = localParts(this.iso(), pref.timezone || 'America/Chicago');
    const start = minutesOf(pref.quiet_start);
    const end = minutesOf(pref.quiet_end);
    if (start === end) return false;
    if (start < end) return parts.minutes >= start && parts.minutes < end;
    return parts.minutes >= start || parts.minutes < end;
  }

  #quietEnd(pref) {
    const end = minutesOf(pref.quiet_end);
    const timezone = pref.timezone || 'America/Chicago';
    for (let step = 1; step <= 24 * 60; step += 1) {
      const candidate = new Date(this.now().getTime() + step * 60_000);
      const parts = localParts(candidate.toISOString(), timezone);
      if (parts.minutes === end) return candidate.toISOString();
    }
    return new Date(this.now().getTime() + 60 * 60_000).toISOString();
  }

  runJob(job) {
    const payload = JSON.parse(job.payload);
    if (job.kind === 'notify') return this.deliverNotification(payload);
    if (job.kind === 'push') return this.attemptPush(payload.notificationId);
    if (job.kind === 'alert') return this.deliverNotification(payload);
    throw new MarketError('unknown_job', `Unknown job ${job.kind}.`);
  }

  processJobs() {
    const ready = this.db.prepare(`SELECT * FROM jobs WHERE status = 'pending' AND run_at <= ? ORDER BY run_at LIMIT 40`).all(this.iso());
    for (const job of ready) {
      const claimed = this.db.prepare(`UPDATE jobs SET status = 'running', updated_at = ? WHERE id = ? AND status = 'pending'`).run(this.iso(), job.id);
      if (claimed.changes !== 1) continue;
      try {
        this.runJob(job);
        this.db.prepare(`UPDATE jobs SET status = 'done', updated_at = ? WHERE id = ?`).run(this.iso(), job.id);
      } catch (error) {
        const attempts = job.attempts + 1;
        const dead = attempts >= job.max_attempts;
        const delay = Math.min(60_000 * 2 ** attempts, 3_600_000);
        this.db.prepare(`UPDATE jobs SET status = ?, attempts = ?, last_error = ?, run_at = ?, updated_at = ? WHERE id = ?`).run(
          dead ? 'dead' : 'pending', attempts, String(error.message || error).slice(0, 300),
          new Date(this.now().getTime() + delay).toISOString(), this.iso(), job.id,
        );
      }
    }
  }

  replayJob(user, jobId) {
    this.assertRole(user, ['admin', 'support']);
    const job = this.db.prepare('SELECT * FROM jobs WHERE id = ?').get(jobId);
    if (!job) throw new MarketError('not_found', 'That job does not exist.', 404);
    if (job.status !== 'dead') throw new MarketError('conflict', 'Only failed jobs can be replayed.', 409);
    this.db.prepare(`UPDATE jobs SET status = 'pending', attempts = 0, last_error = NULL, run_at = ?, updated_at = ? WHERE id = ? AND status = 'dead'`).run(this.iso(), this.iso(), jobId);
    this.audit(user, 'replay_job', 'Replayed a failed job.', 'job', jobId);
    this.processJobs();
    return this.db.prepare('SELECT id, kind, status, attempts, last_error FROM jobs WHERE id = ?').get(jobId);
  }

  tick() {
    this.expireReservations();
    this.expireOffers();
    this.expireListings();
    this.expireUploads();
    this.publishDueReviews();
    this.processJobs();
  }

  requestCode(email, { preview = false, ip = 'local' } = {}) {
    const normalized = String(email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new MarketError('invalid_email', 'Enter a valid email address.');
    const campus = campusForEmail(normalized);
    if (!campus) throw new MarketError('campus_required', 'Use an approved university email. Out of Pocket currently verifies ua.edu, crimson.ua.edu, and auburn.edu.');
    const fixture = this.db.prepare('SELECT is_fixture FROM users WHERE email = ?').get(normalized);
    if (fixture?.is_fixture) throw new MarketError('fixture_email', 'That address is reserved for sample inventory.');
    this.rateLimit(`code:${normalized}`, 5, 60 * 60_000);
    this.rateLimit(`code-ip:${ip}`, 30, 60 * 60_000);
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    this.db.prepare(`
      INSERT INTO auth_codes (id, email, code_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?)
    `).run(this.rid('code'), normalized, this.hashCode(normalized, code), this.iso(), new Date(this.now().getTime() + 10 * 60_000).toISOString());
    this.writeLog('info', 'auth.code', { email: normalized, campus });
    return preview ? { sent: true, previewCode: code, campus } : { sent: true, campus };
  }

  verifyCode(email, code, { userAgent = '', ip = 'local', staffEmails = '' } = {}) {
    const normalized = String(email || '').trim().toLowerCase();
    const campus = campusForEmail(normalized);
    if (!campus) throw new MarketError('campus_required', 'That email is not on an approved campus domain.');
    this.rateLimit(`verify:${normalized}`, 10, 60 * 60_000);
    const row = this.db.prepare(`
      SELECT * FROM auth_codes WHERE email = ? AND consumed_at IS NULL AND expires_at > ?
      ORDER BY created_at DESC LIMIT 1
    `).get(normalized, this.iso());
    if (!row) throw new MarketError('invalid_code', 'That code is expired or already used.', 401);
    if (row.attempts >= 5) throw new MarketError('invalid_code', 'Too many attempts. Request a new code.', 401);
    if (!this.sameHash(row.code_hash, this.hashCode(normalized, String(code || '').trim()))) {
      this.db.prepare('UPDATE auth_codes SET attempts = attempts + 1 WHERE id = ?').run(row.id);
      throw new MarketError('invalid_code', 'That code does not match.', 401);
    }
    this.db.prepare('UPDATE auth_codes SET consumed_at = ? WHERE id = ?').run(this.iso(), row.id);
    let user = this.db.prepare('SELECT * FROM users WHERE email = ?').get(normalized);
    if (user?.deleted_at) throw new MarketError('deleted', 'This account was deleted. Marketplace history stayed with completed exchanges, but sign-in is closed.', 403);
    if (!user) {
      this.rateLimit(`signup:${ip}`, 20, 60 * 60_000);
      const local = normalized.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
      user = {
        id: this.rid('usr'),
        email: normalized,
        display_name: local.slice(0, 40) || 'Student',
        campus_id: campus,
        browse_campus: campus,
      };
      this.db.prepare(`
        INSERT INTO users (id, email, display_name, campus_id, browse_campus, joined_at, role, moderator_campuses)
        VALUES (?, ?, ?, ?, ?, ?, 'student', '[]')
      `).run(user.id, normalized, user.display_name, campus, campus, this.iso());
      this.db.prepare('INSERT INTO notification_prefs (user_id) VALUES (?)').run(user.id);
      user = this.userById(user.id);
    } else if (user.campus_id !== campus) {
      throw new MarketError('campus_mismatch', 'This email domain does not match the campus membership on the account.', 403);
    }
    const staff = parseStaff(staffEmails)[normalized];
    if (staff) {
      this.db.prepare('UPDATE users SET role = ?, moderator_campuses = ? WHERE id = ?').run(staff.role, JSON.stringify(staff.campuses), user.id);
      user = this.userById(user.id);
    }
    const token = randomBytes(32).toString('hex');
    const sessionId = this.rid('ses');
    this.db.prepare(`
      INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at, user_agent, last_seen_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(sessionId, user.id, this.hashToken(token), this.iso(), new Date(this.now().getTime() + 30 * 24 * 3600_000).toISOString(), userAgent.slice(0, 200), this.iso());
    this.writeLog('info', 'auth.session', { userId: user.id });
    return { token, user: this.presentSelf(this.userById(user.id)) };
  }

  logout(user) {
    this.requireUser(user);
    this.db.prepare('UPDATE sessions SET revoked_at = ? WHERE id = ?').run(this.iso(), user.sessionId);
    return { ok: true };
  }

  sessions(user) {
    this.requireUser(user);
    return this.db.prepare(`
      SELECT id, created_at, expires_at, user_agent, last_seen_at, revoked_at FROM sessions
      WHERE user_id = ? ORDER BY created_at DESC
    `).all(user.id);
  }

  revokeSession(user, sessionId) {
    this.requireUser(user);
    const info = this.db.prepare('UPDATE sessions SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL').run(this.iso(), sessionId, user.id);
    if (info.changes !== 1) throw new MarketError('not_found', 'That session is not active.', 404);
    return { ok: true };
  }

  updateMe(user, body) {
    this.requireUser(user);
    if ('campus' in body || 'campusId' in body || 'campus_id' in body || 'role' in body) {
      throw new MarketError('forbidden', 'Campus membership comes from your verified email domain and cannot be changed in a request.', 403);
    }
    const name = body.displayName == null ? user.display_name : String(body.displayName).trim();
    const bio = body.bio == null ? user.bio : String(body.bio).trim();
    if (name.length < 2 || name.length > 40) throw new MarketError('invalid_name', 'Use a display name between 2 and 40 characters.');
    if (bio.length > 280) throw new MarketError('invalid_bio', 'Keep the bio under 280 characters.');
    const visibility = body.visibility || user.visibility;
    if (!['campus', 'private'].includes(visibility)) throw new MarketError('invalid_visibility', 'Visibility is campus or private.');
    const browse = body.browseCampus || user.browse_campus || user.campus_id;
    if (!['Alabama', 'Auburn'].includes(browse)) throw new MarketError('invalid_campus', 'Choose Alabama or Auburn as a browsing preference.');
    const current = this.prefs(user.id);
    const pref = {
      email: body.emailEnabled == null ? current.email_enabled : body.emailEnabled ? 1 : 0,
      push: body.pushEnabled == null ? current.push_enabled : body.pushEnabled ? 1 : 0,
      quietStart: body.quietStart === undefined ? current.quiet_start : body.quietStart || null,
      quietEnd: body.quietEnd === undefined ? current.quiet_end : body.quietEnd || null,
      timezone: body.timezone || current.timezone || 'America/Chicago',
      metrics: body.metricsConsent == null ? current.metrics_consent : body.metricsConsent ? 1 : 0,
    };
    if (pref.quietStart && !/^\d{2}:\d{2}$/.test(pref.quietStart)) throw new MarketError('invalid_quiet_hours', 'Quiet hours use 24-hour HH:MM.');
    if (pref.quietEnd && !/^\d{2}:\d{2}$/.test(pref.quietEnd)) throw new MarketError('invalid_quiet_hours', 'Quiet hours use 24-hour HH:MM.');
    this.db.prepare('UPDATE users SET display_name = ?, bio = ?, visibility = ?, browse_campus = ?, version = version + 1 WHERE id = ?').run(name, bio, visibility, browse, user.id);
    this.db.prepare(`
      INSERT INTO notification_prefs (user_id, email_enabled, push_enabled, quiet_start, quiet_end, timezone, metrics_consent)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET email_enabled = excluded.email_enabled, push_enabled = excluded.push_enabled,
        quiet_start = excluded.quiet_start, quiet_end = excluded.quiet_end, timezone = excluded.timezone, metrics_consent = excluded.metrics_consent
    `).run(user.id, pref.email, pref.push, pref.quietStart, pref.quietEnd, pref.timezone, pref.metrics);
    return this.presentSelf(this.userById(user.id));
  }

  presentSelf(user) {
    const pref = this.prefs(user.id);
    return {
      ...this.presentUser(user, { self: true }),
      email: user.email,
      browseCampus: user.browse_campus,
      role: user.role,
      moderatorCampuses: JSON.parse(user.moderator_campuses || '[]'),
      preferences: {
        emailEnabled: Boolean(pref.email_enabled),
        pushEnabled: Boolean(pref.push_enabled),
        quietStart: pref.quiet_start,
        quietEnd: pref.quiet_end,
        timezone: pref.timezone,
        metricsConsent: Boolean(pref.metrics_consent),
      },
    };
  }

  presentUser(user, { self = false } = {}) {
    if (!user) return null;
    const completed = this.db.prepare(`SELECT COUNT(*) AS n FROM reservations WHERE status = 'completed' AND (buyer_id = ? OR seller_id = ?)`).get(user.id, user.id).n;
    const active = this.db.prepare(`SELECT COUNT(*) AS n FROM listings WHERE owner_id = ? AND status = 'active'`).get(user.id).n;
    const replies = this.db.prepare(`
      SELECT c.created_at, (SELECT MIN(m.created_at) FROM messages m WHERE m.conversation_id = c.id AND m.sender_id = c.seller_id) AS reply
      FROM conversations c WHERE c.seller_id = ?
    `).all(user.id).filter((row) => row.reply);
    let responseTimeHours = null;
    if (replies.length >= 5) {
      const hours = replies.map((row) => (Date.parse(row.reply) - Date.parse(row.created_at)) / 3_600_000);
      responseTimeHours = Math.round((hours.reduce((sum, value) => sum + value, 0) / hours.length) * 10) / 10;
    }
    const deleted = Boolean(user.deleted_at);
    const hideBio = deleted || (!self && user.visibility === 'private');
    return {
      id: user.id,
      displayName: deleted ? 'Deleted account' : user.display_name,
      initials: deleted ? '—' : initials(user.display_name),
      bio: hideBio ? '' : user.bio,
      campus: user.campus_id,
      campusVerification: user.campus_id ? {
        status: 'verified_email_domain',
        badge: `Verified ${CAMPUS_NAMES[user.campus_id]} email`,
        proves: 'This badge means Out of Pocket confirmed control of an approved university email domain. It does not prove current enrollment, a student ID photo, or a class year.',
      } : null,
      joinedAt: user.joined_at,
      completedExchanges: completed,
      activeListings: active,
      responseTimeHours,
      visibility: user.visibility,
      deleted,
    };
  }

  profile(viewer, userId) {
    const user = this.userById(userId);
    if (!user) throw new MarketError('not_found', 'That profile does not exist.', 404);
    const presented = this.presentUser(user);
    const listings = user.visibility === 'private' && viewer?.id !== user.id
      ? []
      : this.db.prepare(`SELECT * FROM listings WHERE owner_id = ? AND status = 'active' AND source != 'hidden' ORDER BY published_at DESC`).all(user.id)
        .filter((listing) => !viewer || viewer.id === user.id || !this.blockedEither(viewer.id, user.id))
        .map((listing) => this.presentListing(listing, viewer));
    const reviews = this.db.prepare(`
      SELECT accuracy, communication, punctuality FROM reviews WHERE reviewee_id = ? AND status = 'published'
    `).all(user.id);
    return { user: presented, listings, reviews: summarizeReviews(reviews) };
  }

  createListing(user, body) {
    this.requireUser(user);
    this.rateLimit(`listing:${user.id}`, 20, 24 * 3600_000);
    const listing = this.#validateListing(user, body, { status: body.status === 'active' ? 'active' : 'draft' });
    this.#rejectProhibited(listing);
    const id = this.rid('lst');
    const now = this.iso();
    this.db.prepare(`
      INSERT INTO listings (id, owner_id, campus_id, title, description, category, condition, price_cents, original_price_cents,
        status, listing_type, area, cross_campus, category_details, checks, source, expires_at, created_at, updated_at, published_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'live', ?, ?, ?, ?)
    `).run(
      id, user.id, user.campus_id, listing.title, listing.description, listing.category, listing.condition, listing.priceCents,
      listing.originalPriceCents, listing.status, listing.listingType, listing.area, listing.crossCampus ? 1 : 0,
      JSON.stringify(listing.categoryDetails), JSON.stringify(listing.checks),
      listing.status === 'active' ? new Date(this.now().getTime() + 60 * 24 * 3600_000).toISOString() : null,
      now, now, listing.status === 'active' ? now : null,
    );
    if (listing.fulfillment) this.setFulfillment(user, id, listing.fulfillment);
    if (listing.status === 'active') this.#afterPublish(this.listingRow(id));
    return this.presentListing(this.listingRow(id), user);
  }

  updateListing(user, id, body) {
    this.requireUser(user);
    const current = this.#ownListing(user, id);
    if (!['draft', 'active'].includes(current.status)) throw new MarketError('conflict', 'Reserved, sold, or closed listings keep their published snapshot and cannot be edited.', 409);
    if (body.version != null && body.version !== current.version) throw new MarketError('conflict', 'This listing changed. Reload it and try again.', 409);
    const listing = this.#validateListing(user, { ...presentInput(current), ...body }, { status: current.status });
    this.#rejectProhibited(listing);
    const info = this.db.prepare(`
      UPDATE listings SET title=?, description=?, category=?, condition=?, price_cents=?, original_price_cents=?, listing_type=?,
        area=?, cross_campus=?, category_details=?, checks=?, version=version+1, updated_at=?
      WHERE id=? AND owner_id=? AND version=? AND status IN ('draft','active')
    `).run(
      listing.title, listing.description, listing.category, listing.condition, listing.priceCents, listing.originalPriceCents,
      listing.listingType, listing.area, listing.crossCampus ? 1 : 0, JSON.stringify(listing.categoryDetails), JSON.stringify(listing.checks),
      this.iso(), id, user.id, current.version,
    );
    if (info.changes !== 1) throw new MarketError('conflict', 'This listing changed. Reload it and try again.', 409);
    return this.presentListing(this.listingRow(id), user);
  }

  transitionListing(user, id, status) {
    this.requireUser(user);
    const current = this.#ownListing(user, id);
    const allowed = {
      draft: ['active', 'withdrawn'],
      active: ['withdrawn', 'sold', 'expired'],
      withdrawn: ['active'],
      expired: ['active'],
    };
    if (!allowed[current.status]?.includes(status)) throw new MarketError('invalid_transition', `A ${current.status} listing cannot move to ${status}.`, 409);
    if (status === 'sold' && this.openReservation(id)) throw new MarketError('conflict', 'This listing has a reservation. Finish or cancel that exchange first.', 409);
    if (status === 'active') this.#rejectProhibited(presentInput(current));
    const now = this.iso();
    const expires = status === 'active' ? new Date(this.now().getTime() + 60 * 24 * 3600_000).toISOString() : current.expires_at;
    const published = status === 'active' ? now : current.published_at;
    const info = this.db.prepare(`
      UPDATE listings SET status=?, version=version+1, updated_at=?, published_at=?, expires_at=?
      WHERE id=? AND owner_id=? AND status=?
    `).run(status, now, published, expires, id, user.id, current.status);
    if (info.changes !== 1) throw new MarketError('conflict', 'This listing changed. Reload it and try again.', 409);
    if (status === 'active') this.#afterPublish(this.listingRow(id));
    return this.presentListing(this.listingRow(id), user);
  }

  #afterPublish(listing) {
    const consent = Boolean(this.prefs(listing.owner_id).metrics_consent);
    this.recordMetric('publish', { campusId: listing.campus_id, subjectId: listing.id, consent, props: { category: listing.category } });
    this.matchSavedSearches(listing);
  }

  #ownListing(user, id) {
    const listing = this.listingRow(id);
    if (!listing) throw new MarketError('not_found', 'That listing does not exist.', 404);
    if (listing.owner_id !== user.id) throw new MarketError('forbidden', 'Only the seller can change this listing.', 403);
    if (listing.source === 'fixture') throw new MarketError('forbidden', 'Sample inventory is separate from live listings.', 403);
    return listing;
  }

  listingRow(id) {
    return this.db.prepare('SELECT * FROM listings WHERE id = ?').get(id);
  }

  #validateListing(user, body, { status }) {
    const title = String(body.title || '').trim();
    const description = String(body.description || '').trim();
    const category = body.category;
    const spec = CATEGORIES[category];
    if (!spec) throw new MarketError('invalid_category', 'Choose a supported category.');
    if (title.length < 3 || title.length > 80) throw new MarketError('invalid_title', 'Use a title between 3 and 80 characters.');
    if (description.length < 1 || description.length > 4000) throw new MarketError('invalid_description', 'Add a description under 4000 characters.');
    const condition = String(body.condition || 'Good').trim();
    if (condition.length < 2 || condition.length > 40) throw new MarketError('invalid_condition', 'Describe the condition in a few words.');
    const priceCents = cents(body.priceCents, 'Price');
    if (category === 'Free stuff' && priceCents !== 0) throw new MarketError('invalid_amount', 'Free stuff listings are $0.');
    const original = body.originalPriceCents == null || body.originalPriceCents === '' ? null : cents(body.originalPriceCents, 'Original price');
    const area = String(body.area || 'Campus area').trim().slice(0, 80);
    if (looksLikeStreet(area)) throw new MarketError('private_location', 'Use a campus area such as “North campus,” not a home address.');
    const details = validateDetails(spec.fields, body.categoryDetails || {});
    if (spec.type === 'ride') details.seatsLeft = details.seatsLeft ?? details.seats;
    const checks = Array.isArray(body.checks) && body.checks.length ? body.checks.map((item) => String(item).trim()).filter(Boolean).slice(0, 8) : ['Item matches the listing', 'Condition matches the description'];
    return {
      title, description, category, condition, priceCents, originalPriceCents: original, area,
      crossCampus: Boolean(body.crossCampus), categoryDetails: details, checks, status,
      listingType: spec.type, fulfillment: body.fulfillment,
    };
  }

  #rejectProhibited(listing) {
    const haystack = `${listing.title} ${listing.description} ${JSON.stringify(listing.categoryDetails || listing.category_details || {})}`;
    for (const [pattern, message] of PROHIBITED) {
      if (pattern.test(haystack)) throw new MarketError('prohibited', message, 422);
    }
    const category = listing.category;
    if (category === 'Tickets') {
      const transfer = listing.categoryDetails?.transfer || '';
      if (transfer.length < 8) throw new MarketError('prohibited', 'Ticket listings need a short note describing how the ticket transfers and that it is yours to transfer.', 422);
    }
  }

  savePhoto(user, input) {
    this.requireUser(user);
    this.rateLimit(`upload:${user.id}`, 30, 60 * 60_000);
    const image = processImage(input);
    const id = this.rid('img');
    const blob = join(this.directory, 'blobs', `${id}.img`);
    const thumb = join(this.directory, 'thumbs', `${id}.img`);
    writeFileSync(blob, image.buffer);
    writeFileSync(thumb, image.thumb);
    this.db.prepare(`
      INSERT INTO photos (id, owner_id, position, is_cover, blob_path, thumb_path, width, height, content_type, created_at, expires_at)
      VALUES (?, ?, NULL, 0, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, user.id, blob, thumb, image.width, image.height, image.contentType, this.iso(), new Date(this.now().getTime() + 24 * 3600_000).toISOString());
    this.db.prepare(`INSERT INTO signals (id, kind, subject_type, subject_id, detail, campus_id, created_at) VALUES (?, 'photo_review', 'photo', ?, 'New photo waiting for review.', ?, ?)`).run(
      this.rid('sig'), id, user.campus_id, this.iso(),
    );
    return { id, width: image.width, height: image.height, contentType: image.contentType };
  }

  attachPhotos(user, listingId, { photoIds, coverId } = {}) {
    const listing = this.#ownListing(user, listingId);
    if (!Array.isArray(photoIds) || photoIds.length === 0 || photoIds.length > 8) throw new MarketError('invalid_photos', 'Attach between 1 and 8 uploaded photos.');
    const unique = [...new Set(photoIds)];
    this.immediate(() => {
      this.db.prepare('UPDATE photos SET listing_id = NULL, position = NULL, is_cover = 0 WHERE listing_id = ?').run(listing.id);
      unique.forEach((photoId, index) => {
        const info = this.db.prepare(`
          UPDATE photos SET listing_id = ?, position = ?, is_cover = ?, expires_at = NULL
          WHERE id = ? AND owner_id = ? AND (listing_id IS NULL OR listing_id = ?)
        `).run(listing.id, index, photoId === (coverId || unique[0]) ? 1 : 0, photoId, user.id, listing.id);
        if (info.changes !== 1) throw new MarketError('invalid_photos', 'A photo was missing or belonged to a different upload. The listing was not published with that gallery.');
      });
    });
    return this.presentListing(this.listingRow(listing.id), user);
  }

  photoFile(photoId, { thumb = false } = {}) {
    const photo = this.db.prepare('SELECT * FROM photos WHERE id = ?').get(photoId);
    if (!photo || photo.moderation_status === 'rejected') return null;
    if (!photo.listing_id && photo.expires_at && photo.expires_at < this.iso()) return null;
    return { path: thumb ? photo.thumb_path : photo.blob_path, contentType: photo.content_type };
  }

  listListings(user, query) {
    const filters = normalizeQuery(query);
    const where = ['l.source != \'hidden\''];
    const params = {};
    if (filters.mine) {
      if (!user) throw new MarketError('unauthorized', 'Sign in to see your listings.', 401);
      where.push('l.owner_id = @uid');
      params.uid = user.id;
      if (filters.status) {
        where.push('l.status = @status');
        params.status = filters.status;
      }
    } else {
      if (!user) throw new MarketError('unauthorized', 'Sign in with a verified campus email to browse listings.', 401);
      where.push(`l.status = 'active'`);
      where.push('(l.campus_id = @member OR l.cross_campus = 1)');
      params.member = user.campus_id;
      where.push(`l.owner_id NOT IN (
        SELECT blocked_id FROM blocks WHERE blocker_id = @uid
        UNION SELECT blocker_id FROM blocks WHERE blocked_id = @uid
      )`);
      params.uid = user.id;
      if (filters.campus) {
        where.push('l.campus_id = @campus');
        params.campus = filters.campus;
      }
    }
    if (filters.category) {
      where.push('l.category = @category');
      params.category = filters.category;
    }
    if (filters.condition) {
      where.push('l.condition = @condition');
      params.condition = filters.condition;
    }
    if (filters.minPrice != null) {
      where.push('l.price_cents >= @minPrice');
      params.minPrice = filters.minPrice;
    }
    if (filters.maxPrice != null) {
      where.push('l.price_cents <= @maxPrice');
      params.maxPrice = filters.maxPrice;
    }
    if (filters.area) {
      where.push('l.area = @area');
      params.area = filters.area;
    }
    if (filters.type) {
      where.push('l.listing_type = @type');
      params.type = filters.type;
    }
    if (filters.edition) {
      where.push(`json_extract(l.category_details, '$.edition') = @edition`);
      params.edition = filters.edition;
    }
    if (filters.saved) {
      where.push('l.id IN (SELECT listing_id FROM favorites WHERE user_id = @uid)');
    }
    let join = '';
    if (filters.text) {
      const match = ftsQuery(filters.text);
      if (!match) return this.#emptyDiscovery(user, filters, 'Try a short word from the title, like desk or textbook.');
      join = 'JOIN listings_fts ON listings_fts.rowid = l.rowid';
      where.push('listings_fts MATCH @match');
      params.match = match;
    }
    const order = filters.sort === 'price_asc' ? 'l.price_cents ASC, l.id ASC'
      : filters.sort === 'price_desc' ? 'l.price_cents DESC, l.id ASC'
        : filters.sort === 'newest' ? 'l.published_at DESC, l.id ASC'
          : 'CASE WHEN l.campus_id = @member THEN 0 ELSE 1 END, l.published_at DESC, l.id ASC';
    if (filters.cursor) {
      where.push(cursorClause(filters));
      params.cPublished = filters.cursor.publishedAt;
      params.cPrice = filters.cursor.price;
      params.cId = filters.cursor.id;
    }
    if (user) params.member = user.campus_id;
    params.limit = filters.limit;
    const rows = this.db.prepare(`SELECT l.* FROM listings l ${join} WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT @limit`).all(params);
    const items = rows.map((row) => this.presentListing(row, user));
    const last = rows.at(-1);
    const consent = user ? Boolean(this.prefs(user.id).metrics_consent) : false;
    if (!filters.mine) {
      this.recordMetric('search', {
        user, consent, props: { text: filters.text, results: items.length, category: filters.category, maxPrice: filters.maxPrice, zero: items.length === 0 },
      });
    }
    return {
      items,
      nextCursor: rows.length === filters.limit && last ? encodeCursor(last, filters.sort) : null,
      relevance: 'Results prefer your verified campus, then newer listings. A text query also has to match the title, description, or category.',
      recovery: items.length ? null : this.#recovery(user, filters),
    };
  }

  #emptyDiscovery(user, filters, hint) {
    return { items: [], nextCursor: null, relevance: hint, recovery: this.#recovery(user, filters) };
  }

  #recovery(user, filters) {
    if (!user || filters.mine) return null;
    const relaxed = this.db.prepare(`
      SELECT * FROM listings WHERE status = 'active' AND (campus_id = ? OR cross_campus = 1)
      ORDER BY published_at DESC LIMIT 3
    `).all(user.campus_id).map((row) => this.presentListing(row, user));
    return { message: 'Nothing matched. These are recent listings you can still see, or clear a filter.', items: relaxed };
  }

  getListing(user, id, { preview = false } = {}) {
    const listing = this.listingRow(id);
    if (!listing) throw new MarketError('not_found', 'That listing does not exist.', 404);
    if (preview || !user) {
      if (!['active', 'reserved', 'sold', 'expired', 'withdrawn'].includes(listing.status)) throw new MarketError('not_found', 'That listing is not public.', 404);
      return this.presentListing(listing, null, { preview: true });
    }
    const owner = user.id === listing.owner_id;
    if (!owner && listing.status === 'draft') throw new MarketError('not_found', 'That listing is not public.', 404);
    if (!owner && listing.status === 'active' && listing.campus_id !== user.campus_id && !listing.cross_campus) {
      throw new MarketError('forbidden', 'This listing is limited to its campus.', 403);
    }
    if (!owner && this.blockedEither(user.id, listing.owner_id) && !this.sharedOpenOrder(user.id, listing.owner_id)) {
      throw new MarketError('forbidden', 'This listing is hidden because one of you blocked the other.', 403);
    }
    if (!owner && this.prefs(user.id).metrics_consent) {
      this.db.prepare('INSERT OR IGNORE INTO listing_views (listing_id, viewer_id, day) VALUES (?, ?, ?)').run(id, user.id, this.iso().slice(0, 10));
      this.db.prepare('UPDATE listings SET view_count = (SELECT COUNT(*) FROM listing_views WHERE listing_id = ?) WHERE id = ?').run(id, id);
    }
    return this.presentListing(this.listingRow(id), user);
  }

  favorite(user, listingId, saved) {
    this.requireUser(user);
    this.getListing(user, listingId);
    if (saved) this.db.prepare('INSERT OR IGNORE INTO favorites (user_id, listing_id, created_at) VALUES (?, ?, ?)').run(user.id, listingId, this.iso());
    else this.db.prepare('DELETE FROM favorites WHERE user_id = ? AND listing_id = ?').run(user.id, listingId);
    return { saved: Boolean(saved) };
  }

  presentListing(listing, viewer, { preview = false } = {}) {
    const seller = this.userById(listing.owner_id);
    const photos = this.db.prepare(`SELECT * FROM photos WHERE listing_id = ? AND moderation_status != 'rejected' ORDER BY position`).all(listing.id);
    const saved = viewer ? Boolean(this.db.prepare('SELECT 1 FROM favorites WHERE user_id = ? AND listing_id = ?').get(viewer.id, listing.id)) : false;
    const fulfillment = this.db.prepare('SELECT * FROM fulfillment WHERE listing_id = ?').get(listing.id);
    return {
      id: listing.id,
      title: listing.title,
      description: listing.description,
      category: listing.category,
      condition: listing.condition,
      priceCents: listing.price_cents,
      originalPriceCents: listing.original_price_cents,
      status: listing.status,
      listingType: listing.listing_type,
      campus: listing.campus_id,
      area: preview ? null : listing.area,
      locationPrecision: 'campus_area',
      crossCampus: Boolean(listing.cross_campus),
      categoryDetails: JSON.parse(listing.category_details || '{}'),
      checks: JSON.parse(listing.checks || '[]'),
      version: listing.version,
      source: listing.source,
      publishedAt: listing.published_at,
      expiresAt: listing.expires_at,
      viewCount: viewer?.id === listing.owner_id ? listing.view_count : undefined,
      saved,
      seller: this.presentUser(seller),
      mine: viewer?.id === listing.owner_id,
      photos: photos.map((photo) => ({
        id: photo.id,
        url: photo.blob_path.startsWith('/images/') ? photo.blob_path : `/api/v1/media/${photo.id}`,
        thumbUrl: photo.blob_path.startsWith('/images/') ? photo.blob_path : `/api/v1/media/${photo.id}?thumb=1`,
        width: photo.width,
        height: photo.height,
        cover: Boolean(photo.is_cover),
      })),
      fulfillment: fulfillment ? {
        method: fulfillment.method,
        maxMiles: fulfillment.max_miles,
        feeCents: fulfillment.fee_cents,
        transportNotes: fulfillment.transport_notes,
      } : { method: 'pickup', feeCents: 0, transportNotes: '' },
    };
  }

  flags() {
    const rows = this.db.prepare('SELECT key, enabled, description FROM feature_flags').all();
    return Object.fromEntries(rows.map((row) => [row.key, { enabled: Boolean(row.enabled), description: row.description }]));
  }

  health() {
    const ok = this.db.prepare('SELECT 1 AS ok').get().ok === 1;
    return { ok, database: ok, time: this.iso() };
  }

  backup(dest) {
    this.db.pragma('wal_checkpoint(FULL)');
    return this.db.backup(dest);
  }

  restore(src) {
    this.db.close();
    copyFileSync(src, this.path);
    rmSync(`${this.path}-wal`, { force: true });
    rmSync(`${this.path}-shm`, { force: true });
    const opened = openDatabase(this.directory);
    this.db = opened.db;
  }

  audit(actor, action, reason, targetType, targetId) {
    if (!reason || String(reason).trim().length < 3) throw new MarketError('reason_required', 'Staff actions need a reason.');
    this.db.prepare(`
      INSERT INTO staff_actions (id, actor_id, action, reason, target_type, target_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(this.rid('act'), actor.id, action, String(reason).trim(), targetType, targetId, this.iso());
  }

  #seed() {
    const count = this.db.prepare('SELECT COUNT(*) AS n FROM feature_flags').get().n;
    if (count) return;
    const flags = [
      ['payments_sandbox', 1, 'Sandbox checkout is authoritative on the server and moves no bank funds.'],
      ['payments_live', 0, 'Live card charges stay off until a provider key is configured.'],
      ['cash_on_trades', 1, 'Trades may include a cash difference because the payment ledger exists. Cash still requires authorization.'],
      ['services', 1, 'Tutoring slots and ride capacity use their own booking records.'],
      ['delivery', 1, 'Seller delivery can be quoted before a buyer commits. Pickup remains the default.'],
    ];
    const insert = this.db.prepare('INSERT INTO feature_flags (key, enabled, description) VALUES (?, ?, ?)');
    for (const flag of flags) insert.run(...flag);
    this.#seedFixtures();
  }

  #seedFixtures() {
    const now = this.iso();
    const owner = (id, email, name, campus) => {
      this.db.prepare(`
        INSERT INTO users (id, email, display_name, campus_id, browse_campus, joined_at, is_fixture, bio)
        VALUES (?, ?, ?, ?, ?, ?, 1, 'Sample student inventory. Not a live account.')
      `).run(id, email, name, campus, campus, now);
    };
    owner('usr_fixture_ua', 'fixtures@ua.edu', 'Sample sellers', 'Alabama');
    owner('usr_fixture_au', 'fixtures@auburn.edu', 'Sample sellers', 'Auburn');
    const add = (listing) => {
      this.db.prepare(`
        INSERT INTO listings (id, owner_id, campus_id, title, description, category, condition, price_cents, original_price_cents,
          status, listing_type, area, cross_campus, category_details, checks, source, created_at, updated_at, published_at, expires_at)
        VALUES (@id, @owner, @campus, @title, @description, @category, @condition, @price, @original, 'active', @type, @area, @cross, @details, @checks, 'fixture', @now, @now, @now, @expires)
      `).run({
        ...listing,
        original: listing.original ?? null,
        type: listing.type || 'item',
        cross: listing.cross ? 1 : 0,
        details: JSON.stringify(listing.details || {}),
        checks: JSON.stringify(['Item matches the listing', 'Condition matches the description']),
        now,
        expires: new Date(this.now().getTime() + 180 * 24 * 3600_000).toISOString(),
      });
      this.db.prepare(`
        INSERT INTO photos (id, owner_id, listing_id, position, is_cover, blob_path, thumb_path, width, height, content_type, moderation_status, created_at)
        VALUES (?, ?, ?, 0, 1, ?, ?, 1200, 900, 'image/jpeg', 'approved', ?)
      `).run(this.rid('img'), listing.owner, listing.id, listing.image, listing.image, now);
    };
    add({ id: 'lst_desk', owner: 'usr_fixture_ua', campus: 'Alabama', title: 'Used dorm desk', description: 'A used desk for a small dorm room. Legs unscrew. Pickup at a public campus spot.', category: 'Dorm & living', condition: 'Good', price: 4000, original: 12000, area: 'North campus', details: { widthIn: 42, depthIn: 24, heightIn: 30, transport: 'Fits in a sedan with the legs off' }, image: '/images/room.jpg' });
    add({ id: 'lst_chair', owner: 'usr_fixture_ua', campus: 'Alabama', title: 'Your new favorite reading chair', description: 'A comfortable accent chair. Light marks on the legs. Pickup at a public campus spot.', category: 'Dorm & living', condition: 'Like new', price: 4500, original: 12900, area: 'North campus', details: { widthIn: 28, depthIn: 30, heightIn: 34, transport: 'Two people can carry it.' }, image: '/images/chair.jpg' });
    add({ id: 'lst_books', owner: 'usr_fixture_ua', campus: 'Alabama', title: 'Intro biology textbook', description: 'Third edition. Some highlighting. Check the course requirements before you reserve.', category: 'Textbooks', condition: 'Good', price: 2400, area: 'South campus', details: { isbn: '9780134093413', edition: '3rd', course: 'BSC 114' }, image: '/images/books.jpg' });
    add({ id: 'lst_headphones', owner: 'usr_fixture_ua', campus: 'Alabama', title: 'Find your focus. Lose the noise.', description: 'Over-ear headphones. Cable included.', category: 'Tech', condition: 'Like new', price: 5500, area: 'North campus', cross: 1, details: { model: 'Campus cans', storage: 'n/a', accessories: 'Cable' }, image: '/images/headphones.jpg' });
    add({ id: 'lst_camera', owner: 'usr_fixture_au', campus: 'Auburn', title: 'Make the semester worth keeping', description: 'Entry-level camera. Battery and strap included.', category: 'Tech', condition: 'Good', price: 9000, area: 'Central campus', details: { model: 'Sample cam', storage: 'SD card', accessories: 'Strap, battery' }, image: '/images/camera.jpg' });
  }

  subscribe(user, socket) {
    this.requireUser(user);
    const set = this.subscribers.get(user.id) || new Set();
    set.add(socket);
    this.subscribers.set(user.id, set);
    return () => set.delete(socket);
  }

  suspiciousText(text) {
    const urls = String(text || '').match(/https?:\/\/[^\s]+/gi) || [];
    return urls.some((url) => {
      try {
        const host = new URL(url).hostname.replace(/^www\./, '');
        return url.startsWith('http://') || SHORTENERS.has(host);
      } catch {
        return true;
      }
    });
  }
}

Object.assign(Marketplace.prototype, exchangeMethods, communityMethods);

function parseStaff(value) {
  const map = {};
  for (const part of String(value || process.env.RELAY_STAFF_EMAILS || '').split(',').map((item) => item.trim()).filter(Boolean)) {
    const [email, role = 'moderator', campuses = ''] = part.split(':');
    map[email.toLowerCase()] = { role, campuses: campuses ? campuses.split('|') : [] };
  }
  return map;
}

function validateDetails(fields, input) {
  const details = {};
  for (const [key, type] of Object.entries(fields)) {
    const value = input[key];
    if (value == null || value === '') continue;
    if (type === 'text') {
      const text = String(value).trim();
      if (text.length > 300) throw new MarketError('invalid_details', `${key} is too long.`);
      details[key] = text;
    } else if (type === 'number' || type === 'cents') {
      const number = Number(value);
      if (!Number.isInteger(number) || number < 0 || number > 1_000_000) throw new MarketError('invalid_details', `${key} needs a whole number.`);
      details[key] = number;
    }
  }
  return details;
}

function presentInput(row) {
  return {
    title: row.title,
    description: row.description,
    category: row.category,
    condition: row.condition,
    priceCents: row.price_cents,
    originalPriceCents: row.original_price_cents,
    area: row.area,
    crossCampus: Boolean(row.cross_campus),
    categoryDetails: JSON.parse(row.category_details || '{}'),
    checks: JSON.parse(row.checks || '[]'),
  };
}

export function normalizeQuery(query = {}) {
  const limit = Math.min(Math.max(Number(query.limit) || 24, 1), 50);
  return {
    text: String(query.q || query.text || '').trim(),
    category: query.category && query.category !== 'All finds' ? query.category : '',
    campus: ['Alabama', 'Auburn'].includes(query.campus) ? query.campus : '',
    condition: query.condition ? String(query.condition) : '',
    area: query.area ? String(query.area) : '',
    type: query.type ? String(query.type) : '',
    edition: query.edition ? String(query.edition) : '',
    minPrice: query.minPrice == null || query.minPrice === '' ? null : cents(Number(query.minPrice), 'Minimum price'),
    maxPrice: query.maxPrice == null || query.maxPrice === '' ? null : cents(Number(query.maxPrice), 'Maximum price'),
    sort: ['price_asc', 'price_desc', 'newest', 'relevance'].includes(query.sort) ? query.sort : 'relevance',
    mine: query.mine === '1' || query.mine === true,
    saved: query.saved === '1' || query.saved === true,
    status: query.status || '',
    cursor: query.cursor ? decodeCursor(query.cursor) : null,
    limit,
  };
}

function ftsQuery(text) {
  const terms = text.toLowerCase().match(/[a-z0-9]{2,}/g) || [];
  if (!terms.length) return '';
  return terms.map((term) => `"${term}"*`).join(' AND ');
}

function encodeCursor(row, sort) {
  return Buffer.from(JSON.stringify({ publishedAt: row.published_at, price: row.price_cents, id: row.id, sort })).toString('base64url');
}

function decodeCursor(value) {
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString());
    if (!parsed.id) throw new Error('bad');
    return parsed;
  } catch {
    throw new MarketError('invalid_cursor', 'That page cursor is not valid.');
  }
}

function cursorClause(filters) {
  const cursor = filters.cursor;
  if (filters.sort === 'price_asc') return '(l.price_cents > @cPrice OR (l.price_cents = @cPrice AND l.id > @cId))';
  if (filters.sort === 'price_desc') return '(l.price_cents < @cPrice OR (l.price_cents = @cPrice AND l.id > @cId))';
  return '(l.published_at < @cPublished OR (l.published_at = @cPublished AND l.id > @cId))';
}

function localParts(iso, timeZone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(iso)).map((part) => [part.type, part.value]));
  const weekdays = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { weekday: weekdays[parts.weekday], minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

function minutesOf(value) {
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

function looksLikeStreet(value) {
  return /\d{1,5}\s+\w+\s+(st|street|ave|avenue|rd|road|blvd|lane|ln|dr|drive)\b/i.test(value);
}

function summarizeReviews(rows) {
  if (!rows.length) return { count: 0, distribution: { accuracy: null, communication: null, punctuality: null } };
  const avg = (key) => Math.round((rows.reduce((sum, row) => sum + row[key], 0) / rows.length) * 10) / 10;
  return { count: rows.length, distribution: { accuracy: avg('accuracy'), communication: avg('communication'), punctuality: avg('punctuality') } };
}

export { CATEGORIES, localParts };
