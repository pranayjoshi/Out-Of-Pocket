import SwiftUI
import RelayCore

struct ExchangeDestination: Identifiable { let id: UUID }

struct ListingDetailView: View {
    @Environment(RelayStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    let listing: Listing
    @State private var meeting = Calendar.current.date(byAdding: .day, value: 1, to: Date()) ?? Date()
    @State private var destination: ExchangeDestination?
    @State private var conversationDestination: ConversationDestination?
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 23) {
                    GeometryReader { geometry in
                        ListingImage(name: listing.imageName).frame(width: geometry.size.width, height: 320).clipped()
                    }.frame(height: 320).clipShape(RoundedRectangle(cornerRadius: 27))
                    VStack(alignment: .leading, spacing: 12) {
                        Eyebrow(text: "\(listing.category.rawValue) · \(listing.campus.shortName)")
                        Text(listing.title).font(RelayTheme.heading(30)).tracking(-1).foregroundStyle(RelayTheme.ink)
                        HStack(alignment: .firstTextBaseline, spacing: 10) {
                            Text(listing.price).font(RelayTheme.heading(32)).foregroundStyle(RelayTheme.ink)
                            if let original = listing.originalPrice { Text("\(original) new").font(.subheadline).strikethrough().foregroundStyle(RelayTheme.secondary) }
                            Spacer()
                            Label(listing.condition, systemImage: "sparkle").font(.caption).foregroundStyle(RelayTheme.secondary)
                        }
                    }
                    HStack(spacing: 13) {
                        Text(listing.initials).font(.subheadline.weight(.semibold)).frame(width: 44, height: 44).background(RelayTheme.peach, in: Circle())
                        VStack(alignment: .leading, spacing: 5) {
                            Text(listing.seller).font(.subheadline.weight(.semibold))
                            Text(store.usesSharedMarket ? (listing.isOwnListing ? "Your listing" : listing.seller) : (listing.isOwnListing ? "Your local sample listing" : "Sample profile · affiliation unverified")).font(.caption).foregroundStyle(RelayTheme.secondary)
                        }
                        Spacer()
                        Image(systemName: "graduationcap").foregroundStyle(RelayTheme.accent)
                    }.foregroundStyle(RelayTheme.ink)
                    if let code = listing.courseCode { Label("\(code) · \(listing.campus.name)", systemImage: "graduationcap").font(.subheadline).foregroundStyle(RelayTheme.forest) }
                    Text(listing.description).font(.subheadline).foregroundStyle(RelayTheme.secondary).lineSpacing(5)
                    Divider().overlay(RelayTheme.line)
                    VStack(alignment: .leading, spacing: 13) {
                        Label("A thoughtful handoff", systemImage: "mappin.and.ellipse").font(RelayTheme.heading(20))
                        Text("\(listing.location). Agree on an accessible public place during open hours.").font(.subheadline).foregroundStyle(RelayTheme.secondary).lineSpacing(4)
                        DatePicker("Preferred time", selection: $meeting, in: Date()..., displayedComponents: [.date, .hourAndMinute])
                            .font(.subheadline).tint(RelayTheme.forest)
                    }.foregroundStyle(RelayTheme.ink)
                    VStack(alignment: .leading, spacing: 12) {
                        Label("Look it over. Then make it yours.", systemImage: "checkmark.shield").font(.subheadline.weight(.semibold))
                        Text("Partner identification never approves payment. Inspect the item and explicitly accept it before the sample payment step.")
                            .font(.caption).foregroundStyle(RelayTheme.secondary).lineSpacing(4)
                    }.foregroundStyle(RelayTheme.forest).padding(18).frame(maxWidth: .infinity, alignment: .leading)
                        .background(RelayTheme.soft, in: RoundedRectangle(cornerRadius: 20))
                    if !listing.isOwnListing {
                        Button {
                            Task { conversationDestination = ConversationDestination(id: await store.openConversation(for: listing)) }
                        } label: { Label(listing.priceCents == 0 ? "Message seller" : "Message seller / make an offer", systemImage: "bubble.left.and.bubble.right") }
                            .buttonStyle(RelayPrimaryButton()).accessibilityIdentifier("message-seller")
                    } else {
                        Text("This is your listing. Buyer conversations will appear in your inbox.").font(.caption).foregroundStyle(RelayTheme.secondary)
                    }
                    DemoNotice(text: store.usesSharedMarket ? "Shared campus listing. Pickup codes identify your partner and do not charge anyone." : "Local sample. Nothing here is shared with another student.")
                }.padding(20).padding(.bottom, 10)
            }
            .background(RelayTheme.paper)
            .navigationTitle("A good little find").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { Button("Done") { dismiss() } }
                ToolbarItemGroup(placement: .topBarTrailing) {
                    ShareLink(item: URL(string: "relay://listing/\(listing.id)")!) { Image(systemName: "square.and.arrow.up") }.accessibilityLabel("Share this find")
                    Button { store.toggleSaved(listing) } label: { Image(systemName: store.isSaved(listing) ? "heart.fill" : "heart") }.accessibilityLabel("Save this find")
                }
            }
            .safeAreaInset(edge: .bottom) {
                VStack(spacing: 10) {
                    if !listing.isOwnListing {
                        Button {
                            Task { conversationDestination = ConversationDestination(id: await store.openConversation(for: listing)) }
                        } label: { Label("Message seller", systemImage: "bubble.left.and.bubble.right") }
                            .buttonStyle(RelayPrimaryButton()).accessibilityIdentifier("message-seller-bottom")
                    }
                    Button {
                        if let thread = store.conversations.first(where: { $0.listing.id == listing.id }), thread.pendingOffer != nil {
                            conversationDestination = ConversationDestination(id: thread.id)
                        } else {
                            Task { if let id = try? await store.reserve(listing, meeting: meeting) { destination = ExchangeDestination(id: id) } }
                        }
                    } label: { HStack { Text(store.usesSharedMarket ? "Reserve" : "Try the handoff demo"); Spacer(); Image(systemName: "arrow.up.right") } }
                        .buttonStyle(RelayPrimaryButton(secondary: true)).accessibilityIdentifier("reserve-listing").disabled(listing.isOwnListing)
                    Button { store.addToPlan(listing); dismiss() } label: { Label("Add to my setup", systemImage: "plus") }
                        .buttonStyle(RelayPrimaryButton(secondary: true))
                }.padding(.horizontal, 20).padding(.top, 13).padding(.bottom, 8).background(.regularMaterial)
            }
            .sheet(item: $conversationDestination) { target in
                NavigationStack { ConversationView(conversationID: target.id).toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { conversationDestination = nil } } } }
            }
            .sheet(item: $destination) { ExchangeDetailView(exchangeID: $0.id) }
        }.presentationDragIndicator(.visible)
    }
}
