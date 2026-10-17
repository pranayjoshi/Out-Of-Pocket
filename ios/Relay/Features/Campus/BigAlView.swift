import SwiftUI
import RelayCore

struct AgentTradeRoute: Hashable { let id: UUID }
struct AgentThreadRoute: Hashable { let id: UUID }

/// The Campus tab: Big Al, the buying agent. Students tell it what they need; it finds the
/// best listing, negotiates under their max and asks before anything is locked in.
struct BigAlView: View {
    @Environment(RelayStore.self) private var store
    @State private var showSchedule = false
    @State private var showOpenTrade = false
    @State private var showSwap = false
    @State private var closingSwap: AgentSwap?
    @State private var showChat = false
    @State private var closing: AgentTrade?

    private var trades: [AgentTrade] { store.agentTrades }
    private func trades(_ phases: Set<AgentTradePhase>) -> [AgentTrade] { trades.filter { phases.contains($0.phase) } }
    private var swaps: [AgentSwap] { store.agentSwaps }
    private func swaps(_ include: (AgentSwap) -> Bool) -> [AgentSwap] { swaps.filter(include) }
    private var isEmpty: Bool { trades.isEmpty && swaps.isEmpty }

    var body: some View {
        List {
            Section { header.listRowInsets(EdgeInsets(top: 4, leading: 4, bottom: 6, trailing: 4)) }
                .listRowBackground(Color.clear)
            if !isEmpty {
                Section { summary } header: { sectionHeader("Since your last visit") }.listRowBackground(RelayTheme.surface)
            }
            Section {
                actionRow("Upload your schedule", detail: "Big Al lists what your classes need", symbol: "calendar.badge.plus", id: "bigal-schedule") { showSchedule = true }
                actionRow("Open a trade", detail: "Anything, not just class materials", symbol: "plus.circle", id: "bigal-open-trade") { showOpenTrade = true }
                actionRow("Start a trading circle", detail: "Swap what you have for what you want", symbol: "arrow.triangle.2.circlepath", id: "bigal-circle") { showSwap = true }
                actionRow("Ask Big Al", detail: "Chat about what you’re looking for", symbol: "bubble.left", id: "bigal-chat") { showChat = true }
            }.listRowBackground(RelayTheme.surface)
            if let budget = store.agentBudgetCents { Section { budgetRow(budget) }.listRowBackground(RelayTheme.surface) }
            tradeSection("Ready for you", trades([.ready, .noDeal]), swaps { $0.phase == .approving && !$0.youApproved })
            tradeSection("Working on it", trades([.searching, .negotiating]), swaps { $0.phase == .searching || ($0.phase == .approving && $0.youApproved) })
            tradeSection("Locked in", trades([.locked]), swaps { $0.phase == .confirmed })
            tradeSection("Closed", trades([.passed, .unavailable]), swaps { $0.phase == .noMatch || $0.phase == .declined })
            if isEmpty {
                Section {
                    Text("No open trades. Upload your schedule or open one for anything you need; Big Al asks before it buys.")
                        .font(.subheadline).foregroundStyle(RelayTheme.secondary).lineSpacing(3).padding(.vertical, 6)
                } header: { sectionHeader("Open trades") }.listRowBackground(RelayTheme.surface)
            }
            Section {
                CampusPromotionPlacement(placement: "Campus board")
                    .listRowInsets(EdgeInsets()).listRowBackground(Color.clear)
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(RelayTheme.paper)
        .foregroundStyle(RelayTheme.ink)
        .tint(RelayTheme.forest)
        .navigationTitle("Big Al")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { showOpenTrade = true } label: { Image(systemName: "plus") }.accessibilityLabel("Open a trade")
            }
        }
        .navigationDestination(for: AgentTradeRoute.self) { AgentTradeDetailView(tradeID: $0.id) }
        .navigationDestination(for: AgentThreadRoute.self) { ConversationView(conversationID: $0.id) }
        .navigationDestination(for: SwapRoute.self) { TradeCircleView(swapID: $0.id) }
        .sheet(isPresented: $showSchedule) { ScheduleTradesSheet() }
        .sheet(isPresented: $showOpenTrade) { OpenTradeSheet() }
        .sheet(isPresented: $showSwap) { OpenTradeSheet(mode: .swap) }
        .confirmationDialog(closingSwap?.circle == nil ? "Close this swap?" : "Leave this circle?",
                            isPresented: Binding(get: { closingSwap != nil }, set: { if !$0 { closingSwap = nil } }), titleVisibility: .visible, presenting: closingSwap) { swap in
            Button(swap.circle == nil ? "Close swap" : "Leave circle", role: .destructive) { store.closeSwap(swap.id) }
        } message: { swap in Text(swap.circle == nil ? "Big Al stops looking." : "Big Al lets everyone know, and the circle is off.") }
        .sheet(isPresented: $showChat) { NavigationStack { BigAlChatView() } }
        .confirmationDialog(closing.map { $0.phase == .locked ? "Cancel this purchase?" : "Close this trade?" } ?? "",
                            isPresented: Binding(get: { closing != nil }, set: { if !$0 { closing = nil } }), titleVisibility: .visible, presenting: closing) { trade in
            Button(trade.phase == .locked ? "Cancel purchase" : "Close trade", role: .destructive) { store.closeAgentTrade(trade.id) }
        } message: { trade in
            Text(trade.phase == .locked ? "Big Al lets the seller know the meetup is off." : "Big Al stops working on \(trade.displayTitle).")
        }
    }

