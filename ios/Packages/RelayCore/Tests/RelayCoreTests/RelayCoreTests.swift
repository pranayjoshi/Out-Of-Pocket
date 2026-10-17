import Foundation
import Testing
@testable import RelayCore

func paidListing() throws -> Listing { try #require(DemoCatalog.listings().first { $0.priceCents > 0 }) }

@Test func bundledCatalogLoads() throws {
    let listings = try DemoCatalog.listings()
    #expect(listings.count == 8)
    #expect(Set(listings.map(\.id)).count == listings.count)
}
@Test func identificationNeverCapturesPayment() throws {
    var exchange = Exchange(listing: try paidListing())
    try exchange.apply(.prepareFunds)
    try exchange.apply(.identify(code: "2418"))
    #expect(exchange.stage == .identified)
    #expect(exchange.buyerMoneyLabel.contains("temporary hold"))
    #expect(throws: ExchangeError.invalidTransition) { try exchange.apply(.accept) }
}
@Test func invalidCodeDoesNotAdvanceExchange() throws {
    var exchange = Exchange(listing: try paidListing())
    try exchange.apply(.prepareFunds)
    #expect(throws: ExchangeError.invalidCode) { try exchange.apply(.identify(code: "0000")) }
    #expect(exchange.stage == .fundsReady)
}
@Test func inspectionMustCoverEveryCheck() throws {
    var exchange = Exchange(listing: try paidListing())
    try exchange.apply(.prepareFunds)
    try exchange.apply(.identify(code: "2418"))
    #expect(throws: ExchangeError.incompleteInspection) { try exchange.apply(.inspect(checked: [])) }
    try exchange.apply(.inspect(checked: Set(exchange.listing.checks)))
    try exchange.apply(.accept)
    #expect(exchange.stage == .completed)
    #expect(throws: ExchangeError.invalidTransition) { try exchange.apply(.accept) }
}
@Test func rejectionBeforeCaptureCannotBecomePaid() throws {
    var exchange = Exchange(listing: try paidListing())
    try exchange.apply(.prepareFunds)
    try exchange.apply(.cancel)
    #expect(exchange.stage == .canceled)
    #expect(exchange.buyerMoneyLabel == "No payment captured")
    #expect(throws: ExchangeError.invalidTransition) { try exchange.apply(.accept) }
}
@Test func submittedRefundIsSeparateFromBankConfirmation() throws {
    var exchange = Exchange(listing: try paidListing(), stage: .completed)
    try exchange.apply(.report)
    #expect(exchange.stage == .caseOpen)
    #expect(throws: ExchangeError.invalidTransition) { try exchange.apply(.confirmRefund) }
    try exchange.apply(.approveReturn)
    #expect(exchange.stage == .refundPending)
    #expect(exchange.buyerMoneyLabel.contains("refund pending"))
    try exchange.apply(.confirmRefund)
    #expect(exchange.stage == .refunded)
}
@Test func freeItemsNeverClaimMoneyMovement() throws {
    let listing = try #require(DemoCatalog.listings().first { $0.priceCents == 0 })
    var exchange = Exchange(listing: listing)
    try exchange.apply(.prepareFunds)
    #expect(exchange.buyerMoneyLabel == "No payment required")
    try exchange.apply(.identify(code: "2418"))
    try exchange.apply(.inspect(checked: Set(listing.checks)))
    try exchange.apply(.accept)
    #expect(exchange.sellerMoneyLabel == "Free item · no transfer")
    #expect(throws: ExchangeError.freeItemRefund) { try exchange.apply(.report) }
}
@Test func campusFilteringAndCrossCampusOptIn() throws {
    let listings = try DemoCatalog.listings()
    var query = ListingQuery()
    #expect(query.apply(to: listings).allSatisfy { $0.campus == .alabama })
    query.campus = .auburn
    #expect(query.apply(to: listings).count == 1)
    query.includeOtherCampuses = true
    #expect(query.apply(to: listings).count == 8)
}
@Test func searchCombinesFiltersAndSort() throws {
    var query = ListingQuery()
    query.category = .tech; query.text = "  headphones  "
    let results = query.apply(to: try DemoCatalog.listings())
    #expect(results.count == 1)
    #expect(results.first?.id == "headphones")
    query.text = ""; query.category = .all; query.sort = .priceLow
    let sorted = query.apply(to: try DemoCatalog.listings())
    #expect(sorted.map(\.priceCents) == sorted.map(\.priceCents).sorted())
}
@Test func planAvoidsDuplicatesAndUsesCents() throws {
    let listing = try paidListing()
    var plan = SetupPlan()
    plan.add(listing.id); plan.add(listing.id)
    #expect(plan.listingIDs.count == 1)
    #expect(plan.total(in: [listing]) == listing.priceCents)
    plan.remove(listing.id)
    #expect(plan.total(in: [listing]) == 0)
    #expect(Money.parse("19.95") == 1995)
    #expect(Money.parse("19.999") == nil)
    #expect(Money.parse("-1") == nil)
}
@Test func exchangeSurvivesPersistenceRoundTrip() throws {
    var exchange = Exchange(listing: try paidListing())
    try exchange.apply(.prepareFunds)
    let restored = try JSONDecoder().decode(Exchange.self, from: JSONEncoder().encode(exchange))
    #expect(restored == exchange)
}
