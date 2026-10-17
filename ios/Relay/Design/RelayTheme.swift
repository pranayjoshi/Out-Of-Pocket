import SwiftUI
import UIKit

// Semantic, adaptive surfaces keep the campus palette legible in both appearances.
enum RelayTheme {
    static let paper = adaptive(0xF6F6F2, 0x11131B)
    static let surface = adaptive(0xFFFFFF, 0x1C1F2A)
    static let soft = adaptive(0xEBEDF3, 0x282D3C)
    static let forest = adaptive(0x4C52D9, 0xB8BCFF)
    static let ink = adaptive(0x202337, 0xF4F4FB)
    static let secondary = adaptive(0x6B7084, 0xA7ADC3)
    static let line = adaptive(0xE3E5EC, 0x353B4D)
    static let lime = adaptive(0xDCEFBA, 0x344827)
    static let peach = adaptive(0xFFE0CD, 0x553A2D)
    static let lavender = adaptive(0xE4E3FF, 0x36335A)
    static let heroInk = adaptive(0x252940, 0xF2F0FF)
    static let onForest = adaptive(0xFFFFFF, 0x222650)
    static let accent = adaptive(0x555ED0, 0xB8BCFF)
    static func eventColor(_ theme: String) -> Color { theme == "peach" ? peach : theme == "lavender" ? lavender : lime }
    static func heading(_ size: CGFloat) -> Font {
        let style: Font.TextStyle
        switch size {
        case 32...: style = .largeTitle
        case 28..<32: style = .title
        case 24..<28: style = .title2
        case 20..<24: style = .title3
        default: style = .headline
        }
        return .system(style, design: .default, weight: .bold)
    }
    static func adaptive(_ light: UInt32, _ dark: UInt32) -> Color {
        Color(uiColor: UIColor { trait in
            let hex = trait.userInterfaceStyle == .dark ? dark : light
            return UIColor(red: Double((hex >> 16) & 255) / 255, green: Double((hex >> 8) & 255) / 255, blue: Double(hex & 255) / 255, alpha: 1)
        })
    }
}

struct RelayPrimaryButton: ButtonStyle {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    var secondary = false
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(.subheadline, weight: .semibold))
            .frame(maxWidth: .infinity).frame(minHeight: 50)
            .padding(.horizontal, 18)
            .background(secondary ? RelayTheme.soft : RelayTheme.forest, in: RoundedRectangle(cornerRadius: 17))
            .foregroundStyle(secondary ? RelayTheme.forest : RelayTheme.onForest)
            .scaleEffect(configuration.isPressed && !reduceMotion ? 0.975 : 1)
            .opacity(configuration.isPressed ? 0.85 : 1)
            .animation(reduceMotion ? nil : .spring(response: 0.3, dampingFraction: 0.7), value: configuration.isPressed)
    }
}

