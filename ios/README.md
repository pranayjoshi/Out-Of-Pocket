# Relay for iOS

A native SwiftUI campus marketplace for iPhone and iPad, targeting iOS 18 and later. Uses system navigation, tabs, sheets, Photos Picker, SF Symbols, haptics, Dynamic Type, light/dark appearance, and Reduce Motion.

## Open and run

From the repository root, run the first-time setup:

```sh
python3 ios/scripts/relay.py setup
```

This selects full Xcode for this process, installs its first-launch components and a compatible iOS runtime if missing, creates a dedicated **Relay iPhone**, then builds, installs, and launches the app. The runtime download is approximately 9 GB; setup requires at least 14 GB free before starting a download. It does not change the global `xcode-select` setting. No XcodeGen, Homebrew packages, Node dependencies, account, API key, or signing team is needed.

For subsequent launches, double-click **Launch Relay.command** or run:

```sh
python3 ios/scripts/relay.py run
python3 ios/scripts/relay.py doctor   # Check Xcode and the installed runtime
python3 ios/scripts/relay.py test     # Domain tests and native simulator UI tests
```

Equivalent npm shortcuts are `npm run ios:setup`, `npm run ios`, `npm run ios:doctor`, and `npm run ios:test`. Optional `--device UUID` uses an existing simulator. Builds stay in the ignored `work/ios-local-build` directory; app data persists in the simulator across launches.

If the simulator hangs on its first boot, retry with `python3 ios/scripts/relay.py run --restart`. This restarts the selected simulator without erasing its data or downloading the runtime again. The launcher stops waiting after 10 minutes and prints recovery instructions. A runtime marked **Verified / Ready** in `xcrun simctl runtime list` has finished verification; the subsequent first-boot migration and cache setup are separate steps.

Or use Xcode directly:

1. Open `Relay.xcodeproj` in Xcode 16 or later.
2. Choose the **Relay** scheme and an installed iPhone simulator.
3. Run with **⌘R**. No account, API key, or signing team is needed for the simulator.
4. To run on a physical iPhone, choose your own development team in Signing & Capabilities and select the device. Device signing and TestFlight distribution require your Apple account configuration.

The checked-in Xcode project is ready to open; XcodeGen is only needed when regenerating it after changing `project.yml`:

```sh
xcodegen generate --spec ios/project.yml
```

From the repository root:

```sh
# Native business rules; does not require a simulator runtime.
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcrun swift test \
  --package-path ios/Packages/RelayCore

# Choose an installed simulator name, or supply its UUID.
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild test \
  -project ios/Relay.xcodeproj -scheme Relay \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  CODE_SIGNING_ALLOWED=NO
```

`DEVELOPER_DIR` is optional if your active developer directory already points to Xcode. It avoids changing the machine's global developer selection.

## Native experience

- **Discover:** an interactive campus switchboard with Find / Offer / Trade, six quick topics (books, dorm gear, lab supplies, tickets, tutoring, rides), category-aware matching, prefilled listing and campus-post forms, and an ask fallback when there are no matches. Also includes campus switching, native search, category chips, price sorting, free-item/cross-campus filters, product detail sheets, sharing, favorites, and responsive listing cards.
- **My plans:** editable budgets, persistent setup pieces, calculated totals, and budget progress.
- **Campus:** campus asks, service offers, and trades appear before sample event flyers. Posts include optional budgets, timing/rate details, and both sides of a trade. All posts are local to this device. Also includes event saving and sponsorship concepts.
- **Inbox:** persistent listing conversations, messages, unread counts, offers, counters, acceptance, decline, and withdrawal. Use the explicit demo participant switch to try both sides. Agreed prices carry into handoffs. Messages remain on this device.
- **Inbox → Handoffs:** reservations, partner identification, inspection checklists, explicit acceptance, cancellation, and refund tracking.
- **Mock checkout:** select sample Visa, Mastercard, or Apple Pay; simulate success, decline, or connection failure at authorization and capture. Processing prevents duplicate taps. Failed attempts keep the current stage and can be retried. Receipts retain the original funding method through refunds. No Wallet connection or real card details are collected.
- **You:** saved finds, locally created listing entry, campus preferences, accessibility information, and safety guidance.
- **Listing creation:** selected-photo access through Photos Picker, local JPEG storage, validated monetary input, explicit condition, and honest descriptions. Without a selected photo, the sample image is labeled.

