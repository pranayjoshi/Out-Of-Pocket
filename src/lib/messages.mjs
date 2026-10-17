/** @typedef {'buyer' | 'seller'} Party */
/** @typedef {'pending' | 'accepted' | 'declined' | 'withdrawn' | 'superseded'} OfferStatus */
/** @typedef {{id: string, author: Party, text: string, createdAt: string, offerId?: string}} Message */
/** @typedef {{id: string, author: Party, amountCents: number, status: OfferStatus}} Offer */
/** @typedef {{kind: 'item', id: string} | {kind: 'ride_booking' | 'ride_request' | 'ticket_order', id: string, tripId?: string, title: string, detail?: string}} Subject */
/** @typedef {{id: string, subject?: Subject, product?: import('../data').Product, title?: string, detail?: string, own: boolean, messages: Message[], offers: Offer[], readCount: number, createdAt: string}} Conversation */

/** @param {import('../data').Product} product @param {boolean} [own] @returns {Conversation} */
export function createConversation(product, own = false) {
  return { id: crypto.randomUUID(), subject: { kind: 'item', id: product.id }, product, own, messages: [], offers: [], readCount: 0, createdAt: new Date().toISOString() };
}
/** @param {Exclude<Subject, {kind: 'item'}>} subject @param {boolean} [own] @returns {Conversation} */
export function createSubjectConversation(subject, own = false) {
  if (!subject?.id || !['ride_booking', 'ride_request', 'ticket_order'].includes(subject.kind)) throw new Error('Choose a ride or ticket conversation.');
  return { id: crypto.randomUUID(), subject, title: subject.title, detail: subject.detail || '', own, messages: [], offers: [], readCount: 0, createdAt: new Date().toISOString() };
}
/** @param {Conversation} thread */
export function conversationTitle(thread) { return thread.product?.title || thread.title || thread.subject?.title || 'Conversation'; }
/** @param {string} input */
export function parseOffer(input) {
  const value = input.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(value)) throw new Error('Enter dollars with up to two decimal places.');
  const cents = Math.round(Number(value) * 100);
  if (!Number.isSafeInteger(cents) || cents < 1 || cents > 1000000) throw new Error('Enter an offer from $0.01 to $10,000.');
  return cents;
}
/** @param {Conversation} thread */
export function pendingOffer(thread) { return thread.offers.find(o => o.status === 'pending'); }
/** @param {Conversation} thread @returns {import('../data').Product} */
export function agreedProduct(thread) {
  if (!thread.product) throw new Error('This conversation is not about an item.');
  const accepted = thread.offers.find(o => o.status === 'accepted');
  return accepted ? { ...thread.product, price: accepted.amountCents / 100 } : thread.product;
}
/** @param {Conversation} thread */
export function unreadCount(thread) {
  return thread.messages.slice(thread.readCount).filter(m => m.author !== (thread.own ? 'seller' : 'buyer')).length;
}
/** @param {number} cents */
export function formatOffer(cents) { return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: cents % 100 === 0 ? 0 : 2 }); }
/**
 * @param {Conversation} original
 * @param {{type: 'message' | 'offer' | 'accepted' | 'declined' | 'withdrawn' | 'read', party: Party, text?: string, amountCents?: number, offerId?: string}} action
 * @param {boolean} [locked]
 * @returns {Conversation}
 */
export function updateConversation(original, action, locked = false) {
  const thread = structuredClone(original);
  const append = (/** @type {string} */ text, /** @type {string | undefined} */ offerId = undefined) => thread.messages.push({ id: crypto.randomUUID(), author: action.party, text, ...(offerId ? { offerId } : {}), createdAt: new Date().toISOString() });
  if (action.type === 'read') { thread.readCount = thread.messages.length; return thread; }
  if (action.type === 'message') {
    const text = action.text?.trim() || '';
    if (!text || text.length > 2000) throw new Error('Write a message between 1 and 2,000 characters.');
    append(text); return thread;
  }
  if (locked) throw new Error('A handoff has started. Its price is fixed; you can keep messaging.');
  if (action.type === 'offer') {
    if (thread.subject && thread.subject.kind !== 'item') throw new Error('Offers stay on item listings. Ride and ticket activity keeps its own price.');
    if (!thread.product || thread.product.price === 0 || thread.offers.some(o => o.status === 'accepted')) throw new Error('Negotiation is closed for this listing.');
    const cents = action.amountCents;
    if (!Number.isSafeInteger(cents) || !cents || cents < 1 || cents > 1000000) throw new Error('Enter an offer from $0.01 to $10,000.');
    const pending = pendingOffer(thread);
    if (pending?.author === action.party) throw new Error('Withdraw your current offer before sending another.');
    if (pending) pending.status = 'superseded';
    const id = crypto.randomUUID();
    thread.offers.push({ id, author: action.party, amountCents: cents, status: 'pending' });
    append(`Offered ${formatOffer(cents)}`, id); return thread;
  }
  if (!['accepted', 'declined', 'withdrawn'].includes(action.type)) throw new Error('Unknown offer action.');
  const offer = thread.offers.find(o => o.id === action.offerId);
  if (!offer || offer.status !== 'pending' || (action.type === 'withdrawn' ? offer.author !== action.party : offer.author === action.party)) throw new Error('This offer has changed or this action belongs to the other participant.');
  offer.status = action.type;
  append(`${action.type[0].toUpperCase() + action.type.slice(1)} the ${formatOffer(offer.amountCents)} offer`, offer.id);
  return thread;
}
