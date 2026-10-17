import SwiftUI

@main
struct RelayApp: App {
    @State private var store = RelayStore(inMemory: ProcessInfo.processInfo.arguments.contains("-ui-testing"))
    var body: some Scene {
        WindowGroup {
            RelayRootView()
                .environment(store)
                .tint(RelayTheme.forest)
        }
    }
}
