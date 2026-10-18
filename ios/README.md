# Out of Pocket for iOS

A native SwiftUI campus marketplace for iPhone and iPad, targeting iOS 18 and later. Uses system navigation, tabs, sheets, Photos Picker, SF Symbols, haptics, Dynamic Type, light/dark appearance, and Reduce Motion.

## Open and run

### Out of Pocket UI flow

Run the recorded feature walkthrough:

```sh
npm run ios:flow
```

You can also double-click **Out of Pocket UI flow.command** in this folder. This builds the UI test app once, then runs 22 independent chapters in a fixed order on the existing **Relay iPhone**, using `work/ios-ui-flow-build` for test build output. It opens a local results viewer and writes each run to `work/ui-flow/<timestamp>/`. Each chapter has a simulator video, retained screenshots, a test log, and an `.xcresult` bundle. The viewer refreshes while running; `report.json` contains machine-readable statuses and durations. Failures do not stop later chapters, and the command exits unsuccessfully if any chapter fails. Press Control-C to stop and retain completed evidence.

The order covers Home and navigation → classes → marketplace search/saves/filters → listing creation and price suggestions → tutoring search/messages/requests/offers → ticket reservation and transfer → ride requests/acceptance/cancellation → listing negotiation → inspection/cancellation → payment decline/retry → completed handoff and refund → free handoff → Big Al purchases and materials → trading circles and no-match retry → promotions → Auburn inventory → campus pet behavior.

```sh
npm run ios:flow -- --list
npm run ios:flow -- --only 04-market,09-tickets
npm run ios:flow -- --no-video --no-open
npm run ios:flow -- --device SIMULATOR_UUID
```

Subset runs preserve the chapter order regardless of the order supplied to `--only`. Tests use fresh in-memory sample data and simulated transactions. Pet tests exercise their existing preferences and relaunch behavior. This is native UI coverage: live account sign-in, provider-backed AI/schedule imports, photo-library selection, external maps/Uber, and real payments still need separate integration checks. The browser app and university ads administration are outside this native flow. The existing `npm run ios:test` also runs domain tests; the recorded flow runs UI tests only.

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

The app has four destinations, each with one purpose:

- **Home:** Big Al’s campus buying agent plus a campus hub with direct entry to tutoring, tickets, and rides, a ticket spotlight, activity shortcut, tutor preview, classes, and a secondary marketplace entry.
- **Explore:** a persistent service selector for **Tutoring / Tickets / Rides / Market**. Tutoring supports course/name search, subject filters, saved tutor profiles, conversations, and local study requests/offers. Tickets show event cards, available inventory, reservation and transfer progress. Rides include pickup/destination selection, departure windows, seat requests, driver responses, ride posting, and an Uber handoff. Market retains item search, categories, sorting, free/cross-campus filters, asks, and trades.
- **Inbox:** Messages, Activity, and Handoffs. Ride and ticket activity opens the corresponding trip or order. Tutor conversations discuss sessions without item handoff or checkout controls.
- **You:** saved tutors and finds, classes, your posts, campus preferences, sign-in, and safety information.

My Plan and its entry points have been removed. Previously stored plan data remains decodable for compatibility; no new plans are created.

The shared visual system uses warm neutral surfaces, violet actions, and distinct lavender, peach, and green service cards. Entrances are staggered, the service selector animates its selection, buttons respond to presses, and ride/ticket steps transition smoothly. Motion follows Reduce Motion; layouts support Dynamic Type and light/dark appearance. At accessibility text sizes the service selector scrolls horizontally and Home service cards stack vertically.

Listing creation uses selected-photo access through Photos Picker, local JPEG storage, validated monetary input, condition, and descriptions. The existing mock checkout, inspection requirements, offer negotiation, cancellation, and refund flow are preserved. No real payments occur.

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

`RelayCore` has 44 Swift Testing cases covering catalog decoding, campus filters, search, sorting, precise money, setup totals, exchange guards, cancellation, refunds, mock payment failures/retries, original-method retention, legacy data, campus post migration, trade/service post persistence, conversation validation, negotiation turns and stale offers, free-item negotiation, agreed prices, unread counts, and persistence round trips.

`RelayUITests` covers Big Al entry points, course-material review, trade approval and conversations, service navigation, tutor search/save/messaging, study requests, activity shortcuts, promotions, offer negotiation, mandatory inspection, cancellation, and mock payment decline/retry. `.github/workflows/ios.yml` runs domain and simulator UI checks on pushes, then uploads the simulator build, test result bundle, and light/dark screenshots.

