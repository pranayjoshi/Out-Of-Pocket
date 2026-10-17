import SwiftUI
import UIKit

// Semantic, adaptive surfaces keep the campus palette legible in both appearances.
enum RelayTheme {
    static let paper = adaptive(0xF8F9F4, 0x151E19)
    static let surface = adaptive(0xFFFFFF, 0x202C24)
    static let soft = adaptive(0xEEF1E5, 0x293629)
    static let forest = adaptive(0x294B3D, 0xC8E1B5)
    static let ink = adaptive(0x263E32, 0xF1F5E9)
    static let secondary = adaptive(0x6B7862, 0xAFBBA3)
    static let line = adaptive(0xE2E7D9, 0x3A493A)
    static let lime = adaptive(0xDCEB9C, 0x526C35)
    static let peach = adaptive(0xEFD4C1, 0x634B3E)
    static let lavender = adaptive(0xDDD8E7, 0x4A4259)
    static let heroInk = adaptive(0x30462E, 0xEBF2DD)
    static let onForest = adaptive(0xFCFFF4, 0x18321F)
    static let accent = adaptive(0x7C9459, 0xB4D08D)
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
        return .system(style, design: .rounded, weight: .semibold)
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
            if name.hasPrefix("local:"), let image = UIImage(contentsOfFile: RelayStore.photosDirectory.appending(path: String(name.dropFirst(6))).path) {
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
