import Foundation
import Testing
@testable import RelayCore

@Test func samplesCoverBothCampusesAndAllInlinePlacements() throws {
    let samples = CampusPromotion.samples
    #expect(samples.count == 6)
    let notices = samples.filter { $0.sample != true }
    #expect(notices.map(\.id) == ["ua-research-studies", "ua-student-assistant"])
    for placement in ["Discover", "Campus board", "My plans", "Exchanges"] {
        #expect(notices.filter { $0.isVisible(campus: .alabama, placement: placement) }.count == 2)
        #expect(samples.filter { $0.sample == true && $0.isVisible(campus: .auburn, placement: placement) }.count == 1)
    }
    #expect(samples.allSatisfy { $0.destination != nil })
}

@Test func promotionsRespectCampusStatusAndInclusiveSchedule() throws {
    var ad = try #require(CampusPromotion.samples.first { $0.id == "sample-alabama-reuse" })
    ad.start = "2099-10-01"; ad.end = "2099-10-31"
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.dateFormat = "yyyy-MM-dd HH:mm"
    func date(_ value: String) throws -> Date { try #require(formatter.date(from: value + " 12:00")) }
    #expect(ad.isVisible(campus: .alabama, placement: "Discover", on: try date("2099-10-01")))
    #expect(ad.isVisible(campus: .alabama, placement: "Discover", on: try date("2099-10-31")))
    #expect(!ad.isVisible(campus: .alabama, placement: "Discover", on: try date("2099-09-30")))
    #expect(!ad.isVisible(campus: .alabama, placement: "Discover", on: try date("2099-11-01")))
    #expect(!ad.isVisible(campus: .auburn, placement: "Discover", on: try date("2099-10-10")))
    #expect(!ad.isVisible(campus: .alabama, placement: "My plans", on: try date("2099-10-10")))
    for status in ["draft", "paused"] {
        ad.status = status
        #expect(!ad.isVisible(campus: .alabama, placement: "Discover", on: try date("2099-10-10")))
    }
}

@Test func nativePromotionsOnlyOpenSafeDestinations() throws {
    var ad = try #require(CampusPromotion.samples.first)
    for url in ["javascript:alert(1)", "http://example.edu", "https://user:secret@example.edu", "not a URL"] {
        ad.url = url
        #expect(ad.destination == nil)
        #expect(!ad.isVisible(campus: .alabama, placement: "Discover"))
    }
}

@Test func inlineAdsAreSingleStableEligibleAndStayDismissed() throws {
    for campus in Campus.allCases {
        for slot in ["home", "tutoring", "tickets", "rides", "market", "bigal"] {
            let placement = slot == "home" ? "Discover" : "Campus board"
            let selected = try #require(CampusPromotion.inline(in: CampusPromotion.samples, campus: campus, placement: placement, slot: slot, seed: 42))
            #expect(selected.isVisible(campus: campus, placement: placement))
            let reordered = CampusPromotion.inline(in: CampusPromotion.samples.reversed(), campus: campus, placement: placement, slot: slot, seed: 42)
            #expect(selected.id == reordered?.id)
            #expect(CampusPromotion.inline(in: CampusPromotion.samples, campus: campus, placement: placement, slot: slot, seed: 42, dismissed: [selected.id]) == nil)
        }
    }
}