struct Eyebrow: View {
    let text: String
    var body: some View {
        Text(text.uppercased()).font(.system(.caption2, weight: .semibold)).tracking(1.7)
            .foregroundStyle(RelayTheme.secondary).fixedSize(horizontal: false, vertical: true)
    }
}
struct RelayWordmark: View {
    var body: some View {
        HStack(spacing: 7) {
            Image(systemName: "arrow.left.arrow.right").font(.system(size: 20, weight: .bold)).rotationEffect(.degrees(-28))
            Text("relay").font(.system(size: 31, weight: .bold, design: .rounded)).tracking(-1.7)
            Text(".").font(.system(size: 30, weight: .bold, design: .rounded)).foregroundStyle(RelayTheme.accent).padding(.leading, -8)
        }.foregroundStyle(RelayTheme.forest).accessibilityElement(children: .ignore).accessibilityLabel("Relay")
    }
}
struct RoundIcon: View {
    let symbol: String
    var size: CGFloat = 42
    var body: some View {
        Image(systemName: symbol).font(.system(size: size * 0.4, weight: .medium))
            .foregroundStyle(RelayTheme.forest).frame(width: size, height: size)
            .background(RelayTheme.soft, in: Circle())
    }
}
struct DemoNotice: View {
    var text = "Interactive demo. No real payments or reservations."
    var body: some View {
        Label(text, systemImage: "lock.shield")
            .font(.caption).foregroundStyle(RelayTheme.secondary)
            .padding(13).frame(maxWidth: .infinity, alignment: .leading)
            .background(RelayTheme.soft, in: RoundedRectangle(cornerRadius: 14))
    }
}
struct SectionTitle: View {
    let eyebrow: String
    let title: String
    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            Eyebrow(text: eyebrow)
            Text(title).font(RelayTheme.heading(25)).tracking(-0.7).foregroundStyle(RelayTheme.ink)
        }.frame(maxWidth: .infinity, alignment: .leading)
    }
}
struct EmptyContent: View {
    let symbol: String
    let title: String
    let message: String
    var actionTitle: String? = nil
    var action: (() -> Void)? = nil
    var body: some View {
        VStack(spacing: 17) {
            RoundIcon(symbol: symbol, size: 70)
            Text(title).font(RelayTheme.heading(25)).multilineTextAlignment(.center).foregroundStyle(RelayTheme.ink)
            Text(message).font(.subheadline).foregroundStyle(RelayTheme.secondary).multilineTextAlignment(.center).lineSpacing(4)
            if let actionTitle, let action { Button(actionTitle, action: action).buttonStyle(RelayPrimaryButton()).padding(.top, 7) }
        }.padding(.vertical, 35).frame(maxWidth: .infinity)
    }
}
struct ListingImage: View {
    let name: String
    var body: some View {
        Group {
            if name.hasPrefix("remote:"), let url = URL(string: String(name.dropFirst(7))) {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .success(let image): image.resizable().scaledToFill()
                    default: RelayTheme.soft
                    }
                }
            } else if name.hasPrefix("local:"), let image = UIImage(contentsOfFile: RelayStore.photosDirectory.appending(path: String(name.dropFirst(6))).path) {
                Image(uiImage: image).resizable().scaledToFill()
            } else {
                Image(name).resizable().scaledToFill()
            }
        }.accessibilityHidden(true)
    }
}
struct FormField: View {
    let label: String
    let placeholder: String
    @Binding var text: String
    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            Text(label).font(.subheadline.weight(.medium)).foregroundStyle(RelayTheme.ink)
            TextField(placeholder, text: $text).padding(15)
                .background(RelayTheme.soft, in: RoundedRectangle(cornerRadius: 14))
                .foregroundStyle(RelayTheme.ink)
        }
    }
}
struct FlowLayout: Layout {
    var spacing: CGFloat = 8
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        arrange(width: proposal.width ?? 320, subviews: subviews).size
    }
    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let result = arrange(width: bounds.width, subviews: subviews)
        for (index, point) in result.points.enumerated() {
            subviews[index].place(at: CGPoint(x: bounds.minX + point.x, y: bounds.minY + point.y), proposal: .unspecified)
        }
    }
    private func arrange(width: CGFloat, subviews: Subviews) -> (size: CGSize, points: [CGPoint]) {
        var x: CGFloat = 0; var y: CGFloat = 0; var rowHeight: CGFloat = 0; var points: [CGPoint] = []
        for view in subviews {
            let size = view.sizeThatFits(.unspecified)
            if x > 0 && x + size.width > width { x = 0; y += rowHeight + spacing; rowHeight = 0 }
            points.append(CGPoint(x: x, y: y)); x += size.width + spacing; rowHeight = max(rowHeight, size.height)
        }
        return (CGSize(width: width, height: y + rowHeight), points)
    }
}

// One service vocabulary shared by the home hub, explore rail and posting sheet.
enum CampusService: String, CaseIterable, Identifiable {
    case tutoring = "Tutoring", tickets = "Tickets", rides = "Rides", market = "Market"
    var id: String { rawValue }
    var symbol: String {
        switch self {
        case .tutoring: "graduationcap.fill"
        case .tickets: "ticket.fill"
        case .rides: "car.side.fill"
        case .market: "bag.fill"
        }
    }
    var color: Color {
        switch self {
        case .tutoring: RelayTheme.lavender
        case .tickets: RelayTheme.peach
        case .rides: RelayTheme.lime
        case .market: RelayTheme.soft
        }
    }
    var subtitle: String {
        switch self {
        case .tutoring: "Get unstuck"
        case .tickets: "Be there"
        case .rides: "Go together"
        case .market: "Find your thing"
        }
    }
}

