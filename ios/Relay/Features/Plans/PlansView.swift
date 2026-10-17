import SwiftUI
import RelayCore

struct PlansView: View {
    @Environment(RelayStore.self) private var store
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var showEditor = false
    @State private var selected: Listing?
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 26) {
                SectionTitle(eyebrow: "MAKE ROOM FOR WHAT’S NEXT", title: "A new chapter.\nA little plan.")
                if let plan = store.snapshot.plan {
                    budgetCard(plan)
                    HStack {
                        Text(plan.name).font(RelayTheme.heading(24)).tracking(-0.7)
                        Spacer()
                        Button { showEditor = true } label: { Image(systemName: "slider.horizontal.3").frame(width: 44, height: 44) }.accessibilityLabel("Edit setup plan")
                    }
                    if store.planListings.isEmpty { emptyPlan }
                    ForEach(store.planListings) { listing in
                        HStack(spacing: 15) {
                            Button { selected = listing } label: {
                                ListingImage(name: listing.imageName).frame(width: 82, height: 96).clipped().clipShape(RoundedRectangle(cornerRadius: 16))
                            }.accessibilityLabel("View \(listing.title)")
                            VStack(alignment: .leading, spacing: 7) {
                                Text(listing.title).font(.subheadline.weight(.medium))
                                Text(listing.condition).font(.caption).foregroundStyle(RelayTheme.secondary)
                                Text(listing.price).font(.system(.headline, design: .rounded))
                            }
                            Spacer(minLength: 0)
                            Button { store.removeFromPlan(listing) } label: { Image(systemName: "minus.circle").frame(width: 44, height: 44).foregroundStyle(RelayTheme.secondary) }
                                .accessibilityLabel("Remove \(listing.title) from setup")
                        }.padding(14).background(RelayTheme.surface, in: RoundedRectangle(cornerRadius: 22))
                    }
                    Button { store.selectedTab = .discover } label: { Label("Find another piece", systemImage: "plus") }.buttonStyle(RelayPrimaryButton(secondary: true))
                    DemoNotice(text: "Each item is reserved and inspected separately. Your plan is a wishlist, not a purchase.")
                } else {
                    EmptyContent(symbol: "sofa", title: "A space that feels like you.", message: "A cozy dorm. A fresh semester. Build a setup with a budget you feel good about.", actionTitle: "Build my setup") { showEditor = true }
                    starterCard
                }
                HStack(alignment: .top, spacing: 15) {
                    RoundIcon(symbol: "arrow.left.arrow.right", size: 47)
                    VStack(alignment: .leading, spacing: 8) {
                        Eyebrow(text: "COMING FULL CIRCLE")
                        Text("Today’s find.\nNext semester’s head start.").font(RelayTheme.heading(21)).tracking(-0.6)
                        Text("When you’re ready, pass it on with fresh photos and an updated condition.").font(.caption).foregroundStyle(RelayTheme.secondary).lineSpacing(4)
                    }
                }.padding(21).background(RelayTheme.soft, in: RoundedRectangle(cornerRadius: 24))
                CampusPromotionPlacement(placement: "My plans")
            }.foregroundStyle(RelayTheme.ink).padding(20).padding(.bottom, 20)
        }.background(RelayTheme.paper)
            .navigationTitle("My plans").navigationBarTitleDisplayMode(.inline)
            .sheet(isPresented: $showEditor) { PlanEditorView() }
            .sheet(item: $selected) { ListingDetailView(listing: $0) }
    }
    private func budgetCard(_ plan: SetupPlan) -> some View {
        VStack(alignment: .leading, spacing: 19) {
            HStack { Eyebrow(text: "BIG PLANS. LITTLE BUDGET."); Spacer(); Image(systemName: "sparkles").foregroundStyle(RelayTheme.accent) }
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(Money.format(store.planTotal)).font(.system(size: 43, weight: .semibold, design: .rounded)).tracking(-1.5)
                Text("/ \(Money.format(plan.budgetCents))").font(.title3).foregroundStyle(RelayTheme.secondary)
            }.accessibilityElement(children: .combine).accessibilityLabel("\(Money.format(store.planTotal)) of \(Money.format(plan.budgetCents)) budget")
            ProgressView(value: Double(min(store.planTotal, plan.budgetCents)), total: Double(plan.budgetCents)).tint(RelayTheme.accent)
                .animation(reduceMotion ? nil : .smooth, value: store.planTotal)
            Text(store.planTotal <= plan.budgetCents ? "\(Money.format(plan.budgetCents - store.planTotal)) left for whatever’s next." : "\(Money.format(store.planTotal - plan.budgetCents)) over budget. Try swapping a piece.")
                .font(.subheadline).foregroundStyle(RelayTheme.secondary)
        }.padding(24).background(RelayTheme.soft, in: RoundedRectangle(cornerRadius: 27))
    }
    private var emptyPlan: some View {
        EmptyContent(symbol: "square.grid.2x2", title: "Every good setup starts somewhere.", message: "Open a find and tap Add to my setup to see it here.")
    }
    private var starterCard: some View {
        HStack(spacing: 16) {
            ForEach(["chair", "lamp", "plant"], id: \.self) { name in
                ListingImage(name: name).frame(width: 85, height: 107).clipped().clipShape(RoundedRectangle(cornerRadius: 17))
                    .rotationEffect(.degrees(name == "lamp" ? 6 : -5))
            }
        }.frame(maxWidth: .infinity).padding(.vertical, 18).accessibilityHidden(true)
    }
}

struct PlanEditorView: View {
    @Environment(RelayStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var name = "My cozy campus corner"
    @State private var budget = "150"
    private var valid: Bool { !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && name.count <= 80 && (Money.parse(budget) ?? 0) > 0 }
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 25) {
                    RoundIcon(symbol: "sparkles", size: 65)
                    SectionTitle(eyebrow: "LET’S PIECE IT TOGETHER", title: "A little plan.\nA place that feels like you.")
                    Text("Give your next chapter a name and a comfortable budget. You can add and swap pieces as you go.").font(.subheadline).foregroundStyle(RelayTheme.secondary).lineSpacing(4)
                    FormField(label: "What are you planning?", placeholder: "My first dorm, semester essentials…", text: $name).accessibilityIdentifier("plan-name")
                    FormField(label: "Your comfortable budget ($)", placeholder: "150", text: $budget).keyboardType(.decimalPad).accessibilityIdentifier("plan-budget")
                    Label("A good setup doesn’t have to start brand new.", systemImage: "leaf").font(.caption).foregroundStyle(RelayTheme.secondary)
                    Button("Save my plan") {
                        guard let cents = Money.parse(budget), valid else { return }
                        store.savePlan(name: name.trimmingCharacters(in: .whitespacesAndNewlines), budgetCents: cents)
                        store.selectedTab = .plans; dismiss()
                    }.buttonStyle(RelayPrimaryButton()).disabled(!valid).accessibilityIdentifier("save-plan")
                }.padding(24)
            }.background(RelayTheme.paper).navigationTitle("Your next chapter").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
                .onAppear { if let plan = store.snapshot.plan { name = plan.name; budget = String(format: "%.2f", Double(plan.budgetCents) / 100) } }
                .scrollDismissesKeyboard(.interactively)
        }.presentationDragIndicator(.visible)
    }
}
