import SwiftUI
import RelayCore

struct RelayRootView: View {
    @Environment(RelayStore.self) private var store
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var demoExchange: ExchangeDestination?
    var body: some View {
        @Bindable var store = store
        TabView(selection: $store.selectedTab) {
            Tab(RelayTab.discover.rawValue, systemImage: RelayTab.discover.symbol, value: .discover) {
                NavigationStack { DiscoverView() }
            }
            Tab(RelayTab.plans.rawValue, systemImage: RelayTab.plans.symbol, value: .plans) {
                NavigationStack { PlansView() }
            }
            Tab(RelayTab.campus.rawValue, systemImage: RelayTab.campus.symbol, value: .campus) {
                NavigationStack { CampusBoardView() }
            }
            Tab(RelayTab.exchanges.rawValue, systemImage: RelayTab.exchanges.symbol, value: .exchanges) {
                NavigationStack { ExchangesView() }
            }
            Tab(RelayTab.you.rawValue, systemImage: RelayTab.you.symbol, value: .you) {
                NavigationStack { ProfileView() }
            }
        }
        .sensoryFeedback(.selection, trigger: store.feedbackCount)
        .sheet(item: $demoExchange) { ExchangeDetailView(exchangeID: $0.id) }
        .task {
            if ProcessInfo.processInfo.arguments.contains("-open-exchange-demo"), demoExchange == nil,
               let listing = store.catalog.first(where: { $0.priceCents > 0 }) {
                demoExchange = ExchangeDestination(id: store.reserve(listing, meeting: Date()))
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