State is Codable and persisted atomically in Application Support. Selected photos remain in the app sandbox. A decoding failure keeps a recovery copy instead of silently deleting the prior file. UI tests launch with `-ui-testing` to keep state in memory.

## Safety boundaries

This remains a local interactive prototype. Profiles and university affiliations are unverified. There is no university endorsement, server-side tenancy, live message delivery, live booking, real moderation, payment provider, escrow, or emergency monitoring.

Exchange transitions are enforced in `Packages/RelayCore`, not only by hiding UI buttons:

- Identifying the other party does not accept an item or capture money.
- All inspection checks are required before explicit acceptance.
- Canceling before capture cannot transition into payment.
- Reporting a case does not approve a refund.
- A refund submission and bank confirmation are separate.
- Free items never claim a card hold, charge, or seller transfer.
- Monetary values are integer cents; invalid or fractional-cent inputs are rejected.

Future real payments must execute server-side with verified provider webhooks, an order/money ledger, idempotency, reconciliation, appropriate seller onboarding, and funded loss handling. On-device state is not authoritative for financial operations.

## Checks and CI

`RelayCore` has 25 Swift Testing cases covering catalog decoding, campus filters, search, sorting, precise money, setup totals, exchange guards, cancellation, refunds, mock payment failures/retries, original-method retention, legacy data, campus post migration, trade/service post persistence, conversation validation, negotiation turns and stale offers, free-item negotiation, agreed prices, unread counts, and persistence round trips.

`RelayUITests` covers native navigation, setup creation, invalid partner codes, mandatory inspection, cancellation, and mock payment decline/retry. `.github/workflows/ios.yml` runs domain and simulator UI checks on pushes, then uploads the simulator build, test result bundle, and light/dark screenshots.

The SwiftUI app has no external dependencies. `RelayCore` is a local Swift package shared by the app and its domain tests. Product photography is bundled for offline use; see the repository README for source identifiers.

## Campus promotions

Discover, Campus, My plans and Exchanges now include a native, dismissible sponsored card. Both campuses have bundled sample event/research campaigns, so placements work on the first offline launch. Sample cards explain that they are examples; real campaign buttons open their validated HTTPS destination.

For live local editing from the university web portal, run `npm run dev -- --port 5174 --strictPort` at the repository root and open `/admin/ads`. The simulator reads the shared campaign service every 30 seconds while active and caches the feed for offline use. Published ads appear; draft, paused, expired, other-campus and unselected-placement ads are excluded. The provider API key stays on the Mac server.

For a physical phone or hosted API, configure the full HTTPS feed URL through the `RELAY_CAMPAIGNS_URL` scheme environment variable or `RelayCampaignsURL` Info.plist key. The default physical-device experience uses samples. Debug builds permit local networking for simulator development; Release builds keep standard ATS behavior. The local service has no university authentication or billing and must stay on loopback until a production backend is implemented.

### Schedule screenshots

Open **You → Your classes** or the link in Discover. Choose a schedule screenshot, allow processing through OpenRouter, review classes, then save. Manual selection works offline. Classes are stored locally by university and can be cleared. Listing creation includes an optional university course picker, and Discover's **For you** sort promotes relevant listings with an explanation.

Run the Vite service on port 5174 with server-only `OPENROUTER_API_KEY`; the simulator imports through `/api/schedule/import`. Physical devices need a hosted HTTPS endpoint configured through `RELAY_SCHEDULE_URL` or `RelayScheduleURL` in Info.plist. `OPENROUTER_SCHEDULE_MODEL` defaults to `google/gemini-2.5-flash-lite`. Relay does not persist schedule images; the selected screenshot is sent to OpenRouter and its provider only after consent. The course catalog is a starter subset of Alabama/Auburn offerings; unsupported detected codes are reported rather than silently assigned to another course.
