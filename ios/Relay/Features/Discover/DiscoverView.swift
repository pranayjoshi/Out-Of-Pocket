import SwiftUI
import RelayCore

struct DiscoverView: View {
    @Environment(RelayStore.self) private var store
    @Environment(\.dynamicTypeSize) private var typeSize
    @State private var showCreate = false
    @State private var showRequest = false
    @State private var selected: Listing?
    private var tutors: [Listing] { store.listings.filter { $0.campus == store.campus && $0.category == .tutoring } }
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 28) {
                VStack(alignment: .leading, spacing: 13) {
                    Eyebrow(text: "YOUR CAMPUS, CONNECTED")
                    Text("Campus life,\nhandled.").font(.system(.largeTitle, weight: .bold)).tracking(-1.5)
                    Text("A little help. A way there. A reason to go.")
                        .font(.subheadline).foregroundStyle(RelayTheme.secondary)
                }.accessibilityIdentifier("discovery-intro").relayEntrance()
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 10), count: typeSize.isAccessibilitySize ? 1 : 3), spacing: 10) {
                    ForEach(Array(CampusService.allCases.prefix(3).enumerated()), id: \.element.id) { index, service in
                        Button { store.explore(service) } label: {
                            VStack(alignment: .leading, spacing: 19) {
                                HStack {
                                    Image(systemName: service.symbol).font(.system(size: 24, weight: .medium)).frame(height: 28)
                                    Spacer(minLength: 0)
                                    Image(systemName: "arrow.up.right").font(.caption2.weight(.semibold))
                                }
                                VStack(alignment: .leading, spacing: 5) {
                                    Text(service.rawValue).font(.subheadline.weight(.bold))
                                    Text(service.subtitle).font(.caption2)
                                }
                            }.foregroundStyle(RelayTheme.heroInk).padding(15)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .background(service.color, in: RoundedRectangle(cornerRadius: 23))
                        }.buttonStyle(RelayPressStyle()).accessibilityIdentifier("home-\(service.rawValue)").relayEntrance(index + 1)
                    }
                }
                spotlight.relayEntrance(3)
                Button {
                    if store.unreadMessageCount > 0 { store.inboxPane = "messages"; store.selectedTab = .exchanges }
                    else { store.openActivity() }
                } label: {
                HStack(alignment: .center, spacing: 14) {
                    RoundIcon(symbol: "bubble.left.and.bubble.right.fill", size: 46)
                    VStack(alignment: .leading, spacing: 5) {
                        Text(store.unreadMessageCount > 0 ? "\(store.unreadMessageCount) unread messages" : "Everything you’re arranging")
                            .font(.subheadline.weight(.semibold))
                        Text(store.unreadMessageCount > 0 ? "Your campus conversations are waiting." : "Messages, ticket orders, and ride requests.").font(.caption).foregroundStyle(RelayTheme.secondary)
                    }
                    Spacer(minLength: 0)
                    Image(systemName: "chevron.right").font(.caption.weight(.semibold))
                }.relayCard()
                }.buttonStyle(RelayPressStyle()).foregroundStyle(RelayTheme.ink)
                    .accessibilityIdentifier("home-activity").relayEntrance(4)
                VStack(alignment: .leading, spacing: 16) {
                    sectionHeader("A little help goes a long way", action: "Tutors") { store.explore(.tutoring) }
                    if let tutor = tutors.first {
                        Button { selected = tutor } label: { TutorRow(listing: tutor) }.buttonStyle(RelayPressStyle())
                    } else {
                        Button { showRequest = true } label: {
                            Label("Ask your campus for study help", systemImage: "graduationcap").frame(maxWidth: .infinity, minHeight: 56)
                        }.buttonStyle(RelayPrimaryButton(secondary: true))
                    }
                    NavigationLink { ScheduleView() } label: {
                        HStack {
                            Image(systemName: "calendar").frame(width: 26)
                            VStack(alignment: .leading, spacing: 4) {
                                Text(store.courseCodes.isEmpty ? "Make it your semester" : "Your classes, in one place").font(.subheadline.weight(.semibold))
                                Text(store.courseCodes.isEmpty ? "Add your classes for relevant finds." : store.courseCodes.joined(separator: " · ")).font(.caption).foregroundStyle(RelayTheme.secondary)
                            }
                            Spacer(); Image(systemName: "arrow.right").font(.caption)
                        }.foregroundStyle(RelayTheme.ink).padding(.vertical, 8)
                    }
                }.relayEntrance(5)
                Button { store.explore(.market) } label: {
                    HStack(spacing: 15) {
                        Image(systemName: "bag.fill").font(.title2).frame(width: 52, height: 58).background(RelayTheme.soft, in: RoundedRectangle(cornerRadius: 18))
                        VStack(alignment: .leading, spacing: 5) {
                            Text("The campus marketplace").font(.subheadline.weight(.semibold))
                            Text("Books, dorm finds, and second chances.").font(.caption).foregroundStyle(RelayTheme.secondary)
                        }
                        Spacer(minLength: 0); Image(systemName: "arrow.up.right").font(.subheadline)
                    }.foregroundStyle(RelayTheme.ink).relayCard()
                }.buttonStyle(RelayPressStyle())
                CampusPromotionPlacement(placement: "Discover")
                Text("Made for the in-between, and everything after.").font(.caption).foregroundStyle(RelayTheme.secondary).frame(maxWidth: .infinity)
            }.foregroundStyle(RelayTheme.ink).padding(22).padding(.bottom, 18)
        }.background(RelayTheme.paper).navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { RelayWordmark().fixedSize() }
                ToolbarItemGroup(placement: .topBarTrailing) {
                    Menu {
                        ForEach(Campus.allCases) { campus in
                            Button { store.selectCampus(campus) } label: {
                                if store.campus == campus { Label(campus.name, systemImage: "checkmark") }
                                else { Text(campus.name) }
                            }
                        }
                    } label: {
                        HStack(spacing: 5) { Image(systemName: "mappin.circle.fill"); Text(store.campus.shortName) }.font(.subheadline.weight(.semibold)).fixedSize()
                    }.accessibilityLabel("Select campus, currently \(store.campus.name)")
                    Button { showCreate = true } label: { Image(systemName: "plus").font(.headline).frame(width: 38, height: 38).background(RelayTheme.forest, in: Circle()).foregroundStyle(RelayTheme.onForest) }
                        .accessibilityLabel("Create a post")
                }
            }
            .sheet(isPresented: $showCreate) { CreateChoiceSheet() }
            .sheet(isPresented: $showRequest) { RequestEditorView(category: .tutoring) }
            .sheet(item: $selected) { ListingDetailView(listing: $0) }
    }
    private var spotlight: some View {
        Button { store.explore(.tickets) } label: {
            HStack(alignment: .center, spacing: 10) {
                VStack(alignment: .leading, spacing: 14) {
                    Text("OUT OF THE GROUP CHAT").font(.system(.caption2, weight: .bold)).tracking(1.3)
                    Text("Be there for\nthe good stuff.").font(.system(.title, weight: .bold)).tracking(-0.8).multilineTextAlignment(.leading)
                    Label("Find your next ticket", systemImage: "arrow.right").font(.caption.weight(.semibold))
                }.frame(maxWidth: .infinity, alignment: .leading)
                Image(systemName: "ticket.fill").font(.system(size: 66, weight: .regular))
                    .rotationEffect(.degrees(-28)).foregroundStyle(Color(red: 0.84, green: 0.87, blue: 1))
                    .frame(width: 85).accessibilityHidden(true)
            }.padding(23).foregroundStyle(.white)
                .background(Color(red: 0.20, green: 0.23, blue: 0.50).gradient, in: RoundedRectangle(cornerRadius: 28))
        }.buttonStyle(RelayPressStyle()).accessibilityIdentifier("home-ticket-spotlight")
    }
    private func sectionHeader(_ title: String, action: String, onTap: @escaping () -> Void) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            Text(title).font(.title3.weight(.bold)).tracking(-0.5)
            Spacer(minLength: 0)
            Button(action, action: onTap).font(.caption.weight(.semibold))
        }
    }
}

