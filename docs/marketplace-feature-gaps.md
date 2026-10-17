# Relay marketplace feature gaps

Prepared October 17, 2026 from the current working tree, including uncommitted web and native changes. This is a source review, not a runtime usability test. Priorities are proposed product decisions, not measured user demand.

## What already exists

Relay has web and native marketplace prototypes with search, category and campus filters, price sorting, favorites, local listing creation, setup plans, campus asks, sample events, and simulated exchanges. Both clients now have local conversations, offers, counteroffers, acceptance, withdrawal, and agreed-price handoff flows. Native listing creation supports one locally stored photo. The university promotions portal has local server persistence, artwork upload/generation, scheduling, placement selection, and a native feed.

These features should be extended rather than rebuilt. The root and iOS READMEs still say there is no messaging, but the current messaging source implements a local demo. Neither client delivers marketplace messages to another person. Marketplace listings, orders, and accounts do not have a shared production backend. Campus selection is a filter, not authorization.

## Priority definitions

- **P0:** Required for a usable marketplace pilot with real users.
- **P0 for in-app payments:** Required before enabling real money movement. A pilot can defer these by explicitly supporting independently arranged payment and free exchanges, without implying platform payment protection.
- **P1:** Important improvements after the basic marketplace works.
- **P2:** Expansion features; implement when the corresponding product scope is chosen.

## P0: Core marketplace pilot

### 1. Shared marketplace backend and cross-device sync

**Gap:** Web data lives in localStorage; native data lives in an Application Support JSON snapshot. Users cannot discover one another's actual inventory or continue on another device.

**Implementation:** Create an authenticated HTTPS API and PostgreSQL database for users, campus memberships, listings, conversations, offers, reservations, exchanges, and favorites. Give records stable IDs and versions. Keep client storage as a cache, with explicit loading, offline, retry, and conflict states. Add pagination and migrations. Keep demo fixtures isolated from live data.

**Acceptance:** A listing created by one account on iOS appears for an authorized second account on web; unauthorized writes fail server-side.

### 2. Sign-in, account recovery, and campus verification

**Gap:** No real user identity or verified campus membership; users can switch campus freely.

**Implementation:** Add email-link or code sign-in, secure sessions, logout/revocation, and recovery. Model campus membership separately from the user's browsing preference. Verify access to approved university domains; add university SSO only where an actual integration exists. Describe precisely what a badge proves. Enforce membership and explicit cross-campus visibility rules on the server.

**Acceptance:** Changing a campus value in a request cannot grant private campus access, and account recovery preserves marketplace history.

### 3. Real buyer and seller profiles

**Gap:** Sellers are names and initials embedded in listings; the profile screen is a local summary.

**Implementation:** Add user IDs, display names, avatars, bios, campus verification state, join date, active listings, and completed exchange counts. Connect listings and conversations to users through IDs. Allow profile editing with private email and exact location excluded from public responses. Show response-time metrics only when enough real data exists.

**Acceptance:** Tapping a seller opens their actual profile and inventory; identity changes do not break existing orders.

### 4. Listing management and availability lifecycle

**Gap:** Publishing exists, but there is no complete seller workflow for drafts, editing, pausing, expiring, withdrawing, or marking inventory sold.

**Implementation:** Add `draft`, `active`, `reserved`, `sold`, `withdrawn`, and `expired` states with owner-authorized transitions. Support editing, draft recovery, renewal, and sold elsewhere. Preserve the agreed listing snapshot on an exchange so later edits cannot rewrite the deal. Remove unavailable items from default discovery.

**Acceptance:** A seller can manage a listing throughout its life; completed or reserved inventory cannot be purchased again.

### 5. Shared listing photos and galleries

**Gap:** Web listing creation uses category imagery. Native accepts a single photo that stays on the device.

**Implementation:** Add multiple photos, cover selection, reorder/delete, upload progress, and retry. Upload through short-lived authorized URLs to object storage. Validate file signatures, sizes, and decoded dimensions; re-encode images, strip location metadata, and generate thumbnails. Clean up abandoned uploads and support moderation review.

**Acceptance:** Photos uploaded on either client render for another user; a failed upload never produces a falsely published gallery.

### 6. Real messaging and offer negotiation

