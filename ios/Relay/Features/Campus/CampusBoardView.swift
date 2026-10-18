import SwiftUI
import RelayCore

struct CampusBoardView: View {
    @Environment(RelayStore.self) private var store
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var showCreate = false
    var body: some View {
        @Bindable var store = store
        VStack(spacing: 0) {
            ServiceRail(selection: $store.selectedService).padding(.horizontal, 20).padding(.vertical, 12)
            Group {
                switch store.selectedService {
                case .tutoring: TutoringView()
                case .tickets: TicketsDemoView()
                case .rides: RidesDemoView()
                case .market: MarketplaceView()
                }
            }.id(store.selectedService)
                .transition(reduceMotion ? .opacity : .opacity.combined(with: .offset(y: 8)))
        }.background(RelayTheme.paper)
            .animation(reduceMotion ? nil : .easeInOut(duration: 0.22), value: store.selectedService)
            .navigationTitle("Explore").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showCreate = true } label: { Label("Post", systemImage: "plus") }.font(.subheadline.weight(.semibold))
                }
            }
            .sheet(isPresented: $showCreate) { CreateChoiceSheet() }
    }
}

struct TutoringView: View {
    @Environment(RelayStore.self) private var store
    @State private var search = ""
    @State private var selected: Listing?
    @State private var showRequest = false
    @State private var subject = "All"
    @State private var adGap = Int.random(in: 1...2)
    private let subjects = ["All", "Math", "Computer science", "Writing"]
    private var tutors: [Listing] {
        store.listings.filter {
            $0.campus == store.campus && $0.category == .tutoring &&
            (search.isEmpty || "\($0.title) \($0.seller) \($0.courseCode ?? "") \($0.description)".localizedCaseInsensitiveContains(search)) &&
            (subject == "All" || $0.tag == subject)
        }
    }
    private var asks: [CampusRequest] {
        store.campusRequests.filter { $0.category == .tutoring && (search.isEmpty || "\($0.title) \($0.details ?? "")".localizedCaseInsensitiveContains(search)) }
    }
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 23) {
                ServiceHeading(service: .tutoring, title: "Your next aha!", subtitle: "Find someone who gets your course.\nLearn at your own pace.").relayEntrance()
                RelaySearchField(placeholder: "Course, subject, or tutor", text: $search)
                ScrollView(.horizontal) {
                    HStack(spacing: 8) {
                        ForEach(subjects, id: \.self) { item in
                            Button { subject = item } label: {
                                Text(item).font(.caption.weight(.semibold)).padding(.horizontal, 15).frame(minHeight: 40)
                                    .background(subject == item ? RelayTheme.lavender : RelayTheme.surface, in: Capsule())
                                    .foregroundStyle(RelayTheme.ink)
                            }.accessibilityAddTraits(subject == item ? .isSelected : [])
                        }
                    }
                }.scrollIndicators(.hidden)
                HStack {
                    Text("Find your study person").font(.title3.weight(.bold)).tracking(-0.5)
                    Spacer(); Text("\(tutors.count) tutors").font(.caption).foregroundStyle(RelayTheme.secondary)
                }
                if tutors.isEmpty {
                    EmptyContent(symbol: "graduationcap", title: "Let’s ask your campus.", message: "No tutors match these filters. Post your course and what you need help with.", actionTitle: "Request a tutor") { showRequest = true }
                }
                ForEach(Array(tutors.enumerated()), id: \.element.id) { index, tutor in
                    if index == min(adGap, tutors.count - 1) { CampusPromotionPlacement(placement: "Campus board", slot: "tutoring") }
                    Button { selected = tutor } label: { TutorRow(listing: tutor) }.buttonStyle(RelayPressStyle()).relayEntrance(min(index + 1, 4))
                }
                Button { showRequest = true } label: {
                    HStack {
                        VStack(alignment: .leading, spacing: 7) {
                            Text("Need help with something else?").font(.headline)
                            Text("Post your course. Let campus come to you.").font(.caption).foregroundStyle(RelayTheme.secondary)
                        }
                        Spacer(minLength: 0); Image(systemName: "plus.circle.fill").font(.title2)
                    }.foregroundStyle(RelayTheme.ink).padding(20).background(RelayTheme.lavender, in: RoundedRectangle(cornerRadius: 23))
                }.buttonStyle(RelayPressStyle()).accessibilityIdentifier("request-tutor")
                if !asks.isEmpty {
                    Text("The study board").font(.title3.weight(.bold))
                    ForEach(asks) { post in
                        NavigationLink { TutoringPostView(post: post) } label: {
                            HStack(alignment: .top, spacing: 12) {
                                RoundIcon(symbol: post.postIntent == .offer ? "hand.raised.fill" : "questionmark.bubble.fill")
                                VStack(alignment: .leading, spacing: 6) {
                                    Text(post.title).font(.subheadline.weight(.semibold))
                                    Text("\(post.person) · \(post.summary)").font(.caption).foregroundStyle(RelayTheme.secondary)
                                }
                                Spacer(minLength: 0); Image(systemName: "chevron.right").font(.caption)
                            }.foregroundStyle(RelayTheme.ink).relayCard()
                        }.buttonStyle(.plain)
                    }
                }
                DemoNotice(text: "Sample tutors and local study posts. Availability and affiliations are unverified. No sessions are booked or paid for here.")
            }.padding(22).padding(.bottom, 16)
        }.scrollDismissesKeyboard(.interactively)
            .sheet(item: $selected) { ListingDetailView(listing: $0) }
            .sheet(isPresented: $showRequest) { RequestEditorView(category: .tutoring) }
    }
}

