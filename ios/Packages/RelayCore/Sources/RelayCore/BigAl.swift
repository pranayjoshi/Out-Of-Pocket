import Foundation

/// Big Al, the campus buying agent. Every student gets the same agent: the search,
/// negotiation and meetup rules below are identical for everyone; only the student's
/// own max price changes what it does.

public enum AgentSide: String, Codable, Sendable { case al, seller }

public struct AgentRound: Codable, Equatable, Sendable {
    public let side: AgentSide
    public let amountCents: Int
    public let note: String
    public init(side: AgentSide, amountCents: Int, note: String) {
        self.side = side; self.amountCents = amountCents; self.note = note
    }
}

public enum AgentTradePhase: String, Codable, Sendable {
    case searching, negotiating, ready, noDeal, locked, passed, unavailable
    public var isWorking: Bool { self == .searching || self == .negotiating }
}

public struct AgentMaterial: Codable, Equatable, Sendable {
    public let title: String
    public let kind: String
    public let listingID: String?
}

public struct AgentNegotiation: Codable, Equatable, Sendable {
    public let askedCents: Int
    public let ceilingCents: Int
    public let rounds: [AgentRound]
    public let agreedCents: Int?
    public let zone: String
    public let slot: String
    public let code: String
    public var savedCents: Int { agreedCents.map { askedCents - $0 } ?? 0 }
}

public struct AgentTrade: Codable, Identifiable, Equatable, Sendable {
    public let id: UUID
    public var item: String
    public var courseCode: String?
    public var maxCents: Int?
    public var phase: AgentTradePhase
    public var listing: Listing?
    public var options: Int
    public var negotiation: AgentNegotiation?
    public var conversationID: UUID?
    public var exchangeID: UUID?
    public let createdAt: Date
    public init(id: UUID = UUID(), item: String, courseCode: String? = nil, maxCents: Int? = nil, createdAt: Date = Date()) {
        self.id = id; self.item = item; self.courseCode = courseCode; self.maxCents = maxCents
        self.phase = .searching; self.listing = nil; self.options = 0; self.negotiation = nil; self.createdAt = createdAt
    }
    /// What the student sees: the found listing's title for open requests, the course item otherwise.
    public var displayTitle: String { courseCode == nil ? (listing?.title ?? item.capitalizedFirst) : item }
}

private struct BigAlData: Decodable {
    let materials: [String: [AgentMaterial]]
    let listings: [Listing]
}

public enum BigAl {
    /// Any uploaded schedule reads as this Fall 2026 load in the demo.
    public static let demoSchedule = ["CS 495", "CS 460", "CS 465", "CS 470", "GES 255", "AY 101"]
    /// By default Big Al stays under this share of the asking price.
    public static let defaultMaxShare = 0.86

    private static let data: BigAlData? = {
        guard let url = Bundle.module.url(forResource: "bigal", withExtension: "json"),
              let raw = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(BigAlData.self, from: raw)
    }()

    public static var listings: [Listing] { data?.listings ?? [] }
    public static func materials(for course: String) -> [AgentMaterial] { data?.materials[course] ?? [] }
    public static func askingCents(for material: AgentMaterial) -> Int? {
        listings.first { $0.id == material.listingID }?.priceCents
    }

    // MARK: search

    private static let stopWords: Set<String> = ["a", "an", "the", "for", "me", "my", "under", "below", "find", "get",
                                                 "need", "want", "some", "one", "used", "and", "or", "of", "to", "in", "i"]

    /// Best matches first: words matched in the title and course, then seller-campus, then price.
    public static func search(_ query: String, course: String? = nil, in pool: [Listing], campus: Campus) -> [Listing] {
        let words = query.lowercased().split { !$0.isLetter && !$0.isNumber }.map(String.init)
            .filter { $0.count > 1 && !stopWords.contains($0) }
        let scored: [(Listing, Double)] = pool.compactMap { listing in
            guard !listing.isOwnListing, listing.priceCents > 0 else { return nil }
            func tokens(_ text: String) -> Set<String> { Set(text.lowercased().split { !$0.isLetter && !$0.isNumber }.map(String.init)) }
            func hits(_ set: Set<String>) -> Int { words.filter { w in set.contains(w) || (w.count > 3 && set.contains { $0.contains(w) }) }.count }
            // The title (and category) must match; description words only nudge the ranking.
            let titleHits = hits(tokens(listing.title + " " + listing.category.rawValue))
            guard titleHits > 0 else { return nil }
            var score = Double(titleHits) + 0.3 * Double(hits(tokens(listing.description)))
            if let course, listing.courseCode == course { score += 2 }
            if listing.campus != campus { score -= 0.5 }
            return (listing, score - Double(listing.priceCents) / 1_000_000)
        }
        return scored.sorted { $0.1 > $1.1 }.map(\.0)
    }

