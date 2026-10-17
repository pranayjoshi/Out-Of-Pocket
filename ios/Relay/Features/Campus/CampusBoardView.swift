import SwiftUI
import RelayCore

struct CampusBoardView: View {
    @Environment(RelayStore.self) private var store
    @State private var selectedEvent: String?
    @State private var showRequest = false
    @State private var relatedPost: CampusRequest?
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 28) {
                SectionTitle(eyebrow: "MORE THAN A MARKETPLACE", title: "Good things\nare happening.")
                Text("Less lost in the group chat.\nMore actually showing up.").font(.subheadline).foregroundStyle(RelayTheme.secondary).lineSpacing(5)
                HStack {
                    SectionTitle(eyebrow: "THE CAMPUS SWITCHBOARD", title: "A little give. A little take.")
                    Button { showRequest = true } label: { RoundIcon(symbol: "plus") }.accessibilityLabel("Post a campus request")
                }
                ForEach(store.campusRequests) { request in
                    HStack(spacing: 12) {
                        Text(String(request.person.prefix(1))).font(.subheadline).frame(width: 44, height: 44).background(RelayTheme.soft, in: Circle())
                        VStack(alignment: .leading, spacing: 7) {
                            Text(request.title).font(.subheadline.weight(.medium))
                            if let details = request.details, !details.isEmpty { Text(details).font(.caption).foregroundStyle(RelayTheme.secondary) }
                            Text("\(request.postIntent.rawValue) · \(request.summary)").font(.caption).foregroundStyle(RelayTheme.secondary)
                        }
                        Spacer(minLength: 0)
                        Button { relatedPost = request } label: { Image(systemName: "arrow.up.right").frame(width: 44, height: 44) }.accessibilityLabel("Create a related post for \(request.title)")
                    }.padding(17).background(RelayTheme.surface, in: RoundedRectangle(cornerRadius: 20))
                }
                CampusPromotionPlacement(placement: "Campus board")
                SectionTitle(eyebrow: "AROUND CAMPUS", title: "Make a little time.")
                ForEach(DemoCatalog.events.filter { $0.id != "coffee" }) { event in
                    Button { selectedEvent = event.id } label: { FlyerCard(event: event) }.buttonStyle(.plain)
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
            .sheet(item: $relatedPost) { CampusPostResponseView(post: $0) }
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
    @State private var details = ""
    @State private var exchangeFor = ""
    @State private var category: RelayCore.Category = .all
    let intent: CampusIntent

    init(title: String = "", category: RelayCore.Category = .all, intent: CampusIntent = .find, exchangeFor: String = "", details: String = "") {
        _title = State(initialValue: title)
        _category = State(initialValue: category)
        _exchangeFor = State(initialValue: exchangeFor)
        _details = State(initialValue: details)
        self.intent = intent
    }
    private var valid: Bool {
        !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && title.count <= 100 && details.count <= 1000 &&
        (intent == .trade ? !exchangeFor.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && exchangeFor.count <= 100 : budget.isEmpty || Money.parse(budget) != nil)
    }
    private var heading: String {
        switch intent {
        case .find: "What’s your missing piece?"
        case .offer: "Someone could use your help."
        case .trade: "Your thing. Their thing."
        }
    }
    private var titleLabel: String {
        switch intent {
        case .find: "I’m looking for…"
        case .offer: "I’m offering…"
        case .trade: "I can trade…"
        }
    }
    private var actionLabel: String {
        switch intent {
        case .find: "Ask your campus"
        case .offer: "Post my offer"
        case .trade: "Post my trade"
        }
    }
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 23) {
                    RoundIcon(symbol: intent.symbol, size: 60)
                    SectionTitle(eyebrow: "\(intent.rawValue.uppercased()) · \(store.campus.shortName) CAMPUS BOARD", title: heading)
                    FormField(label: titleLabel, placeholder: intent == .trade ? "My chemistry textbook" : "A little help with Calculus", text: $title)
                        .accessibilityIdentifier("campus-post-title")
                    if intent == .trade {
                        FormField(label: "In exchange for…", placeholder: "A desk lamp, another book, or a skill", text: $exchangeFor)
                            .accessibilityIdentifier("campus-post-wanted")
                    } else {
                        FormField(label: intent == .find ? "Budget up to ($) · optional" : "Asking price ($) · optional", placeholder: "Leave blank to agree later", text: $budget).keyboardType(.decimalPad)
                        Text(intent == .offer ? "For a service or ride, add the rate, availability, and what’s included below." : "Add a preferred time below for tutoring, rides, or tickets.")
                            .font(.caption).foregroundStyle(RelayTheme.secondary)
                    }
                    HStack {
                        Text("Category").font(.subheadline)
                        Spacer()
                        Picker("Category", selection: $category) {
                            ForEach(RelayCore.Category.allCases) { Text($0 == .all ? "Anything on campus" : $0.rawValue).tag($0) }
                        }.tint(RelayTheme.forest)
                    }
                    VStack(alignment: .leading, spacing: 9) {
                        Text("A few useful details · optional").font(.subheadline.weight(.medium))
                        TextField("When, where, condition, rate, or what you have in mind…", text: $details, axis: .vertical)
                            .lineLimit(3...6).padding(15).background(RelayTheme.soft, in: RoundedRectangle(cornerRadius: 14))
                            .accessibilityIdentifier("campus-post-details")
                        Text("Keep contact details private. Up to 1,000 characters.").font(.caption).foregroundStyle(RelayTheme.secondary)
                    }
                    DemoNotice(text: "Your sample post stays on this device. It isn’t shared with other students.")
                    Button(actionLabel) {
                        guard valid else { return }
                        store.postRequest(CampusRequest(title: title.trimmingCharacters(in: .whitespacesAndNewlines),
                            budgetCents: intent == .trade ? 0 : Money.parse(budget) ?? 0, category: category, campus: store.campus,
                            intent: intent, exchangeFor: intent == .trade ? exchangeFor.trimmingCharacters(in: .whitespacesAndNewlines) : nil,
                            details: details.trimmingCharacters(in: .whitespacesAndNewlines)))
                        store.selectedTab = .campus; dismiss()
                    }.buttonStyle(RelayPrimaryButton()).disabled(!valid).accessibilityIdentifier("campus-post-submit")
                }.foregroundStyle(RelayTheme.ink).padding(24)
            }.background(RelayTheme.paper).navigationTitle(intent == .find ? "The community ask" : "\(intent.rawValue) on campus").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
                .scrollDismissesKeyboard(.interactively)
        }.presentationDragIndicator(.visible)
    }
}

struct CampusPostResponseView: View {
    let post: CampusRequest
    var body: some View {
        if post.postIntent == .find && [.dorm, .books, .tech, .lab, .free].contains(post.category) {
            CreateListingView(title: post.title, category: post.category)
        } else {
            RequestEditorView(title: post.postIntent == .trade ? post.exchangeFor ?? "" : post.title,
                              category: post.postIntent == .trade ? .all : post.category,
                              intent: post.postIntent == .find ? .offer : post.postIntent == .offer ? .find : .trade,
                              exchangeFor: post.postIntent == .trade ? post.title : "",
                              details: "Related to \(post.person)’s campus \(post.postIntent.rawValue.lowercased()): \(post.title).")
        }
    }
}
