import Foundation
import Testing
@testable import RelayCore

func paidListing() throws -> Listing { try #require(DemoCatalog.listings().first { $0.priceCents > 0 }) }

@Test func bundledCatalogLoads() throws {
    let listings = try DemoCatalog.listings()
    #expect(listings.count >= 38)
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
    #expect(query.apply(to: listings).count == listings.filter { $0.campus == .auburn }.count)
    query.includeOtherCampuses = true
    #expect(query.apply(to: listings).count == listings.count)
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
    #expect(Money.parse("19oops") == nil)
    #expect(Money.parse("19,95") == nil)
    #expect(Money.parse("1e2") == nil)
    #expect(Money.parse(" 19.95 ") == 1995)
}
@Test func exchangeSurvivesPersistenceRoundTrip() throws {
    var exchange = Exchange(listing: try paidListing())
    try exchange.apply(.prepareFunds)
    let restored = try JSONDecoder().decode(Exchange.self, from: JSONEncoder().encode(exchange))
    #expect(restored == exchange)
}

@Test func failedAuthorizationCanRetryWithAnotherMethod() throws {
    var exchange = Exchange(listing: try paidListing())
    #expect(throws: ExchangeError.mockDeclined) {
        try exchange.apply(.authorizeMock(method: .visa, outcome: .declined))
    }
    #expect(exchange.stage == .reserved)
    #expect(exchange.paymentMethod == nil)
    #expect(exchange.buyerMoneyLabel == "No payment collected")
    try exchange.apply(.authorizeMock(method: .applePay, outcome: .success))
    #expect(exchange.stage == .fundsReady)
    #expect(exchange.paymentMethod == .applePay)
    #expect(throws: ExchangeError.invalidTransition) {
        try exchange.apply(.authorizeMock(method: .mastercard, outcome: .success))
    }
}

@Test func failedCapturePreservesHoldAndOriginalRefundMethod() throws {
    var exchange = Exchange(listing: try paidListing())
    #expect(throws: ExchangeError.invalidTransition) { try exchange.apply(.captureMock(outcome: .success)) }
    try exchange.apply(.authorizeMock(method: .mastercard, outcome: .success))
    try exchange.apply(.identify(code: "2418"))
    try exchange.apply(.inspect(checked: Set(exchange.listing.checks)))
    for outcome in [MockPaymentOutcome.declined, .unavailable] {
        #expect(throws: (any Error).self) { try exchange.apply(.captureMock(outcome: outcome)) }
        #expect(exchange.stage == .inspected)
        #expect(exchange.buyerMoneyLabel.contains("temporary hold"))
    }
    try exchange.apply(.captureMock(outcome: .success))
    #expect(throws: ExchangeError.invalidTransition) { try exchange.apply(.captureMock(outcome: .success)) }
    try exchange.apply(.report)
    try exchange.apply(.approveReturn)
    try exchange.apply(.confirmRefund)
    let restored = try JSONDecoder().decode(Exchange.self, from: JSONEncoder().encode(exchange))
    #expect(restored.fundingMethod == .mastercard)
    #expect(restored.stage == .refunded)
    #expect(restored.mockReference == exchange.mockReference)
}

@Test func freeItemsRejectMockMoneyEvents() throws {
    let listing = try #require(DemoCatalog.listings().first { $0.priceCents == 0 })
    var exchange = Exchange(listing: listing)
    #expect(throws: ExchangeError.invalidTransition) {
        try exchange.apply(.authorizeMock(method: .visa, outcome: .success))
    }
    #expect(exchange.paymentMethod == nil)
    #expect(exchange.stage == .reserved)
}

@Test func legacyExchangeDecodesWithoutPaymentMethod() throws {
    let exchange = Exchange(listing: try paidListing(), stage: .fundsReady)
    var json = try #require(JSONSerialization.jsonObject(with: JSONEncoder().encode(exchange)) as? [String: Any])
    json.removeValue(forKey: "paymentMethod")
    let restored = try JSONDecoder().decode(Exchange.self, from: JSONSerialization.data(withJSONObject: json))
    #expect(restored.stage == .fundsReady)
    #expect(restored.fundingMethod == .visa)
}

