import Foundation

public enum Campus: String, CaseIterable, Codable, Identifiable, Sendable {
    case alabama = "Alabama"
    case auburn = "Auburn"
    public var id: String { rawValue }
    public var name: String { self == .alabama ? "University of Alabama" : "Auburn University" }
    public var shortName: String { self == .alabama ? "UA" : "AU" }
}

public enum Category: String, CaseIterable, Codable, Identifiable, Sendable {
    case all = "All finds"
    case dorm = "Dorm & living"
    case books = "Textbooks"
    case tech = "Tech"
    case transport = "Getting around"
    case free = "Free stuff"
    public var id: String { rawValue }
    public var symbol: String {
        switch self {
        case .all: "square.grid.2x2"
        case .dorm: "sofa"
        case .books: "books.vertical"
        case .tech: "headphones"
        case .transport: "bicycle"
        case .free: "gift"
        }
    }
}

public struct Listing: Codable, Identifiable, Equatable, Sendable {
    public let id: String
    public var title: String
    public var category: Category
    public var priceCents: Int
    public var originalPriceCents: Int?
    public var imageName: String
    public var seller: String
    public var initials: String
    public var condition: String
    public var location: String
    public var campus: Campus
    public var tag: String?
    public var description: String
    public var checks: [String]
    public var isOwnListing: Bool
    public var price: String { priceCents == 0 ? "Free" : Money.format(priceCents) }
    public var originalPrice: String? { originalPriceCents.map(Money.format) }

    public init(id: String = UUID().uuidString, title: String, category: Category, priceCents: Int,
                originalPriceCents: Int? = nil, imageName: String, seller: String = "You",
                initials: String = "Y", condition: String = "Good", location: String = "Public place to be agreed",
                campus: Campus = .alabama, tag: String? = nil, description: String,
                checks: [String] = ["Item matches the listing", "Condition and parts checked", "Comfortable accepting this item"],
                isOwnListing: Bool = false) {
        self.id = id; self.title = title; self.category = category; self.priceCents = max(0, priceCents)
        self.originalPriceCents = originalPriceCents; self.imageName = imageName; self.seller = seller
        self.initials = initials; self.condition = condition; self.location = location; self.campus = campus
        self.tag = tag; self.description = description; self.checks = checks; self.isOwnListing = isOwnListing
    }
}

public enum Money {
    public static func format(_ cents: Int) -> String {
        let amount = Decimal(cents) / 100
        return amount.formatted(.currency(code: "USD").precision(cents % 100 == 0 ? .fractionLength(0) : .fractionLength(2)))
    }
    public static func parse(_ string: String) -> Int? {
        guard let amount = Decimal(string: string, locale: Locale(identifier: "en_US_POSIX")),
              amount >= 0, amount <= 10_000 else { return nil }
        let cents = amount * 100
        let number = NSDecimalNumber(decimal: cents)
        guard Decimal(number.intValue) == cents else { return nil }
        return number.intValue
    }
}

public struct SetupPlan: Codable, Equatable, Sendable {
    public var name: String
    public var budgetCents: Int
    public var listingIDs: [String]
    public init(name: String = "My cozy campus corner", budgetCents: Int = 15_000, listingIDs: [String] = []) {
        self.name = name; self.budgetCents = max(1, budgetCents); self.listingIDs = listingIDs
    }
    public mutating func add(_ id: String) { if !listingIDs.contains(id) { listingIDs.append(id) } }
    public mutating func remove(_ id: String) { listingIDs.removeAll { $0 == id } }
    public func total(in listings: [Listing]) -> Int { listings.filter { listingIDs.contains($0.id) }.reduce(0) { $0 + $1.priceCents } }
}

public struct CampusRequest: Codable, Identifiable, Equatable, Sendable {
    public let id: String
    public var title: String
    public var budgetCents: Int
    public var person: String
    public var category: Category
    public var campus: Campus
    public init(id: String = UUID().uuidString, title: String, budgetCents: Int, person: String = "You", category: Category, campus: Campus) {
        self.id = id; self.title = title; self.budgetCents = budgetCents; self.person = person; self.category = category; self.campus = campus
    }
}

public struct CampusEvent: Identifiable, Sendable {
    public let id: String
    public let eyebrow: String
    public let title: String
    public let description: String
    public let dateLabel: String
    public let time: String
    public let host: String
    public let symbol: String
    public let theme: String
    public let sponsored: Bool
}

public enum ListingSort: String, CaseIterable, Identifiable, Sendable {
    case recommended = "For you", priceLow = "Price: low to high", priceHigh = "Price: high to low"
    public var id: String { rawValue }
}

public struct ListingQuery: Sendable {
    public var campus: Campus = .alabama
    public var category: Category = .all
    public var text: String = ""
    public var includeOtherCampuses = false
    public var freeOnly = false
    public var savedOnly = false
    public var savedIDs: Set<String> = []
    public var sort: ListingSort = .recommended
    public init() {}
    public func apply(to listings: [Listing]) -> [Listing] {
        let search = text.trimmingCharacters(in: .whitespacesAndNewlines)
        let filtered = listings.filter { item in
            (includeOtherCampuses || item.campus == campus) &&
            (category == .all || item.category == category) &&
            (!freeOnly || item.priceCents == 0) &&
            (!savedOnly || savedIDs.contains(item.id)) &&
            (search.isEmpty || "\(item.title) \(item.category.rawValue) \(item.description)".localizedCaseInsensitiveContains(search))
        }
        switch sort {
        case .recommended: return filtered
        case .priceLow: return filtered.sorted { $0.priceCents == $1.priceCents ? $0.id < $1.id : $0.priceCents < $1.priceCents }
        case .priceHigh: return filtered.sorted { $0.priceCents == $1.priceCents ? $0.id < $1.id : $0.priceCents > $1.priceCents }
        }
    }
}
