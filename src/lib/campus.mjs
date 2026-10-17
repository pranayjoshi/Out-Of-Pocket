import catalog from '../catalog/rides-tickets.json' with { type: 'json' };

export class DomainError extends Error {
  /** @param {string} code @param {string} message */
  constructor(code, message) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
  }
}

export const YOU = 'you';
export const flags = catalog.flags;
/** @type {typeof catalog.campuses} */
export const campuses = catalog.campuses;

/** @param {string} campusId */
export function campusById(campusId) {
  const campus = campuses.find((item) => item.campusId === campusId);
  if (!campus) throw new DomainError('unknown_campus', 'Choose a campus Relay knows about.');
  return campus;
}

/** @param {string} label */
export function campusByLabel(label) {
  return campuses.find((item) => item.label === label) ?? campusById('alabama');
}

/** @param {string} campusId @param {string} placeId */
export function placeById(campusId, placeId) {
  const place = campusById(campusId).places.find((item) => item.id === placeId);
  if (!place) throw new DomainError('unknown_place', 'Choose a meeting point from the campus list.');
  return place;
}

/** @param {string} campusId @param {string} query */
export function searchPlaces(campusId, query) {
  const needle = query.trim().toLowerCase();
  return campusById(campusId).places.filter((place) => {
    if (!needle) return true;
    return [place.name, place.area, place.formattedAddress, ...place.aliases].join(' ').toLowerCase().includes(needle);
  });
}

/** @param {string} campusId */
export function mapPresentation(campusId) {
  const campus = campusById(campusId);
  return {
    campusId: campus.campusId,
    officialMapUrl: campus.officialMapUrl,
    embedUrl: campus.embedPermitted ? campus.embedUrl : null,
    embedPermitted: campus.embedPermitted === true,
    fallback: campus.embedPermitted ? 'embed' : campus.fallback,
    framingNote: campus.framingNote,
    attribution: campus.attribution,
    instruction: 'Find your location, then choose the meeting point below.',
  };
}

/** @param {Date} date @param {string} timeZone */
export function zonedParts(date, timeZone) {
  const bag = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(date).map((part) => [part.type, part.value]));
  return { year: bag.year, month: bag.month, day: bag.day, hour: Number(bag.hour) % 24, minute: Number(bag.minute) };
}

/** @param {Date} date @param {string} timeZone */
export function campusDayKey(date, timeZone) {
  const parts = zonedParts(date, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** @param {{year: string, month: string, day: string, hour: number, minute: number}} parts @param {string} timeZone */
export function zonedInstant(parts, timeZone) {
  const utc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), parts.hour, parts.minute);
  const offsetAt = (guess) => {
    const zoned = zonedParts(new Date(guess), timeZone);
    return Date.UTC(Number(zoned.year), Number(zoned.month) - 1, Number(zoned.day), zoned.hour, zoned.minute) - guess;
  };
  let guess = utc;
  for (let pass = 0; pass < 2; pass += 1) guess = utc - offsetAt(guess);
  return new Date(guess);
}

/** @param {string} dayKey @param {number} dayOffset */
export function shiftDayKey(dayKey, dayOffset) {
  const [year, month, day] = dayKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + dayOffset);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

/** @param {{dayOffset?: number, hour: number, minute: number} | null | undefined} spec @param {string} timeZone @param {Date} now */
export function resolveDeparture(spec, timeZone, now) {
  if (!spec) throw new DomainError('invalid_time', 'Choose a departure time.');
  const key = shiftDayKey(campusDayKey(now, timeZone), spec.dayOffset || 0);
  const [year, month, day] = key.split('-');
  return zonedInstant({ year, month, day, hour: spec.hour, minute: spec.minute }, timeZone);
}

/**
 * @param {Date | string} instant
 * @param {string} timeZone
 * @param {Date} now
 * @param {string} [userTimeZone]
 */
export function formatWhen(instant, timeZone, now, userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone) {
  const date = instant instanceof Date ? instant : new Date(instant);
  const sameDay = campusDayKey(date, timeZone) === campusDayKey(now, timeZone);
  const time = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' }).format(date);
  const zone = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'short' }).formatToParts(date).find((part) => part.type === 'timeZoneName')?.value;
  const body = sameDay
    ? `Today, ${time}`
    : new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date);
  return userTimeZone === timeZone ? body : `${body} ${zone}`;
}

/** @param {number} cents */
export function formatCents(cents) {
  if (cents === 0) return 'Free';
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: cents % 100 === 0 ? 0 : 2 });
}

/** @param {number} cents */
export function parseDollars(input) {
  const value = String(input).trim();
  if (value === '' || value.toLowerCase() === 'free') return 0;
  if (!/^\d+(\.\d{1,2})?$/.test(value)) throw new DomainError('invalid_amount', 'Enter dollars with up to two decimal places, or Free.');
  const cents = Math.round(Number(value) * 100);
  if (!Number.isSafeInteger(cents) || cents < 0 || cents > 100000) throw new DomainError('invalid_amount', 'Enter a contribution from Free to $1,000.');
  return cents;
}

export const WINDOWS = {
  morning: [8, 12],
  afternoon: [12, 17],
  evening: [17, 21],
};

/** @param {Date | string} instant @param {string} dayKey @param {string} windowName @param {string} timeZone */
export function inWindow(instant, dayKey, windowName, timeZone) {
  const date = instant instanceof Date ? instant : new Date(instant);
  if (campusDayKey(date, timeZone) !== dayKey) return false;
  if (!windowName || windowName === 'any') return true;
  const range = WINDOWS[windowName];
  if (!range) throw new DomainError('invalid_time', 'Choose a departure window.');
  const parts = zonedParts(date, timeZone);
  const minutes = parts.hour * 60 + parts.minute;
  return minutes >= range[0] * 60 && minutes < range[1] * 60;
}
