import SwiftUI
import PhotosUI
import RelayCore

/// Schedule → what the classes need → the student approves, sets maxes or a budget → trades open.
struct ScheduleTradesSheet: View {
    @Environment(RelayStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    private enum Step { case source, reading, review }
    @State private var step: Step = .source
    @State private var photo: PhotosPickerItem?
    @State private var query = ""
    @State private var picked: Set<String> = []
    @State private var courses: [String] = []
    @State private var excluded: Set<String> = []
    @State private var maxes: [String: String] = [:]
    @State private var budgetText = ""

    private struct Need: Identifiable { let course: String; let material: AgentMaterial; var id: String { course + "|" + material.title } }
    private var needs: [Need] { courses.flatMap { c in BigAl.materials(for: c).map { Need(course: c, material: $0) } } }
    private var chosen: [Need] { needs.filter { !excluded.contains($0.id) } }
    private var budget: Int? { Money.parse(budgetText) }
    private var placeholders: [String: Int] {
        guard let budget else { return [:] }
        let list = chosen
        let split = BigAl.allocate(budgetCents: budget, asking: list.map { BigAl.askingCents(for: $0.material) }, manual: list.map { maxes[$0.id].flatMap(Money.parse) })
        return Dictionary(uniqueKeysWithValues: zip(list.map(\.id), split).compactMap { id, v in v.map { (id, $0) } })
    }

    var body: some View {
        NavigationStack {
            Group {
                switch step {
                case .source: source
                case .reading: reading
                case .review: review
                }
            }
            .background(RelayTheme.paper)
            .foregroundStyle(RelayTheme.ink)
            .tint(RelayTheme.forest)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
        }
        .onChange(of: photo) { _, item in if item != nil { read() } }
    }

    // MARK: step 1, the schedule

    private var source: some View {
        let all = UniversityCourse.courses(for: store.campus)
        let matches = query.isEmpty ? all : all.filter { "\($0.code) \($0.title)".localizedCaseInsensitiveContains(query) }
        return List {
            Section {
                PhotosPicker(selection: $photo, matching: .images) {
                    HStack(spacing: 14) {
                        Image(systemName: "photo.on.rectangle").font(.system(size: 17, weight: .medium)).frame(width: 36, height: 36)
                            .background(RelayTheme.soft, in: RoundedRectangle(cornerRadius: 10))
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Choose a schedule screenshot").font(.body.weight(.medium)).foregroundStyle(RelayTheme.ink)
                            Text("From myBama or Degree Works").font(.footnote).foregroundStyle(RelayTheme.secondary)
                        }
                    }
                }.accessibilityIdentifier("bigal-schedule-photo")
            } header: {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Your classes").font(RelayTheme.heading(24)).tracking(-0.5).foregroundStyle(RelayTheme.ink)
                    Text("Big Al reads your schedule and lists what each class needs. Nothing opens until you approve.")
                        .font(.subheadline).foregroundStyle(RelayTheme.secondary)
                }.textCase(nil).padding(.bottom, 10).padding(.horizontal, -4)
            }.listRowBackground(RelayTheme.surface)
            Section {
                ForEach(matches) { course in
                    Button {
                        if picked.contains(course.code) { picked.remove(course.code) } else { picked.insert(course.code) }
                    } label: {
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(course.code).font(.subheadline.weight(.semibold)).foregroundStyle(RelayTheme.ink)
                                Text(course.title).font(.footnote).foregroundStyle(RelayTheme.secondary)
                            }
                            Spacer()
                            Image(systemName: picked.contains(course.code) ? "checkmark.circle.fill" : "circle")
                                .foregroundStyle(picked.contains(course.code) ? RelayTheme.forest : RelayTheme.line).font(.title3)
                        }.contentShape(Rectangle())
                    }.buttonStyle(.plain)
                }
            } header: { Text("Or pick classes").font(.footnote.weight(.semibold)).textCase(nil) }
                .listRowBackground(RelayTheme.surface)
        }
        .listStyle(.insetGrouped).scrollContentBackground(.hidden)
        .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: "Search \(store.campus.shortName) classes")
        .safeAreaInset(edge: .bottom) {
            if !picked.isEmpty {
                Button("Find materials for \(picked.count) \(picked.count == 1 ? "class" : "classes")") { load(Array(picked).sorted()) }
                    .buttonStyle(RelayPrimaryButton()).padding(.horizontal, 20).padding(.vertical, 10).background(.bar)
            }
        }
    }

    private var reading: some View {
        VStack(spacing: 16) {
            BigAlAvatar(size: 64)
            ProgressView()
            Text("Reading your schedule…").font(.subheadline).foregroundStyle(RelayTheme.secondary)
        }.frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func read() {
        step = .reading
        Task {
            try? await Task.sleep(for: .seconds(1.4))
            // Demo: any schedule reads as the Fall 2026 load.
            load(BigAl.demoSchedule)
        }
    }

    private func load(_ codes: [String]) {
        store.saveCourses(Array(Set(store.courseCodes + codes)), for: store.campus)
        courses = codes
        excluded = []
        withAnimation { step = .review }
    }

    // MARK: step 2, approve

    private var review: some View {
        let asking = chosen.compactMap { BigAl.askingCents(for: $0.material) }.reduce(0, +)
        let floor = Int(Double(asking) * 0.76)
        return List {
            Section {
                VStack(alignment: .leading, spacing: 6) {
                    Text("\(needs.count) items for \(courses.count) classes").font(RelayTheme.heading(24)).tracking(-0.5)
                    Text("Uncheck anything you already have. Big Al stays under each max, or about 86% of asking if you leave it blank.")
                        .font(.subheadline).foregroundStyle(RelayTheme.secondary)
                }.listRowBackground(Color.clear).listRowInsets(EdgeInsets(top: 0, leading: 4, bottom: 4, trailing: 4))
            }
            Section {
                HStack {
                    Text("Total budget").font(.subheadline.weight(.medium))
                    Spacer()
                    DollarField(placeholder: "Optional", text: $budgetText).accessibilityIdentifier("bigal-budget")
                }
                if let budget, budget < floor {
                    Label("Tight. Sellers here usually won’t go below about \(Money.format(floor)) for these.", systemImage: "exclamationmark.triangle")
                        .font(.footnote).foregroundStyle(.orange)
                }
            } footer: {
                if asking > 0 { Text("Asking prices add up to \(Money.format(asking)). A budget splits across items you don’t set yourself.") }
            }.listRowBackground(RelayTheme.surface)
            ForEach(courses, id: \.self) { course in
                Section {
                    ForEach(needs.filter { $0.course == course }) { need in row(need) }
                } header: {
                    Text("\(course) · \(UniversityCourse.courses(for: store.campus).first { $0.code == course }?.title ?? "")")
                        .font(.footnote.weight(.semibold)).textCase(nil)
                }.listRowBackground(RelayTheme.surface)
            }
        }
        .listStyle(.insetGrouped).scrollContentBackground(.hidden)
        .scrollDismissesKeyboard(.interactively)
        .safeAreaInset(edge: .bottom) {
            Button(chosen.isEmpty ? "Choose at least one item" : "Open \(chosen.count) \(chosen.count == 1 ? "trade" : "trades")") { open() }
                .buttonStyle(RelayPrimaryButton()).disabled(chosen.isEmpty).opacity(chosen.isEmpty ? 0.5 : 1)
                .padding(.horizontal, 20).padding(.vertical, 10).background(.bar)
                .accessibilityIdentifier("bigal-open-trades")
        }
    }

    private func row(_ need: Need) -> some View {
        let on = !excluded.contains(need.id)
        let asking = BigAl.askingCents(for: need.material)
        return HStack(spacing: 12) {
            Button {
                if on { excluded.insert(need.id) } else { excluded.remove(need.id) }
            } label: {
                Image(systemName: on ? "checkmark.circle.fill" : "circle").font(.title3).foregroundStyle(on ? RelayTheme.forest : RelayTheme.line)
            }.buttonStyle(.plain).accessibilityLabel(on ? "Remove \(need.material.title)" : "Add \(need.material.title)")
            VStack(alignment: .leading, spacing: 2) {
                Text(need.material.title).font(.subheadline.weight(.medium)).foregroundStyle(on ? RelayTheme.ink : RelayTheme.secondary)
                Text(asking.map { "\(need.material.kind) · asking around \(Money.format($0))" } ?? "\(need.material.kind) · not listed yet")
                    .font(.footnote).foregroundStyle(RelayTheme.secondary)
            }
            Spacer(minLength: 6)
            if on {
                DollarField(placeholder: placeholders[need.id].map { "\($0 / 100)" } ?? "Max",
                            text: Binding(get: { maxes[need.id] ?? "" }, set: { maxes[need.id] = $0 }))
            }
        }
    }

    private func open() {
        let split = placeholders
        let requests = chosen.map { need in
            AgentRequest(course: need.course, item: need.material.title, maxCents: maxes[need.id].flatMap(Money.parse) ?? split[need.id])
        }
        store.openAgentTrades(requests, budgetCents: budget)
        store.notify("Big Al opened \(requests.count) \(requests.count == 1 ? "trade" : "trades").")
        dismiss()
    }
}

