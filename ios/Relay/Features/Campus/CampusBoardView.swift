import SwiftUI
import RelayCore

struct CampusBoardView: View {
    @Environment(RelayStore.self) private var store
    @State private var selectedEvent: String?
    @State private var showRequest = false
    @State private var showListing = false
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 28) {
                SectionTitle(eyebrow: "MORE THAN A MARKETPLACE", title: "Good things\nare happening.")
                Text("Less lost in the group chat.\nMore actually showing up.").font(.subheadline).foregroundStyle(RelayTheme.secondary).lineSpacing(5)
                ForEach(DemoCatalog.events) { event in
                    Button { selectedEvent = event.id } label: { FlyerCard(event: event) }.buttonStyle(.plain)
                }
                HStack {
                    SectionTitle(eyebrow: "THE COMMUNITY ASK", title: "A little help goes a long way.")
                    Button { showRequest = true } label: { RoundIcon(symbol: "plus") }.accessibilityLabel("Post a campus request")
                }
                ForEach(store.campusRequests) { request in
                    HStack(spacing: 12) {
                        Text(String(request.person.prefix(1))).font(.subheadline).frame(width: 44, height: 44).background(RelayTheme.soft, in: Circle())
                        VStack(alignment: .leading, spacing: 7) {
                            Text(request.title).font(.subheadline.weight(.medium))
                            Text("\(request.person) · Under \(Money.format(request.budgetCents))").font(.caption).foregroundStyle(RelayTheme.secondary)
                        }
                        Spacer(minLength: 0)
                        Button { showListing = true } label: { Image(systemName: "arrow.up.right").frame(width: 44, height: 44) }.accessibilityLabel("Respond to \(request.title)")
                    }.padding(17).background(RelayTheme.surface, in: RoundedRectangle(cornerRadius: 20))
                }
                DemoNotice(text: "Sample events and campaigns. No live event bookings or sponsor-funded offers.")
            }.foregroundStyle(RelayTheme.ink).padding(20).padding(.bottom, 20)
        }.background(RelayTheme.paper)
            .navigationTitle("Campus board").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button { showRequest = true } label: { Image(systemName: "plus.bubble") }.accessibilityLabel("Post a campus request") } }
            .sheet(isPresented: Binding(get: { selectedEvent != nil }, set: { if !$0 { selectedEvent = nil } })) {
                if let event = DemoCatalog.events.first(where: { $0.id == selectedEvent }) { EventDetailView(event: event) }
            }
            .sheet(isPresented: $showRequest) { RequestEditorView() }
            .sheet(isPresented: $showListing) { CreateListingView() }
    }
}
struct FlyerCard: View {
    @Environment(RelayStore.self) private var store
    let event: CampusEvent
    var body: some View {
        VStack(alignment: .leading, spacing: 22) {
            HStack { Eyebrow(text: event.eyebrow); Spacer(); Image(systemName: "arrow.up.right") }
            Text(event.title).font(RelayTheme.heading(33)).tracking(-1.3).fixedSize(horizontal: false, vertical: true)
            HStack {
                Image(systemName: event.symbol).font(.system(size: 69, weight: .ultraLight)).rotationEffect(.degrees(-13)).padding(.leading, 17)
                Spacer()
                Image(systemName: "sparkle").font(.system(size: 43, weight: .light)).rotationEffect(.degrees(12)).padding(.trailing, 27)
            }.frame(height: 112).opacity(0.75).accessibilityHidden(true)
            Text(event.description).font(.subheadline).lineSpacing(4).foregroundStyle(RelayTheme.secondary)
            Divider().overlay(RelayTheme.heroInk.opacity(0.1))
            HStack {
                Text(event.dateLabel).font(RelayTheme.heading(22)).tracking(-0.6)
                Spacer()
                if store.snapshot.savedEventIDs.contains(event.id) { Label("Saved", systemImage: "checkmark").font(.caption.weight(.semibold)) }
                else { Text(event.time).font(.caption) }
            }
        }.foregroundStyle(RelayTheme.heroInk).padding(26)
            .background(RelayTheme.eventColor(event.theme), in: RoundedRectangle(cornerRadius: 25))
            .overlay(alignment: .top) {
                RoundedRectangle(cornerRadius: 2).fill(.regularMaterial).frame(width: 64, height: 16).rotationEffect(.degrees(-4)).offset(y: -6)
            }
    }
}
struct EventDetailView: View {
    @Environment(RelayStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    let event: CampusEvent
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 25) {
                    HStack { Image(systemName: event.symbol).font(.system(size: 65, weight: .light)).rotationEffect(.degrees(-12)); Spacer(); Text(event.dateLabel).font(RelayTheme.heading(40)).tracking(-2) }
                        .padding(27).frame(height: 170).background(RelayTheme.eventColor(event.theme), in: RoundedRectangle(cornerRadius: 24)).accessibilityHidden(true)
                    SectionTitle(eyebrow: event.eyebrow, title: event.title)
                    Text(event.description).font(.body).foregroundStyle(RelayTheme.secondary).lineSpacing(5)
                    VStack(alignment: .leading, spacing: 20) {
                        Label(event.time, systemImage: "calendar")
                        Label(event.host, systemImage: "person.2")
                        Label("Public campus space · location to be confirmed", systemImage: "mappin.and.ellipse")
                    }.font(.subheadline).foregroundStyle(RelayTheme.secondary)
                    DemoNotice(text: "Sample concept. No live booking, discount, or payment subsidy is available.")
                    Button {
                        store.toggleEvent(event.id)
                    } label: { Label(store.snapshot.savedEventIDs.contains(event.id) ? "Saved to your board" : "Save for later", systemImage: store.snapshot.savedEventIDs.contains(event.id) ? "checkmark" : "heart") }
                        .buttonStyle(RelayPrimaryButton())
                }.foregroundStyle(RelayTheme.ink).padding(23)
            }.background(RelayTheme.paper).navigationTitle("Around campus").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }.presentationDragIndicator(.visible)
    }
}
struct RequestEditorView: View {
    @Environment(RelayStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var title = ""
    @State private var budget = ""
    @State private var category: RelayCore.Category = .dorm
    private var valid: Bool { !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && title.count <= 100 && (Money.parse(budget) ?? 0) > 0 }
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 25) {
                    RoundIcon(symbol: "paperplane", size: 65)
                    SectionTitle(eyebrow: "PUT A LITTLE ASK OUT THERE", title: "What’s your\nmissing piece?")
                    Text("Someone on campus might have just the thing. Give them a little nudge.").font(.subheadline).foregroundStyle(RelayTheme.secondary).lineSpacing(4)
                    FormField(label: "I’m looking for…", placeholder: "A desk that fits a tiny dorm", text: $title)
                    FormField(label: "Budget up to ($)", placeholder: "50", text: $budget).keyboardType(.decimalPad)
                    HStack {
                        Text("Category").font(.subheadline)
                        Spacer()
                        Picker("Category", selection: $category) { ForEach(RelayCore.Category.allCases.filter { $0 != .all }) { Text($0.rawValue).tag($0) } }
                    }
                    DemoNotice(text: "Your sample request stays on this device. It isn’t posted to a shared server.")
                    Button("Ask your campus") {
                        guard let cents = Money.parse(budget), valid else { return }
                        store.postRequest(CampusRequest(title: title.trimmingCharacters(in: .whitespacesAndNewlines), budgetCents: cents, category: category, campus: store.campus))
                        store.selectedTab = .campus; dismiss()
                    }.buttonStyle(RelayPrimaryButton()).disabled(!valid)
                }.foregroundStyle(RelayTheme.ink).padding(24)
            }.background(RelayTheme.paper).navigationTitle("The community ask").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
                .scrollDismissesKeyboard(.interactively)
        }.presentationDragIndicator(.visible)
    }
}
