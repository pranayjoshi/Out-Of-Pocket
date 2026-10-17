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
        CampusRequest(id: "desk-request", title: "A desk that fits a tiny dorm", budgetCents: 5_000, person: "Jamie", category: .dorm, campus: .alabama),
        CampusRequest(id: "bike-request", title: "A bike for the rest of the semester", budgetCents: 10_000, person: "Taylor", category: .transport, campus: .alabama)
    ]
}
