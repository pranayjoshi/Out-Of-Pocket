import SwiftUI
import RelayCore

/// One open trade: what Big Al picked, how the two agents negotiated, and the student's call.
struct AgentTradeDetailView: View {
    @Environment(RelayStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let tradeID: UUID
    @State private var revealed = 0
    @State private var confirming = false
    @State private var editingMax = false
    @State private var maxText = ""
    @State private var closing = false

    private var trade: AgentTrade? { store.agentTrade(tradeID) }

    var body: some View {
        Group {
            if let trade {
                ScrollView {
                    VStack(alignment: .leading, spacing: 22) {
                        pick(trade)
                        TradeStepper(phase: trade.phase)
                        if let n = trade.negotiation, trade.phase != .searching { rail(trade, n) }
                        outcome(trade)
                        if let thread = trade.conversationID {
                            NavigationLink { ConversationView(conversationID: thread) } label: {
                                Label("Message seller", systemImage: "bubble.left.and.bubble.right")
                            }.buttonStyle(RelayPrimaryButton(secondary: true)).accessibilityIdentifier("bigal-message-seller")
                        }
                    }.padding(20).padding(.bottom, 24)
                }
                .background(RelayTheme.paper)
                .foregroundStyle(RelayTheme.ink)
                .navigationTitle(trade.courseCode ?? "Trade")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .topBarTrailing) { menu(trade) } }
                .task(id: trade.negotiation) { await reveal(trade) }
                .sheet(isPresented: $confirming) { LockInSheet(trade: trade).presentationDetents([.medium]) }
                .alert("Change your max", isPresented: $editingMax) {
                    TextField("Max in dollars", text: $maxText).keyboardType(.decimalPad)
                    Button("Cancel", role: .cancel) {}
                    Button("Negotiate again") { if let cents = Money.parse(maxText) { store.renegotiateAgentTrade(tradeID, maxCents: cents) } }
                } message: { Text("Big Al reopens the negotiation and never goes above this.") }
                .confirmationDialog(trade.phase == .locked ? "Cancel this purchase?" : "Close this trade?", isPresented: $closing, titleVisibility: .visible) {
                    Button(trade.phase == .locked ? "Cancel purchase" : "Close trade", role: .destructive) { store.closeAgentTrade(tradeID); dismiss() }
                } message: { Text(trade.phase == .locked ? "Big Al lets the seller know the meetup is off." : "Big Al stops working on this.") }
            } else {
                EmptyContent(symbol: "tray", title: "Trade closed", message: "This trade isn’t open anymore.").background(RelayTheme.paper)
            }
        }
    }

    // MARK: the pick

    @ViewBuilder private func pick(_ trade: AgentTrade) -> some View {
        if let listing = trade.listing {
            VStack(alignment: .leading, spacing: 0) {
                ListingImage(name: listing.imageName).frame(height: 200).frame(maxWidth: .infinity).clipped()
                VStack(alignment: .leading, spacing: 6) {
                    HStack(alignment: .firstTextBaseline) {
                        Text(listing.title).font(RelayTheme.heading(20)).tracking(-0.3)
                        Spacer(minLength: 8)
                        Text(listing.price).font(.headline.monospacedDigit()).foregroundStyle(RelayTheme.secondary)
                    }
                    Text("\(listing.seller) · \(listing.condition) · \(listing.campus.shortName)").font(.footnote).foregroundStyle(RelayTheme.secondary)
                    if trade.options > 1 {
                        Text("Best of \(trade.options) listings Big Al compared").font(.footnote).foregroundStyle(RelayTheme.accent).padding(.top, 2)
                    }
                }.padding(16)
            }
            .background(RelayTheme.surface, in: RoundedRectangle(cornerRadius: 20))
            .clipShape(RoundedRectangle(cornerRadius: 20))
        } else {
            VStack(alignment: .leading, spacing: 6) {
                Eyebrow(text: trade.courseCode ?? "Open request")
                Text(trade.displayTitle).font(RelayTheme.heading(24)).tracking(-0.5)
                if let max = trade.maxCents { Text("Your max \(Money.format(max))").font(.subheadline).foregroundStyle(RelayTheme.secondary) }
            }
        }
    }

    // MARK: the negotiation

    private func rail(_ trade: AgentTrade, _ n: AgentNegotiation) -> some View {
        let seller = trade.listing.map { $0.seller.split(separator: " ").first.map(String.init) ?? $0.seller } ?? "Seller"
        let shown = trade.phase == .negotiating ? min(revealed, n.rounds.count) : n.rounds.count
        return VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text("Negotiation").font(.subheadline.weight(.semibold))
                Spacer()
                Text("Your max \(Money.format(n.ceilingCents))").font(.footnote.monospacedDigit()).foregroundStyle(RelayTheme.secondary)
            }.padding(.bottom, 14)
            ForEach(Array(n.rounds.prefix(shown).enumerated()), id: \.offset) { index, round in
                HStack(alignment: .top, spacing: 12) {
                    VStack(spacing: 0) {
                        Circle().fill(round.side == .al ? RelayTheme.forest : RelayTheme.secondary.opacity(0.5)).frame(width: 9, height: 9).padding(.top, 5)
                        if index < shown - 1 || trade.phase == .negotiating { Rectangle().fill(RelayTheme.line).frame(width: 1.5).frame(maxHeight: .infinity) }
                    }.frame(width: 12)
                    VStack(alignment: .leading, spacing: 2) {
                        HStack {
                            Text(round.side == .al ? "Big Al" : "\(seller)’s agent").font(.footnote.weight(.semibold))
                            Spacer()
                            Text(Money.format(round.amountCents)).font(.subheadline.weight(.semibold).monospacedDigit())
                        }
                        Text(round.note).font(.footnote).foregroundStyle(RelayTheme.secondary)
                    }.padding(.bottom, 14)
                }
                .transition(.opacity.combined(with: .move(edge: .top)))
            }
            if trade.phase == .negotiating {
                HStack(spacing: 10) {
                    ProgressView().controlSize(.small)
                    Text("Agents are talking…").font(.footnote).foregroundStyle(RelayTheme.secondary)
                }.padding(.leading, 1)
            }
        }
        .padding(16)
        .background(RelayTheme.surface, in: RoundedRectangle(cornerRadius: 20))
        .animation(reduceMotion ? nil : .easeOut(duration: 0.3), value: shown)
    }

    private func reveal(_ trade: AgentTrade) async {
        guard trade.phase == .negotiating, let n = trade.negotiation else { revealed = trade.negotiation?.rounds.count ?? 0; return }
        revealed = 0
        for i in 1...n.rounds.count {
            try? await Task.sleep(for: .seconds(i == 1 ? 0.3 : 0.7))
            if Task.isCancelled { return }
            revealed = i
        }
    }

    // MARK: outcome

    @ViewBuilder private func outcome(_ trade: AgentTrade) -> some View {
        switch trade.phase {
        case .searching:
            statusCard(symbol: "magnifyingglass", title: "Looking on campus", text: "Big Al is comparing listings for \(trade.displayTitle).")
        case .negotiating:
            EmptyView()
        case .ready:
            if let n = trade.negotiation, let agreed = n.agreedCents {
                VStack(alignment: .leading, spacing: 14) {
                    HStack(alignment: .firstTextBaseline) {
                        VStack(alignment: .leading, spacing: 3) {
                            Text("Deal ready").font(.subheadline.weight(.semibold))
                            Text("\(Money.format(n.savedCents)) under asking, within your max").font(.footnote).foregroundStyle(RelayTheme.secondary)
                        }
                        Spacer()
                        Text(Money.format(agreed)).font(RelayTheme.heading(28).monospacedDigit())
                    }
                    Button("Lock it in") { confirming = true }.buttonStyle(RelayPrimaryButton()).accessibilityIdentifier("bigal-lock")
                    Button("Pass on this one") { store.passAgentTrade(tradeID) }
                        .font(.subheadline.weight(.medium)).foregroundStyle(RelayTheme.secondary).frame(maxWidth: .infinity, minHeight: 36)
                }.padding(16).background(RelayTheme.surface, in: RoundedRectangle(cornerRadius: 20))
            }
        case .noDeal:
            let floor = trade.negotiation?.rounds.last { $0.side == .seller }?.amountCents
            VStack(alignment: .leading, spacing: 14) {
                statusText(title: "No deal under your max", text: floor.map { "The seller’s agent stopped at \(Money.format($0)). Raise your max to try again." } ?? "The seller wouldn’t come down far enough.")
                if let floor { Button("Try again at \(Money.format(floor))") { store.renegotiateAgentTrade(tradeID, maxCents: floor) }.buttonStyle(RelayPrimaryButton()) }
                Button("Set a different max") { maxText = ""; editingMax = true }.buttonStyle(RelayPrimaryButton(secondary: true))
            }.padding(16).background(RelayTheme.surface, in: RoundedRectangle(cornerRadius: 20))
        case .locked:
            if let n = trade.negotiation, let listing = trade.listing { HandoffTicket(listing: listing, negotiation: n) { store.unlockAgentTrade(tradeID) } }
        case .passed:
            statusCard(symbol: "hand.raised", title: "You passed", text: "Big Al told the seller. Close the trade, or change your max to reopen it.")
        case .unavailable:
            statusCard(symbol: "eye.slash", title: "No one’s selling this yet", text: "Nothing on campus matches \(trade.displayTitle) right now. Close it, or open a trade for something similar.")
        }
    }

    private func statusCard(symbol: String, title: String, text: String) -> some View {
        HStack(alignment: .top, spacing: 14) {
            RoundIcon(symbol: symbol, size: 38)
            statusText(title: title, text: text)
        }.padding(16).frame(maxWidth: .infinity, alignment: .leading).background(RelayTheme.surface, in: RoundedRectangle(cornerRadius: 20))
    }

    private func statusText(title: String, text: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title).font(.subheadline.weight(.semibold))
            Text(text).font(.footnote).foregroundStyle(RelayTheme.secondary).lineSpacing(2).fixedSize(horizontal: false, vertical: true)
        }
    }

    private func menu(_ trade: AgentTrade) -> some View {
        Menu {
            if trade.listing != nil && trade.phase != .locked {
                Button { maxText = trade.maxCents.map { String($0 / 100) } ?? ""; editingMax = true } label: { Label("Change max", systemImage: "slider.horizontal.3") }
            }
            Button(role: .destructive) { closing = true } label: {
                Label(trade.phase == .locked ? "Cancel purchase" : "Close trade", systemImage: "xmark.circle")
            }
        } label: { Image(systemName: "ellipsis.circle") }.accessibilityLabel("Trade options")
    }
}

