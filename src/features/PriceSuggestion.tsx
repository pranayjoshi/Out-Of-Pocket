import { predictPrice } from "../lib/pricing.mjs";
import "./pricing.css";

type Comparable = { id: string; title: string; category: string; condition: string; campus: string; priceCents: number; mine?: boolean; source?: string };
export function PriceSuggestion({ title, category, condition, campus, id, listings, onUse, loading = false, unavailable = false, sample = false }: {
  title: string; category: string; condition: string; campus: string; id?: string; listings: Comparable[];
  onUse: (price: string) => void; loading?: boolean; unavailable?: boolean; sample?: boolean;
}) {
  const estimate = predictPrice({ title, category, condition, campus, id }, listings);
  const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
  return <section className="price-suggestion" aria-label="Predicted selling price">
    <strong>Predicted price {estimate ? `· ${money(estimate.priceCents)}` : ""}</strong>
    {loading ? <p>Checking similar campus listings…</p> : estimate ? <>
      {estimate.priceCents > 0 && <p>Suggested range: {money(estimate.lowCents)}–{money(estimate.highCents)}</p>}
      <p>{estimate.basis}</p>
      {sample && <p>Uses sample listings for this demo.</p>}
      {unavailable && <p>Campus comparisons couldn’t load. This estimate uses the category guide.</p>}
      <button className="button secondary" type="button" onClick={() => onUse((estimate.priceCents / 100).toFixed(2))}>Use predicted price</button>
    </> : <p>Add an item title to see a starting price.</p>}
    <p>You choose the final price. Enter your own selling price below, or change it after using the prediction.</p>
  </section>;
}
