import Foundation

/// A starting-price heuristic using asking prices, not an appraisal or completed-sale data.
public struct PricePrediction: Equatable, Sendable {
    public let priceCents: Int
    public let lowCents: Int
    public let highCents: Int
    public let comparableCount: Int
    public var basis: String {
        if priceCents == 0 { return "Free listings are always $0." }
        if comparableCount > 0 {
            return "Based on \(comparableCount) similar campus asking \(comparableCount == 1 ? "price" : "prices"), adjusted for condition. Not completed sales."
        }
        return "Rough category guide adjusted for condition. Not enough similar listings; brand, model and age may change the price substantially."
    }
    public static func predict(title: String, category: Category, condition: String, campus: Campus, listings: [Listing]) -> PricePrediction? {
        if category == .free { return PricePrediction(priceCents: 0, lowCents: 0, highCents: 0, comparableCount: 0) }
        let words = tokens(title)
        guard !words.isEmpty else { return nil }
        let matches = listings.filter {
            !$0.isOwnListing && $0.category == category && $0.campus == campus && $0.priceCents > 0 && !tokens($0.title).isDisjoint(with: words)
        }
        let amounts = matches.map { Double($0.priceCents) * factor(condition) / factor($0.condition) }.sorted()
        let guides: [Category: Double] = [.dorm: 3500, .books: 2500, .tech: 6000, .transport: 8000, .lab: 2000, .tickets: 3000, .tutoring: 2000]
        let base: Double
        if amounts.isEmpty {
            guard let guide = guides[category] else { return nil }
            base = guide * factor(condition)
        } else {
            let middle = amounts.count / 2
            base = amounts.count % 2 == 1 ? amounts[middle] : (amounts[middle - 1] + amounts[middle]) / 2
        }
        let price = roundCents(base)
        let spread = matches.count >= 3 ? 0.2 : 0.4
        return PricePrediction(priceCents: price, lowCents: roundCents(Double(price) * (1 - spread)), highCents: roundCents(Double(price) * (1 + spread)), comparableCount: matches.count)
    }
    private static func roundCents(_ amount: Double) -> Int { min(1_000_000, max(100, Int((amount / 100).rounded()) * 100)) }
    private static func factor(_ condition: String) -> Double {
        switch condition { case "Like new": 1.2; case "Well-loved": 0.7; case "Needs repair": 0.35; default: 1 }
    }
    private static func tokens(_ text: String) -> Set<String> {
        let stop: Set<String> = ["a", "an", "the", "for", "with", "and", "of", "my", "your", "new", "used", "good", "sale", "like"]
        return Set(text.lowercased().components(separatedBy: CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyz0123456789").inverted).filter { $0.count > 1 && !stop.contains($0) })
    }
}
