import Foundation
import Observation
import RelayCore

struct AppSnapshot: Codable {
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
}

enum RelayTab: String, CaseIterable, Identifiable {
    case discover = "Discover", plans = "My plans", campus = "Campus", exchanges = "Exchanges", you = "You"
    var id: String { rawValue }
    var symbol: String {
        switch self {
        case .discover: "sparkle.magnifyingglass"
        case .plans: "square.grid.2x2"
        case .campus: "ticket"
        case .exchanges: "arrow.left.arrow.right"
        case .you: "person.crop.circle"
        }
    }
}

@MainActor @Observable
final class RelayStore {
    private(set) var snapshot: AppSnapshot
    private(set) var catalog: [Listing] = []
    var selectedTab: RelayTab = .discover
    var toast: String?
    var persistenceError: String?
    var feedbackCount = 0
    @ObservationIgnored private let persistenceURL: URL?
    @ObservationIgnored private var toastTask: Task<Void, Never>?

    var listings: [Listing] { snapshot.ownListings + catalog }
    var campus: Campus { snapshot.campus }
    var planListings: [Listing] { listings.filter { snapshot.plan?.listingIDs.contains($0.id) == true } }
    var planTotal: Int { snapshot.plan?.total(in: listings) ?? 0 }
    var campusRequests: [CampusRequest] { snapshot.requests.filter { $0.campus == campus } }

    init(inMemory: Bool = false) {
        let directory = URL.applicationSupportDirectory.appending(path: "Relay", directoryHint: .isDirectory)
        persistenceURL = inMemory ? nil : directory.appending(path: "campus-state-v1.json")
        var loaded = AppSnapshot()
        var startupError: String?
        if let url = persistenceURL, FileManager.default.fileExists(atPath: url.path) {
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
        do { catalog = try DemoCatalog.listings() }
        catch { persistenceError = "The sample catalog couldn’t be loaded. You can still create a listing." }
    }

    func isSaved(_ listing: Listing) -> Bool { snapshot.savedListingIDs.contains(listing.id) }
    func toggleSaved(_ listing: Listing) {
        update { state in
            if state.savedListingIDs.contains(listing.id) { state.savedListingIDs.remove(listing.id) }
            else { state.savedListingIDs.insert(listing.id) }
        }
        feedbackCount += 1
    }
    func selectCampus(_ campus: Campus) { update { $0.campus = campus } }
    func setCrossCampus(_ enabled: Bool) { update { $0.includeOtherCampuses = enabled } }
    func finishWelcome() { update { $0.hasSeenWelcome = true } }
    func savePlan(name: String, budgetCents: Int) {
        update { $0.plan = SetupPlan(name: name, budgetCents: budgetCents, listingIDs: $0.plan?.listingIDs ?? []) }
        notify("A little plan. A great beginning.")
    }
    func addToPlan(_ listing: Listing) {
        update { state in
            if state.plan == nil { state.plan = SetupPlan() }
            state.plan?.add(listing.id)
        }
        notify("Added to your setup plan.")
    }
    func removeFromPlan(_ listing: Listing) { update { $0.plan?.remove(listing.id) } }
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
        notify("Your ask is on the sample campus board.")
    }
    func toggleEvent(_ id: String) {
        update { state in
            if state.savedEventIDs.contains(id) { state.savedEventIDs.remove(id) }
            else { state.savedEventIDs.insert(id) }
        }
        feedbackCount += 1
    }
    func reserve(_ listing: Listing, meeting: Date) -> UUID {
        if let existing = snapshot.exchanges.first(where: { $0.listing.id == listing.id && ![.canceled, .refunded].contains($0.stage) }) {
            return existing.id
        }
        let exchange = Exchange(listing: listing, meeting: meeting)
        update { $0.exchanges.insert(exchange, at: 0) }
        notify("Sample handoff reserved. No money collected.")
        return exchange.id
    }
    func exchange(_ id: UUID) -> Exchange? { snapshot.exchanges.first { $0.id == id } }
    func advance(_ id: UUID, event: ExchangeEvent) throws {
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
    private func update(_ mutation: (inout AppSnapshot) -> Void) {
        mutation(&snapshot)
        guard let url = persistenceURL else { return }
        do {
            try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
            try JSONEncoder().encode(snapshot).write(to: url, options: .atomic)
        } catch { persistenceError = "Your changes are in memory, but this device couldn’t save them. Please try again later." }
    }
}
