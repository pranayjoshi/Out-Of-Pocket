# Relay: student rides and ticket selling

Prepared October 17, 2026. Product and implementation plan for the existing web and native apps; no feature implementation is included in this document.

## 1. Product direction

Add **Rides** and **Tickets** to Relay as focused campus experiences, connected to its existing identity, messaging, events, and inbox. Keep the current marketplace available and preserve its visual language: warm backgrounds, green actions, readable cards, and short forms.

Interpret “like Uber” as a clear pickup → destination → ride request experience, with both student carpools and an actual outbound Uber connection. Interpret “like Student Seats” as event-first student ticket buying and selling. Student Seats is a product reference, not an assumed integration or partnership.

For the UA demo, the student ride map must use the [University of Alabama’s official map](https://www.ua.edu/map/). Other colleges should use their own official maps through campus configuration. The demo should work without a live dispatch network, paid transactions, or university credentials.

| Experience | Initial demo | Real-user release |
| --- | --- | --- |
| Student rides | Browse and offer sample carpools; request a seat; explicit driver simulation | Verified accounts, shared trips, capacity control, notifications, cancellation and support |
| Uber connection | Open Uber with reviewed locations where supported | Tested provider links and fallback; additional APIs only with confirmed access |
| Student tickets | Browse sample events; list, reserve, and simulate transfer | Eligible listings, authoritative reservations, official transfer instructions, supported payment and dispute handling |
| Campus map | UA official interactive map with text location selection | Campus-specific official map configuration and reviewed pickup locations |

The first student ride release should be scheduled carpool matching. Instant dispatch, live driver tracking, dynamic pricing, and commercial driver operations add separate operational scope and should follow evidence of demand.

## 2. Simple navigation

Keep the existing five native tabs: **Discover, My plans, Campus, Inbox, You**. Put a compact row of **Shop · Rides · Tickets** shortcuts near the top of Discover and Campus. These open dedicated destinations; the current destination gets a clear title and back action. Use the same labels on web, without adding more primary navigation sections.

Use the existing Inbox for conversations. Add activity filters for **Items, Rides, Tickets**, plus an **All** default. On web, link ride and ticket activity from Exchanges and keep Messages as the conversation home. On native, put these records in Inbox’s activity section. **You → My posts** provides items, rides, and ticket listings with edit/cancel actions.

The global create button opens three plain choices: **Sell an item, Offer a ride, Sell a ticket**. Within each destination, use the relevant action directly.

| Screen | Immediately visible | Main action |
| --- | --- | --- |
| Rides home | Pickup, destination, departure time; Student rides/Uber control | Find rides or Open in Uber |
| Student ride results | Departure, pickup → destination, contribution per seat, seats left | Select a ride |
| Ride detail | Driver, meeting instructions, time, seat count, total | Request seat |
| Offer a ride | Route, time, seats, contribution | Review ride |
| Tickets home | Upcoming event rows, dates, available ticket counts | Select an event |
| Event tickets | Ticket type/bowl, quantity, all-in price, seller | Select a listing |
| Ticket detail | Event, eligibility, transfer method, price breakdown | Reserve ticket in demo; Buy ticket when live |
| Sell a ticket | Event, ticket type, quantity, price | Review listing |
| Activity detail | Status, next required action, conversation link | One contextual action |

Avoid map-heavy landing screens, competing buttons, and long onboarding tours. Offer a map when choosing or reviewing locations. Preserve each form draft when opening a map, messaging, or an external app.

## 3. Student rides: rider flow

1. Open **Rides**. Start on **Student rides**, with **Uber** beside it.
2. Pick a public campus pickup location and a destination. Search a short campus place list; optionally open the official campus map for orientation. Manual selection works without location permission.
3. Choose **Today** and a departure window, or another date. Default to one passenger; expose additional seats under a small passenger control.
4. Tap **Find rides**. Match the same campus, compatible endpoints, time window, and available capacity. Start with curated pickup areas and destination groups; avoid promising precise detour matching before route data exists.
5. Choose a result. Review the actual meeting spot, driver identity, departure, baggage/accessibility notes, contribution per seat, and total. A student-email badge describes email verification only; driving checks have a separate status if implemented.
6. Tap **Request seat**. Show **Waiting for driver**, with cancellation and a trip-linked conversation. A request does not imply acceptance.
7. On acceptance, show **Seat confirmed**, meeting instructions, and a shareable trip summary. The activity page becomes the place for departure updates, cancellation, and completion.

Result example, using fictional data: “Today, 4:30 PM · Student Center area → airport · 2 seats left · $12 per seat.” Mark the fixture as **Demo**. Airport destinations use a separate reviewed destination record; the UA map covers the campus meeting point.

Start with explicit area matching and departure-time sorting. Allow destination, date, and seat filters; place baggage and other preferences in **More filters**. If nothing matches, show **Change time**, **Post a ride request**, and **Open in Uber**. A ride request must create a persistent post and conversation relationship rather than opening an unrelated listing form.

## 4. Student rides: driver flow and capacity

Use three short steps:

1. **Route & time:** pickup, destination, departure date/time.
2. **Seats & details:** offered seats, contribution per seat or Free, vehicle details, luggage, optional accessibility notes.
3. **Review:** route summary, passenger total, cancellation terms, then **Post ride**.

Show incoming requests on the ride’s activity page with **Accept** and **Decline**. The driver cannot reduce capacity below accepted seats. Material changes to a confirmed ride require affected riders to reconfirm or cancel; changing a destination must never silently alter an accepted booking.

Model the trip separately from each passenger booking:

- Trip: `draft → open → full → in_progress → completed`, with `canceled` and `expired` branches. A full trip can reopen after a cancellation.
- Booking: `requested → accepted → in_progress → completed`, with `declined`, `withdrawn`, `expired`, `canceled`, and reported `no_show` branches.
- Requests do not consume seats; acceptance atomically checks and consumes the requested quantity. Limit duplicate requests and set an explicit request expiry.
- Accepted cancellations release capacity exactly once. Retried actions cannot duplicate a booking or release seats twice.
- At departure, unaccepted requests expire. Trip completion must not automatically claim that every passenger rode; retain participant confirmations and reported problems separately.

For the demo, provide a clearly labeled **Demo: act as driver** control, matching the existing conversation simulator. Paid real-user student rides depend on the operating model, applicable transport requirements, driver/vehicle checks, insurance arrangements, and a defined contribution/payment policy. Assign those decisions before enabling a live paid pilot; the demo can simulate them immediately.

## 5. UA official map integration

The [UA map page](https://www.ua.edu/map/) currently embeds a [Concept3D campus map](https://map.concept3d.com/?id=1222). Use this official map experience for the demo rather than creating a replacement map.

Implement the following fallback sequence:

1. **Integration spike:** test the official page in the web panel and native web container, including framing restrictions, cookies, navigation, accessibility, loading, and network failure. Confirm supported embed terms and any documented location-link interface before relying on them.
2. **Web:** if embedding is permitted and works, show the official experience in a dedicated map panel with a persistent **Open UA map** link. If framing fails, use the same link in a new browser tab and keep the form in Relay.
3. **Native:** present the official page in an in-app browser if usable, with an external-browser fallback. Return to the preserved ride draft.
4. **Location selection:** keep Relay’s searchable place list outside the third-party map. Selecting a Relay place sets the pickup/destination in Relay. Opening the map helps identify the area; the user can then return and select the named place.
5. **Enhancement:** add map centering, markers, or two-way selection only if an authorized, documented integration supports them. Do not depend on reading cross-origin map DOM or inventing map API parameters.

The baseline demo does not claim that tapping the embedded map selects a Relay pickup. Label the action **View campus map** and give a short instruction: “Find your location, then choose the meeting point below.” Avoid placing a second independent set of pins over an unconnected map.

Create campus configuration with `campusId`, `officialMapUrl`, optional approved embed URL, optional documented place-link template, fallback behavior, and a place catalog. Each place needs a stable ID, display name, aliases, area, source, review date, and optional reviewed coordinates and pickup instructions. A building centroid is not automatically a suitable vehicle pickup point.

Candidate UA fixture areas can include the Student Center, university libraries, recreation facilities, and stadium surroundings. Confirm exact names, coordinates, vehicle access, and meeting instructions before describing any point as approved. Game-day road closures may require different meeting points. Keep unknown points visibly unreviewed in development.

Do not require GPS for the basic flow. Ask for one-time location access only after **Use my location**; offer manual entry on denial. With an unavailable map, retain searchable places and the chosen location text. If Uber coordinates are unreviewed, open Uber for manual confirmation rather than passing fabricated coordinates. Off-campus navigation can continue in Uber; Relay’s campus map remains the university’s map.

## 6. Uber connectivity

Use a provider-link adapter as the first integration. Uber documents ride-request deep links and native/mobile-web handoffs in its [developer guide](https://developer.uber.com/docs/deep-linking-action-setpickup). Its [widget migration guidance](https://developer.uber.com/docs/riders/ride-requests/tutorials/widget/migration-to-deep-links) favors linking into the Uber experience. Verify the current link requirements and test target devices during implementation.

Reuse the reviewed pickup and destination from the Rides form. Show **Open in Uber** with supporting text: “Review your pickup, fare, and booking in Uber.” Pass supported location fields through a URL builder with proper encoding and configured provider identifiers where required. Keep credentials and provider access rules appropriate to the integration.

Opening the link records only an outbound handoff. Returning to Relay must not show **Ride booked**, a driver arrival, a charged fare, or a completed trip. Pricing, dispatch, and payment stay in Uber. If app opening fails, offer its supported web flow plus copyable location details. Test installed-app, missing-app, desktop, and failed-link cases.

Later provider estimates, booking APIs, or trip-status callbacks require confirmed provider access and authoritative responses. Keep those capabilities behind flags; an outbound click is never a conversion measurement. This plan does not assume an Uber commercial partnership.

## 7. Tickets: buyer flow

Use an event-first marketplace. Student Seats’ [published flow](https://studentseats.com/Home/HowItWorks) is a useful reference for discovering an event and coordinating a university-portal transfer. Relay should use its own transaction rules and interface rather than inherit another service’s fee schedule or protection claims.

1. Open **Tickets** and choose an upcoming event. Each event shows date/time, venue, and available eligible listings. Use **Time TBD** when appropriate.
2. Browse simple rows: ticket type/bowl or section, quantity, eligibility, seller, and all-in price. Default to lowest total price; support bowl/type and quantity filters.
3. Open a listing and review ticket details, restrictions, transfer method, deadline, and cost. For student general admission, show the actual bowl/type; do not invent assigned row or seat numbers.
4. Tap **Reserve ticket** in the demo. Live **Buy ticket** requires sign-in, eligibility checks, an atomic inventory hold, and the approved payment flow.
5. Track the order through a short checklist: **Payment → Seller transfer → Accept in university portal → Receipt**. The highlighted step shows who must act and by when.
6. Return from the official portal and report receipt or a problem. Without an integration, label confirmations **Reported by seller/buyer** rather than **University verified**.

UA’s [Action Card instructions](https://actcard.ua.edu/my-tickets/) describe student-to-student transfers through MyTickets and require the recipient to accept. Configure UA student football with that transfer route. Keep student eligibility, bowl assignment, and transfer deadlines separate from general-admission ticketing. Recheck event-specific rules before launch; transfer capability alone does not establish permission for every resale arrangement.

For ordinary athletics tickets, Alabama’s [2026 game-day guidance](https://rolltide.com/news/2026/8/28/football-new-in-2026) identifies SeatGeek as its official marketplace. Route unsupported ticket types to the applicable official channel. Relay must not imply university endorsement or an automatic ticketing partnership.

After an order completes, offer a quiet **Need a ride?** link with the event venue preselected where a reviewed destination exists. Keep transportation optional and outside checkout.

## 8. Tickets: seller flow

Keep the listing form short:

1. **Choose event:** select from a campus event catalog. Catalog entries carry venue, time or TBD, ticket policy, and transfer route. Initially send missing-event requests to review rather than letting sellers publish arbitrary events.
2. **Describe ticket:** student ticket/general admission/assigned seat; bowl or section where relevant; quantity; price per ticket. Show only fields required for that type.
3. **Review & publish:** show buyer total, seller proceeds, transfer deadline, and an ownership/eligibility attestation. Live publication also checks the campus policy and seller account.

A screenshot may support a moderation review but cannot prove current ownership. Do not request ticket barcodes, university passwords, full student IDs, or public ticket QR images. Store any necessary evidence privately with access controls and retention. Mark ownership as self-reported unless independently verified.

Start with one ticket per listing for UA student football; allow configurable quantities for other supported events. Multi-ticket inventory must reserve quantity atomically. Add adjacent-seat and bundle rules only when event data supports them.

After a sale, show a single next action: **Open official transfer portal**. Reveal only the recipient identifier needed for the transaction to the authorized seller. Show **I sent the transfer** as a self-report, then ask the buyer to accept in the official system. A sent transfer and an accepted transfer are distinct states.

## 9. Ticket orders and money rules

Keep ticket fulfillment independent of physical-item inspection. Recommended order states are `reserved → payment_pending → awaiting_transfer → transfer_reported → receipt_reported → completed`, with `expired`, `canceled`, and `disputed` branches. Payment authorizations, captures, refunds, seller transfers, and payouts have their own provider-backed states.

- Use short server-owned reservation expiries. Releasing an unpaid hold can relist inventory. A paid order with uncertain transfer status requires resolution before relisting the same ticket.
- Snapshot price, quantity, event details, policy version, and transfer deadline when reserving. A seller price edit cannot change an existing order.
- Display total cost before commitment. Proposed Relay policy is no added student platform commission, consistent with its current direction; processing-cost funding remains an explicit business decision. Do not silently introduce buyer fees or promise subsidized processing before it is funded.
- In the demo, show **Simulate payment** and **Demo transfer** with fictional recipients. No real ticket should be sent during a demo walkthrough.
- Before enabling live payments, choose a provider-supported capture and payout policy, seller onboarding, loss allocation, refunds, and staffed dispute handling. Authorization expiry and event timing must fit that policy. Do not copy a competitor’s fixed complaint period or label Relay’s arrangement escrow without support.
- Lack of a complaint is insufficient evidence of delivery. A buyer self-report is also not provider verification. Define reviewed evidence and resolution rules for missing, wrong, duplicate, canceled-event, and denied-entry cases.
- Event cancellation pauses affected listings and creates an explicit resolution workflow; postponement preserves the original schedule and shows the changed date for review. Do not assume an issuer refund automatically reimburses the Relay buyer.

## 10. UI and accessibility requirements

Use concrete labels: **Find rides**, **Request seat**, **Offer a ride**, **Sell a ticket**, **Accept in MyTickets**. Keep one prominent action per screen and contextual help beside the field that needs it.

- Show campus, date/time, and total price in the review screen and activity summary. Format event/trip times in the campus timezone, with a timezone label when the user or destination differs.
- Use at least 44 × 44 point native targets and comparably usable web controls; visible labels, keyboard operation, focus return, and screen-reader status announcements.
- Support large text, narrow screens, reduced motion, and text/icons alongside status color. Lists provide the same essential location information as the map.
- Keep **More options** collapsed for uncommon fields. Preserve drafts and selected filters on back navigation and external-app returns.
- Handle loading, offline, empty, permission-denied, expired, full, sold, and removed states with a useful next action. Never show a success state after a failed write.
- Avoid live-tracking animations and countdowns that are not backed by real data. Use server-derived expiry times for live reservations.
- Describe third-party map behavior clearly. A small attribution/link belongs beside the map; no misleading affiliation badge.

Proposed usability targets: a first-time student can find a ride and submit a request in under 60 seconds, list a ticket in under 90 seconds, identify their next transfer action without assistance, and complete either location-selection flow without GPS. These are targets to test, not measured results.

## 11. Data and API design

Reuse account, campus, conversation, report, notification, and audit infrastructure when implemented. The current working tree contains initial marketplace schema files; their presence does not establish a running shared marketplace. Use explicit models for the new domains.

| Record | Essential fields |
| --- | --- |
| CampusMapConfig / CampusPlace | Campus, official URL, optional supported embed/link config; place ID, aliases, source, review status, coordinates, pickup notes |
| RideTrip | Driver, campus, pickup/destination IDs or private destination, departure UTC, campus timezone, capacity, contribution cents, vehicle summary, status, version |
| RideBooking | Trip, rider, quantity, status, expiry, accepted terms, timestamps, version |
| Event / TicketPolicy | Campus, venue, start UTC or TBD, timezone, status, ticket types, eligibility, transfer route/window, resale configuration, source/review date |
| TicketListing | Seller, event, type/bowl/seat fields, quantity, price cents, inventory status, attestation, version |
| TicketOrder / TransferRecord | Buyer/seller, inventory hold, quantity, price/policy snapshot, deadline, provider references, participant reports, evidence, dispute state |
| ProviderHandoff | User, provider, reviewed location references, opened timestamp; no assumed booking state |

Keep money in integer cents and canonical timestamps in UTC. Validate authorization and campus access on the server. Distinguish verified campus membership from an event’s more specific ticket eligibility.

Proposed API groups:

- `GET /api/campuses/:id/places` and campus map configuration.
- `GET/POST /api/rides`; owner-authorized edit/cancel; `POST /api/rides/:id/requests`; accept, decline, withdraw, cancel, and completion actions on bookings.
- `GET /api/events`; `GET/POST /api/ticket-listings`; edit/withdraw; `POST /api/ticket-listings/:id/reservations`; order checkout, transfer-report, receipt-report, and dispute actions.
- Domain-linked conversation and notification endpoints; authenticated private transfer-detail access; verified payment/provider webhooks only when those integrations exist.

Use idempotency keys for reservations and consequential transitions, version checks for edits, and database transactions/constraints for capacity and inventory. Enforce ownership, participant membership, blocked-contact rules, and eligible campus on each action. Jobs expire holds and requests using server time; retries remain safe. Rate-limit publication and requests, retain audit history, and restrict private location/recipient data to the required participants.

## 12. Fit with this repository

| Existing area | Planned change |
| --- | --- |
| `src/App.tsx`, `src/data.ts` | Add destination routing/shortcuts and typed demo seeds; route ride/ticket creation into dedicated forms |
| New `src/features/rides/` | Search, results, detail, offer form, activity, official campus map panel, provider-link adapter |
| New `src/features/tickets/` | Event list, ticket rows, detail, sale form, order checklist |
| `src/Messages.tsx`, `src/lib/messages.mjs` | Generalize conversation subjects beyond listings while preserving existing item negotiation |
| `ios/Relay/App/RelayRootView.swift`, `RelayStore.swift` | Preserve tabs, add routes/repositories, migrate local snapshots with defaults |
| New native `Features/Rides/` and `Features/Tickets/` | Equivalent native flows, campus-map browser presentation, external-provider handoff |
| Native `RelayCore` | Ride/ticket domain types, state rules, campus config, deterministic fixtures and display formatting |
| `server/marketplace/db.mjs` | Review and migrate schema: current `ride_bookings` stores only listing, rider, and timestamp; add trip, quantity, status and concurrency rules |
| Existing exchange, ads and schedule code | Keep domain contracts intact; connect only through explicit event/location/conversation references |

Create a versioned conversation subject such as `item`, `ride_booking`, or `ticket_order`; do not reuse an item ID field for unrelated records. Retain legacy listing conversations during migration. Share API fixtures and policy definitions between web and native to prevent differences in seat counts, ticket totals, or permitted actions.

## 13. Delivery sequence

Estimates are indicative engineering effort for someone familiar with this repository, not delivery commitments; provider approvals and university coordination may dominate elapsed time.

| Stage | Deliverable | Exit condition | Indicative effort |
| --- | --- | --- | --- |
| 1. UX and integration spike | Routes, compact screen outlines, UA official map proof, tested Uber handoff approach, ticket-policy configuration | Map fallback and provider behavior documented; simple flows reviewed | 2–3 days |
| 2. UA rides demo | Shared fixtures, ride forms/results/requests, driver simulation, official map, Uber link | Both clients demonstrate the complete ride journey and failures | 4–6 days |
| 3. UA tickets demo | Sample events, sell form, inventory holds, order checklist, explicit simulated transfer | Both clients demonstrate buying and selling without real funds or credentials | 4–6 days |
| 4. Usability and integration pass | Unified activity/messages, responsive/accessible UI, state restoration, regression checks | Usability targets tested and critical navigation issues resolved | 2–3 days |
| 5. Shared live foundation | Authentication, campus permissions, domain APIs, persistence, notifications, moderation and operational recovery | Two real authorized accounts complete non-simulated cross-device coordination | Scope with the broader marketplace backend |
| 6. Controlled launch | Campus/event rules, transport operating decisions, supported payments/transfer evidence and support | All applicable release gates met; flags enable each domain independently | Estimate after external dependencies are confirmed |

Ship stages 1–4 as the next product demo. Build stages 5–6 on the broader marketplace foundation described in [marketplace-feature-gaps.md](marketplace-feature-gaps.md). Uber outbound connectivity can ship independently; live paid rides and ticket sales need their own release decisions. A later campus expansion adds official-map config and reviewed event rules instead of copying UA assumptions.

## 14. Demo walkthrough and acceptance

Use fictional names, event opponents/dates, quantities, prices, and availability with persistent Demo labeling. Suggested fixture set: three rides (available, full, canceled), two upcoming events (student admission and a supported campus event), a sold ticket, and one failed/expired reservation.

The walkthrough should demonstrate:

1. Student selects UA, opens Rides, views the official map, returns with their draft intact, finds a trip, and requests one seat.
2. Demo driver accepts; rider sees the confirmation in activity and opens the same trip conversation. A final-seat race accepts only one request.
3. Student switches to Uber and opens the provider with reviewed location data. Returning to Relay shows no fabricated booking status.
4. Seller selects a sample event and publishes a student ticket in three short steps. Buyer reserves it; competing buyers see unavailable inventory.
5. Demo payment and transfer reports advance a clear checklist. The buyer sees a separate university-portal acceptance instruction and reports receipt. A missing transfer opens a case instead of completing the order.
6. Buyer follows **Need a ride?** with the venue populated and can change it before searching.

Required verification includes concurrency for the last seat/ticket, hold expiry, idempotent cancellation, cross-campus and participant access, price snapshot protection, map blocked/offline behavior, location denial, provider fallback, transfer deadline changes, disputed receipt, canceled/postponed events, blocked contact, and web/native state parity. Verify keyboard and screen-reader flows and large text on representative mobile widths. Run existing marketplace tests after integration; add domain and integration coverage for consequential transitions.

Run a small task-based usability session with 5–8 students before the pilot. Observe completion and errors rather than asking only whether the UI looks simple. Revise any point where students confuse an outbound Uber link with a booking, a seat request with acceptance, or a transfer report with confirmed possession.

## 15. Release decisions and measurement

Proceed with the demo using the defaults above. Before live activation, assign owners to approve: transport operating model and driver checks; campus/event resale and eligibility rules; official-map embed support; Uber configuration; payment-cost funding and capture/payout policy; transfer evidence; cancellation/refund rules; and support coverage near departure/event times. These decisions do not block planning or the simulated demo.

Use independent flags for rides demo, tickets demo, Uber handoff, live ride matching, paid rides, ticket checkout, and each approved campus/event policy. Keep demo and live data separate.

Measure real funnel steps: ride search → request → acceptance → participant-reported completion; ticket event view → reservation → payment → transfer report → receipt report → resolution. Track zero results, cancellations, no-shows, transfer lateness, and support cases. Measure outbound Uber opens separately. Avoid logging precise coordinates, private destinations, university usernames, or ticket evidence in general analytics. Never present these planned metrics as existing usage or verified provider outcomes.
