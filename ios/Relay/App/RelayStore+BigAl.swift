import Foundation
import RelayCore

/// One line in the Big Al chat. Listing IDs are the picks shown under the message.
struct AgentChatMessage: Codable, Identifiable, Equatable {
    let id: UUID
    let fromAl: Bool
    let text: String
    var listingIDs: [String] = []
    var openedTradeIDs: [UUID] = []
    let createdAt: Date
    init(fromAl: Bool, text: String, listingIDs: [String] = [], openedTradeIDs: [UUID] = []) {
        id = UUID(); self.fromAl = fromAl; self.text = text; self.listingIDs = listingIDs
        self.openedTradeIDs = openedTradeIDs; createdAt = Date()
    }
}

struct AgentRequest {
    var course: String?
    var item: String
    var maxCents: Int?
}

private struct AgentReply: Decodable {
    struct Action: Decodable { let type: String; let listingId: String?; let item: String?; let maxCents: Int? }
    let reply: String?
    let results: [String]?
    let actions: [Action]?
    let error: String?
}

extension RelayStore {
    var agentTrades: [AgentTrade] { (snapshot.agentTrades ?? []).sorted { $0.createdAt < $1.createdAt } }
    var agentBudgetCents: Int? { snapshot.agentBudgetCents }
    var agentChat: [AgentChatMessage] { snapshot.agentChat ?? [] }
    var agentListingIDs: Set<String> { Set((snapshot.agentTrades ?? []).compactMap { $0.listing?.id }) }
    var agentReadyCount: Int { agentTrades.filter { $0.phase == .ready }.count }
    var agentWorkingCount: Int { agentTrades.filter { $0.phase.isWorking }.count }
    func agentTrade(_ id: UUID) -> AgentTrade? { snapshot.agentTrades?.first { $0.id == id } }

    /// Everything Big Al may buy from: what the student can see plus the course-material samples.
    var agentPool: [Listing] {
        var seen = Set<String>()
        return (listings + BigAl.listings).filter { seen.insert($0.id).inserted }
    }

    // MARK: opening and running trades

    @discardableResult
    func openAgentTrades(_ requests: [AgentRequest], budgetCents: Int? = nil) -> [UUID] {
        let fresh = requests.map { AgentTrade(item: $0.item, courseCode: $0.course, maxCents: $0.maxCents) }
        update { s in
            s.agentTrades = (s.agentTrades ?? []) + fresh
            if let budgetCents { s.agentBudgetCents = budgetCents }
        }
        for (i, trade) in fresh.enumerated() {
            Task { await runAgentTrade(trade.id, delay: Double(i) * 0.65) }
        }
        return fresh.map(\.id)
    }

    func resumeAgentTrades() {
        for trade in agentTrades where trade.phase.isWorking {
            if trade.phase == .negotiating { setAgentTrade(trade.id) { $0.phase = .searching } }
            Task { await runAgentTrade(trade.id, delay: 0) }
        }
    }

    private func runAgentTrade(_ id: UUID, delay: Double) async {
        try? await Task.sleep(for: .seconds(0.9 + delay))
        guard let trade = agentTrade(id), trade.phase == .searching else { return }
        let next = BigAl.run(trade, pool: agentPool, campus: campus)
        setAgentTrade(id) { $0 = next }
        guard next.phase == .negotiating, let negotiation = next.negotiation else { return }
        await finishNegotiation(id, negotiation)
    }

    private func finishNegotiation(_ id: UUID, _ negotiation: AgentNegotiation) async {
        try? await Task.sleep(for: .seconds(Double(negotiation.rounds.count) * 0.7 + 0.6))
        guard let trade = agentTrade(id), trade.phase == .negotiating, trade.negotiation == negotiation else { return }
        let thread = recordNegotiation(trade, negotiation)
        setAgentTrade(id) {
            $0.conversationID = thread
            $0.phase = negotiation.agreedCents == nil ? .noDeal : .ready
        }
    }