The SwiftUI app has no external dependencies. `RelayCore` is a local Swift package shared by the app and its domain tests. Product photography is bundled for offline use; see the repository README for source identifiers.

## Campus promotions

Home, the campus marketplace/board and Exchanges now include a native, dismissible sponsored card. Both campuses have bundled sample event/research campaigns, so placements work on the first offline launch. Sample cards explain that they are examples; real campaign buttons open their validated HTTPS destination.

For live local editing from the university web portal, run `npm run dev -- --port 5174 --strictPort` at the repository root and open `/admin/ads`. The simulator reads the shared campaign service every 30 seconds while active and caches the feed for offline use. Published ads appear; draft, paused, expired, other-campus and unselected-placement ads are excluded. The provider API key stays on the Mac server.

For a physical phone or hosted API, configure the full HTTPS feed URL through the `RELAY_CAMPAIGNS_URL` scheme environment variable or `RelayCampaignsURL` Info.plist key. The default physical-device experience uses samples. Debug builds permit local networking for simulator development; Release builds keep standard ATS behavior. The local service has no university authentication or billing and must stay on loopback until a production backend is implemented.

### Schedule screenshots

Open **You → Your classes** or the classes link on Home. Choose a schedule screenshot, allow processing through OpenRouter, review classes, then save. Manual selection works offline. Classes are stored locally by university and can be cleared. Listing creation includes an optional university course picker, and Tutoring supports course search, and marketplace listings retain their optional course tags.

Run the Vite service on port 5174 with server-only `OPENROUTER_API_KEY`; the simulator imports through `/api/schedule/import`. Physical devices need a hosted HTTPS endpoint configured through `RELAY_SCHEDULE_URL` or `RelayScheduleURL` in Info.plist. `OPENROUTER_SCHEDULE_MODEL` defaults to `google/gemma-4-31b-it`. Out of Pocket does not persist schedule images; the selected screenshot is sent to OpenRouter and its provider only after consent. The course catalog is a starter subset of Alabama/Auburn offerings; unsupported detected codes are reported rather than silently assigned to another course.

## Big Al campus buying agent

Open **Buy with Big Al** on Home or in **Explore → Market**. It includes course-material review, item requests, simulated price negotiations, approval, local conversation transcripts, and trade management. The four main destinations and tutoring/tickets/rides service selector are preserved; My Plan remains removed. Buying-agent negotiation and meetup data are demos, and schedule-photo selection currently loads the labeled sample schedule rather than extracting the image. Select courses manually for your actual schedule.

Optional AI chat uses the server-only `OPENROUTER_API_KEY` and `OPENROUTER_AGENT_MODEL` through `/api/agent/chat`. Set `RELAY_AGENT_URL` / `RelayAgentURL` for a hosted service; the simulator defaults to localhost port 5174. Without the chat service, manual requests and local negotiations still work. Tutor and ticket listings are excluded from the item-buying pool.

### Floating campus companion

Home's buying-agent card is now a large floating pet above the bottom-right tab bar. Alabama gets **Al Pal**, a crimson-clad elephant; Auburn gets **Auburn Pal**, a navy-clad tiger. The companion follows the selected campus and stays available across the four main tabs. Tap it to open the existing buying, course-material, chat, and trading-circle tools. Drag it anywhere within the usable screen; its relative position survives relaunch and adapts to screen size. Long-press to pause/resume dancing or return it to the bottom right. VoiceOver offers directional move actions. Motion stops for Reduce Motion, background scenes, and the open agent sheet.

The transparent pixel-art assets in `pet-al-pal.imageset` and `pet-auburn.imageset` were generated with OpenAI imagegen. The app animates them locally with bounce, sway, and squash; no media service is needed at runtime.

### Trading circles

Open **Buy & swap with Big Al → Start a trading circle**, or switch an open trade to **Swap**. Enter what you give and want. Big Al finds a same-campus loop of two to four students, shows each handoff, collects your approval, and produces a shared sample meetup and code once all simulated members agree. Circle details include local group chat, retry when no match exists, and leave/close actions. Existing campus-board trade posts join the matching pool. Saved circles resume after relaunch; all approvals and chat remain simulated on this device.
