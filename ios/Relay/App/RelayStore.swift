import CryptoKit
import Foundation
import Observation
import Security
import RelayCore

struct AppSnapshot: Codable {
    var courseProfiles: [String: [String]]?
    var conversations: [ListingConversation]?
    var schemaVersion = 1
    var campus: Campus = .alabama
    var savedListingIDs: Set<String> = []
    var savedEventIDs: Set<String> = []
    var ownListings: [Listing] = []
    var plan: SetupPlan?
    var exchanges: [Exchange] = []
    var requests: [CampusRequest] = DemoCatalog.requests
    var includeOtherCampuses = false
    var hasSeenWelcome = false
    var rideDemo: RideLedger?
    var ticketDemo: TicketLedger?
    var baselineApplied: Bool?
}

enum RelayTab: String, CaseIterable, Identifiable {
    case discover = "Home", campus = "Explore", exchanges = "Inbox", you = "You"
    var id: String { rawValue }
    var symbol: String {
        switch self {
        case .discover: "house"
        case .campus: "square.grid.2x2"
        case .exchanges: "bubble.left.and.bubble.right"
        case .you: "person.crop.circle"
        }
    }
}

@MainActor @Observable
final class RelayStore {
    private(set) var snapshot: AppSnapshot
    private(set) var catalog: [Listing] = []
    var promotions: [CampusPromotion] = CampusPromotion.samples
    var dismissedPromotionIDs: Set<String> = []
    var selectedTab: RelayTab = .discover
    var selectedService: CampusService = .tutoring
    var inboxPane = "messages"
    func explore(_ service: CampusService) {
        selectedService = service
        selectedTab = .campus
        feedbackCount += 1
    }
    func openActivity() { inboxPane = "activity"; selectedTab = .exchanges }

    var toast: String?
    var persistenceError: String?
    var feedbackCount = 0
    @ObservationIgnored private let persistenceURL: URL?
    @ObservationIgnored private let promotionCacheURL: URL?
    @ObservationIgnored private var toastTask: Task<Void, Never>?

    var account: MarketplaceAccount?
    var remoteListings: [Listing]?
    var remoteThreads: [ListingConversation]?
    var remoteExchanges: [Exchange]?
    var deepLink: DeepLink?
    @ObservationIgnored private var reservationByLocalID: [UUID: RemoteReservation] = [:]
    @ObservationIgnored private var conversationServerID: [UUID: String] = [:]
    @ObservationIgnored private var offerServerID: [UUID: String] = [:]
    var usesSharedMarket: Bool { account != nil && !ProcessInfo.processInfo.arguments.contains("-ui-testing") }
    var listings: [Listing] {
        if ProcessInfo.processInfo.arguments.contains("-ui-testing") { return snapshot.ownListings + catalog }
        if account != nil, let remoteListings { return remoteListings }
        return snapshot.ownListings + catalog
    }
    var campus: Campus { snapshot.campus }
    var courseCodes: [String] { snapshot.courseProfiles?[campus.rawValue] ?? [] }
    func saveCourses(_ codes: [String], for campus: Campus) {
        let allowed = Set(UniversityCourse.courses(for: campus).map(\.code))
        update { state in
            if state.courseProfiles == nil { state.courseProfiles = [:] }
            state.courseProfiles?[campus.rawValue] = Array(Set(codes.filter { allowed.contains($0) })).sorted()
        }
    }
    var conversations: [ListingConversation] {
        if usesSharedMarket, let remoteThreads { return remoteThreads.sorted { $0.updatedAt > $1.updatedAt } }
        return (snapshot.conversations ?? []).sorted { $0.updatedAt > $1.updatedAt }
    }
    var exchanges: [Exchange] {
        if usesSharedMarket, let remoteExchanges { return remoteExchanges }
        return snapshot.exchanges
    }
    var unreadMessageCount: Int { conversations.reduce(0) { $0 + $1.unreadCount } }
    var campusRequests: [CampusRequest] { snapshot.requests.filter { $0.campus == campus } }

    func rideLedger(now: Date = Date()) -> RideLedger {
        (try? CampusMobility.hydrateRides(snapshot.rideDemo, now: now)) ?? RideLedger(trips: [], bookings: [], handoffs: [], keys: [:])
    }
    func saveRides(_ ledger: RideLedger) { update { $0.rideDemo = ledger } }
    func ticketLedger(now: Date = Date()) -> TicketLedger {
        (try? CampusMobility.hydrateTickets(snapshot.ticketDemo, now: now)) ?? TicketLedger(events: [], listings: [], orders: [], eventRequests: [], keys: [:])
    }
    func saveTickets(_ ledger: TicketLedger) { update { $0.ticketDemo = ledger } }