struct TutorRow: View {
    let listing: Listing
    var body: some View {
        HStack(alignment: .top, spacing: 15) {
            Text(listing.initials).font(.title2.weight(.semibold)).frame(width: 62, height: 72)
                .background(RelayTheme.lavender, in: RoundedRectangle(cornerRadius: 20))
            VStack(alignment: .leading, spacing: 7) {
                HStack {
                    Text(listing.seller).font(.subheadline.weight(.bold))
                    Spacer(minLength: 0)
                    Text("\(listing.price)/hr").font(.subheadline.weight(.bold))
                }
                Text(listing.title).font(.subheadline).fixedSize(horizontal: false, vertical: true)
                Text([listing.courseCode, listing.condition].compactMap { $0 }.joined(separator: " · "))
                    .font(.caption).foregroundStyle(RelayTheme.secondary)
                Text("Sample tutor").font(.caption2).foregroundStyle(RelayTheme.secondary)
            }
        }.foregroundStyle(RelayTheme.ink).frame(maxWidth: .infinity, alignment: .leading).relayCard()
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
            Text(listing.courseCode ?? listing.category.rawValue).font(.caption2).foregroundStyle(RelayTheme.secondary)
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
            if let reason = UniversityCourse.reason(for: listing, campus: store.campus, codes: store.courseCodes) {
                Text(reason).font(.caption2).foregroundStyle(RelayTheme.forest)
            }
        }
    }
}
