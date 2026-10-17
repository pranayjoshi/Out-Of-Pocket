import SwiftUI
import PhotosUI
import RelayCore

struct ProfileView: View {
    @Environment(RelayStore.self) private var store
    @State private var showSafety = false
    @State private var showSaved = false
    @State private var showCreate = false
    @State private var showSignIn = false
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 26) {
                VStack(alignment: .leading, spacing: 17) {
                    Text(String((store.account?.displayName ?? "You").prefix(1))).font(.system(.largeTitle, weight: .bold)).frame(width: 76, height: 84).background(RelayTheme.lavender, in: RoundedRectangle(cornerRadius: 26))
                    SectionTitle(eyebrow: store.campus.name, title: store.account?.displayName ?? "Make yourself at home.")
                    Text("Your saves, your posts, your semester.").font(.subheadline).foregroundStyle(RelayTheme.secondary).lineSpacing(4)
                }
                HStack(spacing: 10) {
                    stat("Saved finds", "\(store.snapshot.savedListingIDs.count)", "heart")
                    stat("Classes", "\(store.courseCodes.count)", "graduationcap")
                    stat("Conversations", "\(store.conversations.count)", "bubble.left.and.bubble.right")
                }
                VStack(spacing: 0) {
                    NavigationLink { ScheduleView() } label: { profileRow("Your classes", "Import a schedule. Find what fits.", "calendar") }
                    Divider().padding(.leading, 59)
                    Button { showSaved = true } label: { profileRow("Your saved finds", "Worth coming back for.", "heart") }
                    Divider().padding(.leading, 59)
                    Button { showCreate = true } label: { profileRow("Create a post", "Tutor, sell a ticket, or offer a ride.", "plus.circle") }
                    Divider().padding(.leading, 59)
                    NavigationLink { MyPostsView() } label: { profileRow("My posts", "Manage what you’re sharing.", "square.and.pencil") }
                    Divider().padding(.leading, 59)
                    Button { showSafety = true } label: { profileRow("Safety & how it works", "Meet thoughtfully. Know the next step.", "checkmark.shield") }
                }.background(RelayTheme.surface, in: RoundedRectangle(cornerRadius: 23))
                VStack(alignment: .leading, spacing: 20) {
                    Eyebrow(text: "YOUR COMMUNITY")
                    Picker("Your campus", selection: Binding(get: { store.campus }, set: { store.selectCampus($0) })) {
                        ForEach(Campus.allCases) { Text($0.name).tag($0) }
                    }.font(.subheadline).tint(RelayTheme.forest)
                    Divider()
                    Toggle(isOn: Binding(get: { store.snapshot.includeOtherCampuses }, set: { store.setCrossCampus($0) })) {
                        VStack(alignment: .leading, spacing: 5) {
                            Text("Beyond campus").font(.subheadline.weight(.medium))
                            Text("Include marketplace finds from other schools.").font(.caption).foregroundStyle(RelayTheme.secondary)
                        }
                    }.tint(RelayTheme.forest)
                }.padding(21).background(RelayTheme.surface, in: RoundedRectangle(cornerRadius: 23))
                VStack(alignment: .leading, spacing: 13) {
                    Label("Made for your pace", systemImage: "hand.raised").font(.subheadline.weight(.semibold))
                    Text("Relay follows your device’s light and dark appearance, Dynamic Type, and Reduce Motion settings. Listing photos stay on this device. Schedule screenshots are sent for AI processing only when you allow it.")
                        .font(.caption).foregroundStyle(RelayTheme.secondary).lineSpacing(4)
                }.padding(21).background(RelayTheme.soft, in: RoundedRectangle(cornerRadius: 23))
                if let account = store.account {
                    DemoNotice(text: "Signed in as \(account.displayName). \(account.badge) The campus picker above is a browsing preference and does not change this membership.")
                    Button("Sign out") { store.signOut() }.buttonStyle(RelayPrimaryButton())
                } else {
                    Button("Sign in with your university email") { showSignIn = true }.buttonStyle(RelayPrimaryButton())
                    DemoNotice(text: "Unsigned, this app keeps a local sample catalog. Sign in to see the shared campus marketplace. Payments in the pilot are sandbox only.")
                }
                HStack { Spacer(); RelayWordmark(); Spacer() }.padding(.top, 5)
                Text("Your campus. A little closer.").font(.caption).foregroundStyle(RelayTheme.secondary).frame(maxWidth: .infinity)
            }.foregroundStyle(RelayTheme.ink).padding(22).padding(.bottom, 25).relayEntrance()
        }.background(RelayTheme.paper).navigationTitle("You").navigationBarTitleDisplayMode(.inline)
            .navigationDestination(isPresented: $showSaved) { SavedFindsView() }
            .sheet(isPresented: $showSafety) { SafetyView() }
            .sheet(isPresented: $showCreate) { CreateChoiceSheet() }
            .sheet(isPresented: $showSignIn) { SignInSheet() }
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
                SectionTitle(eyebrow: "YOUR COLLECTION", title: "Keep the good ones close.")
                if listings.isEmpty {
                    EmptyContent(symbol: "heart", title: "Your next favorite is out there.", message: "Tap a heart on a listing to keep it here.", actionTitle: "Explore campus finds") { store.explore(.market) }
                } else {
                    ForEach(listings.filter { $0.category == .tutoring }) { tutor in
                        Button { selected = tutor } label: { TutorRow(listing: tutor) }.buttonStyle(RelayPressStyle())
                    }
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 14), count: typeSize.isAccessibilitySize ? 1 : 2), spacing: 24) {
                        ForEach(listings.filter { $0.category != .tutoring }) { listing in ListingCard(listing: listing) { selected = listing } }
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

private struct ScheduleImportResult: Decodable {
    var courses: [String]?
    var unmatched: [String]?
    var error: String?
}
struct ScheduleView: View {
    @Environment(RelayStore.self) private var store
    @State private var draft: Set<String> = []
    @State private var photo: PhotosPickerItem?
    @State private var imageData: Data?
    @State private var consent = false
    @State private var busy = false
    @State private var message = ""
    @State private var unmatched: [String] = []
    @State private var importTask: Task<Void, Never>?
    @State private var editingCampus: Campus = .alabama
    var body: some View {
        Form {
            Section {
                Text("Add classes at \(editingCampus.name) to personalize your finds. Review detected classes before saving.")
                PhotosPicker("Choose schedule screenshot", selection: $photo, matching: .images).disabled(busy)
                if imageData != nil { Label("Screenshot ready", systemImage: "checkmark.circle") }
                Toggle("Allow sending this screenshot to OpenRouter and its model provider", isOn: $consent).disabled(busy)
                Text("Crop out personal details first. Relay does not save this image. Only confirmed class codes stay on your device. Provider data policies apply to the uploaded image.").font(.caption).foregroundStyle(.secondary)
                Button(busy ? "Reading schedule…" : "Read screenshot") {
                    importTask = Task { await readSchedule() }
                }.disabled(busy || imageData == nil || !consent)
                if busy { ProgressView() }
                if !message.isEmpty { Text(message).font(.subheadline).accessibilityIdentifier("schedule-status") }
                if !unmatched.isEmpty { Text("Outside this starter catalog: " + unmatched.joined(separator: ", ")).font(.caption) }
            } header: { Text("Your semester, sorted") }
            Section("Review classes · starter catalog") {
                ForEach(UniversityCourse.courses(for: editingCampus)) { course in
                    Toggle(isOn: Binding(get: { draft.contains(course.code) }, set: { if $0 { draft.insert(course.code) } else { draft.remove(course.code) } })) {
                        VStack(alignment: .leading) { Text(course.code).font(.subheadline.weight(.semibold)); Text(course.title).font(.caption) }
                    }.disabled(busy)
                }
                Button("Save classes") { store.saveCourses(Array(draft), for: editingCampus); message = "Classes saved. Your For you finds now use these classes." }.disabled(busy)
                Button("Clear classes", role: .destructive) { draft = []; store.saveCourses([], for: editingCampus); imageData = nil; consent = false; message = "Saved classes removed." }.disabled(busy)
            }
            Section { Text("Suggestions use course tags and listing keywords. Check your syllabus for required books, editions and supplies.").font(.caption) }
        }.navigationTitle("Your classes").tint(RelayTheme.forest)
            .onAppear { editingCampus = store.campus; draft = Set(store.courseCodes) }
            .onDisappear { importTask?.cancel(); imageData = nil }
            .task(id: photo) {
                imageData = nil; consent = false
                guard let photo else { return }
                do {
                    guard let data = try await photo.loadTransferable(type: Data.self), data.count <= 25 * 1024 * 1024,
                          let image = UIImage(data: data), let jpeg = image.jpegData(compressionQuality: 0.75), jpeg.count <= 5 * 1024 * 1024 else {
                        message = "Choose an image that can fit within 5 MB."; return
                    }
                    guard !Task.isCancelled else { return }
                    imageData = jpeg; message = "Screenshot ready. Allow processing to read it."
                } catch { message = "Could not open that screenshot." }
            }
    }
    @MainActor private func readSchedule() async {
        guard let imageData, consent else { return }
        let configured = ProcessInfo.processInfo.environment["RELAY_SCHEDULE_URL"] ?? Bundle.main.object(forInfoDictionaryKey: "RelayScheduleURL") as? String
        #if targetEnvironment(simulator)
        let address = configured ?? "http://127.0.0.1:5174/api/schedule/import"
        #else
        guard let address = configured else { message = "Connect an HTTPS schedule service using RelayScheduleURL. You can choose classes manually."; return }
        #endif
        guard let url = URL(string: address), url.scheme == "https" || (url.scheme == "http" && ["localhost", "127.0.0.1"].contains(url.host ?? "")) else { message = "Configure a valid schedule service URL."; return }
        busy = true; message = ""; unmatched = []
        defer { busy = false }
        do {
            var request = URLRequest(url: url, timeoutInterval: 55)
            request.httpMethod = "POST"; request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: ["campus": editingCampus.rawValue, "consent": true, "image": "data:image/jpeg;base64," + imageData.base64EncodedString()])
            let (data, response) = try await URLSession.shared.data(for: request)
            guard !Task.isCancelled else { return }
            let result = try JSONDecoder().decode(ScheduleImportResult.self, from: data)
            guard (response as? HTTPURLResponse)?.statusCode == 200, let codes = result.courses else { message = result.error ?? "Could not read this schedule."; return }
            let allowed = Set(UniversityCourse.courses(for: editingCampus).map(\.code))
            draft = Set(codes).intersection(allowed); unmatched = result.unmatched ?? []
            self.imageData = nil; consent = false
            message = draft.isEmpty ? "No supported classes found. Choose from the list below." : "Review the detected classes below, then save."
        } catch { if !Task.isCancelled { message = "Schedule service unavailable. Try again or choose classes manually." } }
    }
}

