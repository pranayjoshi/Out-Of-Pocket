import SwiftUI
import RelayCore

/// The buying and swapping agent's movable, campus-specific companion.
struct CampusPetOverlay: View {
    @Environment(RelayStore.self) private var store
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var scenePhase
    @AppStorage("campus-pet-x") private var savedX = 1.0
    @AppStorage("campus-pet-y") private var savedY = 1.0
    @AppStorage("campus-pet-dancing") private var dancing = true
    @GestureState private var translation = CGSize.zero
    @State private var showAgent = false

    private let petSize = CGSize(width: 176, height: 218)
    private var name: String { store.campus == .alabama ? "Al Pal" : "Auburn Pal" }
    private var ready: Int { store.agentReadyCount + store.swapsNeedingYou }
    private var isMoving: Bool {
        dancing && !reduceMotion && scenePhase == .active && !showAgent &&
        !ProcessInfo.processInfo.arguments.contains("-pet-still")
    }

    var body: some View {
        GeometryReader { proxy in
            // Keep the entire pet inside the screen and above the tab bar.
            let minX = petSize.width / 2 + 12
            let maxX = max(minX, proxy.size.width - minX)
            let minY = petSize.height / 2 + 56
            let maxY = max(minY, proxy.size.height - petSize.height / 2 - 66)
            let x = minX + (maxX - minX) * clamped(savedX)
            let y = minY + (maxY - minY) * clamped(savedY)

            Button { showAgent = true } label: {
                VStack(spacing: 2) {
                    ZStack(alignment: .topTrailing) {
                        CampusPetSprite(campus: store.campus, moving: isMoving)
                            .frame(width: 176, height: 178)
                        if ready > 0 {
                            Text("\(ready)").font(.caption.bold()).monospacedDigit()
                                .foregroundStyle(RelayTheme.onBrand).padding(8)
                                .background(RelayTheme.brand, in: Circle())
                                .offset(x: -8, y: 4)
                        }
                    }
                    HStack(spacing: 6) {
                        Text(name).font(.subheadline.weight(.bold))
                        Image(systemName: "bubble.left.fill").font(.caption)
                    }
                    .foregroundStyle(RelayTheme.forest)
                    .padding(.horizontal, 15).padding(.vertical, 9)
                    .background(.regularMaterial, in: Capsule())
                    .overlay(Capsule().stroke(RelayTheme.line, lineWidth: 1))
                }
                .frame(width: petSize.width, height: petSize.height)
                .contentShape(RoundedRectangle(cornerRadius: 40))
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("campus-pet")
            .accessibilityLabel("\(name), buy and swap")
            .accessibilityValue("\(store.campus.rawValue). \(ready) trades ready. \(dancing && !reduceMotion ? "Dancing" : "Resting")")
            .accessibilityHint("Tap to open buying and swapping. Drag to move, or use the pet options.")
            .accessibilityAction(named: "Move left") { savedX = clamped(savedX - 0.25) }
            .accessibilityAction(named: "Move right") { savedX = clamped(savedX + 0.25) }
            .accessibilityAction(named: "Move up") { savedY = clamped(savedY - 0.25) }
            .accessibilityAction(named: "Move down") { savedY = clamped(savedY + 0.25) }
            .accessibilityAction(named: "Return to bottom right") { resetPosition() }
            .contextMenu {
                Button(dancing ? "Pause dancing" : "Start dancing", systemImage: dancing ? "pause" : "play") { dancing.toggle() }
                Button("Return to bottom right", systemImage: "arrow.down.right") { resetPosition() }
            }
            .highPriorityGesture(
                DragGesture(minimumDistance: 8)
                    .updating($translation) { value, state, _ in state = value.translation }
                    .onEnded { value in
                        if maxX > minX { savedX = clamped((x + value.translation.width - minX) / (maxX - minX)) }
                        if maxY > minY { savedY = clamped((y + value.translation.height - minY) / (maxY - minY)) }
                    }
            )
            .position(x: min(maxX, max(minX, x + translation.width)),
                      y: min(maxY, max(minY, y + translation.height)))
        }
        .sheet(isPresented: $showAgent) {
            NavigationStack {
                BigAlView()
                    .toolbar {
                        ToolbarItem(placement: .topBarLeading) {
                            Button("Done") { showAgent = false }
                                .accessibilityIdentifier("close-pet-agent")
                        }
                    }
            }
        }
        .onChange(of: store.selectedTab) { showAgent = false }
        .onAppear {
            if ProcessInfo.processInfo.arguments.contains("-pet-reset") {
                resetPosition(); dancing = true
            }
        }
    }

    private func clamped(_ value: Double) -> Double { min(1, max(0, value)) }
    private func resetPosition() { savedX = 1; savedY = 1 }
}

/// One lightweight animation clock supplies the bounce, sway and squash.
/// The clock stops in the background, while the agent is open, or for Reduce Motion.
struct CampusPetSprite: View {
    let campus: Campus
    var moving = false

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30, paused: !moving)) { context in
            let phase = moving ? context.date.timeIntervalSinceReferenceDate * .pi * 2 / 1.35 : 0
            let sway = sin(phase)
            let hop = abs(sin(phase))
            ZStack(alignment: .bottom) {
                Ellipse().fill(.black.opacity(0.09))
                    .frame(width: 86 - hop * 12, height: 9)
                    .offset(y: -3)
                Image(campus == .alabama ? "pet-al-pal" : "pet-auburn")
                    .resizable().interpolation(.none).scaledToFit()
                    .padding(8)
                    .rotationEffect(.degrees(sway * 7), anchor: .bottom)
                    .scaleEffect(x: 1 + hop * 0.025, y: 1 - hop * 0.025, anchor: .bottom)
                    .offset(x: sway * 4, y: -hop * 11)
            }
        }
        .accessibilityHidden(true)
    }
}
