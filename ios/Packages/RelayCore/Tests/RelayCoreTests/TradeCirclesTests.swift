import Foundation
import Testing
@testable import RelayCore

private func mine(_ gives: String, _ wants: String, campus: Campus = .alabama) -> SwapPost {
    SwapPost(id: "me", person: TradeCircles.you, campus: campus, gives: gives, wants: wants)
}

@Test func matchingNeedsTheWantedWords() {
    #expect(TradeCircles.satisfies("TI-84 Plus graphing calculator", "TI-84 calculator"))
    #expect(TradeCircles.satisfies("Probability and Statistics for Engineers", "Statistics textbook"))
    #expect(!TradeCircles.satisfies("Introduction to Algorithms, 4e", "Statistics textbook"))
    #expect(!TradeCircles.satisfies("Mini fridge", ""))
}

@Test func findsTwoThreeAndFourPersonCircles() throws {
    let pool = TradeCircles.samplePosts
    let two = try #require(TradeCircles.findCircle(for: mine("Desk lamp", "Algorithms textbook"), in: pool))
    #expect(two.members.map(\.person) == ["You", "Chris D."])
    let three = try #require(TradeCircles.findCircle(for: mine("TI-84 calculator", "Arduino kit"), in: pool))
    #expect(three.members.map(\.person) == ["You", "Priya S.", "Jordan M."])
    #expect(three.legs.map(\.item) == ["TI-84 calculator", "Mini fridge", "Arduino Uno starter kit"])
    #expect(three.legs.last?.to == "You")
    let four = try #require(TradeCircles.findCircle(for: mine("Probability and Statistics for Engineers", "TI-84"), in: pool))
    #expect(four.members.count == 4)
    #expect(four.zone == "UAPD lobby")
}

@Test func everyLegGivesSomeoneWhatTheyWanted() throws {
    let circle = try #require(TradeCircles.findCircle(for: mine("Probability and Statistics for Engineers", "TI-84"), in: TradeCircles.samplePosts))
    for (i, member) in circle.members.enumerated() {
        let next = circle.members[(i + 1) % circle.members.count]
        #expect(TradeCircles.satisfies(member.gives, next.wants))
    }
}

@Test func noCircleAcrossCampusesOrWithoutAMatch() {
    // Taylor (Auburn) swaps a fridge for a desk lamp: a match at Auburn, but not across campuses.
    #expect(TradeCircles.findCircle(for: mine("Desk lamp", "Mini fridge", campus: .auburn), in: TradeCircles.samplePosts)?.members.last?.person == "Taylor R.")
    #expect(TradeCircles.findCircle(for: mine("Desk lamp", "Mini fridge"), in: TradeCircles.samplePosts) == nil)
    #expect(TradeCircles.findCircle(for: mine("Desk lamp", "Kayak"), in: TradeCircles.samplePosts) == nil)
}

@Test func expandedSamplesSupportCirclesAtBothCampuses() throws {
    let posts = TradeCircles.samplePosts
    #expect(Set(posts.map(\.id)).count == posts.count)
    for campus in Campus.allCases {
        let circle = try #require(TradeCircles.findCircle(for: mine("Camera tripod", "Desk organizer", campus: campus), in: posts))
        #expect(circle.members.count == 3)
        #expect(circle.members.allSatisfy { $0.campus == campus })
        for (index, member) in circle.members.enumerated() {
            #expect(TradeCircles.satisfies(member.gives, circle.members[(index + 1) % circle.members.count].wants))
        }
    }
}
