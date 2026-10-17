# Relay

A campus marketplace UI prototype built with React, TypeScript, Vite, Motion, and Lucide. Warm paper surfaces, forest-green controls, floating editorial imagery, staggered listing reveals, animated navigation, and responsive layouts establish the first product direction.

## Run locally

```sh
npm install
npm run dev
```

Open the Local URL printed by Vite. The server binds to `127.0.0.1`; Vite selects another port if the default is occupied.

```sh
npm run build
npm test
```

## Implemented

- Searchable listings with categories, price sorting, free-item and cross-campus filters.
- Item detail drawers, favorites, locally created listings, and campus request posts.
- Setup plans with editable budgets, item selection, and calculated totals.
- Campus flyer board, sample sponsorship, and event saving.
- Simulated reservation → authorization → partner identification → inspection → explicit acceptance/payment.
- Pre-capture cancellation and simulated case review, return, refund submission, and bank confirmation.
- A separate no-payment experience for free items.
- Local persistence for listings, favorites, plans, requests, flyer saves, orders, and campus selection.
- Native dialogs, keyboard access, form validation, reduced-motion support, and mobile navigation.

## Prototype boundaries

All profiles, listings, university affiliations, events, and sponsor campaigns are illustrative. State is held in this browser's localStorage. There is no authentication, shared database, chat, photo upload, moderation service, or payment processor. Payment and refund buttons never move funds. The university selector demonstrates filtering, not secure tenant isolation.

A production implementation needs server-side identity and campus authorization, an order and money ledger, approved processor integration, signed and idempotent payment webhooks, provider reconciliation, evidence-based moderation, and operational support before handling real exchanges.

## Structure

- `src/App.tsx`: interactive screens and dialogs.
- `src/data.ts`: sample campus inventory and flyers.
- `src/styles.css`: responsive product styles and motion fallbacks.
- `src/lib/exchange.mjs`: deterministic exchange state transitions and money labels.
- `tests/exchange.test.mjs`: guards against premature payment, duplicate transitions, and misleading refund/free-item states.
- `public/images`: locally stored illustrative product photography from Unsplash.

## Photography

Product and room imagery is sourced from Unsplash and stored locally for reliable preview rendering. Images are illustrative, not evidence of actual student inventory. Original image identifiers: `photo-1598300042247-d088f8ab3a91`, `photo-1507473885765-e6ed057f782c`, `photo-1543002588-bfa74002ed7e`, `photo-1546435770-a3e426bf472b`, `photo-1485965120184-e220f721d03e`, `photo-1485955900006-10f4d324d411`, `photo-1516035069371-29a1b244cc32`, and `photo-1616486338812-3dadae4b4ace`.
