import SwiftUI
import RelayCore

struct RelayRootView: View {
    @Environment(RelayStore.self) private var store
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var scenePhase
    @State private var demoConversation: ConversationDestination?
    @State private var demoExchange: ExchangeDestination?
    var body: some View {
        @Bindable var store = store
        TabView(selection: $store.selectedTab) {
            Tab(RelayTab.discover.rawValue, systemImage: RelayTab.discover.symbol, value: RelayTab.discover) {
                NavigationStack { DiscoverView() }
            }
            Tab(RelayTab.plans.rawValue, systemImage: RelayTab.plans.symbol, value: RelayTab.plans) {
                NavigationStack { PlansView() }
            }
            Tab(RelayTab.campus.rawValue, systemImage: RelayTab.campus.symbol, value: RelayTab.campus) {
                NavigationStack { CampusBoardView() }
            }
            Tab(RelayTab.exchanges.rawValue, systemImage: RelayTab.exchanges.symbol, value: RelayTab.exchanges) {
                NavigationStack { InboxView() }.badge(store.unreadMessageCount)
            }
            Tab(RelayTab.you.rawValue, systemImage: RelayTab.you.symbol, value: RelayTab.you) {
                NavigationStack { ProfileView() }
            }
        }
        .task(id: scenePhase) {
            guard scenePhase == .active else { return }
            await store.refreshMarketplace()
            while !Task.isCancelled {
                await store.refreshPromotions()
                await store.refreshMarketplace()
                try? await Task.sleep(for: .seconds(30))
            }
        }
        .onOpenURL { store.open(url: $0) }
        .sheet(item: $store.deepLink) { link in
            if let listing = store.listings.first(where: { $0.id == link.id }) {
                ListingDetailView(listing: listing)
            } else {
                Text("That listing isn’t available on this account.").padding()
            }
        }
        .sensoryFeedback(.selection, trigger: store.feedbackCount)
        .sheet(item: $demoConversation) { target in
            NavigationStack { ConversationView(conversationID: target.id) }
        }
        .sheet(item: $demoExchange) { ExchangeDetailView(exchangeID: $0.id) }
        .task {
            if ProcessInfo.processInfo.arguments.contains("-open-conversation-demo"), demoConversation == nil,
               let listing = store.catalog.first(where: { $0.priceCents > 0 }) {
                demoConversation = ConversationDestination(id: await store.openConversation(for: listing))
            }
            if ProcessInfo.processInfo.arguments.contains("-open-exchange-demo"), demoExchange == nil,
               let listing = store.catalog.first(where: { $0.priceCents > 0 }) {
                if let id = try? await store.reserve(listing, meeting: Date()) { demoExchange = ExchangeDestination(id: id) }
            }
        }
        .overlay(alignment: .top) {
            if let message = store.toast {
                HStack(spacing: 10) {
                    Image(systemName: "checkmark.circle.fill").foregroundStyle(RelayTheme.lime)
                    Text(message).font(.subheadline.weight(.medium))
                    Button { store.toast = nil } label: { Image(systemName: "xmark").font(.caption.weight(.semibold)).frame(width: 30, height: 34) }
                        .accessibilityLabel("Dismiss notification")
                }
                .foregroundStyle(RelayTheme.onForest).padding(.leading, 16).padding(.trailing, 6).padding(.vertical, 10)
                .background(RelayTheme.forest, in: RoundedRectangle(cornerRadius: 20))
                .padding(.horizontal, 18).padding(.top, 5)
                .shadow(color: .black.opacity(0.12), radius: 15, y: 6)
                .transition(reduceMotion ? .opacity : .move(edge: .top).combined(with: .opacity))
                .accessibilityElement(children: .combine).accessibilityAddTraits(.updatesFrequently)
            }
        }
        .animation(reduceMotion ? nil : .spring(response: 0.4, dampingFraction: 0.85), value: store.toast)
        .alert("Couldn’t save on this device", isPresented: Binding(get: { store.persistenceError != nil }, set: { if !$0 { store.persistenceError = nil } })) {
            Button("OK") { store.persistenceError = nil }
        } message: { Text(store.persistenceError ?? "") }
    }
}
