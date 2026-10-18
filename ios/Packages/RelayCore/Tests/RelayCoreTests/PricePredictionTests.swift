import Testing
@testable import RelayCore

@Test func predictionUsesComparableMedianAndCondition() {
    let listings = [2000, 3000, 90000].map { Listing(title: "Desk lamp", category: .dorm, priceCents: $0, imageName: "lamp", description: "A working lamp") }
    let estimate = PricePrediction.predict(title: "Desk lamp", category: .dorm, condition: "Good", campus: .alabama, listings: listings)
    #expect(estimate?.priceCents == 3000)
    #expect(estimate?.comparableCount == 3)
    #expect(PricePrediction.predict(title: "Desk lamp", category: .dorm, condition: "Well-loved", campus: .alabama, listings: listings)?.priceCents == 2100)
}
@Test func predictionIgnoresOwnUnrelatedAndOtherCampusItems() {
    let listings = [
        Listing(title: "Desk lamp", category: .dorm, priceCents: 1000, imageName: "lamp", description: "Working"),
        Listing(title: "Desk lamp", category: .dorm, priceCents: 99900, imageName: "lamp", description: "Working", isOwnListing: true),
        Listing(title: "Desk lamp", category: .dorm, priceCents: 99900, imageName: "lamp", campus: .auburn, description: "Working"),
        Listing(title: "Reading chair", category: .dorm, priceCents: 99900, imageName: "chair", description: "Working")
    ]
    let estimate = PricePrediction.predict(title: "Desk lamp", category: .dorm, condition: "Good", campus: .alabama, listings: listings)
    #expect(estimate?.priceCents == 1000)
    #expect(estimate?.comparableCount == 1)
}
@Test func predictionHandlesMissingComparisonsAndFreeListings() {
    #expect(PricePrediction.predict(title: "", category: .dorm, condition: "Good", campus: .alabama, listings: []) == nil)
    let guide = PricePrediction.predict(title: "Desk lamp", category: .dorm, condition: "Good", campus: .alabama, listings: [])
    #expect(guide?.priceCents == 3500)
    #expect(guide?.basis.contains("Rough category guide") == true)
    #expect(PricePrediction.predict(title: "Plant", category: .free, condition: "Good", campus: .alabama, listings: [])?.priceCents == 0)
}
