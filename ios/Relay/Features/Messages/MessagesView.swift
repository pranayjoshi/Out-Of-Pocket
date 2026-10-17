import SwiftUI
import RelayCore

struct ConversationDestination: Identifiable { let id: UUID }

struct InboxView: View {
    @Environment(RelayStore.self) private var store
    @State private var handoffs = false
    var body: some View {
        VStack(spacing: 0) {
            Picker("Inbox section", selection: $handoffs) {
                Text("Messages").tag(false)
                Text("Handoffs").tag(true)
            }.pickerStyle(.segmented).padding(.horizontal, 20).padding(.vertical, 10)
            if handoffs { ExchangesView() }
            else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        SectionTitle(eyebrow: "A GOOD FIND STARTS WITH HELLO", title: "Make a little connection.")
                        Text("Ask a question, agree on a price, and plan your pickup.").font(.subheadline).foregroundStyle(RelayTheme.secondary)
                        DemoNotice(text: store.usesSharedMarket ? "Messages go to the other signed-in student." : "Local demo conversations. Messages stay on this device; no one else receives them.")
                        if store.conversations.isEmpty {
                            EmptyContent(symbol: "bubble.left.and.bubble.right", title: "Say hello to a good find.", message: "Open a listing and tap Message seller to start a conversation.", actionTitle: "Explore listings") { store.selectedTab = .discover }
                        }
                        ForEach(store.conversations) { thread in
                            NavigationLink {
                                ConversationView(conversationID: thread.id)
                            } label: { conversationRow(thread) }.buttonStyle(.plain)
                        }
                    }.padding(20)
                }.background(RelayTheme.paper)
            }
        }.background(RelayTheme.paper).navigationTitle("Inbox").navigationBarTitleDisplayMode(.inline)
    }
    private func conversationRow(_ thread: ListingConversation) -> some View {
        HStack(spacing: 14) {
            ListingImage(name: thread.listing.imageName).frame(width: 65, height: 75).clipped().clipShape(RoundedRectangle(cornerRadius: 13))
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Text(thread.listing.isOwnListing ? "Sample buyer" : thread.listing.seller).font(.subheadline.weight(.semibold))
                    Spacer()
                    if thread.unreadCount > 0 { Text("\(thread.unreadCount)").font(.caption.bold()).padding(6).background(RelayTheme.lime, in: Circle()) }
                }
                Text(thread.listing.title).font(.caption.weight(.medium))
                Text(thread.messages.last?.text ?? "Start the conversation").font(.caption).foregroundStyle(RelayTheme.secondary).lineLimit(2)
                if let offer = thread.acceptedOffer { Text("Agreed · \(Money.format(offer.amountCents))").font(.caption.weight(.medium)).foregroundStyle(RelayTheme.accent) }
                else if let offer = thread.pendingOffer { Text("Offer · \(Money.format(offer.amountCents)) · awaiting \(offer.author.other.title.lowercased())").font(.caption).foregroundStyle(RelayTheme.accent) }
            }
            Image(systemName: "chevron.right").font(.caption)
        }.foregroundStyle(RelayTheme.ink).padding(16).background(RelayTheme.surface, in: RoundedRectangle(cornerRadius: 20))
    }
}