    init(inMemory: Bool = false) {
        let directory = URL.applicationSupportDirectory.appending(path: "Relay", directoryHint: .isDirectory)
        persistenceURL = inMemory ? nil : directory.appending(path: "campus-state-v1.json")
        promotionCacheURL = inMemory ? nil : directory.appending(path: "campus-promotions-v1.json")
        if let url = promotionCacheURL, let data = try? Data(contentsOf: url),
           let feed = try? JSONDecoder().decode(CampusPromotionFeed.self, from: data) { promotions = feed.ads }
        var loaded = AppSnapshot()
        var startupError: String?
        if !Self.uiTesting, let url = persistenceURL, FileManager.default.fileExists(atPath: url.path) {
            do {
                let data = try Data(contentsOf: url)
                let restored = try JSONDecoder().decode(AppSnapshot.self, from: data)
                guard restored.schemaVersion == 1 else { throw CocoaError(.coderReadCorrupt) }
                loaded = restored
            } catch {
                let backup = url.deletingPathExtension().appendingPathExtension("recovery-\(Int(Date().timeIntervalSince1970)).json")
                try? FileManager.default.copyItem(at: url, to: backup)
                startupError = "We couldn’t restore this device’s demo data. A recovery copy was kept."
            }
        }
        snapshot = loaded
        persistenceError = startupError
        if !ProcessInfo.processInfo.arguments.contains("-ui-testing"), let token = SessionVault.load() {
            account = MarketplaceAccount(token: token, userId: "", displayName: "Signed in", campus: snapshot.campus.rawValue, badge: "")
        }
        do { catalog = try DemoCatalog.listings() }
        catch { persistenceError = "The sample catalog couldn’t be loaded. You can still create a listing." }
        installBaselineIfNeeded()
    }

    private static var uiTesting: Bool { ProcessInfo.processInfo.arguments.contains("-ui-testing") }

    /// Fills empty local demo areas once. Existing messages, plans, and saves stay put.
    private func installBaselineIfNeeded() {
        guard !Self.uiTesting, snapshot.baselineApplied != true else { return }
        let byID = Dictionary(uniqueKeysWithValues: catalog.map { ($0.id, $0) })
        guard let headphones = byID["headphones"], let books = byID["books"], let table = byID["side-table"] else { return }
        let meeting = Calendar.current.date(byAdding: .hour, value: 26, to: Date()) ?? Date()
        update { state in
            if state.savedListingIDs.isEmpty { state.savedListingIDs = ["chair", "lamp", "plant"] }
            if state.savedEventIDs.isEmpty { state.savedEventIDs = ["repair"] }
            if state.courseProfiles?.values.allSatisfy(\.isEmpty) ?? true {
                state.courseProfiles = [Campus.alabama.rawValue: ["CS 100", "EN 101"], Campus.auburn.rawValue: ["COMP 1210"]]
            }
            if (state.conversations ?? []).isEmpty {
                state.conversations = Self.sampleConversations(headphones: headphones, books: books)
            }
            if state.exchanges.isEmpty {
                state.exchanges = [Exchange(id: UUID(uuidString: "6F0C2A10-4B1E-4C3A-9D2E-333333333303")!, listing: table, meeting: meeting)]
            }
            let starter: Set<String> = ["desk-request", "bike-request"]
            if state.requests.isEmpty || Set(state.requests.map(\.id)).isSubset(of: starter) {
                state.requests = DemoCatalog.requests
            }
            state.baselineApplied = true
        }
    }

    private static func sampleConversations(headphones: Listing, books: Listing) -> [ListingConversation] {
        let earlier = Date().addingTimeInterval(-5 * 3600)
        let middle = Date().addingTimeInterval(-4 * 3600)
        let later = Date().addingTimeInterval(-3 * 3600)
        let offerID = UUID(uuidString: "6F0C2A10-4B1E-4C3A-9D2E-444444444404")!
        let offer = ListingOffer(id: offerID, amountCents: 4_500, author: .seller, status: .pending, createdAt: later)
        let headphonesThread = ListingConversation(
            id: UUID(uuidString: "6F0C2A10-4B1E-4C3A-9D2E-111111111101")!,
            listing: headphones,
            messages: [
                ListingMessage(id: UUID(uuidString: "6F0C2A10-4B1E-4C3A-9D2E-111111111111")!, author: .buyer, text: "Still available this week?", offerID: nil, createdAt: earlier),
                ListingMessage(id: UUID(uuidString: "6F0C2A10-4B1E-4C3A-9D2E-111111111112")!, author: .seller, text: "Yes. I can meet near Gorgas after 4.", offerID: nil, createdAt: middle),
                ListingMessage(id: UUID(uuidString: "6F0C2A10-4B1E-4C3A-9D2E-111111111113")!, author: .seller, text: "Offered \(Money.format(4_500))", offerID: offerID, createdAt: later)
            ],
            offers: [offer],
            readMessageCount: 1,
            createdAt: earlier
        )
        let booksThread = ListingConversation(
            id: UUID(uuidString: "6F0C2A10-4B1E-4C3A-9D2E-222222222202")!,
            listing: books,
            messages: [
                ListingMessage(id: UUID(uuidString: "6F0C2A10-4B1E-4C3A-9D2E-222222222221")!, author: .buyer, text: "Are there notes in the margins?", offerID: nil, createdAt: earlier.addingTimeInterval(-3600)),
                ListingMessage(id: UUID(uuidString: "6F0C2A10-4B1E-4C3A-9D2E-222222222222")!, author: .seller, text: "A few pencil notes in chapter 2. Happy to show you before you decide.", offerID: nil, createdAt: earlier)
            ],
            offers: [],
            readMessageCount: 2,
            createdAt: earlier.addingTimeInterval(-3600)
        )
        return [headphonesThread, booksThread]
    }