    // MARK: pieces

    private var header: some View {
        HStack(spacing: 14) {
            BigAlAvatar(size: 56)
            VStack(alignment: .leading, spacing: 3) {
                Text("Buy with Big Al").font(RelayTheme.heading(22)).tracking(-0.4)
                Text(status).font(.subheadline).foregroundStyle(RelayTheme.secondary).fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
    }

    private var status: String {
        let working = store.agentWorkingCount + swaps { $0.phase == .searching || ($0.phase == .approving && $0.youApproved) }.count
        let ready = store.agentReadyCount + store.swapsNeedingYou
        if working > 0 { return "Working on \(working) \(working == 1 ? "trade" : "trades") right now" }
        if ready > 0 { return "\(ready) \(ready == 1 ? "deal is" : "deals are") waiting on you" }
        return "Finds it, negotiates, and asks before buying."
    }

    private var summary: some View {
        let found = trades.filter { $0.listing != nil }
        let deals = trades.compactMap { t in t.phase == .ready || t.phase == .locked ? t.negotiation : nil }
        let saved = deals.map(\.savedCents).reduce(0, +)
        let circles = swaps.filter { $0.circle != nil }
        let lines: [(String, String)] = [
            trades.isEmpty ? nil : ("magnifyingglass", "Found \(found.count) of \(trades.count) \(trades.count == 1 ? "item" : "items") on campus"),
            circles.isEmpty ? nil : ("arrow.triangle.2.circlepath", "Lined up \(circles.count) trading \(circles.count == 1 ? "circle" : "circles")\(store.swapsNeedingYou > 0 ? ", \(store.swapsNeedingYou) waiting on your OK" : "")"),
            deals.isEmpty ? nil : ("arrow.down.right", "Talked \(Money.format(saved)) off asking across \(deals.count) \(deals.count == 1 ? "deal" : "deals")"),
            store.agentReadyCount == 0 ? nil : ("checkmark.circle", "\(store.agentReadyCount) ready for you to lock in"),
            trades([.noDeal]).isEmpty ? nil : ("exclamationmark.circle", "\(trades([.noDeal]).count) won’t go under your max"),
            trades([.locked]).isEmpty ? nil : ("ticket", "\(trades([.locked]).count) meetup\(trades([.locked]).count == 1 ? "" : "s") booked at safe zones"),
        ].compactMap { $0 }
        return VStack(alignment: .leading, spacing: 11) {
            ForEach(lines, id: \.1) { symbol, text in
                Label { Text(text).font(.subheadline) } icon: {
                    Image(systemName: symbol).font(.footnote.weight(.semibold)).foregroundStyle(RelayTheme.accent).frame(width: 20)
                }
            }
        }.padding(.vertical, 6)
    }

    private func actionRow(_ title: String, detail: String, symbol: String, id: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 14) {
                Image(systemName: symbol).font(.system(size: 17, weight: .medium)).foregroundStyle(RelayTheme.forest)
                    .frame(width: 36, height: 36).background(RelayTheme.soft, in: RoundedRectangle(cornerRadius: 10))
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(.body.weight(.medium)).foregroundStyle(RelayTheme.ink)
                    Text(detail).font(.footnote).foregroundStyle(RelayTheme.secondary)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(RelayTheme.line)
            }.contentShape(Rectangle())
        }.buttonStyle(.plain).accessibilityIdentifier(id)
    }