struct TutoringPostView: View {
    let post: CampusRequest
    @State private var respond = false
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                ServiceHeading(service: post.category == .tutoring ? .tutoring : .market, title: post.title, subtitle: "\(post.person) · \(post.summary)")
                if let details = post.details { Text(details).font(.body).foregroundStyle(RelayTheme.secondary) }
                DemoNotice(text: "Local study post. A response creates a related post on this device; it does not contact this person.")
                Button(post.category != .tutoring ? "Create a related post" : post.postIntent == .offer ? "Create a related request" : "Offer study help") { respond = true }.buttonStyle(RelayPrimaryButton())
            }.padding(22)
        }.background(RelayTheme.paper).navigationTitle(post.category == .tutoring ? "Study board" : "Campus board").navigationBarTitleDisplayMode(.inline)
            .sheet(isPresented: $respond) { CampusPostResponseView(post: post) }
    }
}

struct RelaySearchField: View {
    let placeholder: String
    @Binding var text: String
    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "magnifyingglass").foregroundStyle(RelayTheme.secondary)
            TextField(placeholder, text: $text).font(.subheadline).submitLabel(.search)
                .accessibilityLabel(placeholder)
            if !text.isEmpty {
                Button { text = "" } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(RelayTheme.secondary).frame(width: 30, height: 36) }.accessibilityLabel("Clear search")
            }
        }.padding(.horizontal, 16).frame(minHeight: 54).background(RelayTheme.surface, in: RoundedRectangle(cornerRadius: 18))
    }
}