/// A trade for anything, not just class materials.
struct OpenTradeSheet: View {
    @Environment(RelayStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var item = ""
    @State private var maxText = ""
    @FocusState private var focused: Bool

    private var suggestions: [String] {
        let taken = Set(store.agentTrades.compactMap { $0.listing?.id })
        return Array(store.agentPool.filter { !taken.contains($0.id) && !$0.isOwnListing && $0.priceCents > 0 && $0.campus == store.campus }
            .map(\.title).prefix(6))
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("What do you need?").font(RelayTheme.heading(24)).tracking(-0.5)
                        Text("Big Al finds the best listing, negotiates under your max and asks before you buy.")
                            .font(.subheadline).foregroundStyle(RelayTheme.secondary)
                    }
                    VStack(alignment: .leading, spacing: 9) {
                        Text("Item").font(.subheadline.weight(.medium))
                        TextField("Mini fridge, TI-84, desk lamp…", text: $item).focused($focused).submitLabel(.next)
                            .padding(15).background(RelayTheme.soft, in: RoundedRectangle(cornerRadius: 14))
                            .accessibilityIdentifier("bigal-item")
                    }
                    if !suggestions.isEmpty {
                        FlowLayout(spacing: 8) {
                            ForEach(suggestions, id: \.self) { title in
                                Button(title) { item = title }
                                    .font(.footnote).padding(.horizontal, 12).padding(.vertical, 8)
                                    .background(item == title ? RelayTheme.lime : RelayTheme.surface, in: Capsule())
                                    .overlay(Capsule().strokeBorder(RelayTheme.line))
                                    .buttonStyle(.plain)
                            }
                        }
                    }
                    VStack(alignment: .leading, spacing: 9) {
                        Text("Your max").font(.subheadline.weight(.medium))
                        HStack {
                            Text("$").foregroundStyle(RelayTheme.secondary)
                            TextField("Optional", text: $maxText).keyboardType(.decimalPad).accessibilityIdentifier("bigal-max")
                        }.padding(15).background(RelayTheme.soft, in: RoundedRectangle(cornerRadius: 14))
                        Text("Leave it blank and Big Al stays under about 86% of the asking price.").font(.footnote).foregroundStyle(RelayTheme.secondary)
                    }
                }.padding(20)
            }
            .scrollDismissesKeyboard(.interactively)
            .background(RelayTheme.paper)
            .foregroundStyle(RelayTheme.ink)
            .tint(RelayTheme.forest)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
            .safeAreaInset(edge: .bottom) {
                Button("Open trade") {
                    store.openAgentTrades([AgentRequest(course: nil, item: item.trimmingCharacters(in: .whitespaces), maxCents: Money.parse(maxText))])
                    dismiss()
                }
                .buttonStyle(RelayPrimaryButton()).disabled(item.trimmingCharacters(in: .whitespaces).isEmpty)
                .opacity(item.trimmingCharacters(in: .whitespaces).isEmpty ? 0.5 : 1)
                .padding(.horizontal, 20).padding(.vertical, 10)
                .accessibilityIdentifier("bigal-submit-trade")
            }
            .onAppear { focused = true }
        }
        .presentationDetents([.large])
    }
}

struct DollarField: View {
    let placeholder: String
    @Binding var text: String
    var body: some View {
        HStack(spacing: 2) {
            Text("$").foregroundStyle(RelayTheme.secondary)
            TextField(placeholder, text: $text).keyboardType(.decimalPad).frame(width: 64)
        }
        .font(.subheadline.monospacedDigit())
        .padding(.horizontal, 10).padding(.vertical, 7)
        .background(RelayTheme.soft, in: RoundedRectangle(cornerRadius: 9))
    }
}