struct ServiceRail: View {
    @Binding var selection: CampusService
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.dynamicTypeSize) private var typeSize
    @Namespace private var highlight
    var body: some View {
        Group {
            if typeSize.isAccessibilitySize {
                ScrollView(.horizontal) { items }.scrollIndicators(.hidden)
            } else { items }
        }.background(RelayTheme.surface, in: RoundedRectangle(cornerRadius: 24))
            .sensoryFeedback(.selection, trigger: selection)
    }
    private var items: some View {
        HStack(spacing: 4) {
            ForEach(CampusService.allCases) { service in
                Button {
                    withAnimation(reduceMotion ? nil : .spring(response: 0.38, dampingFraction: 0.8)) { selection = service }
                } label: {
                    VStack(spacing: 6) {
                        Image(systemName: service.symbol).font(.system(.subheadline, weight: .semibold))
                            .symbolEffect(.bounce, options: .nonRepeating, value: selection == service && !reduceMotion)
                        Text(service.rawValue).font(.caption.weight(.semibold))
                    }
                    .frame(minWidth: typeSize.isAccessibilitySize ? 125 : 0, maxWidth: .infinity, minHeight: 59)
                    .padding(.horizontal, 3)
                    .foregroundStyle(selection == service ? RelayTheme.onForest : RelayTheme.secondary)
                    .background {
                        if selection == service {
                            RoundedRectangle(cornerRadius: 20).fill(RelayTheme.forest).matchedGeometryEffect(id: "service", in: highlight)
                        }
                    }.contentShape(RoundedRectangle(cornerRadius: 20))
                }.buttonStyle(.plain)
                    .accessibilityIdentifier("service-\(service.rawValue)")
                    .accessibilityAddTraits(selection == service ? .isSelected : [])
            }
        }.padding(5)
    }
}

struct RelayPressStyle: ButtonStyle {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed && !reduceMotion ? 0.96 : 1)
            .opacity(configuration.isPressed ? 0.85 : 1)
            .animation(reduceMotion ? nil : .spring(response: 0.32, dampingFraction: 0.65), value: configuration.isPressed)
    }
}

private struct RelayEntrance: ViewModifier {
    let order: Int
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var visible = false
    func body(content: Content) -> some View {
        content.opacity(visible ? 1 : 0)
            .offset(y: visible || reduceMotion ? 0 : 18)
            .onAppear {
                withAnimation(reduceMotion ? nil : .spring(response: 0.6, dampingFraction: 0.85).delay(Double(order) * 0.06)) { visible = true }
            }
    }
}
extension View {
    func relayEntrance(_ order: Int = 0) -> some View { modifier(RelayEntrance(order: order)) }
    func relayCard() -> some View {
        padding(20).background(RelayTheme.surface, in: RoundedRectangle(cornerRadius: 24))
    }
}

struct ServiceHeading: View {
    let service: CampusService
    let title: String
    let subtitle: String
    var body: some View {
        HStack(alignment: .top, spacing: 16) {
            VStack(alignment: .leading, spacing: 8) {
                Text(title).font(RelayTheme.heading(32)).tracking(-1.2).fixedSize(horizontal: false, vertical: true)
                Text(subtitle).font(.subheadline).foregroundStyle(RelayTheme.secondary).lineSpacing(3)
            }
            Spacer(minLength: 0)
            Image(systemName: service.symbol).font(.system(size: 25, weight: .medium))
                .frame(width: 58, height: 64).background(service.color, in: RoundedRectangle(cornerRadius: 21))
                .rotationEffect(.degrees(-7)).accessibilityHidden(true)
        }.foregroundStyle(RelayTheme.ink)
    }
}
