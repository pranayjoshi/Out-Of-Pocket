import Foundation

public enum ConversationParty: String, Codable, CaseIterable, Sendable, Identifiable {
    case buyer, seller
    public var id: String { rawValue }
    public var title: String { rawValue.capitalized }
    public var other: Self { self == .buyer ? .seller : .buyer }
}

public enum OfferStatus: String, Codable, Sendable {
    case pending, accepted, declined, withdrawn, superseded
}

public struct ListingOffer: Codable, Identifiable, Equatable, Sendable {
    public let id: UUID
    public let amountCents: Int
    public let author: ConversationParty
    public var status: OfferStatus
    public let createdAt: Date
    public init(id: UUID, amountCents: Int, author: ConversationParty, status: OfferStatus, createdAt: Date) {
        self.id = id; self.amountCents = amountCents; self.author = author; self.status = status; self.createdAt = createdAt
    }
}

public struct ListingMessage: Codable, Identifiable, Equatable, Sendable {
    public let id: UUID
    public let author: ConversationParty
    public let text: String
    public let offerID: UUID?
    public let createdAt: Date
    public init(id: UUID, author: ConversationParty, text: String, offerID: UUID?, createdAt: Date) {
        self.id = id; self.author = author; self.text = text; self.offerID = offerID; self.createdAt = createdAt
    }
}

public enum ConversationError: Error, LocalizedError, Equatable {
    case emptyMessage, messageTooLong, invalidAmount, invalidAction, negotiationClosed
    public var errorDescription: String? {
        switch self {
        case .emptyMessage: "Write a message first."
        case .messageTooLong: "Keep your message under 2,001 characters."
        case .invalidAmount: "Enter an amount from $0.01 to $10,000 with up to two decimal places."
        case .invalidAction: "This offer has changed or this action belongs to the other participant."
        case .negotiationClosed: "The price is already agreed or a handoff has started. Continue planning in messages."
        }
    }
}

public struct ListingConversation: Codable, Identifiable, Equatable, Sendable {
    public let id: UUID
    public let listing: Listing
    public private(set) var messages: [ListingMessage] = []
    public private(set) var offers: [ListingOffer] = []
    public private(set) var readMessageCount = 0
    public let createdAt: Date
    public var localParty: ConversationParty { listing.isOwnListing ? .seller : .buyer }
    public var pendingOffer: ListingOffer? { offers.last { $0.status == .pending } }
    public var acceptedOffer: ListingOffer? { offers.last { $0.status == .accepted } }
    public var updatedAt: Date { messages.last?.createdAt ?? createdAt }
    public var unreadCount: Int { messages.dropFirst(readMessageCount).filter { $0.author != localParty }.count }
    public var agreedListing: Listing {
        var result = listing
        if let acceptedOffer { result.priceCents = acceptedOffer.amountCents }
        return result
    }
    public init(listing: Listing, id: UUID = UUID(), createdAt: Date = Date()) {
        self.id = id; self.listing = listing; self.createdAt = createdAt
    }
    public init(id: UUID, listing: Listing, messages: [ListingMessage], offers: [ListingOffer], readMessageCount: Int, createdAt: Date) {
        self.id = id
        self.listing = listing
        self.messages = messages
        self.offers = offers
        self.readMessageCount = readMessageCount
        self.createdAt = createdAt
    }
    public mutating func markRead() { readMessageCount = messages.count }
    public mutating func send(_ text: String, as author: ConversationParty) throws {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { throw ConversationError.emptyMessage }
        guard trimmed.count <= 2_000 else { throw ConversationError.messageTooLong }
        append(trimmed, as: author)
    }
    public mutating func propose(_ amountCents: Int, as author: ConversationParty) throws {
        guard listing.priceCents > 0, acceptedOffer == nil else { throw ConversationError.negotiationClosed }
        guard (1...1_000_000).contains(amountCents) else { throw ConversationError.invalidAmount }
        // A counter replaces the previous offer; a sender must withdraw before proposing again.
        if let pendingOffer {
            guard pendingOffer.author != author else { throw ConversationError.invalidAction }
            offers[offers.count - 1].status = .superseded
        }
        let offer = ListingOffer(id: UUID(), amountCents: amountCents, author: author, status: .pending, createdAt: Date())
        offers.append(offer)
        append("Offered \(Money.format(amountCents))", as: author, offerID: offer.id)
    }
    public mutating func respond(to offerID: UUID, status: OfferStatus, as author: ConversationParty) throws {
        guard let index = offers.firstIndex(where: { $0.id == offerID }), offers[index].status == .pending,
              [.accepted, .declined, .withdrawn].contains(status),
              (status == .withdrawn ? offers[index].author == author : offers[index].author != author)
        else { throw ConversationError.invalidAction }
        offers[index].status = status
        append("\(status.rawValue.capitalized) the \(Money.format(offers[index].amountCents)) offer", as: author, offerID: offerID)
    }
    private mutating func append(_ text: String, as author: ConversationParty, offerID: UUID? = nil) {
        messages.append(ListingMessage(id: UUID(), author: author, text: text, offerID: offerID, createdAt: Date()))
    }
}
