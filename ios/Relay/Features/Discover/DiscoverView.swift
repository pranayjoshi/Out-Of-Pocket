import SwiftUI
import RelayCore

struct DiscoverView: View {
    @Environment(RelayStore.self) private var store
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.dynamicTypeSize) private var typeSize
    @State private var category: RelayCore.Category = .all
    @State private var search = ""
    @State private var sort: ListingSort = .recommended
    @State private var freeOnly = false
    @State private var selected: Listing?
    @State private var showFilters = false
    @State private var showCreate = false
    @State private var showPlan = false
    @State private var showRequest = false
    @State private var showSafety = false
    @State private var appeared = false
    @State private var campusMove: CampusMoveDraft?
    @State private var relatedPost: CampusRequest?

    private var results: [Listing] {
        var query = ListingQuery()
        query.campus = store.campus; query.category = category; query.text = search
        query.includeOtherCampuses = store.snapshot.includeOtherCampuses; query.freeOnly = freeOnly; query.sort = sort
        let filtered = query.apply(to: store.listings)
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
                greeting
                if search.isEmpty && category == .all && !freeOnly {
                    CampusHero { campusMove = $0 }
                    .opacity(appeared ? 1 : 0)
                    .offset(y: appeared || reduceMotion ? 0 : 16)
                }
                VStack(alignment: .leading, spacing: 18) {
                    HStack(alignment: .bottom) {
                        SectionTitle(eyebrow: "THE GOOD STUFF, CLOSE BY", title: search.isEmpty ? "A little more you." : "Your kind of find.")
                        Menu {
                            Picker("Sort listings", selection: $sort) {
                                ForEach(ListingSort.allCases) { Text($0.rawValue).tag($0) }
                            }
                        } label: { Image(systemName: "arrow.up.arrow.down").font(.subheadline).frame(width: 44, height: 44).background(RelayTheme.soft, in: Circle()) }
                        .accessibilityLabel("Sort listings")
                    }
                    NavigationLink { ScheduleView() } label: {
                        Label(store.courseCodes.isEmpty ? "Add your class schedule" : "Classes: " + store.courseCodes.joined(separator: ", "), systemImage: "calendar.badge.plus")
                            .font(.subheadline).foregroundStyle(RelayTheme.forest)
                    }
                    categoryPicker
                    if results.isEmpty {
                        EmptyContent(symbol: "sparkle.magnifyingglass", title: "Let’s find another way.", message: "Try another search or tell your campus what you need.", actionTitle: "Ask your campus") { showRequest = true }
                    } else {
                        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 14), count: typeSize.isAccessibilitySize ? 1 : 2), alignment: .leading, spacing: 24) {
                            ForEach(results) { listing in
                                VStack(alignment: .leading, spacing: 6) {
                                    ListingCard(listing: listing) { selected = listing }
                                    if let code = listing.courseCode { Text(code).font(.caption.weight(.semibold)).foregroundStyle(RelayTheme.forest) }
                                    if let reason = UniversityCourse.reason(for: listing, campus: store.campus, codes: store.courseCodes) { Text(reason).font(.caption2).foregroundStyle(RelayTheme.secondary) }
                                }
                            }
                        }
                        .animation(reduceMotion ? nil : .spring(response: 0.4, dampingFraction: 0.85), value: category)
                        Text("\(results.count) good \(results.count == 1 ? "find" : "finds") · sample inventory")
                            .font(.caption).foregroundStyle(RelayTheme.secondary)
                    }
                }
                if search.isEmpty {
                    trustStrip
                    setupNudge
                    requestNudge
                    CampusPromotionPlacement(placement: "Discover")
                    HStack(spacing: 7) {
                        Image(systemName: "leaf").foregroundStyle(RelayTheme.accent)
                        Text("A little less new. A little more you.").foregroundStyle(RelayTheme.secondary)
                    }.font(.caption).frame(maxWidth: .infinity).padding(.vertical, 10)
                }
            }.padding(.horizontal, 20).padding(.top, 13).padding(.bottom, 25)
        }
        .background(RelayTheme.paper)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) { RelayWordmark() }
            ToolbarItemGroup(placement: .topBarTrailing) {
                campusMenu
                Button { showCreate = true } label: {
                    Image(systemName: "plus").font(.system(size: 18, weight: .semibold)).frame(width: 40, height: 40)
                        .background(RelayTheme.forest, in: Circle()).foregroundStyle(RelayTheme.onForest)
                }.accessibilityLabel("Create a listing")
            }
        }
        .searchable(text: $search, prompt: "A chair, a textbook, your next favorite…")
        .sheet(item: $selected) { ListingDetailView(listing: $0) }
        .sheet(isPresented: $showCreate) { CreateListingView() }
        .sheet(isPresented: $showPlan) { PlanEditorView() }
        .sheet(isPresented: $showRequest) { RequestEditorView() }
        .sheet(isPresented: $showSafety) { SafetyView() }
        .sheet(isPresented: $showFilters) { filterSheet }
        .sheet(item: $relatedPost) { CampusPostResponseView(post: $0) }
        .sheet(item: $campusMove) { draft in
            switch draft.intent {
            case .find: CampusFindView(draft: draft)
            case .offer:
                if [.dorm, .books, .tech, .lab, .free].contains(draft.category) {
                    CreateListingView(title: draft.text, category: draft.category)
                } else {
                    RequestEditorView(title: draft.text, category: draft.category, intent: .offer)
                }
            case .trade: RequestEditorView(title: draft.text, category: draft.category, intent: .trade)
            }
        }
        .task { withAnimation(reduceMotion ? nil : .easeOut(duration: 0.55)) { appeared = true } }
    }
    private var greeting: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Find your next chapter.")
                .font(RelayTheme.heading(28)).tracking(-0.9).foregroundStyle(RelayTheme.ink)
            Text("Good things. Good people. Right around you.")
                .font(.subheadline).foregroundStyle(RelayTheme.secondary)
        }.accessibilityElement(children: .combine).accessibilityIdentifier("discovery-intro")
    }
    private var campusMenu: some View {
        Menu {
            ForEach(Campus.allCases) { campus in
                Button { store.selectCampus(campus) } label: {
                    if store.campus == campus { Label(campus.name, systemImage: "checkmark") }
                    else { Text(campus.name) }
                }
            }
            Divider()
            Text("Sample campuses · no university affiliation")
        } label: {
            HStack(spacing: 5) {
                Image(systemName: "graduationcap").font(.caption)
                Text(store.campus.shortName).font(.caption.weight(.semibold))
                Image(systemName: "chevron.down").font(.system(size: 9, weight: .semibold))
            }.padding(.horizontal, 12).frame(minHeight: 40).background(RelayTheme.soft, in: Capsule())
        }.accessibilityLabel("Select campus, currently \(store.campus.name)")
    }
    private var categoryPicker: some View {
        ScrollView(.horizontal) {
            HStack(spacing: 8) {
                ForEach(RelayCore.Category.allCases) { item in
                    Button { withAnimation(reduceMotion ? nil : .snappy) { category = item } } label: {
                        Label(item.rawValue, systemImage: item.symbol).font(.caption.weight(.medium))
                            .padding(.horizontal, 13).frame(minHeight: 42)
                            .foregroundStyle(category == item ? RelayTheme.onForest : RelayTheme.secondary)
                            .background(category == item ? RelayTheme.forest : RelayTheme.soft, in: Capsule())
                    }.accessibilityAddTraits(category == item ? .isSelected : [])
                }
                Button { showFilters = true } label: {
                    Image(systemName: "slider.horizontal.3").frame(width: 42, height: 42).background(RelayTheme.soft, in: Circle())
                }.accessibilityLabel("Filter listings")
            }
        }.scrollIndicators(.hidden).contentMargins(.trailing, 4)
    }
    private var trustStrip: some View {
        Button { showSafety = true } label: {
            HStack(spacing: 9) {
                Image(systemName: "checkmark.shield").foregroundStyle(RelayTheme.accent)
                Text("A thoughtful way to hand things over.").font(.caption)
                Spacer(minLength: 0)
                Image(systemName: "arrow.up.right").font(.caption)
            }.foregroundStyle(RelayTheme.secondary)
        }.frame(minHeight: 44)
    }
    private var setupNudge: some View {
        Button { if store.snapshot.plan != nil { store.selectedTab = .plans } else { showPlan = true } } label: {
            HStack(alignment: .center, spacing: 15) {
                Image(systemName: "square.grid.2x2").font(.title2).frame(width: 50, height: 56).background(RelayTheme.lime, in: RoundedRectangle(cornerRadius: 15))
                VStack(alignment: .leading, spacing: 5) {
                    Text("New chapter? Little plan.").font(RelayTheme.heading(17))
                    Text("Piece your setup together, on your budget.").font(.caption).foregroundStyle(RelayTheme.secondary).multilineTextAlignment(.leading)
                }
                Spacer(minLength: 0)
                Image(systemName: "arrow.up.right").font(.subheadline)
            }.foregroundStyle(RelayTheme.ink).padding(16).background(RelayTheme.soft, in: RoundedRectangle(cornerRadius: 23))
        }.buttonStyle(.plain)
    }
    private var requestNudge: some View {
        VStack(alignment: .leading, spacing: 19) {
            HStack {
                SectionTitle(eyebrow: "SOMEONE’S LOOKING FOR YOU", title: "Got just the thing?")
                Button { showRequest = true } label: { RoundIcon(symbol: "plus") }.accessibilityLabel("Post a campus request")
            }
            ForEach(store.campusRequests.prefix(2)) { request in
                HStack(spacing: 12) {
                    Text(String(request.person.prefix(1))).font(.subheadline.weight(.medium)).frame(width: 39, height: 39).background(RelayTheme.soft, in: Circle())
                    VStack(alignment: .leading, spacing: 5) {
                        Text(request.title).font(.subheadline.weight(.medium))
                            Text("\(request.postIntent.rawValue) · \(request.summary)").font(.caption).foregroundStyle(RelayTheme.secondary)
                    }
                    Spacer(minLength: 0)
                    Button { relatedPost = request } label: { Image(systemName: "arrow.up.right").frame(width: 44, height: 44) }
                        .accessibilityLabel("Create a related post for \(request.title)")
                }
                if request.id != store.campusRequests.prefix(2).last?.id { Divider().overlay(RelayTheme.line) }
            }
            if store.campusRequests.isEmpty { Text("Be the first to put a little ask out there.").font(.subheadline).foregroundStyle(RelayTheme.secondary) }
        }.foregroundStyle(RelayTheme.ink).padding(20).background(RelayTheme.surface, in: RoundedRectangle(cornerRadius: 24))
    }
    private var filterSheet: some View {
        NavigationStack {
            Form {
                Section("Your finds") {
                    Toggle("Free finds only", isOn: $freeOnly)
                    Toggle("Include other campuses", isOn: Binding(get: { store.snapshot.includeOtherCampuses }, set: { store.setCrossCampus($0) }))
                }
                Section {
                    Button("Reset filters") { freeOnly = false; store.setCrossCampus(false); category = .all; search = ""; sort = .recommended }
                } footer: { Text("Cross-campus listings need a separately agreed public handoff. There is no delivery service in this preview.") }
            }
            .navigationTitle("Your kind of find").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { showFilters = false } } }
        }.presentationDetents([.medium, .large]).presentationDragIndicator(.visible)
    }
}

