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

    private var results: [Listing] {
        var query = ListingQuery()
        query.campus = store.campus; query.category = category; query.text = search
        query.includeOtherCampuses = store.snapshot.includeOtherCampuses; query.freeOnly = freeOnly; query.sort = sort
        return query.apply(to: store.listings)
    }
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                greeting
                if search.isEmpty && category == .all && !freeOnly {
                    CampusHero {
                        category = .dorm
                    }
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
                    categoryPicker
                    if results.isEmpty {
                        EmptyContent(symbol: "sparkle.magnifyingglass", title: "Let’s find another way.", message: "Try another search or tell your campus what you need.", actionTitle: "Ask your campus") { showRequest = true }
                    } else {
                        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 14), count: typeSize.isAccessibilitySize ? 1 : 2), alignment: .leading, spacing: 24) {
                            ForEach(results) { listing in
                                ListingCard(listing: listing) { selected = listing }
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
                    SponsorNudge()
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
        .task { withAnimation(reduceMotion ? nil : .easeOut(duration: 0.55)) { appeared = true } }
    }
    private var greeting: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Find your next chapter.")
                .font(RelayTheme.heading(28)).tracking(-0.9).foregroundStyle(RelayTheme.ink)
            Text("Pre-loved. Re-loved. Right around you.")
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
                        Text("\(request.person) · Under \(Money.format(request.budgetCents))").font(.caption).foregroundStyle(RelayTheme.secondary)
                    }
                    Spacer(minLength: 0)
                    Button { showCreate = true } label: { Image(systemName: "arrow.up.right").frame(width: 44, height: 44) }
                        .accessibilityLabel("Respond to \(request.title)")
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

struct CampusHero: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.dynamicTypeSize) private var typeSize
    @State private var float = false
    var action: () -> Void
    var body: some View {
        VStack(alignment: .leading, spacing: 15) {
            if typeSize.isAccessibilitySize {
                copy
                art.frame(maxWidth: .infinity).frame(height: 205)
            } else {
                HStack(spacing: 0) {
                    copy.frame(maxWidth: .infinity, alignment: .leading).layoutPriority(1)
                    art.frame(width: 145, height: 160)
                }
            }
        }.padding(22).background(RelayTheme.soft, in: RoundedRectangle(cornerRadius: 28))
        .task(id: reduceMotion) {
            withAnimation(nil) { float = false }
            guard !reduceMotion else { return }
            withAnimation(.easeInOut(duration: 4).repeatForever(autoreverses: true)) { float = true }
        }
    }
    private var copy: some View {
        VStack(alignment: .leading, spacing: 15) {
            Text("Good things.\nSecond stories.")
                .font(RelayTheme.heading(25)).tracking(-0.9).foregroundStyle(RelayTheme.heroInk)
                .fixedSize(horizontal: false, vertical: true)
            Text("Their favorite corner.\nYour new beginning.").font(.caption).foregroundStyle(RelayTheme.secondary).lineSpacing(3)
            Button(action: action) {
                HStack(spacing: 8) { Text("Find your thing").font(.caption.weight(.semibold)); Image(systemName: "arrow.up.right").font(.caption) }
                    .padding(.horizontal, 13).frame(minHeight: 44)
                    .foregroundStyle(RelayTheme.onForest).background(RelayTheme.forest, in: Capsule())
            }.accessibilityLabel("Explore dorm and living finds")
        }
    }
    private var art: some View {
        ZStack {
            Circle().stroke(RelayTheme.accent.opacity(0.18), lineWidth: 1).frame(width: 168, height: 168)
            Polaroid(image: "lamp", caption: "Late-night companion", price: "$18")
                .frame(width: 96, height: 131).rotationEffect(.degrees(12)).offset(x: 34, y: float ? -27 : -22)
            Polaroid(image: "chair", caption: "Someone’s favorite. Yours next.", price: "$45")
                .frame(width: 114, height: 156).rotationEffect(.degrees(-9)).offset(x: -10, y: float ? 21 : 16)
            Image(systemName: "arrow.left.arrow.right").font(.system(size: 17, weight: .semibold))
                .foregroundStyle(RelayTheme.heroInk).frame(width: 45, height: 45).background(RelayTheme.lime, in: Circle())
                .rotationEffect(.degrees(-13)).offset(x: -42, y: -63)
        }.accessibilityHidden(true)
    }
}
struct Polaroid: View {
    let image: String
    let caption: String
    let price: String
    var body: some View {
        GeometryReader { geometry in
            VStack(alignment: .leading, spacing: 7) {
                ListingImage(name: image).frame(width: geometry.size.width - 12, height: geometry.size.height - 43).clipped()
                HStack(alignment: .top, spacing: 2) {
                    Text(caption).font(.system(size: 6.5, weight: .medium)).lineLimit(2)
                    Spacer(minLength: 0)
                    Text(price).font(.system(size: 7, weight: .semibold))
                }.foregroundStyle(Color(red: 0.22, green: 0.29, blue: 0.19))
            }.padding(6).frame(width: geometry.size.width, height: geometry.size.height, alignment: .top)
                .background(Color(red: 0.99, green: 0.99, blue: 0.96))
                .shadow(color: .black.opacity(0.09), radius: 12, x: 0, y: 7)
        }
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
struct SponsorNudge: View {
    @State private var showSponsor = false
    var body: some View {
        Button { showSponsor = true } label: {
            VStack(alignment: .leading, spacing: 16) {
                Eyebrow(text: "SPONSORED · SAMPLE CAMPAIGN")
                HStack {
                    Text("Good finds.\nGreat coffee.").font(RelayTheme.heading(30)).tracking(-1)
                    Spacer()
                    Image(systemName: "cup.and.saucer").font(.system(size: 47, weight: .light)).rotationEffect(.degrees(12))
                }
                Text("A little local love for your next exchange.").font(.subheadline).foregroundStyle(RelayTheme.secondary)
                HStack { Text("Meet the campus partner idea").font(.caption.weight(.medium)); Spacer(); Image(systemName: "arrow.up.right") }
            }.foregroundStyle(RelayTheme.ink).padding(24).background(RelayTheme.peach, in: RoundedRectangle(cornerRadius: 26))
        }.buttonStyle(.plain)
            .sheet(isPresented: $showSponsor) { EventDetailView(event: DemoCatalog.events[2]) }
    }
}