    /// The simulator can reach the Mac's loopback campaign service. A physical
    /// device uses the configured HTTPS service URL or bundled sample ads.
    func refreshPromotions() async {
        guard !ProcessInfo.processInfo.arguments.contains("-ui-testing") else { return }
        let configured = ProcessInfo.processInfo.environment["RELAY_CAMPAIGNS_URL"]
            ?? Bundle.main.object(forInfoDictionaryKey: "RelayCampaignsURL") as? String
        #if targetEnvironment(simulator)
        let address = configured ?? "http://127.0.0.1:5174/api/ads/campaigns?published=1"
        #else
        guard let address = configured else { return }
        #endif
        guard let url = URL(string: address), url.scheme == "https" || (url.scheme == "http" && ["127.0.0.1", "localhost"].contains(url.host ?? "")) else { return }
        do {
            let request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 8)
            let (data, response) = try await URLSession.shared.data(for: request)
            guard (response as? HTTPURLResponse)?.statusCode == 200, data.count <= 12 * 1024 * 1024 else { return }
            let feed = try JSONDecoder().decode(CampusPromotionFeed.self, from: data)
            guard !Task.isCancelled else { return }
            promotions = feed.ads
            if let cache = promotionCacheURL {
                try? FileManager.default.createDirectory(at: cache.deletingLastPathComponent(), withIntermediateDirectories: true)
                try? data.write(to: cache, options: .atomic)
            }
        } catch { /* Keep the current campaigns or bundled samples offline. */ }
    }

    func isSaved(_ listing: Listing) -> Bool { snapshot.savedListingIDs.contains(listing.id) }
    func toggleSaved(_ listing: Listing) {
        let saved = !snapshot.savedListingIDs.contains(listing.id)
        update { state in
            if saved { state.savedListingIDs.insert(listing.id) } else { state.savedListingIDs.remove(listing.id) }
        }
        feedbackCount += 1
        guard usesSharedMarket, let token = account?.token else { return }
        Task { try? await MarketplaceAPI.sendEmpty(saved ? "POST" : "DELETE", "/favorites/\(listing.id)", token: token) }
    }
    func selectCampus(_ campus: Campus) { update { $0.campus = campus } }
    func setCrossCampus(_ enabled: Bool) { update { $0.includeOtherCampuses = enabled } }
    func finishWelcome() { update { $0.hasSeenWelcome = true } }
    static var photosDirectory: URL { URL.applicationSupportDirectory.appending(path: "Relay/Photos", directoryHint: .isDirectory) }
    func savePhoto(_ data: Data) throws -> String {
        let filename = UUID().uuidString + ".jpg"
        try FileManager.default.createDirectory(at: Self.photosDirectory, withIntermediateDirectories: true)
        try data.write(to: Self.photosDirectory.appending(path: filename), options: .atomic)
        return "local:" + filename
    }
    func publish(_ listing: Listing) {
        update { $0.ownListings.insert(listing, at: 0) }
        notify("Your sample listing has a next chapter.")
    }
    func postRequest(_ request: CampusRequest) {
        update { $0.requests.insert(request, at: 0) }
        notify("Your \(request.postIntent == .find ? "ask" : request.postIntent.rawValue.lowercased()) is on the sample campus board.")
    }
    func toggleEvent(_ id: String) {
        update { state in
            if state.savedEventIDs.contains(id) { state.savedEventIDs.remove(id) }
            else { state.savedEventIDs.insert(id) }
        }
        feedbackCount += 1
    }
    func reserve(_ listing: Listing, meeting: Date) async throws -> UUID {
        if usesSharedMarket {
            guard !listing.isOwnListing, let token = account?.token else { throw ConversationError.invalidAction }
            if let existing = exchanges.first(where: { $0.listing.id == listing.id && ![.canceled, .refunded].contains($0.stage) }) { return existing.id }
            let created: RemoteReservation = try await MarketplaceAPI.post("/reservations", token: token, body: ["listingId": listing.id, "idempotencyKey": "ios:\(listing.id):\(account?.userId ?? "")"])
            await refreshMarketplace()
            notify("Reservation requested. The seller confirms it before anyone pays.")
            return StableID.uuid(created.id)
        }
        guard !listing.isOwnListing else { throw ConversationError.invalidAction }
        if let existing = snapshot.exchanges.first(where: { $0.listing.id == listing.id && ![.canceled, .refunded].contains($0.stage) }) {
            return existing.id
        }
        let conversation = conversations.first { $0.listing.id == listing.id }
        guard conversation?.pendingOffer == nil else { throw ConversationError.invalidAction }
        let agreed = conversation?.agreedListing ?? listing
        let exchange = Exchange(listing: agreed, meeting: meeting)
        update { $0.exchanges.insert(exchange, at: 0) }
        notify("Sample handoff reserved. No money collected.")
        return exchange.id
    }
    func conversation(_ id: UUID) -> ListingConversation? { conversations.first { $0.id == id } }
    func isSeller(_ exchangeID: UUID) -> Bool { reservationByLocalID[exchangeID]?.sellerId == account?.userId }
    func sharedReserveLocked(_ id: UUID) -> Bool {
        guard usesSharedMarket, let order = reservationByLocalID[id] else { return false }
        if order.sellerId == account?.userId { return order.status != "pending_seller" }
        return order.status != "active"
    }
    @discardableResult func openConversation(for listing: Listing) async -> UUID {
        if usesSharedMarket, let token = account?.token {
            if let existing = conversations.first(where: { $0.listing.id == listing.id }) { return existing.id }
            if let created: RemoteConversation = try? await MarketplaceAPI.post("/conversations", token: token, body: ["listingId": listing.id]) {
                await refreshMarketplace()
                return StableID.uuid(created.id)
            }
        }
        if let existing = conversations.first(where: { $0.listing.id == listing.id }) { return existing.id }
        let conversation = ListingConversation(listing: listing)
        update { $0.conversations = ( $0.conversations ?? [] ) + [conversation] }
        return conversation.id
    }
    func markConversationRead(_ id: UUID) {
        guard conversation(id)?.unreadCount ?? 0 > 0 else { return }
        if let serverID = conversationServerID[id], let token = account?.token {
            if var threads = remoteThreads, let index = threads.firstIndex(where: { $0.id == id }) {
                threads[index].markRead()
                remoteThreads = threads
            }
            Task { try? await MarketplaceAPI.postVoid("/conversations/\(serverID)/read", token: token) }
            return
        }
        try? editConversation(id) { $0.markRead() }
    }
    func sendMessage(_ text: String, in id: UUID, as party: ConversationParty) async throws {
        if let serverID = conversationServerID[id], let token = account?.token {
            let _: RemoteMessage = try await MarketplaceAPI.post("/conversations/\(serverID)/messages", token: token, body: ["body": text, "clientId": UUID().uuidString])
            await refreshMarketplace()
            return
        }
        try editConversation(id) { try $0.send(text, as: party) }
    }
    func hasActiveExchange(for listingID: String) -> Bool {
        exchanges.contains { $0.listing.id == listingID && ![.canceled, .refunded].contains($0.stage) }
    }
    func proposeOffer(_ cents: Int, in id: UUID, as party: ConversationParty) async throws {
        if let serverID = conversationServerID[id], let token = account?.token {
            let _: RemoteOffer = try await MarketplaceAPI.post("/conversations/\(serverID)/offers", token: token, body: ["amountCents": cents])
            await refreshMarketplace()
            return
        }
        guard let thread = conversation(id), !hasActiveExchange(for: thread.listing.id) else { throw ConversationError.negotiationClosed }
        try editConversation(id) { try $0.propose(cents, as: party) }
    }
    func respondToOffer(_ offerID: UUID, status: OfferStatus, in id: UUID, as party: ConversationParty) async throws {
        if let serverID = conversationServerID[id], let offer = offerServerID[offerID], let token = account?.token {
            let action = status == .accepted ? "accept" : status == .declined ? "decline" : "withdraw"
            let _: RemoteOffer = try await MarketplaceAPI.post("/conversations/\(serverID)/offers/\(offer)/\(action)", token: token, body: [:])
            await refreshMarketplace()
            return
        }
        guard let thread = conversation(id), !hasActiveExchange(for: thread.listing.id) else { throw ConversationError.negotiationClosed }
        try editConversation(id) { try $0.respond(to: offerID, status: status, as: party) }
    }
    private func editConversation(_ id: UUID, mutation: (inout ListingConversation) throws -> Void) throws {
        guard var threads = snapshot.conversations, let index = threads.firstIndex(where: { $0.id == id }) else { throw ConversationError.invalidAction }
        try mutation(&threads[index])
        update { $0.conversations = threads }
    }
    func exchange(_ id: UUID) -> Exchange? { exchanges.first { $0.id == id } }
    func advance(_ id: UUID, event: ExchangeEvent) async throws {
        if let order = reservationByLocalID[id], let token = account?.token {
            try await advanceShared(order, event: event, token: token)
            await refreshMarketplace()
            return
        }
        guard let index = snapshot.exchanges.firstIndex(where: { $0.id == id }) else { throw ExchangeError.invalidTransition }
        var exchange = snapshot.exchanges[index]
        try exchange.apply(event)
        update { $0.exchanges[index] = exchange }
        feedbackCount += 1
    }
    func notify(_ message: String) {
        toastTask?.cancel()
        toast = message
        feedbackCount += 1
        toastTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(3))
            guard !Task.isCancelled else { return }
            self?.toast = nil
        }
    }
    func refreshMarketplace() async {
        guard !ProcessInfo.processInfo.arguments.contains("-ui-testing"), let token = account?.token ?? SessionVault.load() else { return }
        do {
            let me: MarketplaceProfile = try await MarketplaceAPI.get("/me", token: token)
            let page: MarketplacePage = try await MarketplaceAPI.get("/listings?limit=50", token: token)
            let threads: [RemoteConversation] = try await MarketplaceAPI.get("/conversations", token: token)
            let orders: [RemoteReservation] = try await MarketplaceAPI.get("/reservations", token: token)
            account = MarketplaceAccount(token: token, userId: me.id, displayName: me.displayName, campus: me.campus, badge: me.campusVerification?.badge ?? "")
            remoteListings = page.items.compactMap { $0.listing(mine: $0.mine == true) }
            var hydrated: [ListingConversation] = []
            conversationServerID = [:]
            offerServerID = [:]
            for thread in threads.prefix(30) {
                let detail: RemoteThread = try await MarketplaceAPI.get("/conversations/\(thread.id)/messages", token: token)
                if let conversation = thread.conversation(messages: detail.messages, offers: detail.offers, me: me.id) {
                    hydrated.append(conversation)
                    conversationServerID[conversation.id] = thread.id
                    for offer in detail.offers { offerServerID[StableID.uuid(offer.id)] = offer.id }
                }
            }
            remoteThreads = hydrated
            reservationByLocalID = [:]
            remoteExchanges = orders.compactMap { order in
                guard let exchange = order.exchange(listings: remoteListings ?? [], me: me.id) else { return nil }
                reservationByLocalID[exchange.id] = order
                return exchange
            }
            let saved = Set(page.items.filter { $0.saved == true }.map(\.id))
            if !saved.isEmpty { update { $0.savedListingIDs.formUnion(saved) } }
            SessionVault.save(token)
        } catch {
            notify("The shared marketplace didn’t refresh. Saved listings on this device are unchanged.")
        }
    }

    private func advanceShared(_ order: RemoteReservation, event: ExchangeEvent, token: String) async throws {
        let mine = account?.userId == order.sellerId
        switch event {
        case .cancel:
            let _: RemoteReservation = try await MarketplaceAPI.post("/reservations/\(order.id)/cancel", token: token, body: ["reason": "Changed plans"])
            notify("Reservation canceled. Nothing was captured.")
        case .prepareFunds, .authorizeMock:
            if order.status == "pending_seller" {
                guard mine else { throw ExchangeError.invalidTransition }
                let _: RemoteReservation = try await MarketplaceAPI.post("/reservations/\(order.id)/confirm", token: token, body: [:])
                notify("Reservation confirmed. Agree on a public pickup next.")
                return
            }
            guard order.status == "active" else { throw ExchangeError.invalidTransition }
            if order.priceCents == 0 {
                try await proposeCampusPickup(order, token: token)
                notify("Pickup proposed. Issue a code when you meet. Nothing is charged.")
                return
            }
            guard !mine else { throw ExchangeError.invalidTransition }
            let intent: RemotePayment = try await MarketplaceAPI.post("/reservations/\(order.id)/checkout", token: token, body: [:])
            let _: RemotePayment = try await MarketplaceAPI.post("/payments/\(intent.id)/confirm", token: token, body: ["paymentMethodToken": "sandbox_pm_ok"])
            try await proposeCampusPickup(order, token: token)
            notify("Sandbox hold recorded. No bank charge. Meet and exchange the code.")
        case .identify(let code):
            if code.isEmpty {
                let issued: HandoffIssue = try await MarketplaceAPI.post("/reservations/\(order.id)/handoff/issue", token: token, body: [:])
                notify("Handoff code \(issued.code). It expires in 10 minutes and does not charge anyone.")
                return
            }
            let _: HandoffVerify = try await MarketplaceAPI.post("/reservations/\(order.id)/handoff/verify", token: token, body: ["code": code])
            notify("Partner identified. Inspect the item before accepting it. Nothing was charged.")
        case .inspect:
            return
        case .accept, .captureMock:
            let checks = Array(repeating: true, count: max(order.snapshot.checks?.count ?? 1, 1))
            let _: RemoteReservation = try await MarketplaceAPI.post("/reservations/\(order.id)/accept-item", token: token, body: ["checks": checks])
            notify(order.priceCents == 0 ? "Accepted. No payment was collected." : "Accepted. The sandbox payment was captured. Bank payout is separate.")
        case .report:
            let _: EmptyResponse = try await MarketplaceAPI.post("/reservations/\(order.id)/disputes", token: token, body: ["reason": "The item did not match the listing."])
            notify("Case opened. A report does not refund the exchange.")
        default:
            throw ExchangeError.invalidTransition
        }
    }

    private func proposeCampusPickup(_ order: RemoteReservation, token: String) async throws {
        guard order.pickup == nil else { return }
        let when = Date().addingTimeInterval(24 * 60 * 60)
        let _: EmptyResponse = try await MarketplaceAPI.post("/reservations/\(order.id)/pickup", token: token, body: [
            "startsAt": ISO8601DateFormatter().string(from: when), "timezone": "America/Chicago", "placeLabel": "Campus center",
        ])
    }

    func requestCode(email: String) async throws -> String? {
        let sent: CodeResponse = try await MarketplaceAPI.post("/auth/code", token: nil, body: ["email": email])
        return sent.previewCode
    }

    func verifyCode(email: String, code: String) async throws {
        let session: SessionResponse = try await MarketplaceAPI.post("/auth/verify", token: nil, body: ["email": email, "code": code])
        SessionVault.save(session.token)
        account = MarketplaceAccount(token: session.token, userId: session.user.id, displayName: session.user.displayName, campus: session.user.campus, badge: session.user.campusVerification?.badge ?? "")
        await refreshMarketplace()
        notify("Signed in. Campus membership follows \(session.user.campus).")
    }

    func signOut() {
        let token = account?.token
        account = nil
        remoteListings = nil
        remoteThreads = nil
        remoteExchanges = nil
        reservationByLocalID = [:]
        conversationServerID = [:]
        offerServerID = [:]
        SessionVault.clear()
        if let token { Task { try? await MarketplaceAPI.postVoid("/auth/logout", token: token) } }
    }

    func publishRemote(title: String, category: RelayCore.Category, priceCents: Int, description: String, photo: Data?) async {
        guard let token = account?.token else { publish(Listing(title: title, category: category, priceCents: priceCents, imageName: "room", description: description, isOwnListing: true)); return }
        do {
            var photoIds: [String] = []
            if let photo {
                let uploaded: PhotoUpload = try await MarketplaceAPI.post("/uploads", token: token, body: ["data": photo.base64EncodedString()])
                photoIds = [uploaded.id]
            }
            let created: RemoteListing = try await MarketplaceAPI.post("/listings", token: token, body: [
                "title": title, "description": description, "category": category.rawValue, "condition": "Good",
                "priceCents": priceCents, "area": "Campus area", "status": "draft", "categoryDetails": categoryDetails(category)
            ])
            if !photoIds.isEmpty { let _: RemoteListing = try await MarketplaceAPI.post("/listings/\(created.id)/photos", token: token, body: ["photoIds": photoIds]) }
            let _: RemoteListing = try await MarketplaceAPI.post("/listings/\(created.id)/transition", token: token, body: ["status": "active"])
            await refreshMarketplace()
            notify("Your listing is live for other signed-in students.")
        } catch {
            notify("The listing stayed on this device because the upload didn’t finish.")
            publish(Listing(title: title, category: category, priceCents: priceCents, imageName: "room", description: description, isOwnListing: true))
        }
    }

    private func categoryDetails(_ category: RelayCore.Category) -> [String: Any] {
        switch category {
        case .dorm: ["widthIn": 24, "depthIn": 18, "heightIn": 30, "transport": "Carry"]
        case .books: ["edition": "current", "course": courseCodes.first ?? ""]
        case .tech: ["model": "See description", "storage": "n/a", "accessories": "As described"]
        case .transport: ["size": "See description", "ownership": "I can show ownership at pickup."]
        case .tickets: ["eventName": "Campus event", "seat": "General", "transfer": "This ticket is mine to transfer at the exchange."]
        case .tutoring: ["subject": "Course help", "durationMinutes": 60, "rateCents": 0]
        case .lab: ["course": courseCodes.first ?? "General"]
        default: [:]
        }
    }

    func open(url: URL) {
        let pieces = url.path.split(separator: "/").map(String.init)
        let id: String?
        if url.scheme == "relay" { id = pieces.last }
        else if let index = pieces.firstIndex(where: { ["listing", "profile", "post", "orders"].contains($0) }), index + 1 < pieces.count { id = pieces[index + 1] }
        else { id = nil }
        guard let id else { return }
        deepLink = DeepLink(id: id.removingPercentEncoding ?? id)
        selectedTab = .discover
    }

    private func update(_ mutation: (inout AppSnapshot) -> Void) {
        mutation(&snapshot)
        guard let url = persistenceURL, !Self.uiTesting else { return }
        do {
            try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
            try JSONEncoder().encode(snapshot).write(to: url, options: .atomic)
        } catch { persistenceError = "Your changes are in memory, but this device couldn’t save them. Please try again later." }
    }
}