struct ConversationView: View {
    @Environment(RelayStore.self) private var store
    let conversationID: UUID
    @State private var draft = ""
    @State private var amount = ""
    @State private var demoOtherParty = false
    @State private var showOffer = false
    @State private var error: String?
    @State private var exchangeDestination: ExchangeDestination?
    @State private var meeting = Calendar.current.date(byAdding: .day, value: 1, to: Date()) ?? Date()
    @FocusState private var composing: Bool
    @FocusState private var offerFocused: Bool
    private var thread: ListingConversation? { store.conversation(conversationID) }
    private var party: ConversationParty { demoOtherParty ? (thread?.localParty ?? .buyer).other : thread?.localParty ?? .buyer }
    var body: some View {
        Group {
            if let thread {
                VStack(spacing: 0) {
                    listingHeader(thread)
                    ScrollViewReader { proxy in
                        ScrollView {
                            VStack(alignment: .leading, spacing: 14) {
                                if store.usesSharedMarket {
                                    DemoNotice(text: "You are \(thread.localParty.title.lowercased()). The other person sees this on their account.")
                                } else {
                                    DemoNotice(text: "On-device demo · no messages are delivered. Use the demo control to try both sides.")
                                    Toggle("Demo: act as \(thread.localParty.other.title.lowercased())", isOn: $demoOtherParty)
                                        .font(.caption).tint(RelayTheme.forest).accessibilityIdentifier("demo-other-party")
                                        .onChange(of: demoOtherParty) { _, _ in draft = ""; error = nil; showOffer = false }
                                }
                                if thread.messages.isEmpty {
                                    Text("Ask about condition, availability, or a public pickup spot.").font(.subheadline).foregroundStyle(RelayTheme.secondary).padding(.vertical, 22)
                                }
                                ForEach(thread.messages) { message in messageBubble(message, thread: thread) }
                                offerPanel(thread)
                                if let error { Text(error).font(.caption).foregroundStyle(.red).accessibilityIdentifier("conversation-error") }
                                Color.clear.frame(height: 1).id("latest")
                            }.padding(20)
                        }.scrollDismissesKeyboard(.interactively)
                            .onChange(of: thread.messages.count) { _, _ in
                                proxy.scrollTo("latest", anchor: .bottom)
                                store.markConversationRead(conversationID)
                            }
                    }
                    composer
                }.background(RelayTheme.paper)
                    .onAppear { store.markConversationRead(conversationID) }
            } else { Text("This conversation is unavailable.") }
        }
        .navigationTitle(thread?.listing.isOwnListing == true ? "Sample buyer" : thread?.listing.seller ?? "Conversation")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(item: $exchangeDestination) { ExchangeDetailView(exchangeID: $0.id) }
    }
    private func listingHeader(_ thread: ListingConversation) -> some View {
        HStack(spacing: 13) {
            ListingImage(name: thread.listing.imageName).frame(width: 47, height: 53).clipped().clipShape(RoundedRectangle(cornerRadius: 10))
            VStack(alignment: .leading, spacing: 4) {
                Text(thread.listing.title).font(.subheadline.weight(.medium)).lineLimit(2)
                Text("Asking \(thread.listing.price) · \(thread.listing.campus.shortName)").font(.caption).foregroundStyle(RelayTheme.secondary)
            }
            Spacer(minLength: 0)
        }.padding(.horizontal, 20).padding(.vertical, 12).background(RelayTheme.surface)
    }
    private func messageBubble(_ message: ListingMessage, thread: ListingConversation) -> some View {
        let own = message.author == thread.localParty
        return HStack {
            if own { Spacer(minLength: 35) }
            VStack(alignment: .leading, spacing: 6) {
                Text(own ? "You" : (store.usesSharedMarket ? (thread.listing.isOwnListing ? "Buyer" : thread.listing.seller) : "Demo \(message.author.title.lowercased())")).font(.caption2.weight(.semibold))
                Text(message.text).font(.subheadline).textSelection(.enabled)
                HStack {
                    Text(message.createdAt.formatted(date: .abbreviated, time: .shortened))
                    if let id = message.offerID, let offer = thread.offers.first(where: { $0.id == id }) { Text("· \(offer.status.rawValue.capitalized)") }
                }.font(.caption2).foregroundStyle(RelayTheme.secondary)
            }.padding(14).background(own ? RelayTheme.soft : RelayTheme.surface, in: RoundedRectangle(cornerRadius: 18))
            if !own { Spacer(minLength: 35) }
        }.foregroundStyle(RelayTheme.ink)
    }
    @ViewBuilder private func offerPanel(_ thread: ListingConversation) -> some View {
        let locked = store.hasActiveExchange(for: thread.listing.id)
        VStack(alignment: .leading, spacing: 12) {
            if let offer = thread.acceptedOffer {
                Label("Agreed on \(Money.format(offer.amountCents))", systemImage: "checkmark.seal").font(.headline).accessibilityIdentifier("agreed-price")
                Text("Accepting a price does not reserve the item or charge a payment.").font(.caption).foregroundStyle(RelayTheme.secondary)
            } else if let offer = thread.pendingOffer {
                Text("\(offer.author.title)’s offer · \(Money.format(offer.amountCents))").font(.headline)
                Text("Awaiting \(offer.author.other.title.lowercased()) response").font(.caption).foregroundStyle(RelayTheme.secondary)
                if !locked {
                    if offer.author == party {
                        Button("Withdraw offer") { respond(offer, .withdrawn) }.buttonStyle(RelayPrimaryButton(secondary: true))
                    } else {
                        Button("Accept \(Money.format(offer.amountCents))") { respond(offer, .accepted) }.buttonStyle(RelayPrimaryButton()).accessibilityIdentifier("accept-offer")
                        HStack {
                            Button("Counteroffer") { showOffer = true }.buttonStyle(RelayPrimaryButton(secondary: true)).accessibilityIdentifier("counter-offer")
                            Button("Decline") { respond(offer, .declined) }.buttonStyle(RelayPrimaryButton(secondary: true))
                        }
                    }
                }
            }
            if thread.listing.priceCents > 0 && thread.acceptedOffer == nil && !locked {
                if thread.pendingOffer == nil && !showOffer {
                    Button("Make an offer") { showOffer = true }.buttonStyle(RelayPrimaryButton(secondary: true)).accessibilityIdentifier("make-offer")
                }
                if showOffer {
                    TextField("Your offer in dollars", text: $amount).keyboardType(.decimalPad).textFieldStyle(.roundedBorder).accessibilityIdentifier("offer-amount").focused($offerFocused)
                    HStack {
                        Button("Send offer") {
                            perform {
                                guard let cents = Money.parse(amount), cents > 0 else { throw ConversationError.invalidAmount }
                                try await store.proposeOffer(cents, in: conversationID, as: party)
                                amount = ""; showOffer = false; composing = false; offerFocused = false
                            }
                        }.buttonStyle(RelayPrimaryButton()).accessibilityIdentifier("send-offer")
                        Button("Cancel") { showOffer = false; error = nil }.font(.subheadline)
                    }
                }
            }
            if locked { Text("A handoff has started. Its price is fixed; you can keep messaging.").font(.caption).foregroundStyle(RelayTheme.secondary) }
            if party == .buyer && (thread.pendingOffer == nil || locked) {
                DatePicker("Pickup time", selection: $meeting, in: Date()..., displayedComponents: [.date, .hourAndMinute]).font(.caption)
                Button(locked ? "View handoff" : "Plan handoff · \(thread.agreedListing.price)") {
                    perform { exchangeDestination = ExchangeDestination(id: try await store.reserve(thread.listing, meeting: meeting)) }
                }.buttonStyle(RelayPrimaryButton()).accessibilityIdentifier("conversation-handoff")
            }
        }.foregroundStyle(RelayTheme.forest).padding(16).background(RelayTheme.soft, in: RoundedRectangle(cornerRadius: 20))
    }
    private var composer: some View {
        VStack(alignment: .leading, spacing: 7) {
            Text(store.usesSharedMarket ? "Message" : (demoOtherParty ? "Writing as demo \(party.title.lowercased())" : "Message as \(party.title.lowercased())")).font(.caption2).foregroundStyle(RelayTheme.secondary)
            HStack(alignment: .bottom, spacing: 10) {
                TextField("Write a message…", text: $draft, axis: .vertical).lineLimit(1...5).focused($composing)
                    .padding(12).background(RelayTheme.soft, in: RoundedRectangle(cornerRadius: 15)).accessibilityIdentifier("message-input")
                Button {
                    perform { try await store.sendMessage(draft, in: conversationID, as: party); draft = "" }
                } label: { Image(systemName: "arrow.up").font(.headline).frame(width: 44, height: 44).foregroundStyle(RelayTheme.onForest).background(RelayTheme.forest, in: Circle()) }
                    .disabled(draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || draft.count > 2_000)
                    .accessibilityLabel("Send message").accessibilityIdentifier("send-message")
            }
            if draft.count > 1_800 { Text("\(draft.count)/2,000 characters").font(.caption2).foregroundStyle(draft.count > 2_000 ? .red : RelayTheme.secondary) }
        }.padding(.horizontal, 16).padding(.vertical, 10).background(.regularMaterial)
    }
    private func respond(_ offer: ListingOffer, _ status: OfferStatus) {
        perform { try await store.respondToOffer(offer.id, status: status, in: conversationID, as: party); showOffer = false }
    }
    private func perform(_ action: @escaping () async throws -> Void) {
        Task { do { try await action(); error = nil } catch { self.error = error.localizedDescription } }
    }
}
