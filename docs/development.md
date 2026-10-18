# Out of Pocket

The native iPhone and iPad app lives in [`ios/`](../ios/README.md). Open `ios/Relay.xcodeproj` in Xcode to run the SwiftUI experience. The React app below remains available as the original browser prototype.

For automated iOS setup and launch, run `python3 ios/scripts/relay.py setup` once, then `python3 ios/scripts/relay.py run` on subsequent launches. You can also double-click `ios/Launch Relay.command` after setup. See the [iOS instructions](../ios/README.md) for checks and simulator tests.

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
- Listing-linked inbox with local messages, unread counts, offer/counteroffer history, acceptance, decline, and withdrawal. Accepted prices carry into simulated handoffs.
- Setup plans with editable budgets, item selection, and calculated totals.
- Campus flyer board, sample sponsorship, and event saving.
- Simulated reservation → authorization → partner identification → inspection → explicit acceptance/payment.
- Pre-capture cancellation and simulated case review, return, refund submission, and bank confirmation.
- A separate no-payment experience for free items.
- Local persistence for listings, favorites, plans, requests, flyer saves, orders, and campus selection; server-backed university promotions shared with the native simulator.
- Native dialogs, keyboard access, form validation, reduced-motion support, and mobile navigation.

## Prototype boundaries

`npm run dev` starts the browser app and a local marketplace API on `127.0.0.1:8787`, proxied at `/api/v1`. Sign in with an approved campus address (`@ua.edu`, `@crimson.ua.edu`, or `@auburn.edu`). On localhost the sign-in screen shows the email code. Campus membership comes from that email domain. The campus picker is only a browsing preference.

Listings, messages, offers, reservations, pickup codes, and a sandbox ledger live in ignored `.relay-data/marketplace.db`. The sandbox payment token is `sandbox_pm_ok`. It does not move bank funds. Live card charges, push, and email stay off until Stripe, APNs, and SMTP are configured. Staff roles can be set with `RELAY_STAFF_EMAILS`. The ads portal at `/admin/ads` is unchanged.

The iOS app keeps its local sample catalog until you sign in. After sign-in it reads the same API through Vite on port 5174 (`npm run dev -- --port 5174 --strictPort`). Links use `relay://listing/{id}`. Universal links need an Apple Team ID before they can open the installed app.

## Structure

- `src/App.tsx`: interactive screens and dialogs.
- `src/data.ts`: sample campus inventory and flyers.
- `src/styles.css`: responsive product styles and motion fallbacks.
- `src/lib/exchange.mjs`: deterministic exchange state transitions and money labels.
- `tests/exchange.test.mjs`: guards against premature payment, duplicate transitions, and misleading refund/free-item states.
- `public/images`: locally stored illustrative product photography from Unsplash.

## Photography

Product and room imagery is sourced from Unsplash and stored locally for reliable preview rendering. Images are illustrative, not evidence of actual student inventory. Original image identifiers: `photo-1598300042247-d088f8ab3a91`, `photo-1507473885765-e6ed057f782c`, `photo-1543002588-bfa74002ed7e`, `photo-1546435770-a3e426bf472b`, `photo-1485965120184-e220f721d03e`, `photo-1485955900006-10f4d324d411`, `photo-1516035069371-29a1b244cc32`, and `photo-1616486338812-3dadae4b4ace`.

Big Al sample listings and avatar in the iOS app (`ios/Relay/Resources/Assets.xcassets/bigal-*`):