struct MarketplaceView: View {
    @Environment(RelayStore.self) private var store
    @Environment(\.dynamicTypeSize) private var typeSize
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var search = ""
    @State private var category: RelayCore.Category = .all
    @State private var sort: ListingSort = .recommended
    @State private var freeOnly = false
    @State private var showFilters = false
    @State private var selected: Listing?
    private var results: [Listing] {
        var query = ListingQuery()
        query.campus = store.campus; query.category = category; query.text = search
        query.includeOtherCampuses = store.snapshot.includeOtherCampuses; query.freeOnly = freeOnly; query.sort = sort
        let filtered = query.apply(to: store.listings).filter { ![.tutoring, .tickets].contains($0.category) }
        guard sort == .recommended else { return filtered }
        return filtered.enumerated().sorted { a, b in
            let first = UniversityCourse.reason(for: a.element, campus: store.campus, codes: store.courseCodes) != nil
            let second = UniversityCourse.reason(for: b.element, campus: store.campus, codes: store.courseCodes) != nil
            return first == second ? a.offset < b.offset : first
        }.map(\.element)
    }
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                ServiceHeading(service: .market, title: "Good finds. Close by.", subtitle: "A new chapter for someone’s old favorite.")
                BigAlEntryCard()
                RelaySearchField(placeholder: "Search campus finds", text: $search)
                HStack {
                    Menu {
                        Picker("Category", selection: $category) {
                            ForEach(RelayCore.Category.allCases.filter { ![.tutoring, .tickets].contains($0) }) { Text($0.rawValue).tag($0) }
                        }
                    } label: { Label(category.rawValue, systemImage: "square.grid.2x2").font(.subheadline.weight(.semibold)).frame(minHeight: 44) }
                    Spacer()
                    Button { showFilters = true } label: { Label("Filter", systemImage: "slider.horizontal.3").font(.subheadline).frame(minHeight: 44) }
                }
                if results.isEmpty {
                    EmptyContent(symbol: "magnifyingglass", title: "No finds just yet.", message: "Try a different search or reset your filters.", actionTitle: "Reset filters") { search = ""; category = .all; freeOnly = false; sort = .recommended }
                } else {
                    let split = min(results.count, typeSize.isAccessibilitySize ? 2 : 4)
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 15), count: typeSize.isAccessibilitySize ? 1 : 2), spacing: 24) {
                        ForEach(Array(results.prefix(split))) { listing in ListingCard(listing: listing) { selected = listing } }
                    }
                    CampusPromotionPlacement(placement: "Campus board", slot: "market")
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 15), count: typeSize.isAccessibilitySize ? 1 : 2), spacing: 24) {
                        ForEach(Array(results.dropFirst(split))) { listing in ListingCard(listing: listing) { selected = listing } }
                    }
                }
                NavigationLink { CommunityBoardView() } label: {
                    HStack { Label("Campus asks & trades", systemImage: "bubble.left.and.bubble.right"); Spacer(); Image(systemName: "arrow.right") }
                        .font(.subheadline.weight(.semibold)).foregroundStyle(RelayTheme.ink).relayCard()
                }
            }.padding(22)
        }.scrollDismissesKeyboard(.interactively)
            .sheet(item: $selected) { ListingDetailView(listing: $0) }
            .sheet(isPresented: $showFilters) {
                NavigationStack {
                    Form {
                        Picker("Sort", selection: $sort) { ForEach(ListingSort.allCases) { Text($0.rawValue).tag($0) } }
                        Toggle("Free finds only", isOn: $freeOnly)
                        Toggle("Include other campuses", isOn: Binding(get: { store.snapshot.includeOtherCampuses }, set: { store.setCrossCampus($0) }))
                    }.navigationTitle("Filter finds").navigationBarTitleDisplayMode(.inline)
                        .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { showFilters = false } } }
                }.presentationDetents([.medium, .large])
            }
    }
}

struct CommunityBoardView: View {
    @Environment(RelayStore.self) private var store
    @State private var selectedEvent: String?
    @State private var showRequest = false
    @State private var relatedPost: CampusRequest?
    @State private var adGap = Int.random(in: 1...3)
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 28) {
                SectionTitle(eyebrow: "THE CAMPUS BOARD", title: "Ask. Offer. Trade.")
                Text("What you need. What you can share.\nA place to find each other.").font(.subheadline).foregroundStyle(RelayTheme.secondary).lineSpacing(5)
                HStack {
                    SectionTitle(eyebrow: "YOUR COMMUNITY", title: "Open on campus")
                    Button { showRequest = true } label: { RoundIcon(symbol: "plus") }.accessibilityLabel("Post a campus request")
                }
                ForEach(Array(store.campusRequests.enumerated()), id: \.element.id) { index, request in
                    if index == min(adGap, store.campusRequests.count - 1) { CampusPromotionPlacement(placement: "Campus board", slot: "community") }
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
                        store.explore(category == .tutoring ? .tutoring : .market); dismiss()
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