struct DeepLink: Identifiable, Hashable { let id: String }
struct MarketplaceAccount { var token: String; var userId: String; var displayName: String; var campus: String; var badge: String }

enum SessionVault {
    private static let account = "relay.session"
    static func save(_ token: String) {
        let query = [kSecClass: kSecClassGenericPassword, kSecAttrAccount: account] as CFDictionary
        SecItemDelete(query)
        let data = Data(token.utf8) as CFData
        SecItemAdd([kSecClass: kSecClassGenericPassword, kSecAttrAccount: account, kSecValueData: data] as CFDictionary, nil)
    }
    static func load() -> String? {
        var result: CFTypeRef?
        SecItemCopyMatching([kSecClass: kSecClassGenericPassword, kSecAttrAccount: account, kSecReturnData: true] as CFDictionary, &result)
        guard let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }
    static func clear() { SecItemDelete([kSecClass: kSecClassGenericPassword, kSecAttrAccount: account] as CFDictionary) }
}

enum MarketplaceAPI {
    static var base: URL {
        if let configured = ProcessInfo.processInfo.environment["RELAY_API_URL"] ?? UserDefaults.standard.string(forKey: "RelayAPIURL"), let url = URL(string: configured) { return url }
        return URL(string: "http://127.0.0.1:5174/api/v1")!
    }
    static func get<T: Decodable>(_ path: String, token: String) async throws -> T { try await send("GET", path, token: token, body: nil) }
    static func post<T: Decodable>(_ path: String, token: String?, body: [String: Any]) async throws -> T { try await send("POST", path, token: token, body: body) }
    static func postVoid(_ path: String, token: String) async throws { let _: EmptyResponse = try await send("POST", path, token: token, body: [:]) }
    static func sendEmpty(_ method: String, _ path: String, token: String) async throws { let _: EmptyResponse = try await send(method, path, token: token, body: method == "GET" ? nil : [:]) }
    private static func send<T: Decodable>(_ method: String, _ path: String, token: String?, body: [String: Any]?) async throws -> T {
        guard let url = URL(string: base.absoluteString + path) else { throw MarketplaceFailure("The marketplace address is invalid.") }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        if let body, method != "GET" { request.httpBody = try JSONSerialization.data(withJSONObject: body) }
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw MarketplaceFailure("The marketplace didn’t respond.") }
        if http.statusCode >= 400 {
            let message = (try? JSONDecoder().decode(ErrorResponse.self, from: data).error) ?? "The marketplace couldn’t complete that."
            throw MarketplaceFailure(message)
        }
        return try JSONDecoder().decode(T.self, from: data)
    }
}

