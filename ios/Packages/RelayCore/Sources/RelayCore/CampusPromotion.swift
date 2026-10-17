import Foundation

/// Same campaign contract as the university web portal. Keys never reach iOS.
public struct CampusPromotion: Codable, Identifiable, Sendable {
    public var id: String
    public var campus: String
    public var title: String
    public var description: String
    public var sponsor: String
    public var image: String
    public var url: String
    public var cta: String
    public var status: String
    public var placements: [String]
    public var start: String
    public var end: String
    public var sample: Bool?

    public var destination: URL? {
        guard let destination = URL(string: url), destination.scheme == "https", destination.host != nil,
              destination.user == nil, destination.password == nil else { return nil }
        return destination
    }

    public func isVisible(campus: Campus, placement: String, on date: Date = Date()) -> Bool {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.dateFormat = "yyyy-MM-dd"
        let today = formatter.string(from: date)
        return status == "live" && self.campus == campus.rawValue && placements.contains(placement)
            && (start.isEmpty || start <= today) && (end.isEmpty || today <= end) && destination != nil
    }

    public static var samples: [CampusPromotion] {
        guard let url = Bundle.module.url(forResource: "promotions", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let promotions = try? JSONDecoder().decode([CampusPromotion].self, from: data) else { return [] }
        return promotions
    }
}

public struct CampusPromotionFeed: Decodable, Sendable {
    public let ads: [CampusPromotion]
}
