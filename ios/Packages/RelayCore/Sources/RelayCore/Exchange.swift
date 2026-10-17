import Foundation

public enum MockPaymentMethod: String, Codable, Sendable, CaseIterable, Identifiable {
    case visa, mastercard, applePay
    public var id: String { rawValue }
    public var title: String {
        switch self {
        case .visa: "Visa •••• 4242"
        case .mastercard: "Mastercard •••• 4444"
        case .applePay: "Apple Pay demo"
        }
    }
    public var subtitle: String {
        self == .applePay ? "Simulated wallet · no Wallet connection" : "Sample card · no real card details"
    }
}

public enum MockPaymentOutcome: String, Sendable, CaseIterable, Identifiable {
    case success, declined, unavailable
    public var id: String { rawValue }
    public var title: String {
        switch self {
        case .success: "Success"
        case .declined: "Declined"
        case .unavailable: "Connection failure"
        }
    }
    func validate() throws {
        switch self {
        case .success: break
        case .declined: throw ExchangeError.mockDeclined
        case .unavailable: throw ExchangeError.mockUnavailable
        }
    }
}

public enum ExchangeStage: String, Codable, Sendable, CaseIterable {
    case reserved, fundsReady, identified, inspected, completed, caseOpen, refundPending, refunded, canceled
    public var title: String {
        switch self {
        case .reserved: "Reserved"
        case .fundsReady: "Ready to meet"
        case .identified: "Partner identified"
        case .inspected: "Inspection complete"
        case .completed: "Handoff complete"
        case .caseOpen: "Case under review"
        case .refundPending: "Refund pending"
        case .refunded: "Refund confirmed"
        case .canceled: "Canceled"
        }
    }
    public var canCancel: Bool { [.reserved, .fundsReady, .identified, .inspected].contains(self) }
    public var progress: Int {
        switch self {
        case .reserved, .canceled: 0
        case .fundsReady: 1
        case .identified: 2
        case .inspected: 3
        default: 4
        }
    }
}

public enum ExchangeEvent: Sendable {
    case authorizeMock(method: MockPaymentMethod, outcome: MockPaymentOutcome)
    case captureMock(outcome: MockPaymentOutcome)
    case prepareFunds
    case identify(code: String)
    case inspect(checked: Set<String>)
    case accept
    case cancel
    case report
    case approveReturn
    case confirmRefund
}

public enum ExchangeError: Error, LocalizedError, Equatable {
    case invalidTransition, invalidCode, incompleteInspection, freeItemRefund, mockDeclined, mockUnavailable
    public var errorDescription: String? {
        switch self {
        case .invalidTransition: "That action is not available at this stage."
        case .invalidCode: "That code doesn’t match. The sample code is 2418."
        case .incompleteInspection: "Check every inspection item before continuing."
        case .freeItemRefund: "Free items have no payment to refund."
        case .mockDeclined: "Demo declined. This attempt did not complete. Choose Success to retry."
        case .mockUnavailable: "Demo connection failed. This attempt did not complete. Choose Success to retry."
        }
    }
}

public struct Exchange: Codable, Identifiable, Equatable, Sendable {
    public let id: UUID
    public let listing: Listing
    public let meeting: Date
    public private(set) var stage: ExchangeStage
    public private(set) var paymentMethod: MockPaymentMethod?
    public let createdAt: Date
    public init(id: UUID = UUID(), listing: Listing, meeting: Date = Date(), stage: ExchangeStage = .reserved, paymentMethod: MockPaymentMethod? = nil, createdAt: Date = Date()) {
        self.id = id; self.listing = listing; self.meeting = meeting; self.stage = stage; self.paymentMethod = paymentMethod; self.createdAt = createdAt
    }
    public var isFree: Bool { listing.priceCents == 0 }
    // Older saved exchanges predate method selection and used the default sample card.
    public var fundingMethod: MockPaymentMethod? {
        paymentMethod ?? (!isFree && ![.reserved, .canceled].contains(stage) ? .visa : nil)
    }
    public var mockReference: String { "DEMO-" + id.uuidString.prefix(8) }
    public var buyerMoneyLabel: String {
        if isFree { return "No payment required" }
        switch stage {
        case .reserved: return "No payment collected"
        case .fundsReady, .identified, .inspected: return "\(listing.price) temporary hold"
        case .completed, .caseOpen: return "\(listing.price) payment completed"
        case .canceled: return "No payment captured"
        case .refundPending: return "\(listing.price) refund pending"
        case .refunded: return "\(listing.price) refund confirmed"
        }
    }
    public var sellerMoneyLabel: String {
        if isFree { return "Free item · no transfer" }
        switch stage {
        case .completed: return "Transfer scheduled separately"
        case .caseOpen: return "Unreleased transfer paused"
        default: return "Not transferred"
        }
    }
    public mutating func apply(_ event: ExchangeEvent) throws {
        switch (stage, event) {
        case (.reserved, .authorizeMock(let method, let outcome)) where !isFree:
            try outcome.validate()
            paymentMethod = method
            stage = .fundsReady
        case (.inspected, .captureMock(let outcome)) where !isFree:
            try outcome.validate()
            stage = .completed
        case (.reserved, .prepareFunds):
            if !isFree { paymentMethod = .visa }
            stage = .fundsReady
        case (.fundsReady, .identify(let code)):
            guard code == "2418" else { throw ExchangeError.invalidCode }
            stage = .identified
        case (.identified, .inspect(let checked)):
            guard Set(listing.checks).isSubset(of: checked) else { throw ExchangeError.incompleteInspection }
            stage = .inspected
        case (.inspected, .accept): stage = .completed
        case (_, .cancel) where stage.canCancel: stage = .canceled
        case (.completed, .report):
            guard !isFree else { throw ExchangeError.freeItemRefund }
            stage = .caseOpen
        case (.caseOpen, .approveReturn): stage = .refundPending
        case (.refundPending, .confirmRefund): stage = .refunded
        default: throw ExchangeError.invalidTransition
        }
    }
}