struct MarketplaceFailure: Error, LocalizedError {
    var message: String
    init(_ message: String) { self.message = message }
    var errorDescription: String? { message }
}
private struct ErrorResponse: Decodable { var error: String }
private struct EmptyResponse: Decodable {}
struct CodeResponse: Decodable { var previewCode: String? }
struct SessionResponse: Decodable { var token: String; var user: MarketplaceProfile }
struct MarketplaceProfile: Decodable { var id: String; var displayName: String; var campus: String; var campusVerification: Badge?; struct Badge: Decodable { var badge: String } }
struct PhotoUpload: Decodable { var id: String }
struct MarketplacePage: Decodable { var items: [RemoteListing] }
struct RemoteListing: Decodable {
    var id: String; var title: String; var description: String; var category: String; var condition: String
    var priceCents: Int; var originalPriceCents: Int?; var campus: String; var area: String?; var mine: Bool?; var saved: Bool?
    var seller: Seller; var photos: [Photo]
    struct Seller: Decodable { var displayName: String; var initials: String }
    struct Photo: Decodable { var url: String }
    func listing(mine explicit: Bool) -> Listing? {
        guard let category = Category(rawValue: category), let campus = Campus(rawValue: campus) else { return nil }
        let imageName: String
        if let url = photos.first?.url, url.hasPrefix("/images/") { imageName = url.replacingOccurrences(of: "/images/", with: "").replacingOccurrences(of: ".jpg", with: "") }
        else if let url = photos.first?.url, let absolute = URL(string: url, relativeTo: MarketplaceAPI.base)?.absoluteString { imageName = "remote:\(absolute)" }
        else { imageName = "room" }
        return Listing(id: id, title: title, category: category, priceCents: priceCents, originalPriceCents: originalPriceCents, imageName: imageName,
                       seller: seller.displayName, initials: seller.initials, condition: condition, location: area ?? "Campus area", campus: campus,
                       description: description, isOwnListing: explicit || mine == true)
    }
}