    func renegotiateAgentTrade(_ id: UUID, maxCents: Int) {
        guard let trade = agentTrade(id), let listing = trade.listing, maxCents > 0 else { return }
        let negotiation = BigAl.negotiate(listing: listing, ceilingCents: maxCents)
        setAgentTrade(id) { $0.maxCents = maxCents; $0.negotiation = negotiation; $0.phase = .negotiating }
        Task { await finishNegotiation(id, negotiation) }
    }

    // MARK: the student's decisions

    func lockAgentTrade(_ id: UUID) {
        guard let trade = agentTrade(id), let listing = trade.listing, let negotiation = trade.negotiation,
              let agreed = negotiation.agreedCents else { return }
        if let threadID = trade.conversationID { editAgentThread(threadID) { thread in
            if let offer = thread.pendingOffer, offer.author == .seller { try? thread.respond(to: offer.id, status: .accepted, as: .buyer) }
            try? thread.send("Big Al: Locked in for \(Money.format(agreed)). Meet \(negotiation.slot) at the \(negotiation.zone). Handoff code \(negotiation.code).", as: .buyer)
        } }
        var agreedListing = listing
        agreedListing.priceCents = agreed
        let exchange = Exchange(listing: agreedListing, meeting: Calendar.current.date(byAdding: .day, value: 2, to: Date()) ?? Date())
        update { $0.exchanges.insert(exchange, at: 0) }
        setAgentTrade(id) { $0.phase = .locked; $0.exchangeID = exchange.id }
        notify("Locked in. Meet \(negotiation.slot) at the \(negotiation.zone).")
    }

    func unlockAgentTrade(_ id: UUID) {
        guard let trade = agentTrade(id), trade.phase == .locked else { return }
        if let exchangeID = trade.exchangeID { update { $0.exchanges.removeAll { $0.id == exchangeID } } }
        setAgentTrade(id) { $0.phase = .ready; $0.exchangeID = nil }
    }

    func passAgentTrade(_ id: UUID) {
        guard let trade = agentTrade(id) else { return }
        if let threadID = trade.conversationID { editAgentThread(threadID) { try? $0.send("Big Al: We’ll pass on this one. Thanks for working with us.", as: .buyer) } }
        setAgentTrade(id) { $0.phase = .passed }
    }

    /// Close a trade, or cancel a locked purchase; Big Al tells the seller in the thread.
    func closeAgentTrade(_ id: UUID) {
        guard let trade = agentTrade(id) else { return }
        if let exchangeID = trade.exchangeID { update { $0.exchanges.removeAll { $0.id == exchangeID } } }
        if let threadID = trade.conversationID {
            let text = trade.phase == .locked ? "Big Al: Sorry, my student canceled this purchase. The meetup is off." : "Big Al: Closing this out. Thanks for your time."
            editAgentThread(threadID) { try? $0.send(text, as: .buyer) }
        }
        update { $0.agentTrades?.removeAll { $0.id == id } }
    }

    func setAgentBudget(_ cents: Int?) { update { $0.agentBudgetCents = cents } }
    func clearAgentChat() { update { $0.agentChat = [] } }

    // MARK: chat with Big Al (server-side model; negotiation stays on the phone)

    func sendToBigAl(_ text: String) async {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        update { $0.agentChat = ($0.agentChat ?? []) + [AgentChatMessage(fromAl: false, text: trimmed)] }
        guard let url = agentURL else {
            appendAlMessage("I need a server connection to chat. Connect RelayAgentURL, or open a trade from the Campus tab.")
            return
        }
        do {
            var request = URLRequest(url: url, timeoutInterval: 60)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            let catalog: [[String: Any]] = agentPool.map { l in
                ["id": l.id, "title": l.title, "priceCents": l.priceCents, "campus": l.campus.rawValue,
                 "category": l.category.rawValue, "seller": l.seller, "condition": l.condition, "courseCode": l.courseCode ?? NSNull()]
            }
            let history = agentChat.suffix(16).map { ["role": $0.fromAl ? "assistant" : "user", "content": $0.text] }
            request.httpBody = try JSONSerialization.data(withJSONObject: ["campus": campus.rawValue, "catalog": catalog, "messages": history])
            let (data, _) = try await URLSession.shared.data(for: request)
            let reply = try JSONDecoder().decode(AgentReply.self, from: data)
            var opened: [UUID] = []
            for action in reply.actions ?? [] where action.type == "open_trade" {
                let listing = agentPool.first { $0.id == action.listingId }
                let item = listing?.title ?? action.item ?? ""
                guard !item.isEmpty else { continue }
                opened += openAgentTrades([AgentRequest(course: listing?.courseCode, item: item, maxCents: action.maxCents)])
            }
            appendAlMessage(reply.reply ?? reply.error ?? "Something went wrong on my end.",
                            listings: opened.isEmpty ? Array((reply.results ?? []).prefix(3)) : [], opened: opened)
        } catch {
            appendAlMessage("I lost my connection for a second. Try that again?")
        }
    }

