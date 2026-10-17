import Foundation
import Testing
@testable import RelayCore

@Test func messagesTrimValidateAndKeepRoles() throws {
    var thread = ListingConversation(listing: try paidListing())
    #expect(throws: ConversationError.emptyMessage) { try thread.send("  \n", as: .buyer) }
    #expect(throws: ConversationError.messageTooLong) { try thread.send(String(repeating: "a", count: 2001), as: .buyer) }
    try thread.send("  Still available?  ", as: .buyer)
    #expect(thread.messages[0].text == "Still available?")
    #expect(thread.unreadCount == 0)
    try thread.send("Yes, after class.", as: .seller)
    #expect(thread.unreadCount == 1)
    thread.markRead()
    #expect(thread.unreadCount == 0)
}
@Test func counteroffersInvalidateEarlierOffersAndRespectTurns() throws {
    var thread = ListingConversation(listing: try paidListing())
    try thread.propose(2500, as: .buyer)
    let first = try #require(thread.pendingOffer)
    #expect(throws: ConversationError.invalidAction) { try thread.respond(to: first.id, status: .accepted, as: .buyer) }
    #expect(throws: ConversationError.invalidAction) { try thread.propose(2400, as: .buyer) }
    try thread.propose(3000, as: .seller)
    #expect(thread.offers[0].status == .superseded)
    #expect(throws: ConversationError.invalidAction) { try thread.respond(to: first.id, status: .accepted, as: .seller) }
    let counter = try #require(thread.pendingOffer)
    try thread.respond(to: counter.id, status: .accepted, as: .buyer)
    #expect(thread.acceptedOffer?.amountCents == 3000)
    #expect(thread.agreedListing.priceCents == 3000)
    #expect(throws: ConversationError.negotiationClosed) { try thread.propose(2000, as: .buyer) }
    #expect(throws: ConversationError.invalidAction) { try thread.respond(to: counter.id, status: .declined, as: .buyer) }
    var exchange = Exchange(listing: thread.agreedListing)
    try exchange.apply(.prepareFunds)
    #expect(exchange.listing.priceCents == 3000)
    #expect(exchange.stage == .fundsReady)
}
@Test func offersCanBeDeclinedWithdrawnAndRetried() throws {
    var thread = ListingConversation(listing: try paidListing())
    for amount in [0, -1, 1_000_001] {
        #expect(throws: ConversationError.invalidAmount) { try thread.propose(amount, as: .buyer) }
    }
    try thread.propose(2500, as: .buyer)
    let first = try #require(thread.pendingOffer)
    #expect(throws: ConversationError.invalidAction) { try thread.respond(to: first.id, status: .withdrawn, as: .seller) }
    try thread.respond(to: first.id, status: .withdrawn, as: .buyer)
    try thread.propose(3000, as: .buyer)
    try thread.respond(to: #require(thread.pendingOffer).id, status: .declined, as: .seller)
    #expect(thread.pendingOffer == nil)
    #expect(thread.acceptedOffer == nil)
    #expect(thread.agreedListing.priceCents == thread.listing.priceCents)
}
@Test func freeListingsAllowMessagesWithoutOffers() throws {
    var listing = try paidListing()
    listing.priceCents = 0
    var thread = ListingConversation(listing: listing)
    try thread.send("When can I pick it up?", as: .buyer)
    #expect(throws: ConversationError.negotiationClosed) { try thread.propose(100, as: .buyer) }
    #expect(thread.agreedListing.priceCents == 0)
}
@Test func conversationPersistencePreservesPriceHistoryAndUnread() throws {
    var thread = ListingConversation(listing: try paidListing())
    try thread.propose(1234, as: .seller)
    let offer = try #require(thread.pendingOffer)
    try thread.respond(to: offer.id, status: .accepted, as: .buyer)
    let restored = try JSONDecoder().decode(ListingConversation.self, from: JSONEncoder().encode(thread))
    #expect(restored == thread)
    #expect(restored.agreedListing.priceCents == 1234)
    #expect(restored.unreadCount == 1)
}