struct TradeStepper: View {
    let phase: AgentTradePhase
    private let steps = ["Search", "Negotiate", "Approve", "Meet"]
    private var current: Int {
        switch phase {
        case .searching, .unavailable: 0
        case .negotiating: 1
        case .ready, .noDeal, .passed: 2
        case .locked: 3
        }
    }
    var body: some View {
        HStack(spacing: 6) {
            ForEach(steps.indices, id: \.self) { i in
                VStack(alignment: .leading, spacing: 6) {
                    Capsule().fill(i <= current ? RelayTheme.forest : RelayTheme.line).frame(height: 3)
                    Text(steps[i]).font(.caption2.weight(i == current ? .semibold : .regular))
                        .foregroundStyle(i == current ? RelayTheme.ink : RelayTheme.secondary)
                }
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Step \(current + 1) of 4, \(steps[current])")
    }
}

/// Final confirmation before Big Al accepts the seller's offer.
struct LockInSheet: View {
    @Environment(RelayStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    let trade: AgentTrade
    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            if let n = trade.negotiation, let agreed = n.agreedCents, let listing = trade.listing {
                Eyebrow(text: "Confirm")
                Text("Buy \(listing.title) for \(Money.format(agreed))?").font(RelayTheme.heading(22)).tracking(-0.4).fixedSize(horizontal: false, vertical: true)
                VStack(alignment: .leading, spacing: 10) {
                    Label("\(n.slot) at the \(n.zone)", systemImage: "mappin.and.ellipse")
                    Label("Pay \(listing.seller) in person after you check it", systemImage: "hand.raised")
                    Label("You can cancel any time before the meetup", systemImage: "arrow.uturn.backward")
                }.font(.subheadline).foregroundStyle(RelayTheme.secondary)
                Spacer(minLength: 0)
                Button("Lock it in") { store.lockAgentTrade(trade.id); dismiss() }.buttonStyle(RelayPrimaryButton()).accessibilityIdentifier("bigal-confirm-lock")
                Button("Not yet") { dismiss() }.buttonStyle(RelayPrimaryButton(secondary: true))
            }
        }
        .padding(24).padding(.top, 8)
        .foregroundStyle(RelayTheme.ink)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(RelayTheme.paper)
    }
}

struct HandoffTicket: View {
    let listing: Listing
    let negotiation: AgentNegotiation
    let undo: () -> Void
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Eyebrow(text: "Handoff ticket")
                Spacer()
                Text(Money.format(negotiation.agreedCents ?? negotiation.askedCents)).font(.headline.monospacedDigit())
            }
            Text(negotiation.code).font(.system(size: 34, weight: .semibold, design: .monospaced)).tracking(1)
                .accessibilityLabel("Handoff code \(negotiation.code.map { String($0) }.joined(separator: " "))")
            Divider().overlay(RelayTheme.line)
            VStack(alignment: .leading, spacing: 10) {
                Label(negotiation.zone, systemImage: "mappin.and.ellipse")
                Label(negotiation.slot, systemImage: "clock")
                Label("Meet \(listing.seller). Show this code, check the item, then pay.", systemImage: "checkmark.shield")
            }.font(.subheadline).foregroundStyle(RelayTheme.secondary)
            HStack(spacing: 10) {
                ShareLink(item: "Out of Pocket handoff \(negotiation.code): \(listing.title), \(negotiation.slot) at the \(negotiation.zone).") {
                    Label("Share", systemImage: "square.and.arrow.up")
                }.buttonStyle(RelayPrimaryButton(secondary: true))
                Button("Undo lock-in", action: undo).buttonStyle(RelayPrimaryButton(secondary: true))
            }
        }
        .padding(18)
        .background(RelayTheme.surface, in: RoundedRectangle(cornerRadius: 20))
        .overlay(RoundedRectangle(cornerRadius: 20).strokeBorder(RelayTheme.accent.opacity(0.6), lineWidth: 1))
    }
}