struct CampusMoveDraft: Identifiable {
    let id = UUID()
    let intent: CampusIntent
    let category: RelayCore.Category
    let text: String
}

struct CampusHero: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var intent: CampusIntent = .find
    @State private var category: RelayCore.Category = .all
    @State private var text = ""
    @FocusState private var inputFocused: Bool
    @Namespace private var selection
    var action: (CampusMoveDraft) -> Void

    private let topics: [(RelayCore.Category, String, String)] = [
        (.books, "Books", "books.vertical"), (.dorm, "Dorm", "sofa"),
        (.lab, "Lab", "flask"), (.tickets, "Tickets", "ticket"),
        (.tutoring, "Tutoring", "person.2"), (.transport, "Rides", "car")
    ]
    private var prompt: String {
        switch intent {
        case .find: "I’m looking for…"
        case .offer: "I have something to offer…"
        case .trade: "I’d like to trade…"
        }
    }
    private var placeholder: String {
        switch category {
        case .books: "A Calculus textbook"
        case .dorm: "A desk for a tiny dorm"
        case .lab: "Goggles for chemistry lab"
        case .tickets: "A ticket for game day"
        case .tutoring: "A little help with Calculus"
        case .transport: "A ride home this weekend"
        default: "A textbook, a ride, a little help…"
        }
    }
    private var buttonTitle: String {
        switch intent {
        case .find: "Find my next thing"
        case .offer: "Create my offer"
        case .trade: "Build my trade"
        }
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top, spacing: 8) {
                VStack(alignment: .leading, spacing: 5) {
                    Eyebrow(text: "THE CAMPUS SWITCHBOARD")
                    Text("What’s your next move?")
                        .font(RelayTheme.heading(24)).tracking(-0.7)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
                Image(systemName: intent.symbol)
                    .font(.system(size: 18, weight: .medium))
                    .contentTransition(.symbolEffect(.replace))
                    .frame(width: 42, height: 42).background(RelayTheme.lime, in: Circle())
                    .accessibilityHidden(true)
            }
            intentPicker
            VStack(alignment: .leading, spacing: 7) {
                Text(prompt).font(.caption.weight(.medium)).foregroundStyle(RelayTheme.secondary)
                TextField(placeholder, text: $text)
                    .font(.subheadline).submitLabel(.go).focused($inputFocused)
                    .accessibilityLabel(prompt).accessibilityIdentifier("campus-move-input")
                    .onSubmit(submit)
                    .padding(.horizontal, 14).frame(minHeight: 48)
                    .background(RelayTheme.surface, in: RoundedRectangle(cornerRadius: 15))
            }
            ScrollView(.horizontal) {
                HStack(spacing: 7) {
                    ForEach(topics, id: \.0) { topic in
                        Button {
                            withAnimation(reduceMotion ? nil : .snappy) {
                                category = category == topic.0 ? .all : topic.0
                            }
                        } label: {
                            Label(topic.1, systemImage: topic.2)
                                .font(.caption.weight(.medium))
                                .padding(.horizontal, 12).frame(minHeight: 44)
                                .background(category == topic.0 ? RelayTheme.lime : RelayTheme.surface.opacity(0.65), in: Capsule())
                                .overlay(Capsule().strokeBorder(category == topic.0 ? RelayTheme.accent.opacity(0.5) : .clear))
                        }.buttonStyle(.plain)
                            .accessibilityLabel(topic.0.rawValue)
                            .accessibilityAddTraits(category == topic.0 ? .isSelected : [])
                            .accessibilityIdentifier("campus-topic-\(topic.0.id)")
                    }
                }
            }.scrollIndicators(.hidden)
            Button(action: submit) {
                HStack {
                    Text(buttonTitle)
                    Spacer()
                    Image(systemName: "arrow.up.right")
                }
            }.buttonStyle(RelayPrimaryButton()).accessibilityIdentifier("campus-move-submit")
            HStack(spacing: 5) {
                Image(systemName: "arrow.triangle.branch")
                Text("Things, skills, and a way to get there.")
            }.font(.caption2).foregroundStyle(RelayTheme.secondary)
        }.foregroundStyle(RelayTheme.heroInk).padding(20)
            .background(RelayTheme.soft, in: RoundedRectangle(cornerRadius: 28))
            .accessibilityIdentifier("campus-switchboard")
    }
    private var intentPicker: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 4) { intentButtons }
            VStack(spacing: 4) { intentButtons }
        }.padding(4).background(RelayTheme.surface.opacity(0.7), in: RoundedRectangle(cornerRadius: 17))
    }
    private var intentButtons: some View {
        ForEach(CampusIntent.allCases) { option in
            Button {
                withAnimation(reduceMotion ? nil : .spring(response: 0.35, dampingFraction: 0.8)) { intent = option }
            } label: {
                Label(option.rawValue, systemImage: option.symbol)
                    .font(.subheadline.weight(.semibold)).fixedSize()
                    .frame(maxWidth: .infinity).frame(minHeight: 44).padding(.horizontal, 9)
                    .foregroundStyle(intent == option ? RelayTheme.onForest : RelayTheme.secondary)
                    .background {
                        if intent == option {
                            RoundedRectangle(cornerRadius: 13).fill(RelayTheme.forest)
                                .matchedGeometryEffect(id: "campus-intent", in: selection)
                        }
                    }
            }.buttonStyle(.plain).accessibilityAddTraits(intent == option ? .isSelected : [])
                .accessibilityIdentifier("campus-intent-\(option.rawValue)")
        }
    }
    private func submit() {
        inputFocused = false
        action(CampusMoveDraft(intent: intent, category: category, text: text.trimmingCharacters(in: .whitespacesAndNewlines)))
    }
}

