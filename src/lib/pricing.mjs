// A transparent starting-price heuristic, not an appraisal or a completed-sale model.
const guides = { 'Dorm & living': 3500, Textbooks: 2500, Tech: 6000, 'Getting around': 8000, 'Lab supplies': 2000, Tickets: 3000, Tutoring: 2000, Rides: 1000 };
const factors = { 'Like new': 1.2, Good: 1, 'Well-loved': 0.7, 'Needs repair': 0.35 };
const stop = new Set(['a', 'an', 'the', 'for', 'with', 'and', 'of', 'my', 'your', 'new', 'used', 'good', 'sale', 'like']);
const tokens = (text) => new Set(text.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 1 && !stop.has(word)));

/**
 * @param {{ title: string, category: string, condition: string, campus: string, id?: string }} item
 * @param {{ id: string, title: string, category: string, condition: string, campus: string, priceCents: number, mine?: boolean, source?: string }[]} listings
 */
export function predictPrice(item, listings = []) {
  if (item.category === 'Free stuff') return { priceCents: 0, lowCents: 0, highCents: 0, count: 0, basis: 'Free listings are always $0.' };
  const words = tokens(item.title);
  if (!words.size) return null;
  const matches = listings.filter((other) => other.id !== item.id && !other.mine && other.source !== 'fixture' && other.category === item.category && other.campus === item.campus && Number.isSafeInteger(other.priceCents) && other.priceCents > 0 && [...tokens(other.title)].some((word) => words.has(word)));
  const factor = factors[item.condition] ?? 1;
  const amounts = matches.map((other) => other.priceCents * factor / (factors[other.condition] ?? 1)).sort((a, b) => a - b);
  const middle = Math.floor(amounts.length / 2);
  const median = amounts.length % 2 ? amounts[middle] : (amounts[middle - 1] + amounts[middle]) / 2;
  const baseline = guides[item.category];
  if (!amounts.length && baseline == null) return null;
  const round = (value) => Math.min(1_000_000, Math.max(100, Math.round(value / 100) * 100));
  const priceCents = round(amounts.length ? median : baseline * factor);
  const spread = matches.length >= 3 ? 0.2 : 0.4;
  return { priceCents, lowCents: round(priceCents * (1 - spread)), highCents: round(priceCents * (1 + spread)), count: matches.length,
    basis: matches.length ? `Based on ${matches.length} similar campus asking ${matches.length === 1 ? 'price' : 'prices'}, adjusted for condition. Not completed sales.` : 'Rough category guide adjusted for condition. Not enough similar listings; brand, model and age may change the price substantially.' };
}

export function parseSellingPrice(value) {
  const text = String(value).trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return null;
  const cents = Math.round(Number(text) * 100);
  return Number.isSafeInteger(cents) && cents >= 0 && cents <= 1_000_000 ? cents : null;
}