enum StableID {
    static func uuid(_ value: String) -> UUID {
        let digest = Array(SHA256.hash(data: Data(value.utf8)).prefix(16))
        return UUID(uuid: (digest[0], digest[1], digest[2], digest[3], digest[4], digest[5], digest[6], digest[7], digest[8], digest[9], digest[10], digest[11], digest[12], digest[13], digest[14], digest[15]))
    }
}

enum RelayTime {
    static func date(_ value: String?) -> Date {
        guard let value else { return Date() }
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = fractional.date(from: value) { return date }
        let plain = ISO8601DateFormatter()
        return plain.date(from: value) ?? Date()
    }
}

struct RemoteThread: Decodable { var messages: [RemoteMessage]; var offers: [RemoteOffer] }
struct RemoteMessage: Decodable { var id: String; var senderId: String; var body: String; var createdAt: String }
struct RemoteOffer: Decodable { var id: String; var proposerId: String; var amountCents: Int; var status: String; var createdAt: String }
struct RemoteConversation: Decodable {
    var id: String; var listing: RemoteListing; var buyerId: String; var sellerId: String; var unread: Int; var offers: [RemoteOffer]
    func conversation(messages: [RemoteMessage], offers: [RemoteOffer], me: String) -> ListingConversation? {
        guard let listing = listing.listing(mine: sellerId == me) else { return nil }
        let local = listing.isOwnListing ? ConversationParty.seller : .buyer
        let mappedMessages = messages.map { message in
            ListingMessage(id: StableID.uuid(message.id), author: message.senderId == me ? local : local.other, text: message.body, offerID: nil, createdAt: RelayTime.date(message.createdAt))
        }
        let mappedOffers = offers.map { offer in
            ListingOffer(id: StableID.uuid(offer.id), amountCents: offer.amountCents, author: offer.proposerId == me ? local : local.other, status: OfferStatus(rawValue: offer.status) ?? .declined, createdAt: RelayTime.date(offer.createdAt))
        }
        return ListingConversation(id: StableID.uuid(id), listing: listing, messages: mappedMessages, offers: mappedOffers, readMessageCount: max(0, mappedMessages.count - unread), createdAt: RelayTime.date(messages.first?.createdAt))
    }
}
struct RemotePickup: Decodable { var startsAt: String; var placeLabel: String }
struct RemotePayment: Decodable { var id: String; var status: String }
struct RemoteSnapshot: Decodable { var title: String?; var description: String?; var category: String?; var condition: String?; var checks: [String]? }
struct RemoteReservation: Decodable {
    var id: String; var listingId: String; var buyerId: String; var sellerId: String; var status: String
    var priceCents: Int; var identified: Bool; var buyerAccepted: Bool
    var pickup: RemotePickup?; var payment: RemotePayment?; var snapshot: RemoteSnapshot
    func exchange(listings: [Listing], me: String) -> Exchange? {
        let stage: ExchangeStage = {
            if status == "completed" || buyerAccepted { return .completed }
            if ["canceled", "expired"].contains(status) { return .canceled }
            if identified { return .inspected }
            if payment?.status == "authorized" || priceCents == 0 && status == "active" { return .fundsReady }
            return .reserved
        }()
        let base = listings.first { $0.id == listingId }
        let listing = Listing(
            id: listingId, title: snapshot.title ?? base?.title ?? "Listing",
            category: RelayCore.Category(rawValue: snapshot.category ?? "") ?? base?.category ?? .dorm,
            priceCents: priceCents, imageName: base?.imageName ?? "room", seller: base?.seller ?? "Campus",
            condition: snapshot.condition ?? base?.condition ?? "Good", campus: base?.campus ?? .alabama,
            description: snapshot.description ?? base?.description ?? "", checks: snapshot.checks ?? base?.checks ?? ["Item matches the listing"],
            isOwnListing: sellerId == me
        )
        let paid: MockPaymentMethod? = payment?.status == "authorized" || stage == .completed && priceCents > 0 ? .visa : nil
        return Exchange(id: StableID.uuid(id), listing: listing, meeting: RelayTime.date(pickup?.startsAt), stage: stage, paymentMethod: paid)
    }
}
struct HandoffIssue: Decodable { var code: String }
struct HandoffVerify: Decodable { var identified: Bool; var charged: Bool }
