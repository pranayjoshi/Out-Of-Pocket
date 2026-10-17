import Foundation

public enum DemoCatalog {
    public static func listings() throws -> [Listing] {
        guard let url = Bundle.module.url(forResource: "catalog", withExtension: "json") else {
            throw CocoaError(.fileNoSuchFile)
        }
        return try JSONDecoder().decode([Listing].self, from: Data(contentsOf: url))
    }
    public static let events: [CampusEvent] = [
        CampusEvent(id: "repair", eyebrow: "A LITTLE CAMPUS CONNECTION", title: "A little fixing.\nA lot more living.", description: "Bring your wobbly chair, well-loved jeans, or questions. Let’s give good things another go.", dateLabel: "OCT 22", time: "Thursday · 3–6 PM", host: "Relay Reuse Club", symbol: "wrench.and.screwdriver", theme: "lime", sponsored: false),
        CampusEvent(id: "market", eyebrow: "THE WEEKEND PLAN", title: "Small finds.\nBig campus energy.", description: "A student swap meet for the pieces that make your space yours. Browse, trade, and say hello.", dateLabel: "OCT 24", time: "Saturday · 11 AM–2 PM", host: "Campus Creatives", symbol: "arrow.left.arrow.right", theme: "peach", sponsored: false),
        CampusEvent(id: "coffee", eyebrow: "SPONSORED · SAMPLE CAMPAIGN", title: "Good finds.\nGreat coffee.", description: "A neighborhood café could help make the next exchange a little sweeter. This is a sample sponsorship, not a live offer.", dateLabel: "LOCAL", time: "Partner program concept", host: "The Corner Café · demo advertiser", symbol: "cup.and.saucer", theme: "lavender", sponsored: true)
    ]
    public static let requests: [CampusRequest] = [
        CampusRequest(id: "desk-request", title: "A desk that fits a tiny dorm", budgetCents: 5_000, person: "Jamie", category: .dorm, campus: .alabama, details: "Something narrow for a double. I can pick up on campus this week."),
        CampusRequest(id: "lamp-offer", title: "A spare desk lamp, gently used", budgetCents: 1_200, person: "Noah", category: .dorm, campus: .alabama, intent: .offer, details: "Warm bulb included. Happy to meet at the Student Center."),
        CampusRequest(id: "calc-help", title: "A little help before the calculus quiz", budgetCents: 2_500, person: "Priya", category: .tutoring, campus: .alabama, details: "MATH 125, one hour. Library or Student Center works."),
        CampusRequest(id: "bike-request", title: "A bike for the rest of the semester", budgetCents: 10_000, person: "Taylor", category: .transport, campus: .alabama, details: "City bike is fine. I can check the brakes when we meet."),
        CampusRequest(id: "book-trade", title: "My chemistry textbook", budgetCents: 0, person: "Avery", category: .books, campus: .alabama, intent: .trade, exchangeFor: "A desk lamp or another STEM book", details: "Current edition, light highlighting, no missing pages."),
        CampusRequest(id: "au-desk", title: "A compact desk for a dorm", budgetCents: 4_500, person: "Casey", category: .dorm, campus: .auburn, details: "Something I can carry. Pickup near the Student Center."),
        CampusRequest(id: "au-ride", title: "A ride to the library after class", budgetCents: 800, person: "Riley", category: .transport, campus: .auburn, details: "Weekday afternoons. Happy to chip in for gas.")
    ]
}