struct CampusFindView: View {
    @Environment(RelayStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    let draft: CampusMoveDraft
    @State private var selected: Listing?
    @State private var showRequest = false
    private var matches: [Listing] {
        var query = ListingQuery()
        query.campus = store.campus; query.category = draft.category; query.text = draft.text
        query.includeOtherCampuses = store.snapshot.includeOtherCampuses
        return query.apply(to: store.listings)
    }
    private var offers: [CampusRequest] {
        store.campusRequests.filter {
            $0.postIntent != .find && (draft.category == .all || $0.category == draft.category) &&
            (draft.text.isEmpty || "\($0.title) \($0.category.rawValue) \($0.details ?? "")".localizedCaseInsensitiveContains(draft.text))
        }
    }
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    SectionTitle(eyebrow: "\(store.campus.shortName) · SAMPLE CONNECTIONS", title: "Let’s see what’s around.")
                    if !draft.text.isEmpty { Text("Looking for “\(draft.text)”").font(.subheadline).foregroundStyle(RelayTheme.secondary) }
                    if draft.category != .all { Label(draft.category.rawValue, systemImage: draft.category.symbol).font(.caption).foregroundStyle(RelayTheme.secondary) }
                    if matches.isEmpty && offers.isEmpty {
                        VStack(alignment: .leading, spacing: 12) {
                            RoundIcon(symbol: "bubble.left.and.bubble.right", size: 58)
                            Text("Be the first to ask.").font(RelayTheme.heading(23))
                            Text("No matches here yet. Put an ask on the campus board with your budget or preferred time.")
                                .font(.subheadline).foregroundStyle(RelayTheme.secondary).lineSpacing(4)
                        }.padding(20).frame(maxWidth: .infinity, alignment: .leading)
                            .background(RelayTheme.soft, in: RoundedRectangle(cornerRadius: 23))
                    }
                    ForEach(matches) { listing in
                        Button { selected = listing } label: {
                            HStack(spacing: 14) {
                                ListingImage(name: listing.imageName).frame(width: 74, height: 80).clipped().clipShape(RoundedRectangle(cornerRadius: 14))
                                VStack(alignment: .leading, spacing: 6) {
                                    Text(listing.title).font(.subheadline.weight(.semibold))
                                    Text("\(listing.price) · \(listing.campus.shortName)").font(.caption).foregroundStyle(RelayTheme.secondary)
                                }
                                Spacer(minLength: 0)
                                Image(systemName: "arrow.up.right").font(.caption)
                            }.padding(12).background(RelayTheme.surface, in: RoundedRectangle(cornerRadius: 20))
                        }.buttonStyle(.plain)
                    }
                    ForEach(offers) { offer in
                        VStack(alignment: .leading, spacing: 8) {
                            Label(offer.postIntent.rawValue, systemImage: offer.postIntent.symbol).font(.caption).foregroundStyle(RelayTheme.secondary)
                            Text(offer.title).font(.subheadline.weight(.semibold))
                            Text(offer.summary).font(.caption).foregroundStyle(RelayTheme.secondary)
                            Button("See campus board") { store.selectedTab = .campus; dismiss() }.font(.caption.weight(.semibold)).frame(minHeight: 44)
                        }.padding(18).frame(maxWidth: .infinity, alignment: .leading).background(RelayTheme.surface, in: RoundedRectangle(cornerRadius: 20))
                    }
                    if !matches.isEmpty || !offers.isEmpty {
                        Text("\(matches.count + offers.count) sample \(matches.count + offers.count == 1 ? "connection" : "connections"). Need something different?")
                            .font(.caption).foregroundStyle(RelayTheme.secondary)
                    }
                    Button { showRequest = true } label: { Label("Ask your campus", systemImage: "plus.bubble") }
                        .buttonStyle(RelayPrimaryButton()).accessibilityIdentifier("campus-find-ask")
                }.foregroundStyle(RelayTheme.ink).padding(22)
            }.background(RelayTheme.paper).navigationTitle("Your next move").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
                .sheet(item: $selected) { ListingDetailView(listing: $0) }
                .sheet(isPresented: $showRequest, onDismiss: { if store.selectedTab == .campus { dismiss() } }) {
                    RequestEditorView(title: draft.text, category: draft.category)
                }
        }.presentationDragIndicator(.visible)
    }
}
struct ListingCard: View {
    @Environment(RelayStore.self) private var store
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let listing: Listing
    let open: () -> Void
    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            ZStack(alignment: .topTrailing) {
                Button(action: open) {
                    GeometryReader { geometry in
                        ListingImage(name: listing.imageName).frame(width: geometry.size.width, height: geometry.size.height).clipped()
                    }.frame(height: 180).clipShape(RoundedRectangle(cornerRadius: 20))
                }.accessibilityLabel("View \(listing.title)")
                Button { withAnimation(reduceMotion ? nil : .spring(response: 0.3, dampingFraction: 0.5)) { store.toggleSaved(listing) } } label: {
                    Image(systemName: store.isSaved(listing) ? "heart.fill" : "heart")
                        .font(.system(size: 15, weight: .medium)).foregroundStyle(store.isSaved(listing) ? .red : RelayTheme.forest)
                        .frame(width: 44, height: 44).background(.regularMaterial, in: Circle())
                }.padding(7).accessibilityLabel("\(store.isSaved(listing) ? "Unsave" : "Save") \(listing.title)")
                    .accessibilityAddTraits(store.isSaved(listing) ? .isSelected : [])
            }
            Text(listing.category.rawValue).font(.caption2).foregroundStyle(RelayTheme.secondary)
            Button(action: open) {
                Text(listing.title).font(.system(.subheadline, weight: .medium)).foregroundStyle(RelayTheme.ink)
                    .multilineTextAlignment(.leading).lineLimit(2).frame(maxWidth: .infinity, minHeight: 40, alignment: .topLeading)
            }
            HStack(alignment: .firstTextBaseline, spacing: 5) {
                Text(listing.price).font(.system(.title3, design: .rounded, weight: .semibold)).foregroundStyle(RelayTheme.ink)
                if let original = listing.originalPrice { Text(original).font(.caption2).strikethrough().foregroundStyle(RelayTheme.secondary) }
            }
            HStack(spacing: 4) {
                Circle().fill(RelayTheme.accent).frame(width: 4, height: 4)
                Text(listing.condition).font(.caption2)
                Spacer(minLength: 0)
                Text(listing.campus.shortName).font(.caption2.weight(.medium))
            }.foregroundStyle(RelayTheme.secondary)
        }
    }
}