- `bigal-avatar`: The Redstone Rocket (US Army), public domain, [Flickr](https://www.flickr.com/photos/198124246@N07/54947655430)
- `bigal-ti84`: Asimzb, CC BY, [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:TI-84_Plus_graphing.jpg)
- `bigal-arduino`: Snootlab, CC BY 2.0, [Flickr](https://www.flickr.com/photos/snootlab/6052455554)
- `bigal-hfweb`: steakpinball, CC BY 2.0, [Flickr](https://www.flickr.com/photos/steakpinball/2218263580)
- `bigal-clrs`: katalicia1, CC BY 2.0, [Flickr](https://www.flickr.com/photos/56352515@N00/5013251461)
- `bigal-aima`: cowlet, CC BY 2.0, [Flickr](https://www.flickr.com/photos/17189662@N00/354911838)
- `bigal-stats`: basykes, CC BY 2.0, [Flickr](https://www.flickr.com/photos/11399912@N00/12509097)
- `bigal-cosmic`: alexbrn, CC BY 2.0, [Flickr](https://www.flickr.com/photos/alexbrn/4631428861)

## Big Al campus buying agent

Open **Buy with Big Al** from iOS Home or **Explore → Market**. The four destinations and tutoring/tickets/rides navigation remain available. Select a schedule screenshot to try the labeled sample Alabama schedule (the image is not processed), or pick your actual classes manually, approve the listed materials with optional per-item maxes or a total budget, or open a trade for anything. Big Al picks the best listing and negotiates under your max on the phone (`RelayCore/BigAl.swift`), mirrors the negotiation into an Inbox thread, and waits for you to lock it in. The chat calls `POST /api/agent/chat` on the Vite server, which uses `OPENROUTER_API_KEY` and `OPENROUTER_AGENT_MODEL` (default `qwen/qwen3.5-35b-a3b`).

## University ads portal

Open `/admin/ads` in the React app, or choose **University ads portal** in the sidebar. The portal follows Out of Pocket’s paper-and-green design and supports events, studies, university services, and campus opportunities.

- Generate banner artwork from one prompt, or upload a JPG, PNG or WebP (up to 10 MB) and crop with zoom and position controls.
- Both paths produce a 1,200 × 400 JPEG. Headlines, descriptions, sponsor names and calls to action are rendered as accessible text separately from the artwork.
- The main form shows only the banner, headline and destination link. University identity, button text and initial placements use defaults. Description, sponsor, scheduling and placement overrides sit in a collapsed **More options** section.
- Preview desktop and mobile layouts, save drafts, edit, schedule, pause/resume, and delete promotions.
- Choose Discover, Campus board, My plans, and Exchanges placements. Each page shows at most one eligible promotion, filtered by campus and dates, with a sponsor label and dismiss button. Real preview campaigns replace the sample sponsor on Discover and Campus board.
- Use an HTTPS destination for event tickets, registration or study details. Out of Pocket remains free for students; this flow adds no marketplace commissions or student checkout.

### Enable prompt generation with OpenRouter

Copy `.env.example` to `.env.local`, set `OPENROUTER_API_KEY`, and restart `npm run dev`. Do not prefix this secret with `VITE_`. The Vite server calls [OpenRouter’s Image API](https://openrouter.ai/docs/guides/overview/multimodal/image-generation), with `black-forest-labs/flux.2-klein-4b` as the low-cost default. The model’s posted output price was $0.014 per megapixel when integrated. `OPENROUTER_IMAGE_MODEL` can select another model supporting the same image parameters.

Requests generate one JPEG at `21:9`; the prompt keeps the subject centered so the browser can crop and export the standard 1,200 × 400 banner. Without a key the portal says generation is unconfigured, and uploads and sample campaigns work. API usage is billed to the configured OpenRouter account. Live paid generation has not been exercised without a key.

### Shared campaigns and native app

The local server exposes `GET /api/ads/campaigns` for the admin and `GET /api/ads/campaigns?published=1` for the app. `PUT /api/ads/campaigns` validates and persists the collection atomically with revision checks to prevent stale editors from overwriting newer changes. Campaign records and image data live in ignored `.relay-data/campaigns.json`. Browser localStorage is only a cache; existing browser-only promotions are migrated into a new shared store on first load.

Four clearly marked sample promotions cover both universities and all four placements from the first launch. Web fixtures in `src/lib/sampleAds.mjs` match the native `RelayCore/Resources/promotions.json`; a test checks that they agree. Real campaigns take priority over samples. The native sample card opens a preview explaining that no live event registration, study enrollment or offer exists.

The iOS simulator polls `http://127.0.0.1:5174/api/ads/campaigns?published=1` every 30 seconds while active, caches successful feeds on device, and uses bundled samples on its first offline launch. Launch the Vite server on port 5174 for native integration: `npm run dev -- --port 5174 --strictPort`. Override the full feed URL with the `RELAY_CAMPAIGNS_URL` scheme environment variable or the `RelayCampaignsURL` Info.plist key. Physical iPhones need a configured HTTPS service URL; their default remains offline samples. Only Debug builds include a local-network ATS exception; release builds retain standard ATS protections.

The same native card appears on Discover, Campus, Plans and Exchanges. Each placement displays at most one eligible ad, respects campus/status/schedules, names the sponsor, and lets students dismiss it for the session. Native ads never ask for an API key or call the image provider.

### Production boundary

This is a local development integration, bound to loopback by the dev script. Campus selection is a preview filter, not authorization. The Vite middleware is not included in a static `dist/` deployment. Before exposing the service to other users, add university sign-in and server-enforced campus roles, authenticated generation with tenant quotas, ad review, billing, managed campaign/image storage, and a production HTTPS API. No impression, click, or revenue metrics are fabricated. The existing simulated marketplace exchange/payment flow is unchanged.

`tests/ads.test.mjs` covers cropping and the image endpoint with a provider stub; `tests/campaigns.test.mjs` covers shared persistence, seed parity, status filtering, input validation and conflicting saves. Native domain and simulator UI tests cover eligibility, sample previews and dismissal.

## Listing conversations and negotiation

Open a listing and choose **Message seller / make an offer** (or **Message seller** for a free find). The web **Messages** page and native **Inbox → Messages** keep one conversation per listing. The native **Inbox → Handoffs** section retains the exchange workflow.

Messages and offer history persist locally. **Demo: act as seller** explicitly switches the simulated participant so you can reply, counter, accept, or decline. Only the recipient can accept/decline/counter; only the proposer can withdraw. Countering supersedes the previous offer. Free listings support messaging without paid offers. Pending offers must be resolved before starting a handoff, and a started handoff keeps its original amount. Accepting an offer records a price agreement; it does not charge or reserve anything. The agreed price is copied into the existing handoff/inspection/payment simulation.

There is no automatic seller response, cross-device sync, push delivery, or shared chat service. Production messaging needs authenticated participants, a shared database, server-enforced membership and offer transitions, delivery infrastructure, and reporting/blocking before launch. Web and native conversation stores are independent.

### Class schedules and course recommendations

On web, choose **Add your schedule** in Discover or open **Your preferences**. On iOS, open **You → Your classes** or the schedule link in Discover. Select a screenshot, explicitly allow AI processing, read it, review the detected classes, then save. Classes can also be selected manually and cleared. Confirmed codes persist locally by university; switching universities uses a separate profile. The screenshot is not written to storage by Out of Pocket. The full selected image is sent to OpenRouter and its provider, so crop private details before uploading.

Copy `.env.example` to `.env.local`, set server-only `OPENROUTER_API_KEY`, and restart Vite. `OPENROUTER_SCHEDULE_MODEL` defaults to `google/gemma-4-31b-it`, an open-weight vision model ([OpenRouter model/pricing](https://openrouter.ai/google/gemma-4-31b-it)). The import endpoint is `POST /api/schedule/import`; it validates consent, campus, image signature, 5 MB image limit, bounded output, and matched course codes, with a timeout and one concurrent provider call. Unrecognized courses are shown for review but are not saved as invented catalog entries. Missing credentials and provider failures leave manual class selection available. Vite serves the endpoint in both dev and preview; a static-only deployment needs this server route hosted separately. As with the other local APIs, add authentication and per-user quotas before public deployment.

The iOS simulator uses `http://127.0.0.1:5174/api/schedule/import` by default. Run Vite on port 5174 (`npm run dev -- --port 5174`). A device requires an HTTPS endpoint configured through `RELAY_SCHEDULE_URL` or the `RelayScheduleURL` Info.plist value. Keep the OpenRouter key on the server.

Every new listing can optionally select a class number for its university. The **For you** order promotes listings tagged for saved classes or matching course-related keywords and explains each match. Suggestions do not establish required materials or textbook editions. Untagged inventory remains available, and explicit price sorting takes precedence.

The bundled **starter catalog** contains six courses each for Alabama and Auburn, not their full course offerings. Update `src/catalog/courses.json` and its matching native resource `ios/Packages/RelayCore/Sources/RelayCore/Resources/courses.json` together to expand it. Reference catalogs: [Alabama CS](https://catalog.ua.edu/undergraduate/engineering/computer-science/courses/), [Alabama mathematics](https://catalog.ua.edu/undergraduate/arts-sciences/mathematics/courses/), [Alabama English](https://catalog.ua.edu/undergraduate/arts-sciences/english/courses/), [Auburn computing](https://bulletin.auburn.edu/coursesofinstruction/comp/), [Auburn mathematics](https://bulletin.auburn.edu/coursesofinstruction/math/), [Auburn English](https://bulletin.auburn.edu/coursesofinstruction/engl/).