    private func appendAlMessage(_ text: String, listings: [String] = [], opened: [UUID] = []) {
        update { $0.agentChat = ($0.agentChat ?? []) + [AgentChatMessage(fromAl: true, text: text, listingIDs: listings, openedTradeIDs: opened)] }
    }

    private var agentURL: URL? {
        let configured = ProcessInfo.processInfo.environment["RELAY_AGENT_URL"] ?? Bundle.main.object(forInfoDictionaryKey: "RelayAgentURL") as? String
        #if targetEnvironment(simulator)
        let address = configured ?? "http://127.0.0.1:5174/api/agent/chat"
        #else
        guard let address = configured else { return nil }
        #endif
        guard let url = URL(string: address), url.scheme == "https" || (url.scheme == "http" && ["localhost", "127.0.0.1"].contains(url.host ?? "")) else { return nil }
        return url
    }

    // MARK: helpers

    private func setAgentTrade(_ id: UUID, _ change: (inout AgentTrade) -> Void) {
        update { s in
            guard let i = s.agentTrades?.firstIndex(where: { $0.id == id }) else { return }
            change(&s.agentTrades![i])
        }
    }

    private func editAgentThread(_ id: UUID, _ change: (inout ListingConversation) -> Void) {
        update { s in
            guard let i = s.conversations?.firstIndex(where: { $0.id == id }) else { return }
            change(&s.conversations![i])
        }
    }

    /// Mirror the agents' rounds into a real Inbox thread: Big Al writes as the buyer, the seller's agent as the seller.
    private func recordNegotiation(_ trade: AgentTrade, _ negotiation: AgentNegotiation) -> UUID? {
        guard let listing = trade.listing else { return nil }
        let existing = (snapshot.conversations ?? []).first { $0.listing.id == listing.id }
        var thread = existing ?? ListingConversation(listing: listing)
        guard thread.acceptedOffer == nil else { return thread.id }
        if existing == nil {
            try? thread.send("Big Al: Hi! I’m buying this for a student\(trade.courseCode.map { " (for \($0))" } ?? ""). Would you sell?", as: .buyer)
        }
        if let pending = thread.pendingOffer, pending.author == .buyer {
            try? thread.respond(to: pending.id, status: .withdrawn, as: .buyer)
        }
        var rounds = negotiation.rounds
        // If Big Al's last raise met the seller, the deal is the seller's number.
        if let agreed = negotiation.agreedCents, let last = rounds.last, last.side == .al, last.amountCents >= agreed { rounds.removeLast() }
        let seller = listing.seller.split(separator: " ").first.map(String.init) ?? "Seller"
        for round in rounds {
            let party: ConversationParty = round.side == .al ? .buyer : .seller
            let who = round.side == .al ? "Big Al" : "\(seller)’s agent"
            try? thread.send("\(who): \(round.note)", as: party)
            try? thread.propose(round.amountCents, as: party)
        }
        if negotiation.agreedCents == nil {
            try? thread.send("\(seller)’s agent: That’s as low as \(seller) can go right now.", as: .seller)
        }
        update { s in
            if let i = s.conversations?.firstIndex(where: { $0.id == thread.id }) { s.conversations![i] = thread }
            else { s.conversations = (s.conversations ?? []) + [thread] }
        }
        return thread.id
    }
}
