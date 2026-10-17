import SwiftUI
import RelayCore

/// A real conversation with Big Al. The model picks and opens trades; negotiation runs on the phone.
struct BigAlChatView: View {
    @Environment(RelayStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var draft = ""
    @State private var sending = false
    @FocusState private var composing: Bool

    private let starters = ["Find me a TI-84 under $55", "I need the AI textbook for CS 465, max $50", "What’s out there for CS 470?"]

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 14) {
                    intro
                    ForEach(store.agentChat) { message in bubble(message).id(message.id) }
                    if sending {
                        HStack(spacing: 10) {
                            BigAlAvatar(size: 28)
                            ProgressView().controlSize(.small)
                        }.id("typing")
                    }
                }.padding(.horizontal, 16).padding(.vertical, 18)
            }
            .scrollDismissesKeyboard(.interactively)
            .onChange(of: store.agentChat.count) { scrollDown(proxy) }
            .onChange(of: sending) { scrollDown(proxy) }
            .onAppear { scrollDown(proxy, animated: false) }
        }
        .background(RelayTheme.paper)
        .foregroundStyle(RelayTheme.ink)
        .tint(RelayTheme.forest)
        .safeAreaInset(edge: .bottom) { composer }
        .navigationTitle("Big Al")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("Done") { dismiss() } }
            if !store.agentChat.isEmpty {
                ToolbarItem(placement: .primaryAction) {
                    Menu { Button("Clear chat", role: .destructive) { store.clearAgentChat() } } label: { Image(systemName: "ellipsis.circle") }
                }
            }
        }
    }

    private var intro: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 12) {
                BigAlAvatar(size: 44)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Big Al").font(.headline)
                    Text("Your buying agent · same rules for every student").font(.footnote).foregroundStyle(RelayTheme.secondary)
                }
            }
            if store.agentChat.isEmpty {
                Text("Tell me what you need and your max. I’ll find the best listing, negotiate, and check with you before anything is locked in.")
                    .font(.subheadline).foregroundStyle(RelayTheme.secondary).lineSpacing(3)
                VStack(alignment: .leading, spacing: 8) {
                    ForEach(starters, id: \.self) { s in
                        Button { send(s) } label: {
                            Text(s).font(.subheadline).padding(.horizontal, 14).padding(.vertical, 10)
                                .background(RelayTheme.surface, in: RoundedRectangle(cornerRadius: 14))
                                .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(RelayTheme.line))
                        }.buttonStyle(.plain)
                    }
                }
            }
        }.padding(.bottom, 8)
    }

    @ViewBuilder private func bubble(_ message: AgentChatMessage) -> some View {
        if message.fromAl {
            HStack(alignment: .top, spacing: 10) {
                BigAlAvatar(size: 28)
                VStack(alignment: .leading, spacing: 8) {
                    Text(message.text).font(.subheadline).lineSpacing(2)
                        .padding(.horizontal, 14).padding(.vertical, 10)
                        .background(RelayTheme.surface, in: RoundedRectangle(cornerRadius: 18))
                    ForEach(message.listingIDs, id: \.self) { id in
                        if let listing = store.agentPool.first(where: { $0.id == id }) { pickCard(listing) }
                    }
                    ForEach(message.openedTradeIDs, id: \.self) { id in
                        if let trade = store.agentTrade(id) {
                            NavigationLink { AgentTradeDetailView(tradeID: id) } label: { AgentTradeRow(trade: trade).padding(10) }
                                .buttonStyle(.plain)
                                .background(RelayTheme.surface, in: RoundedRectangle(cornerRadius: 16))
                                .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(RelayTheme.accent.opacity(0.5)))
                        }
                    }
                }
                Spacer(minLength: 36)
            }
        } else {
            HStack {
                Spacer(minLength: 60)
                Text(message.text).font(.subheadline).foregroundStyle(RelayTheme.onForest)
                    .padding(.horizontal, 14).padding(.vertical, 10)
                    .background(RelayTheme.forest, in: RoundedRectangle(cornerRadius: 18))
            }
        }
    }

    private func pickCard(_ listing: Listing) -> some View {
        HStack(spacing: 12) {
            ListingImage(name: listing.imageName).frame(width: 44, height: 44).clipShape(RoundedRectangle(cornerRadius: 10))
            VStack(alignment: .leading, spacing: 2) {
                Text(listing.title).font(.footnote.weight(.semibold)).lineLimit(1)
                Text("\(listing.price) · \(listing.seller) · \(listing.condition)").font(.caption).foregroundStyle(RelayTheme.secondary).lineLimit(1)
            }
            Spacer(minLength: 0)
        }
        .padding(10)
        .background(RelayTheme.surface, in: RoundedRectangle(cornerRadius: 14))
        .accessibilityElement(children: .combine)
    }

    private var composer: some View {
        HStack(spacing: 10) {
            TextField("Ask Big Al", text: $draft, axis: .vertical).lineLimit(1...4).focused($composing)
                .padding(.horizontal, 14).padding(.vertical, 11)
                .background(RelayTheme.surface, in: RoundedRectangle(cornerRadius: 20))
                .overlay(RoundedRectangle(cornerRadius: 20).strokeBorder(RelayTheme.line))
                .onSubmit { send(draft) }
                .accessibilityIdentifier("bigal-chat-input")
            Button { send(draft) } label: {
                Image(systemName: "arrow.up").font(.system(size: 15, weight: .bold)).foregroundStyle(RelayTheme.onForest)
                    .frame(width: 38, height: 38).background(RelayTheme.forest, in: Circle())
            }
            .disabled(sending || draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            .opacity(sending || draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? 0.4 : 1)
            .accessibilityLabel("Send")
        }
        .padding(.horizontal, 14).padding(.vertical, 10)
        .background(.bar)
    }

    private func send(_ text: String) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !sending else { return }
        draft = ""
        sending = true
        Task {
            await store.sendToBigAl(trimmed)
            sending = false
        }
    }

    private func scrollDown(_ proxy: ScrollViewProxy, animated: Bool = true) {
        guard let target: AnyHashable = sending ? "typing" : store.agentChat.last?.id else { return }
        if animated { withAnimation(.easeOut(duration: 0.25)) { proxy.scrollTo(target, anchor: .bottom) } } else { proxy.scrollTo(target, anchor: .bottom) }
    }
}
