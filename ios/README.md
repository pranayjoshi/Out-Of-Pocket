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

- **Discover:** campus switching, native search, category chips, price sorting, free-item/cross-campus filters, product detail sheets, sharing, favorites, and a floating photo composition.
- **My plans:** editable budgets, persistent setup pieces, calculated totals, and budget progress.
- **Campus:** sample event flyers, event saving, sponsorship concepts, and campus request creation.
- **Exchanges:** reservations, partner identification, inspection checklists, explicit acceptance, cancellation, and refund tracking.
- **You:** saved finds, locally created listing entry, campus preferences, accessibility information, and safety guidance.
- **Listing creation:** selected-photo access through Photos Picker, local JPEG storage, validated monetary input, explicit condition, and honest descriptions. Without a selected photo, the sample image is labeled.

State is Codable and persisted atomically in Application Support. Selected photos remain in the app sandbox. A decoding failure keeps a recovery copy instead of silently deleting the prior file. UI tests launch with `-ui-testing` to keep state in memory.

## Safety boundaries

This remains a local interactive prototype. Profiles and university affiliations are unverified. There is no university endorsement, server-side tenancy, messaging, live booking, real moderation, payment provider, escrow, or emergency monitoring.

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

`RelayCore` has 11 Swift Testing cases covering catalog decoding, campus filters, search, sorting, precise money, setup totals, exchange guards, cancellation, refunds, and persistence round trips.

`RelayUITests` covers native navigation, setup creation, invalid partner codes, mandatory inspection, and cancellation. `.github/workflows/ios.yml` runs domain and simulator UI checks on pushes, then uploads the simulator build, test result bundle, and light/dark screenshots.

The SwiftUI app has no external dependencies. `RelayCore` is a local Swift package shared by the app and its domain tests. Product photography is bundled for offline use; see the repository README for source identifiers.
