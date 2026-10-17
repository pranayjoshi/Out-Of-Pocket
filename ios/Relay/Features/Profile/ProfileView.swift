import SwiftUI
import RelayCore

struct ProfileView: View {
    @Environment(RelayStore.self) private var store
    @State private var showSafety = false
    @State private var showSaved = false
    @State private var showCreate = false
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 26) {
                VStack(alignment: .leading, spacing: 17) {
                    Text("Y").font(.system(size: 31, weight: .medium, design: .rounded)).frame(width: 78, height: 78).background(RelayTheme.peach, in: Circle())
                    SectionTitle(eyebrow: "MAKE YOURSELF AT HOME", title: "Your campus era.")
                    Text("Good things. Thoughtful exchanges.\nA little corner of campus, just for you.").font(.subheadline).foregroundStyle(RelayTheme.secondary).lineSpacing(4)
                }
                HStack(spacing: 10) {
                    stat("Saved finds", "\(store.snapshot.savedListingIDs.count)", "heart")
                    stat("Plan pieces", "\(store.planListings.count)", "square.grid.2x2")
                    stat("Exchanges", "\(store.snapshot.exchanges.count)", "arrow.left.arrow.right")
                }
                VStack(spacing: 0) {
                    Button { showSaved = true } label: { profileRow("Your saved finds", "Worth coming back for.", "heart") }
                    Divider().padding(.leading, 59)
                    Button { showCreate = true } label: { profileRow("Pass something on", "Someone’s next favorite thing.", "plus.circle") }
                    Divider().padding(.leading, 59)
                    Button { showSafety = true } label: { profileRow("The Relay way", "A little trust goes a long way.", "checkmark.shield") }
                }.background(RelayTheme.surface, in: RoundedRectangle(cornerRadius: 23))
                VStack(alignment: .leading, spacing: 20) {
                    Eyebrow(text: "YOUR COMMUNITY")
                    Picker("Your campus", selection: Binding(get: { store.campus }, set: { store.selectCampus($0) })) {
                        ForEach(Campus.allCases) { Text($0.name).tag($0) }
                    }.font(.subheadline).tint(RelayTheme.forest)
                    Divider()
                    Toggle(isOn: Binding(get: { store.snapshot.includeOtherCampuses }, set: { store.setCrossCampus($0) })) {
                        VStack(alignment: .leading, spacing: 5) {
                            Text("A little beyond campus").font(.subheadline.weight(.medium))
                            Text("Include sample listings from other schools.").font(.caption).foregroundStyle(RelayTheme.secondary)
                        }
                    }.tint(RelayTheme.forest)
                }.padding(21).background(RelayTheme.surface, in: RoundedRectangle(cornerRadius: 23))
                VStack(alignment: .leading, spacing: 13) {
                    Label("Made for your pace", systemImage: "hand.raised").font(.subheadline.weight(.semibold))
                    Text("Relay follows your device’s light and dark appearance, Dynamic Type, and Reduce Motion settings. Photos you choose stay on this device.")
                        .font(.caption).foregroundStyle(RelayTheme.secondary).lineSpacing(4)
                }.padding(21).background(RelayTheme.soft, in: RoundedRectangle(cornerRadius: 23))
                DemoNotice(text: "Local prototype · no sign-in, shared server, university verification, or real payments. Sample affiliations are not verified.")
                HStack { Spacer(); RelayWordmark(); Spacer() }.padding(.top, 5)
                Text("A little less new. A little more you.").font(.caption).foregroundStyle(RelayTheme.secondary).frame(maxWidth: .infinity)
            }.foregroundStyle(RelayTheme.ink).padding(20).padding(.bottom, 25)
        }.background(RelayTheme.paper).navigationTitle("You").navigationBarTitleDisplayMode(.inline)
            .navigationDestination(isPresented: $showSaved) { SavedFindsView() }
            .sheet(isPresented: $showSafety) { SafetyView() }
            .sheet(isPresented: $showCreate) { CreateListingView() }
    }
    private func stat(_ name: String, _ value: String, _ symbol: String) -> some View {
        VStack(alignment: .leading, spacing: 11) {
            Image(systemName: symbol).font(.subheadline).foregroundStyle(RelayTheme.accent)
            Text(value).font(RelayTheme.heading(28))
            Text(name).font(.caption2).foregroundStyle(RelayTheme.secondary)
        }.frame(maxWidth: .infinity, alignment: .leading).padding(15).background(RelayTheme.soft, in: RoundedRectangle(cornerRadius: 20))
            .accessibilityElement(children: .combine)
    }
    private func profileRow(_ title: String, _ subtitle: String, _ symbol: String) -> some View {
        HStack(spacing: 14) {
            Image(systemName: symbol).font(.title3).foregroundStyle(RelayTheme.accent).frame(width: 26)
            VStack(alignment: .leading, spacing: 5) {
                Text(title).font(.subheadline.weight(.medium))
                Text(subtitle).font(.caption).foregroundStyle(RelayTheme.secondary)
            }
            Spacer(minLength: 0)
            Image(systemName: "chevron.right").font(.caption).foregroundStyle(RelayTheme.secondary)
        }.foregroundStyle(RelayTheme.ink).padding(19).frame(minHeight: 80)
    }
}
struct SavedFindsView: View {
    @Environment(RelayStore.self) private var store
    @Environment(\.dynamicTypeSize) private var typeSize
    @State private var selected: Listing?
    private var listings: [Listing] { store.listings.filter { store.snapshot.savedListingIDs.contains($0.id) } }
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 25) {
                SectionTitle(eyebrow: "YOUR LITTLE COLLECTION", title: "Worth coming back for.")
                if listings.isEmpty {
                    EmptyContent(symbol: "heart", title: "Your next favorite is out there.", message: "Tap a heart on a listing to keep it here.", actionTitle: "Explore campus finds") { store.selectedTab = .discover }
                } else {
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 14), count: typeSize.isAccessibilitySize ? 1 : 2), spacing: 24) {
                        ForEach(listings) { listing in ListingCard(listing: listing) { selected = listing } }
                    }
                }
            }.padding(20)
        }.background(RelayTheme.paper).navigationTitle("Saved finds").navigationBarTitleDisplayMode(.inline)
            .sheet(item: $selected) { ListingDetailView(listing: $0) }
    }
}
struct SafetyView: View {
    @Environment(\.dismiss) private var dismiss
    private let principles: [(String, String, String)] = [
        ("graduationcap", "Know what’s been verified.", "This prototype uses sample profiles. University email access alone would not prove enrollment, ownership, or personal safety. Neither university endorses this preview."),
        ("mappin.and.ellipse", "A public place. A clear plan.", "Agree on an accessible public exchange location during open hours. Bring a friend if you prefer. Location suggestions are not a promise of supervision."),
        ("shippingbox", "Look it over. Then make it yours.", "Check condition, functionality, and included parts. Partner identification is separate from accepting the item. It’s okay to reject an item before payment."),
        ("creditcard", "Every money movement, explained.", "Reservations, temporary holds, successful payments, seller transfers, and bank payouts are separate. This demo never requests a card or moves funds."),
        ("text.bubble", "A fair chance for both sides.", "A real complaint needs the agreed listing, evidence, a seller response, and human review. Opening a case is not automatic approval for a refund.")
    ]
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 28) {
                    RoundIcon(symbol: "checkmark.shield", size: 70)
                    SectionTitle(eyebrow: "A LITTLE TRUST GOES A LONG WAY", title: "Good exchanges\nare thoughtful exchanges.")
                    ForEach(principles, id: \.0) { symbol, title, text in
                        HStack(alignment: .top, spacing: 15) {
                            RoundIcon(symbol: symbol, size: 43)
                            VStack(alignment: .leading, spacing: 8) {
                                Text(title).font(.subheadline.weight(.semibold))
                                Text(text).font(.subheadline).foregroundStyle(RelayTheme.secondary).lineSpacing(4)
                            }
                        }
                    }
                    DemoNotice(text: "Relay does not monitor meetings or provide an emergency response service. In an emergency, use your local emergency services.")
                    Button("That feels like a good start") { dismiss() }.buttonStyle(RelayPrimaryButton())
                }.foregroundStyle(RelayTheme.ink).padding(23)
            }.background(RelayTheme.paper).navigationTitle("The Relay way").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }.presentationDragIndicator(.visible)
    }
}
