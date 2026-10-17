import Foundation
import Testing
@testable import RelayCore

@Test func demoScheduleHasMaterialsAndCatalogCourses() {
    let courses = Set(UniversityCourse.courses(for: .alabama).map(\.code))
    for code in BigAl.demoSchedule {
        #expect(courses.contains(code), "\(code) missing from courses.json")
        #expect(!BigAl.materials(for: code).isEmpty, "\(code) has no materials")
    }
    let ids = Set(BigAl.listings.map(\.id))
    for code in BigAl.demoSchedule {
        for m in BigAl.materials(for: code) { if let id = m.listingID { #expect(ids.contains(id)) } }
    }
}

@Test func negotiationNeverExceedsTheStudentsMax() throws {
    for listing in BigAl.listings {
        for share in [0.5, 0.7, 0.8, 0.86, 0.95] {
            let ceiling = Int(Double(listing.priceCents) * share)
            let n = BigAl.negotiate(listing: listing, ceilingCents: ceiling)
            #expect(n.rounds.filter { $0.side == .al }.allSatisfy { $0.amountCents <= ceiling })
            if let agreed = n.agreedCents {
                #expect(agreed <= ceiling)
                #expect(agreed < listing.priceCents)
            }
            #expect(n.rounds.first?.side == .al)
            for (a, b) in zip(n.rounds, n.rounds.dropFirst()) { #expect(a.side != b.side) }
        }
    }
}

@Test func defaultMaxClosesAndLowMaxDoesNot() throws {
    let book = try #require(BigAl.listings.first { $0.id == "bigal-aima" })
    let ok = BigAl.negotiate(listing: book, ceilingCents: Int(Double(book.priceCents) * BigAl.defaultMaxShare))
    #expect(ok.agreedCents != nil)
    let tight = BigAl.negotiate(listing: book, ceilingCents: Int(Double(book.priceCents) * 0.6))
    #expect(tight.agreedCents == nil)
}

@Test func meetupsAreSafeZonesOnTheSellersCampus() {
    #expect(BigAl.meetup(priceCents: 5_000, campus: .alabama).zone == "UAPD lobby")
    #expect(BigAl.meetup(priceCents: 1_500, campus: .alabama).zone == "Gorgas Library entrance")
    #expect(BigAl.meetup(priceCents: 1_500, campus: .auburn).zone.contains("Auburn"))
    #expect(BigAl.handoffCode("bigal-aima") == BigAl.handoffCode("bigal-aima"))
    #expect(BigAl.handoffCode("bigal-aima").hasPrefix("DIBS-"))
}

@Test func searchFindsCourseItemsAndSkipsMissingOnes() throws {
    let hits = BigAl.search("Artificial Intelligence: A Modern Approach, 4e", course: "CS 465", in: BigAl.listings, campus: .alabama)
    #expect(hits.first?.id == "bigal-aima")
    let calc = BigAl.search("TI-84 Plus graphing calculator", course: "GES 255", in: BigAl.listings, campus: .alabama)
    #expect(calc.first?.id == "bigal-ti84")
    let missing = BigAl.run(AgentTrade(item: "Clean Architecture, Martin", courseCode: "CS 495"), pool: BigAl.listings, campus: .alabama)
    #expect(missing.phase == .unavailable)
    let found = BigAl.run(AgentTrade(item: "Probability and Statistics for Engineers", courseCode: "GES 255"), pool: BigAl.listings, campus: .alabama)
    #expect(found.phase == .negotiating)
    #expect(found.maxCents == Int((5_000 * BigAl.defaultMaxShare).rounded()))
}

@Test func budgetSplitKeepsManualMaxesAndStaysUnderBudget() {
    let asking: [Int?] = [5_000, 4_000, nil]
    let split = BigAl.allocate(budgetCents: 7_000, asking: asking, manual: [nil, 3_000, nil])
    #expect(split[1] == 3_000)
    #expect(split[2] == nil)
    #expect((split[0] ?? 0) + 3_000 <= 7_000)
    let generous = BigAl.allocate(budgetCents: 100_000, asking: [5_000], manual: [nil])
    #expect(generous[0] == 4_750)
}