**Gap:** Local conversation and negotiation interfaces exist, including a demo switch for acting as either party. There is no delivery, authenticated participant identity, or multi-buyer conversation model.

**Implementation:** Persist threads by listing and participant pair. Deliver updates through authenticated realtime subscriptions or WebSockets, with stable message IDs, retry deduplication, pagination, delivery state, and unread cursors. Derive the sender from the session. Move offer transitions to the server; add expiration, stale-offer handling, and a binding accepted-price snapshot. Keep messages available after a listing closes.

**Acceptance:** Two real accounts can negotiate across devices; a third account cannot read the conversation or impersonate either party.

### 7. Reservations that prevent double-selling

**Gap:** Existing duplicate reservation checks apply only to the current device/browser; they do not coordinate competing buyers.

**Implementation:** Use a database transaction and listing row lock or equivalent conditional update to create one active reservation. Add database constraints, idempotency keys, seller confirmation, expiration, cancellation reasons, and release of abandoned holds. Reject self-purchases and stale accepted offers. Make offer acceptance and reservation separate, clearly explained steps.

**Acceptance:** Two simultaneous requests produce one reservation winner; repeated requests do not create multiple orders. PostgreSQL documents the relevant [row-lock behavior](https://www.postgresql.org/docs/18/explicit-locking.html).

### 8. Mutually agreed pickup and verified handoff

**Gap:** A preferred meeting time and inspection demo exist, but there is no shared agreement, rescheduling, or real one-time partner identification.

**Implementation:** Add proposed/accepted pickup times and public meeting places, seller availability, rescheduling, cancellation, and no-show reporting. Store times in UTC with the display timezone. Replace the fixed demo code with a short-lived, order-bound QR/code that the server verifies with attempt limits. Preserve the distinction between identifying a partner, inspecting, and explicitly accepting an item.

**Acceptance:** Both parties see the same confirmed appointment; a reused code fails and scanning never charges the buyer by itself.

### 9. Notifications and actionable inbox

**Gap:** There are local unread counts and a web informational notification dialog, but no actual notification delivery.

**Implementation:** Add a durable notification inbox and background delivery jobs for messages, offers, reservation changes, and pickup reminders. Register native device tokens, use APNs, and offer email fallback and web push where supported. Include preferences, quiet hours, deduplication, and deep links. Keep sensitive message content out of lock-screen previews by default.

**Acceptance:** An offline recipient receives one relevant alert and opens the correct conversation/order. See Apple's [remote notification server documentation](https://developer.apple.com/documentation/usernotifications/setting-up-a-remote-notification-server).

### 10. Reporting, blocking, and abuse prevention

**Gap:** Safety guidance and simulated post-payment cases exist; users cannot meaningfully report an abusive listing/message or block a person.

**Implementation:** Add report actions on listings, profiles, messages, and exchanges with reasons and evidence. Add blocking enforced across messaging and discovery, while preserving controlled access to active-order resolution. Rate-limit new accounts, uploads, posts, messages, and offers; detect duplicate spam and suspicious links. Add category-specific prohibited-item rules.

**Acceptance:** Blocking stops new unsolicited contact, and reports reach a review queue with the relevant evidence.

### 11. Marketplace moderation and support console

**Gap:** The ads portal does not provide marketplace operations or support tooling.

**Implementation:** Build role-restricted queues for reports, suspicious listings, account restrictions, and support tickets. Support takedown, temporary suspension, appeals, user communication, and audited case decisions. Scope campus moderators to authorized campuses. Require reasons for staff actions and make financial permissions narrower than general moderation permissions.

**Acceptance:** Authorized staff can resolve a report with an audit trail; ordinary users cannot access staff data or actions.

### 12. Account privacy and data controls

**Gap:** No real account settings, session management, account deletion, or data export workflow exists.

**Implementation:** Add profile visibility, notification preferences, active-session revocation, downloadable account data, and deletion requests. Define retention by record type and preserve only the records required for unresolved orders and applicable obligations. Hide exact pickup details until the appropriate transaction stage, and remove photo location metadata.

**Acceptance:** Deletion consistently removes public identity and access across both clients, with clear handling of unresolved exchanges.

### 13. Reliable operations and marketplace measurement

**Gap:** Existing domain tests and local persistence do not provide production monitoring, recovery, or a measured marketplace funnel.

**Implementation:** Add structured logs with sensitive-data redaction, error reporting, job retry/dead-letter handling, database backups with restore drills, deployment health checks, and feature flags. Record consent-aware events for search, listing publication, conversation, reservation, and completion. Track zero-result searches, time to first response, sell-through, cancellations, and reports by campus/category.

**Acceptance:** Failed jobs can be replayed without duplicate effects, a backup can be restored, and administrators can identify where real transactions stall.

## P0 before real in-app payments

### 14. Real checkout, receipts, and authoritative money ledger

**Gap:** Authorization, acceptance/payment, Apple Pay/card selection, and money labels are simulations.

**Implementation:** Integrate a marketplace-capable payment provider through server-created payment objects and tokenized client checkout. Keep amounts in integer cents. Store an append-only balanced money ledger and provider references, verify webhook signatures, deduplicate events, and reconcile against provider records. Preserve inspection followed by explicit acceptance before capture. Handle authorization expiration and reauthorization; authorize near pickup when appropriate. Show total cost and receipts, keeping any student fee policy explicit.

**Acceptance:** A forged client response cannot mark an order paid; duplicate/out-of-order events cannot double-charge. Use provider-confirmed capture deadlines rather than assuming indefinite holds. See [Stripe authorization and capture](https://docs.stripe.com/payments/place-a-hold-on-a-payment-method) and [webhooks](https://docs.stripe.com/webhooks).

### 15. Seller onboarding, balances, and payouts

**Gap:** A displayed seller transfer status does not correspond to an onboarded payout account or actual funds movement.

**Implementation:** Use provider-hosted seller onboarding and verification. Model payment capture, seller transfer, available balance, and bank payout separately. Surface onboarding requirements, payout failures, payout history, and transfer reversals. Establish who funds processing costs, refunds, and losses, consistent with the stated student pricing model. Do not describe delayed transfers as escrow without a supported arrangement.

**Acceptance:** Sellers can see the actual destination and state of a payout; failed onboarding or payout cannot appear completed.

### 16. Real disputes, returns, refunds, and chargebacks

**Gap:** Case reporting and refund transitions are demonstrations controlled locally.

**Implementation:** Add an order-linked evidence flow, seller response, case deadlines, staff review, approved remedies, return confirmation, and appeals. Execute refunds and transfer reversals only through authorized server actions. Track partial refunds, failed refunds, and provider disputes separately. Keep an immutable timeline of the listing, offer, acceptance, money movements, and case decisions.

**Acceptance:** Reporting does not automatically grant a refund, and submitting a refund never claims bank confirmation before provider evidence supports it.

## P1: Marketplace quality and repeat use

### 17. Better discovery and search

**Gap:** Basic text matching, category filtering, and price sorting exist; the default recommendation order is effectively catalog order.

**Implementation:** Add price range, condition, newest-first, pickup area/distance, availability, and listing type filters. Start with indexed database full-text search, pagination, and transparent relevance rules based on text match, freshness, and campus. Add approximate locations without exposing home addresses. Show unavailable listings clearly and offer useful zero-result recovery.

**Acceptance:** A buyer can find, for example, an available used desk under $50 near their campus, with stable paginated results.

### 18. Category-specific listing details

**Gap:** General title, condition, description, and checks cannot describe every supported category precisely.

**Implementation:** Define versioned category schemas: textbook ISBN/edition/course, electronics model/storage/accessories, furniture measurements and transport needs, and bike size/ownership information. Use these fields in creation, detail, search, and inspection. Roll out categories only when their relevant rules and transaction flow exist.

**Acceptance:** Buyers can filter textbooks by edition or confirm furniture dimensions before arranging pickup.

### 19. Saved searches, price alerts, and availability alerts

**Gap:** Favorites exist but do not proactively help users find new matches or learn about changes.

**Implementation:** Persist saved query definitions and alert preferences. On listing publication or price/availability changes, evaluate matching subscriptions and enqueue deduplicated alerts. Add immediate/digest frequency controls and unsubscribe. Avoid repeatedly notifying the owner or alerting on already unavailable inventory.

**Acceptance:** A user looking for a desk under $50 gets one alert when a newly eligible listing appears.

### 20. Transaction-backed ratings and reputation

**Gap:** No buyer/seller review history exists.

**Implementation:** Allow one review per participant after a completed exchange, with dimensions such as item accuracy, communication, and punctuality. Use a limited review window and delayed publication until both submit or the window closes. Display counts and distributions; provide reporting and moderation for abusive reviews. Treat cancellations/no-shows separately from completed-sale ratings.

**Acceptance:** Uninvolved accounts cannot review a seller, and repeat submissions cannot inflate reputation.

### 21. Seller dashboard and transaction history

**Gap:** Profile counts do not provide inventory management or a complete selling workspace.

**Implementation:** Add tabs for drafts, active, reserved, sold, and withdrawn listings; expose related conversations and next actions. Show actual listing views, saves, inquiries, and conversion where measured. Separate purchases from sales and provide receipts and payout links where supported.

**Acceptance:** A seller can identify which listing needs a response, pickup confirmation, or a price change from one screen.

### 22. Connected requests and offer matching

**Gap:** Campus asks/offers exist, but the native response flow opens a new listing/post form instead of a persistent direct response relationship.

**Implementation:** Give posts owner IDs, lifecycle states, expiration, and direct response threads. Link a seller's existing listing to a request, rank relevant matches by category/campus/budget, and notify the requester. Allow accept/decline, fulfilled, and closed states; permission-check every response. Let users edit and remove their posts.

**Acceptance:** A seller responds to an ask with an existing listing, the requester receives it, and both can continue in one linked conversation.

### 23. Actual item-for-item trades

**Gap:** Native trade posts describe desired exchanges, but no two-sided trade transaction exists.

**Implementation:** Model a proposal containing both owned listings, optional agreed cash adjustment, both acceptances, and a shared handoff. Reserve both items atomically, snapshot both descriptions, and require each party to inspect and confirm. Define cancellation and failure behavior for either side. Add cash adjustments only after the payment foundation exists.

**Acceptance:** A trade cannot complete with only one party's approval, and neither reserved item can be sold to someone else.

### 24. Plans connected to live availability

**Gap:** Setup budgets and item selection exist, but they are local and do not manage changing shared inventory.

**Implementation:** Sync plans to accounts, support multiple named plans, and show price changes and sold/unavailable items. Recommend replacements within the remaining budget. Keep planned spend, reserved spend, and completed purchases distinct. Add collaborative plans only after defining membership and edit permissions.

**Acceptance:** A sold saved chair is flagged and excluded from an actionable shopping total instead of silently remaining purchasable.

### 25. Shareable listings and reliable deep links

**Gap:** Native sharing sends descriptive text; web routing mainly distinguishes the ads portal from the app, without persistent listing URLs.

**Implementation:** Add stable listing/profile/post/order routes, public previews for deliberately public data, and sign-in redirects that preserve the destination. Configure iOS Universal Links. Resolve private resources only after authorization, and show a useful sold/removed page instead of a dead link. Use metadata previews that exclude private locations.

**Acceptance:** A shared listing opens the correct item on web or iOS after sign-in and still works when it has sold.

## P2: Scope-dependent expansions

### 26. Service booking and category-specific fulfillment

**Requested expansion:** Rides and student ticket selling now have a dedicated [product and implementation plan](rides-and-student-tickets-plan.md). It covers student carpools, outbound Uber connectivity, the official UA campus map, event-first ticket sales, simple web/native navigation, and separate demo/live release criteria. Treat their demo work as the next selected scope; live activation still depends on the core marketplace and domain-specific requirements below.

**Gap:** Tutoring, rides, tickets, and service offers are represented in discovery/posts, but lack dedicated booking, capacity, or fulfillment models.

**Implementation:** For tutoring/services, add availability slots, duration, rates, booking acceptance, cancellations, and completion confirmation. Define separate flows for ride capacity and ticket transfer evidence if those categories are retained; assess their category rules before rollout. Do not reuse the physical-item inspection flow without adapting it.

**Acceptance:** A tutor cannot be booked twice for the same slot, and both parties see the exact duration and total price.

### 27. Optional delivery and cross-campus fulfillment

**Gap:** Cross-campus discovery exists; delivery/shipping does not.

**Implementation:** Begin with explicit pickup-only versus seller-delivery options, distance limits, and item transport requirements. If shipping is introduced, add addresses with restricted access, quoted costs, labels, tracking, delivery evidence, and lost/damaged parcel cases. Define when acceptance and payment occur for delivery before enabling it.

**Acceptance:** Buyers know the fulfillment method and full cost before committing. This is not required for a pickup-only pilot.

### 28. Production university promotions and sponsor reporting

**Gap:** The existing portal handles local campaign editing, images, scheduling, and placements, but has no production campus roles, review workflow, billing, or verified campaign metrics.

**Implementation:** Move campaigns and media to managed storage/API, add verified university advertiser accounts, campus-scoped permissions, approval queues, generation quotas, and auditable publication. Measure actual viewable impressions and outbound clicks with defined deduplication and bot filtering. Add sponsor invoices/billing only if paid advertising is part of the business model. Preserve clear sponsor labels and dismissal.

**Acceptance:** One university cannot edit another's campaign, and every reported impression/click comes from an actual measured event.

## Suggested implementation order

1. Establish the shared API/database, identity, campus authorization, and user/profile models (1–3).
2. Make listing creation, galleries, management, discovery, and seller tools work between two real accounts (4–5, 17–18, 21).
3. Connect messages/offers, reservations, pickup, and notifications into one complete exchange (6–9).
4. Complete reporting, moderation, privacy, support, and operational recovery before a real-user pilot (10–13). Build these alongside the preceding slices.
5. If in-app payments are required at launch, complete checkout/ledger, seller onboarding/payouts, and real disputes/refunds before enabling live payments (14–16).
6. Add alerts, reputation, connected requests, trades, live plans, and shareable routes as usage justifies them (19–20, 22–25). Deep-link support also belongs in the notification slice.
7. Expand service booking, fulfillment, and sponsor operations only when those product scopes are selected (26–28).

## Implementation fit with this repository

- Extract web API access and cached marketplace state from `src/App.tsx` into domain-specific modules. Keep the existing UI as the starting point.
- Introduce a native API/repository layer behind `RelayStore`; retain `RelayCore` for client validation, formatting, and display behavior. Execute authoritative permissions, reservations, offers, exchange transitions, and financial decisions on the server.
- Use one versioned API contract and shared fixtures to keep TypeScript and Swift behavior aligned. Standardize money as integer cents, timestamps as UTC, and listing/order IDs across clients.
- Preserve the existing separation between identity, inspection, acceptance, payment capture, transfer, and bank payout. Free items should skip payment setup entirely.
- Add meaningful integration coverage for cross-account access, campus isolation, concurrent reservations, negotiation races, blocked contact, failed uploads, notification retries, and payment webhook replay. Existing local domain tests remain useful but cannot establish server correctness.

## Source evidence

- `src/App.tsx`: localStorage state, local listings/orders/threads, reservation logic, notification placeholder, listing form, and routing.
- `src/Messages.tsx` and `src/lib/messages.mjs`: local-only chat, demo participants, offer/counteroffer transitions, unread state, and agreed price.
- `ios/Relay/App/RelayStore.swift`: local snapshot persistence, listing publication, conversations, reservation, and promotion-only networking.
- `ios/Packages/RelayCore/Sources/RelayCore/Models.swift`: listing/post models, basic search and sorting, campus enum, and plans.
- `ios/Packages/RelayCore/Sources/RelayCore/Conversation.swift`: native local conversation and offer rules.
- `ios/Packages/RelayCore/Sources/RelayCore/Exchange.swift`: simulated payment methods, exchange stages, fixed demo identification, and money labels.
- `ios/Relay/Features/Listing/CreateListingView.swift`: single selected photo saved to local storage.
- `ios/Relay/Features/Listing/ListingDetailView.swift`: sample profiles, text sharing, preferred pickup time, and demo reservation.
- `ios/Relay/Features/Campus/CampusBoardView.swift`: request/offer/trade posting and response forms.
- `ios/Relay/Features/Profile/ProfileView.swift`: local summary/preferences and safety guidance.
- `src/AdsPortal.tsx` and `server/campaigns-api.mjs`: existing promotions editor and local campaign persistence with revision checks.

External implementation references were used only for provider/technology behavior. Proposed priorities and product scope are based on the source review. No application behavior was changed and no runtime tests were run for this document.