    private func budgetRow(_ budget: Int) -> some View {
        let committed = trades.compactMap { t -> Int? in
            guard t.phase == .ready || t.phase == .locked else { return nil }
            return t.negotiation?.agreedCents
        }.reduce(0, +)
        return VStack(alignment: .leading, spacing: 9) {
            HStack {
                Text("Budget").font(.subheadline.weight(.medium))
                Spacer()
                Text("\(Money.format(committed)) of \(Money.format(budget))").font(.subheadline.monospacedDigit()).foregroundStyle(RelayTheme.secondary)
            }
            ProgressView(value: Double(min(committed, budget)), total: Double(max(budget, 1))).tint(committed > budget ? .red : RelayTheme.accent)
        }
        .padding(.vertical, 4)
        .swipeActions { Button("Remove", role: .destructive) { store.setAgentBudget(nil) } }
    }

    @ViewBuilder
    private func tradeSection(_ title: String, _ items: [AgentTrade], _ swapItems: [AgentSwap]) -> some View {
        if !items.isEmpty || !swapItems.isEmpty {
            Section {
                ForEach(swapItems) { swap in
                    NavigationLink(value: SwapRoute(id: swap.id)) { SwapRow(swap: swap) }
                        .swipeActions(edge: .trailing) {
                            Button(swap.circle == nil ? "Close" : "Leave", role: .destructive) { closingSwap = swap }
                        }
                }
                ForEach(items) { trade in
                    NavigationLink(value: AgentTradeRoute(id: trade.id)) { AgentTradeRow(trade: trade) }
                        .swipeActions(edge: .trailing) {
                            Button(trade.phase == .locked ? "Cancel" : "Close", role: .destructive) { closing = trade }
                        }
                }
            } header: { sectionHeader(title) }.listRowBackground(RelayTheme.surface)
        }
    }

    private func sectionHeader(_ text: String) -> some View {
        Text(text).font(.footnote.weight(.semibold)).foregroundStyle(RelayTheme.secondary).textCase(nil)
    }
}

struct BigAlAvatar: View {
    var size: CGFloat = 40
    var body: some View {
        Image("bigal-avatar").resizable().scaledToFill()
            .frame(width: size, height: size).clipShape(Circle())
            .overlay(Circle().stroke(RelayTheme.line, lineWidth: 1))
            .accessibilityHidden(true)
    }
}

struct AgentTradeRow: View {
    let trade: AgentTrade
    var body: some View {
        HStack(spacing: 13) {
            Group {
                if let listing = trade.listing { ListingImage(name: listing.imageName) }
                else { Image(systemName: trade.phase == .unavailable ? "eye.slash" : "magnifyingglass").foregroundStyle(RelayTheme.secondary).frame(maxWidth: .infinity, maxHeight: .infinity).background(RelayTheme.soft) }
            }
            .frame(width: 48, height: 48).clipShape(RoundedRectangle(cornerRadius: 11))
            VStack(alignment: .leading, spacing: 3) {
                Text(trade.displayTitle).font(.subheadline.weight(.medium)).lineLimit(1)
                Text(detail).font(.footnote).foregroundStyle(RelayTheme.secondary).lineLimit(1)
            }
            Spacer(minLength: 4)
            trailing
        }.padding(.vertical, 3)
    }

    private var detail: String {
        let course = trade.courseCode.map { "\($0) · " } ?? ""
        let seller = trade.listing.map { $0.seller.split(separator: " ").first.map(String.init) ?? $0.seller } ?? "seller"
        switch trade.phase {
        case .searching: return course + "Looking on campus…"
        case .negotiating: return course + "Negotiating with \(seller)’s agent"
        case .ready: return course + "Ready to lock in"
        case .noDeal: return course + "\(seller) won’t meet your max"
        case .locked: return trade.negotiation.map { "\($0.slot) · \($0.zone)" } ?? "Locked in"
        case .passed: return course + "You passed"
        case .unavailable: return course + "No one’s selling this yet"
        }
    }

    @ViewBuilder private var trailing: some View {
        switch trade.phase {
        case .searching, .negotiating: ProgressView().controlSize(.small)
        case .ready, .locked:
            if let n = trade.negotiation, let agreed = n.agreedCents {
                VStack(alignment: .trailing, spacing: 1) {
                    Text(Money.format(agreed)).font(.subheadline.weight(.semibold).monospacedDigit())
                    Text(Money.format(n.askedCents)).font(.caption2.monospacedDigit()).strikethrough().foregroundStyle(RelayTheme.secondary)
                }
            }
        default: EmptyView()
        }
    }
}