    // MARK: negotiation

    private static let alNotes = ["Opened low, citing what these sold for on campus this month.", "Met them partway.", "Nudged up a little.", "Held near your max."]
    private static let sellerNotes = ["Says it’s in great shape.", "Came down some.", "Getting close to their floor.", "Barely moved."]

    /// Both agents concede toward the middle; the seller's agent holds a private floor of 76% of asking.
    public static func negotiate(listing: Listing, ceilingCents: Int) -> AgentNegotiation {
        let asked = listing.priceCents
        let floor = Int((Double(asked) * 0.76).rounded())
        let ceiling = max(1, ceilingCents)
        var al = min(ceiling, Int((Double(asked) * 0.65).rounded()))
        var seller = asked
        var rounds = [AgentRound(side: .al, amountCents: al, note: alNotes[0])]
        let meet = meetup(priceCents: asked, campus: listing.campus)
        func done(_ agreed: Int?) -> AgentNegotiation {
            let m = agreed.map { meetup(priceCents: $0, campus: listing.campus) } ?? meet
            return AgentNegotiation(askedCents: asked, ceilingCents: ceiling, rounds: rounds, agreedCents: agreed,
                                    zone: m.zone, slot: m.slot, code: handoffCode(listing.id))
        }
        for i in 0..<5 {
            seller = max(floor, Int((Double(seller) - Double(seller - al) * 0.45).rounded()))
            rounds.append(AgentRound(side: .seller, amountCents: seller, note: sellerNotes[min(i, 3)]))
            if seller <= ceiling && seller - al <= 300 { return done(seller) }
            al = min(ceiling, Int((Double(al) + Double(seller - al) * 0.5).rounded()))
            rounds.append(AgentRound(side: .al, amountCents: al, note: al == ceiling ? "That’s your max." : alNotes[min(i + 1, 3)]))
            if al >= seller { return done(seller) }
        }
        return done(nil)
    }

    /// Meetups only happen at a safe zone on the seller's campus; pricier items go to a staffed police lobby.
    public static func meetup(priceCents: Int, campus: Campus) -> (zone: String, slot: String) {
        if campus == .auburn { return ("Auburn University Police lobby", "Sat 11:00 AM") }
        return priceCents >= 4_000 ? ("UAPD lobby", "Thu 3:00 PM") : ("Gorgas Library entrance", "Wed 1:30 PM")
    }

    public static func handoffCode(_ id: String) -> String {
        var h: UInt32 = 0
        for b in id.utf8 { h = h &* 31 &+ UInt32(b) }
        let s = String(h, radix: 36).uppercased()
        return "DIBS-" + String((s + "7777").prefix(4))
    }

    /// Search, pick the best listing and negotiate under the student's max.
    public static func run(_ trade: AgentTrade, pool: [Listing], campus: Campus) -> AgentTrade {
        var t = trade
        let found = search(trade.item, course: trade.courseCode, in: pool, campus: campus)
        guard let pick = found.first else { t.phase = .unavailable; return t }
        let ceiling = trade.maxCents ?? Int((Double(pick.priceCents) * defaultMaxShare).rounded())
        t.listing = pick
        t.options = found.count
        t.maxCents = ceiling
        t.negotiation = negotiate(listing: pick, ceilingCents: ceiling)
        t.phase = .negotiating
        return t
    }

    /// Split a total budget across items in proportion to their asking prices; manual maxes keep theirs.
    public static func allocate(budgetCents: Int, asking: [Int?], manual: [Int?]) -> [Int?] {
        let fixed = manual.compactMap { $0 }.reduce(0, +)
        let autoAsking = zip(asking, manual).reduce(0) { $0 + ($1.1 == nil ? ($1.0 ?? 0) : 0) }
        let left = max(0, budgetCents - fixed)
        return zip(asking, manual).map { ask, man in
            if let man { return man }
            guard let ask, autoAsking > 0 else { return nil }
            return max(1, min(Int(Double(ask) * 0.95), Int(Double(ask) * Double(left) / Double(autoAsking))))
        }
    }
}

extension String {
    var capitalizedFirst: String { prefix(1).uppercased() + dropFirst() }
}
