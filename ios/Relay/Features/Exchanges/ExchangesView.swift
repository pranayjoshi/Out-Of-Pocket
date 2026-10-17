import SwiftUI
import RelayCore

struct ExchangesView: View {
    @Environment(RelayStore.self) private var store
    @State private var selected: ExchangeDestination?
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                SectionTitle(eyebrow: "FROM THEIR HANDS TO YOURS", title: "A little trust.\nA good exchange.")
                Text("Clear steps. No guesswork. Your next handoff, all in one place.").font(.subheadline).foregroundStyle(RelayTheme.secondary).lineSpacing(4)
                DemoNotice()
                if store.snapshot.exchanges.isEmpty {
                    EmptyContent(symbol: "arrow.left.arrow.right", title: "It starts with a good find.", message: "Reserve a sample listing to explore the complete handoff, inspection, and payment journey.", actionTitle: "Find your next thing") { store.selectedTab = .discover }
                }
                ForEach(store.snapshot.exchanges) { exchange in
                    Button { selected = ExchangeDestination(id: exchange.id) } label: {
                        HStack(spacing: 15) {
                            ListingImage(name: exchange.listing.imageName).frame(width: 86, height: 107).clipped().clipShape(RoundedRectangle(cornerRadius: 17))
                            VStack(alignment: .leading, spacing: 9) {
                                Text(exchange.stage.title).font(.caption.weight(.medium)).foregroundStyle(RelayTheme.accent)
                                Text(exchange.listing.title).font(.subheadline.weight(.medium)).lineLimit(2)
                                Text(exchange.meeting.formatted(date: .abbreviated, time: .shortened)).font(.caption2).foregroundStyle(RelayTheme.secondary)
                                Text(exchange.listing.price).font(.system(.headline, design: .rounded))
                            }
                            Spacer(minLength: 0)
                            Image(systemName: "arrow.up.right").font(.caption)
                        }.foregroundStyle(RelayTheme.ink).padding(15).frame(maxWidth: .infinity, alignment: .leading)
                            .background(RelayTheme.surface, in: RoundedRectangle(cornerRadius: 23))
                    }.buttonStyle(.plain)
                }
            }.padding(20).padding(.bottom, 20)
        }.background(RelayTheme.paper).navigationTitle("Exchanges").navigationBarTitleDisplayMode(.inline)
            .sheet(item: $selected) { ExchangeDetailView(exchangeID: $0.id) }
    }
}