@Test func legacyCampusRequestsKeepTheirMeaning() throws {
    let legacy = Data(#"{"id":"old-ask","title":"A small desk","budgetCents":5000,"person":"Jamie","category":"Dorm & living","campus":"Alabama"}"#.utf8)
    let restored = try JSONDecoder().decode(CampusRequest.self, from: legacy)
    #expect(restored.postIntent == .find)
    #expect(restored.summary == "Up to $50")
    #expect(restored.exchangeFor == nil)
    #expect(restored.details == nil)
}

@Test func campusTradesAndServiceOffersSurvivePersistence() throws {
    let posts = [
        CampusRequest(title: "Chemistry textbook", budgetCents: 0, category: .books, campus: .alabama,
                      intent: .trade, exchangeFor: "A desk lamp", details: "Available after lab on Monday."),
        CampusRequest(title: "Calculus tutoring", budgetCents: 2000, category: .tutoring, campus: .alabama,
                      intent: .offer, details: "$20 per hour at the library."),
        CampusRequest(title: "A ride home", budgetCents: 0, category: .transport, campus: .alabama, intent: .find)
    ]
    let restored = try JSONDecoder().decode([CampusRequest].self, from: JSONEncoder().encode(posts))
    #expect(restored == posts)
    #expect(restored[0].summary == "For: A desk lamp")
    #expect(restored[1].summary == "Asking $20")
    #expect(restored[2].summary == "Budget flexible")
}

@Test func courseCatalogSeparatesUniversitiesAndExplainsRelevantFinds() throws {
    #expect(UniversityCourse.courses(for: .alabama).contains { $0.code == "CS 100" })
    #expect(!UniversityCourse.courses(for: .auburn).contains { $0.code == "CS 100" })
    var listing = try paidListing()
    listing.campus = .alabama; listing.courseCode = "CS 100"
    #expect(UniversityCourse.reason(for: listing, campus: .alabama, codes: ["CS 100"])?.contains("For your CS 100") == true)
    #expect(UniversityCourse.reason(for: listing, campus: .auburn, codes: ["CS 100"]) == nil)
    #expect(UniversityCourse.reason(for: listing, campus: .alabama, codes: []) == nil)
    listing.isOwnListing = true
    #expect(UniversityCourse.reason(for: listing, campus: .alabama, codes: ["CS 100"]) == nil)
}
@Test func courseTagsPersistAndOldListingsRemainReadable() throws {
    var listing = try paidListing()
    listing.courseCode = "MATH 125"
    let data = try JSONEncoder().encode(listing)
    #expect(try JSONDecoder().decode(Listing.self, from: data).courseCode == "MATH 125")
    var old = try #require(JSONSerialization.jsonObject(with: data) as? [String: Any])
    old.removeValue(forKey: "courseCode")
    #expect(try JSONDecoder().decode(Listing.self, from: JSONSerialization.data(withJSONObject: old)).courseCode == nil)
}

@Test func sampleDirectoryCoversBothCampusesAndCourseMaterials() throws {
    let listings = try DemoCatalog.listings()
    for campus in Campus.allCases {
        let local = listings.filter { $0.campus == campus }
        #expect(local.filter { $0.category == .tutoring }.count >= 6)
        for category in [Category.dorm, .books, .tech, .transport, .free, .lab] {
            #expect(local.contains { $0.category == category })
        }
        for course in UniversityCourse.courses(for: campus) {
            let materials = BigAl.materials(for: course.code)
            #expect(!materials.isEmpty)
            for material in materials {
                if let id = material.listingID {
                    #expect(BigAl.listings.contains { $0.id == id && $0.campus == campus })
                }
            }
        }
        #expect(DemoCatalog.requests.filter { $0.campus == campus && $0.category == .tutoring }.count >= 2)
    }
}