private struct SignInSheet: View {
    @Environment(RelayStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var email = ""
    @State private var code = ""
    @State private var preview: String?
    @State private var codeSent = false
    @State private var message = "Use an approved university address, such as name@ua.edu or name@auburn.edu."
    @State private var busy = false
    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 16) {
                Text(message).font(.subheadline).foregroundStyle(RelayTheme.secondary)
                TextField("University email", text: $email).textContentType(.emailAddress).keyboardType(.emailAddress).textInputAutocapitalization(.never).autocorrectionDisabled()
                    .padding(14).background(RelayTheme.soft, in: RoundedRectangle(cornerRadius: 14))
                if codeSent {
                    TextField("6-digit code", text: $code).keyboardType(.numberPad)
                        .padding(14).background(RelayTheme.soft, in: RoundedRectangle(cornerRadius: 14))
                    if let preview { Text("Local preview code: \(preview)").font(.caption).foregroundStyle(RelayTheme.secondary) }
                }
                Button(codeSent ? "Verify" : "Email a code") { submit() }
                    .buttonStyle(RelayPrimaryButton()).disabled(busy || email.isEmpty || (codeSent && code.count < 6))
                Spacer()
            }.padding(22).background(RelayTheme.paper)
                .navigationTitle("Sign in").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } } }
        }
    }
    private func submit() {
        busy = true
        Task {
            defer { busy = false }
            do {
                let address = email.trimmingCharacters(in: .whitespacesAndNewlines)
                if !codeSent {
                    preview = try await store.requestCode(email: address)
                    codeSent = true
                    message = "Enter the code. On this computer it also appears here when the app is talking to localhost."
                } else {
                    try await store.verifyCode(email: address, code: code)
                    dismiss()
                }
            } catch { message = error.localizedDescription }
        }
    }
}