struct ExchangeDetailView: View {
    @Environment(RelayStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let exchangeID: UUID
    @State private var code = ""
    @State private var checks: Set<String> = []
    @State private var error: String?
    @FocusState private var codeFocused: Bool
    private var exchange: Exchange? { store.exchange(exchangeID) }
    var body: some View {
        NavigationStack {
            ScrollViewReader { proxy in
                ScrollView {
                    if let exchange {
                        VStack(alignment: .leading, spacing: 23) {
                            SectionTitle(eyebrow: "THE RELAY HANDOFF", title: "A good find.\nA thoughtful exchange.")
                            DemoNotice(text: "Payment playground. All money movements are simulated.")
                            itemSummary(exchange)
                            progress(exchange)
                            moneySummary(exchange)
                            VStack(alignment: .leading, spacing: 16) { stageContent(exchange) }
                                .id("stage-action")
                                .transition(reduceMotion ? .opacity : .opacity.combined(with: .offset(y: 10)))
                            if let error { Text(error).font(.subheadline).foregroundStyle(.red).accessibilityIdentifier("exchange-error") }
                            if exchange.stage.canCancel {
                                Button(exchange.stage == .reserved ? "Cancel sample reservation" : "Reject item & cancel before payment") { advance(.cancel) }
                                    .font(.subheadline).foregroundStyle(RelayTheme.secondary).frame(maxWidth: .infinity, minHeight: 46)
                                    .accessibilityIdentifier("cancel-exchange")
                            }
                        }.padding(23).padding(.bottom, 15)
                            .animation(reduceMotion ? nil : .smooth(duration: 0.3), value: exchange.stage)
                    } else {
                        EmptyContent(symbol: "questionmark.circle", title: "This exchange isn’t here.", message: "Return to your exchanges to choose another sample handoff.")
                    }
                }.background(RelayTheme.paper)
                    .scrollDismissesKeyboard(.interactively)
                    .onChange(of: exchange?.stage) { _, _ in
                        codeFocused = false
                        withAnimation(reduceMotion ? nil : .smooth) { proxy.scrollTo("stage-action", anchor: .center) }
                    }
            }
            .navigationTitle("Your exchange").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }.presentationDragIndicator(.visible)
    }
    private func itemSummary(_ exchange: Exchange) -> some View {
        HStack(spacing: 14) {
            ListingImage(name: exchange.listing.imageName).frame(width: 74, height: 83).clipped().clipShape(RoundedRectangle(cornerRadius: 15))
            VStack(alignment: .leading, spacing: 6) {
                Text(exchange.listing.title).font(.subheadline.weight(.medium))
                Text("\(exchange.listing.seller) · \(exchange.listing.price)").font(.caption).foregroundStyle(RelayTheme.secondary)
                Text(exchange.meeting.formatted(date: .abbreviated, time: .shortened)).font(.caption2).foregroundStyle(RelayTheme.secondary)
            }
        }.foregroundStyle(RelayTheme.ink).padding(.vertical, 5)
    }
    private func progress(_ exchange: Exchange) -> some View {
        HStack(alignment: .top, spacing: 0) {
            ForEach(Array(["Reserved", exchange.isFree ? "Ready" : "Hold", "Identify", "Inspect", exchange.isFree ? "Accept" : "Pay"].enumerated()), id: \.offset) { index, label in
                VStack(spacing: 8) {
                    ZStack {
                        Circle().fill(index <= exchange.stage.progress ? RelayTheme.lime : RelayTheme.soft).frame(width: 29, height: 29)
                        if index < exchange.stage.progress { Image(systemName: "checkmark").font(.caption2.weight(.semibold)) }
                        else { Text("\(index + 1)").font(.caption2.weight(.semibold)) }
                    }
                    Text(label).font(.caption2)
                }.foregroundStyle(index <= exchange.stage.progress ? RelayTheme.forest : RelayTheme.secondary).frame(maxWidth: .infinity)
            }
        }.accessibilityElement(children: .ignore).accessibilityLabel("Exchange progress: \(exchange.stage.title)")
    }
    private func moneySummary(_ exchange: Exchange) -> some View {
        VStack(alignment: .leading, spacing: 13) {
            VStack(alignment: .leading, spacing: 4) { Text("Your payment").font(.caption).foregroundStyle(RelayTheme.secondary); Text(exchange.buyerMoneyLabel).font(.subheadline.weight(.semibold)).foregroundStyle(RelayTheme.ink) }
            Divider().overlay(RelayTheme.line)
            VStack(alignment: .leading, spacing: 4) { Text("Seller’s funds").font(.caption).foregroundStyle(RelayTheme.secondary); Text(exchange.sellerMoneyLabel).font(.subheadline.weight(.medium)).foregroundStyle(RelayTheme.ink) }
        }.padding(18).frame(maxWidth: .infinity, alignment: .leading).background(RelayTheme.soft, in: RoundedRectangle(cornerRadius: 19))
    }
    @ViewBuilder private func stageContent(_ exchange: Exchange) -> some View {
        switch exchange.stage {
        case .reserved:
            actionHeading("FIRST, A LITTLE REASSURANCE", exchange.isFree ? "Kindness, passed on." : "Your money stays in your corner.")
            explanation(exchange.isFree ? "This find is free. Identify your partner and inspect the item. No card, payment, or transfer is needed." : "A card hold reserves funds near the meeting. It isn’t a completed payment, and the bank may take time to remove a canceled hold.")
            Button(exchange.isFree ? "Start a free handoff" : "Simulate \(exchange.listing.price) authorization") { advance(.prepareFunds) }.buttonStyle(RelayPrimaryButton()).accessibilityIdentifier("prepare-exchange")
        case .fundsReady:
            actionHeading("RIGHT PERSON. RIGHT EXCHANGE.", "Say hello. Check the code.")
            explanation("Your partner’s sample code is 2418. This identifies the exchange; it does not accept the item or approve payment.")
            TextField("Partner’s exchange code", text: $code).keyboardType(.numberPad).textContentType(.oneTimeCode)
                .font(.system(size: 26, weight: .medium, design: .monospaced)).tracking(9).padding(17)
                .background(RelayTheme.soft, in: RoundedRectangle(cornerRadius: 14)).focused($codeFocused)
                .accessibilityIdentifier("partner-code")
                .onChange(of: code) { _, value in code = String(value.filter(\.isNumber).prefix(4)); error = nil }
            Button("Identify this exchange") { advance(.identify(code: code)) }.buttonStyle(RelayPrimaryButton()).accessibilityIdentifier("identify-exchange")
        case .identified:
            actionHeading("TAKE YOUR TIME. LOOK IT OVER.", "Does it feel like the right find?")
            explanation("Test the item and compare it with the original listing. It’s okay to walk away before payment.")
            ForEach(exchange.listing.checks, id: \.self) { check in
                Button {
                    if checks.contains(check) { checks.remove(check) } else { checks.insert(check) }
                } label: {
                    HStack(alignment: .top, spacing: 12) {
                        Image(systemName: checks.contains(check) ? "checkmark.circle.fill" : "circle").font(.title3).foregroundStyle(checks.contains(check) ? RelayTheme.forest : RelayTheme.secondary)
                        Text(check).font(.subheadline).foregroundStyle(RelayTheme.ink).multilineTextAlignment(.leading)
                        Spacer(minLength: 0)
                    }.padding(15).frame(maxWidth: .infinity, minHeight: 52).background(RelayTheme.soft, in: RoundedRectangle(cornerRadius: 15))
                }.accessibilityLabel(check).accessibilityAddTraits(checks.contains(check) ? .isSelected : [])
            }
            Button("Inspection complete") { advance(.inspect(checked: checks)) }.buttonStyle(RelayPrimaryButton())
                .disabled(!Set(exchange.listing.checks).isSubset(of: checks)).accessibilityIdentifier("complete-inspection")
        case .inspected:
            actionHeading("YOUR CHOICE. YOUR CONFIRMATION.", "Ready for its next chapter?")
            explanation(exchange.isFree ? "You’ve inspected this free find. Confirm that you’re happy to accept it." : "You’ve inspected the item. In a real exchange, the seller keeps it until both screens show a successful payment.")
            Button(exchange.isFree ? "Accept this free find" : "Accept & simulate \(exchange.listing.price) payment") { advance(.accept) }.buttonStyle(RelayPrimaryButton()).accessibilityIdentifier("accept-exchange")
        case .completed:
            RoundIcon(symbol: "checkmark", size: 62)
            actionHeading("AND JUST LIKE THAT", "A new story begins.")
            explanation(exchange.isFree ? "The free handoff is confirmed. A little less waste, a little more kindness. No money moved." : "The sample payment is complete. Seller transfer is scheduled after review and funds availability. Bank payout is a separate step.")
            if !exchange.isFree { Button("Explore a post-handoff issue") { advance(.report) }.buttonStyle(RelayPrimaryButton(secondary: true)) }
        case .caseOpen:
            actionHeading("A CLEAR PATH TO A RESOLUTION", "Your sample case is open.")
            explanation("An unreleased seller transfer is paused. A real case needs evidence, the seller’s response, and human review. A report alone does not grant a refund.")
            Eyebrow(text: "DEMO CONTROL")
            Button("Simulate approved case & verified return") { advance(.approveReturn) }.buttonStyle(RelayPrimaryButton(secondary: true))
        case .refundPending:
            actionHeading("SUBMITTED ISN’T THE SAME AS RECEIVED", "Your sample refund is pending.")
            explanation("The processor and bank determine when a real credit appears. A submitted refund is not bank confirmation.")
            Eyebrow(text: "DEMO CONTROL")
            Button("Simulate bank confirmation") { advance(.confirmRefund) }.buttonStyle(RelayPrimaryButton(secondary: true))
        case .refunded:
            RoundIcon(symbol: "checkmark.circle", size: 62)
            actionHeading("A CLEAR RESOLUTION", "Back where it belongs.")
            explanation("The simulated bank confirmation is recorded. This concludes your sample refund journey.")
        case .canceled:
            actionHeading("IT’S OKAY TO PASS", "It’s okay to pass.")
            explanation("No payment was captured. In a real transaction, your bank may take time to remove a temporary hold.")
            Button("Find a better fit") { dismiss(); store.selectedTab = .discover }.buttonStyle(RelayPrimaryButton())
        }
    }
    private func actionHeading(_ eyebrow: String, _ title: String) -> some View {
        VStack(alignment: .leading, spacing: 9) { Eyebrow(text: eyebrow); Text(title).font(RelayTheme.heading(25)).tracking(-0.7).foregroundStyle(RelayTheme.ink) }
    }
    private func explanation(_ text: String) -> some View { Text(text).font(.subheadline).foregroundStyle(RelayTheme.secondary).lineSpacing(5) }
    private func advance(_ event: ExchangeEvent) {
        do { try store.advance(exchangeID, event: event); error = nil }
        catch { self.error = error.localizedDescription }
    }
}
