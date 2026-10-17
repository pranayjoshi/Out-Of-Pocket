import SwiftUI
import RelayCore

struct SwapRoute: Hashable { let id: UUID }

/// One trading circle: who gives what to whom, who has approved, the meetup, and a group chat.
struct TradeCircleView: View {
    @Environment(RelayStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    let swapID: UUID
    @State private var draft = ""
    @State private var leaving = false

    private var swap: AgentSwap? { store.agentSwap(swapID) }

    var body: some View {
        Group {
            if let swap {
                ScrollView {
                    VStack(alignment: .leading, spacing: 22) {
                        VStack(alignment: .leading, spacing: 6) {
                            Eyebrow(text: swap.circle.map { "Trading circle · \($0.members.count) people" } ?? "Swap")
                            Text("Your \(swap.gives) for \(swap.circle?.members.last?.gives ?? swap.wants)")
                                .font(RelayTheme.heading(24)).tracking(-0.5).fixedSize(horizontal: false, vertical: true)
                        }
                        if let circle = swap.circle {
                            CircleDiagram(members: circle.members, approvals: swap.approvals)
                            legs(circle)
                        }
                        outcome(swap)
                        if swap.circle != nil { chat(swap) }
                    }.padding(20).padding(.bottom, 24)
                }
                .scrollDismissesKeyboard(.interactively)
                .background(RelayTheme.paper)
                .foregroundStyle(RelayTheme.ink)
                .navigationTitle("Trading circle")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        Menu {
                            Button(role: .destructive) { leaving = true } label: {
                                Label(swap.circle == nil ? "Close swap" : "Leave circle", systemImage: "xmark.circle")
                            }
                        } label: { Image(systemName: "ellipsis.circle") }.accessibilityLabel("Circle options")
                    }
                }
                .confirmationDialog(swap.circle == nil ? "Close this swap?" : "Leave this circle?", isPresented: $leaving, titleVisibility: .visible) {
                    Button(swap.circle == nil ? "Close swap" : "Leave circle", role: .destructive) { store.closeSwap(swapID); dismiss() }
                } message: { Text(swap.circle == nil ? "Big Al stops looking." : "Big Al lets everyone know, and the circle is off.") }
            } else {
                EmptyContent(symbol: "tray", title: "Circle closed", message: "This swap isn’t open anymore.").background(RelayTheme.paper)
            }
        }
    }

    private func legs(_ circle: TradeCircle) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(circle.legs.enumerated()), id: \.offset) { i, leg in
                HStack(spacing: 12) {
                    Group {
                        if let image = leg.imageName { ListingImage(name: image) }
                        else { Image(systemName: "shippingbox").foregroundStyle(RelayTheme.secondary).frame(maxWidth: .infinity, maxHeight: .infinity).background(RelayTheme.soft) }
                    }.frame(width: 42, height: 42).clipShape(RoundedRectangle(cornerRadius: 10))
                    VStack(alignment: .leading, spacing: 2) {
                        Text(leg.item).font(.subheadline.weight(.medium)).lineLimit(1)
                        Text("\(name(leg.from)) → \(name(leg.to))").font(.footnote).foregroundStyle(RelayTheme.secondary)
                    }
                    Spacer(minLength: 0)
                    if leg.to == TradeCircles.you { Text("Yours").font(.caption.weight(.semibold)).foregroundStyle(RelayTheme.accent) }
                }.padding(.vertical, 10)
                if i < circle.legs.count - 1 { Divider().overlay(RelayTheme.line) }
            }
        }
        .padding(.horizontal, 16).padding(.vertical, 4)
        .background(RelayTheme.surface, in: RoundedRectangle(cornerRadius: 20))
    }

    private func name(_ person: String) -> String { person == TradeCircles.you ? "You" : person }

    @ViewBuilder private func outcome(_ swap: AgentSwap) -> some View {
        switch swap.phase {
        case .searching:
            card {
                HStack(spacing: 12) {
                    ProgressView()
                    Text("Looking for students whose swaps line up with yours…").font(.subheadline).foregroundStyle(RelayTheme.secondary)
                }
            }
        case .approving:
            card {
                VStack(alignment: .leading, spacing: 14) {
                    if swap.youApproved {
                        HStack(spacing: 10) {
                            ProgressView().controlSize(.small)
                            Text("Waiting on \(swap.waitingOn.map { $0.split(separator: " ")[0] }.joined(separator: ", "))").font(.subheadline)
                        }
                    } else {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Your part").font(.subheadline.weight(.semibold))
                            Text("Bring your \(swap.gives) and leave with the \(swap.circle?.members.last?.gives ?? swap.wants). Nobody pays.")
                                .font(.footnote).foregroundStyle(RelayTheme.secondary).fixedSize(horizontal: false, vertical: true)
                        }
                        Button("Approve my part") { store.approveSwap(swapID) }.buttonStyle(RelayPrimaryButton()).accessibilityIdentifier("circle-approve")
                        Button("Not for me") { store.declineSwap(swapID) }
                            .font(.subheadline.weight(.medium)).foregroundStyle(RelayTheme.secondary).frame(maxWidth: .infinity, minHeight: 36)
                    }
                }
            }
        case .confirmed:
            if let circle = swap.circle { CircleTicket(swap: swap, circle: circle) }
        case .noMatch:
            card {
                VStack(alignment: .leading, spacing: 12) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("No circle yet").font(.subheadline.weight(.semibold))
                        Text("Nobody’s swaps line up with “\(swap.gives)” for “\(swap.wants)” right now. Try a broader want, or look again later.")
                            .font(.footnote).foregroundStyle(RelayTheme.secondary).fixedSize(horizontal: false, vertical: true)
                    }
                    Button("Look again") { store.retrySwap(swapID) }.buttonStyle(RelayPrimaryButton(secondary: true))
                }
            }
        case .declined:
            card {
                VStack(alignment: .leading, spacing: 12) {
                    Text("You passed on this circle.").font(.subheadline.weight(.semibold))
                    Button("Look for another") { store.retrySwap(swapID) }.buttonStyle(RelayPrimaryButton(secondary: true))
                }
            }
        }
    }

    private func card(@ViewBuilder _ content: () -> some View) -> some View {
        content().padding(16).frame(maxWidth: .infinity, alignment: .leading).background(RelayTheme.surface, in: RoundedRectangle(cornerRadius: 20))
    }

    private func chat(_ swap: AgentSwap) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Circle chat").font(.subheadline.weight(.semibold))
            ForEach(swap.messages) { message in
                if let author = message.author {
                    HStack {
                        if author == TradeCircles.you { Spacer(minLength: 50) }
                        VStack(alignment: author == TradeCircles.you ? .trailing : .leading, spacing: 3) {
                            if author != TradeCircles.you { Text(author).font(.caption.weight(.semibold)).foregroundStyle(RelayTheme.secondary) }
                            Text(message.text).font(.subheadline)
                                .foregroundStyle(author == TradeCircles.you ? RelayTheme.onForest : RelayTheme.ink)
                                .padding(.horizontal, 13).padding(.vertical, 9)
                                .background(author == TradeCircles.you ? RelayTheme.forest : RelayTheme.surface, in: RoundedRectangle(cornerRadius: 16))
                        }
                        if author != TradeCircles.you { Spacer(minLength: 50) }
                    }
                } else {
                    HStack(alignment: .top, spacing: 8) {
                        BigAlAvatar(size: 22)
                        Text(message.text).font(.footnote).foregroundStyle(RelayTheme.secondary).fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
            HStack(spacing: 10) {
                TextField("Message the circle", text: $draft, axis: .vertical).lineLimit(1...3)
                    .padding(.horizontal, 14).padding(.vertical, 10)
                    .background(RelayTheme.surface, in: RoundedRectangle(cornerRadius: 18))
                    .overlay(RoundedRectangle(cornerRadius: 18).strokeBorder(RelayTheme.line))
                    .accessibilityIdentifier("circle-chat-input")
                Button { store.sendCircleMessage(swapID, draft); draft = "" } label: {
                    Image(systemName: "arrow.up").font(.system(size: 14, weight: .bold)).foregroundStyle(RelayTheme.onForest)
                        .frame(width: 36, height: 36).background(RelayTheme.forest, in: Circle())
                }
                .disabled(draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                .opacity(draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? 0.4 : 1)
                .accessibilityLabel("Send to circle")
            }
        }
    }
}

/// Members on a ring, arrows showing who hands what to whom. Approved members get a check.
struct CircleDiagram: View {
    let members: [SwapPost]
    let approvals: [String]
    private let node: CGFloat = 50

    var body: some View {
        GeometryReader { geo in
            let center = CGPoint(x: geo.size.width / 2, y: geo.size.height / 2)
            let radius = min(geo.size.width, geo.size.height) / 2 - node / 2 - 14
            let angles = members.indices.map { -Double.pi / 2 + 2 * Double.pi * Double($0) / Double(members.count) }
            ZStack {
                Canvas { context, _ in
                    let gap = Double(node / 2 + 8) / Double(radius)
                    for i in members.indices {
                        let start = angles[i] + gap
                        let end = angles[i] + 2 * Double.pi / Double(members.count) - gap
                        var path = Path()
                        for step in 0...40 {
                            let a = start + (end - start) * Double(step) / 40
                            let p = CGPoint(x: center.x + radius * cos(a), y: center.y + radius * sin(a))
                            step == 0 ? path.move(to: p) : path.addLine(to: p)
                        }
                        // Arrowhead along the tangent at the end of the arc.
                        let tip = CGPoint(x: center.x + radius * cos(end), y: center.y + radius * sin(end))
                        let dir = CGVector(dx: -sin(end), dy: cos(end))
                        for side in [-1.0, 1.0] {
                            let back = CGPoint(x: tip.x - 8 * dir.dx + side * 5 * dir.dy, y: tip.y - 8 * dir.dy - side * 5 * dir.dx)
                            path.move(to: tip); path.addLine(to: back)
                        }
                        context.stroke(path, with: .color(RelayTheme.accent), style: StrokeStyle(lineWidth: 1.75, lineCap: .round, lineJoin: .round))
                    }
                }
                ForEach(Array(members.enumerated()), id: \.offset) { i, member in
                    let isYou = member.person == TradeCircles.you
                    VStack(spacing: 4) {
                        Text(isYou ? "You" : String(member.person.prefix(1)))
                            .font(.system(size: isYou ? 14 : 18, weight: .semibold, design: .rounded))
                            .foregroundStyle(isYou ? RelayTheme.onForest : RelayTheme.forest)
                            .frame(width: node, height: node)
                            .background(isYou ? RelayTheme.forest : RelayTheme.soft, in: Circle())
                            .overlay(alignment: .bottomTrailing) {
                                if approvals.contains(member.person) {
                                    Image(systemName: "checkmark.circle.fill").font(.system(size: 17)).foregroundStyle(RelayTheme.accent)
                                        .background(Circle().fill(RelayTheme.paper)).offset(x: 3, y: 3)
                                        .transition(.scale.combined(with: .opacity))
                                }
                            }
                        if !isYou { Text(member.firstName).font(.caption2.weight(.medium)).foregroundStyle(RelayTheme.secondary) }
                    }
                    .position(x: center.x + radius * cos(angles[i]), y: center.y + radius * sin(angles[i]) + (isYou ? 0 : 7))
                }
            }
        }
        .frame(height: 230)
        .background(RelayTheme.surface, in: RoundedRectangle(cornerRadius: 20))
        .animation(.spring(response: 0.35, dampingFraction: 0.7), value: approvals)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Circle: " + members.map { $0.person == TradeCircles.you ? "you" : $0.firstName }.joined(separator: " to ") + ", and back to you. \(approvals.count) of \(members.count) approved.")
    }
}

struct CircleTicket: View {
    let swap: AgentSwap
    let circle: TradeCircle
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Eyebrow(text: "Circle meetup")
            Text(circle.code).font(.system(size: 34, weight: .semibold, design: .monospaced)).tracking(1)
                .accessibilityLabel("Circle code \(circle.code.map { String($0) }.joined(separator: " "))")
            Divider().overlay(RelayTheme.line)
            VStack(alignment: .leading, spacing: 10) {
                Label(circle.zone, systemImage: "mappin.and.ellipse")
                Label(circle.slot, systemImage: "clock")
                Label("Bring your \(swap.gives). Everyone shows the code, then hands off around the circle.", systemImage: "arrow.triangle.2.circlepath")
            }.font(.subheadline).foregroundStyle(RelayTheme.secondary)
            ShareLink(item: "Relay trading circle \(circle.code): \(circle.slot) at the \(circle.zone).") {
                Label("Share", systemImage: "square.and.arrow.up")
            }.buttonStyle(RelayPrimaryButton(secondary: true))
        }
        .padding(18)
        .background(RelayTheme.surface, in: RoundedRectangle(cornerRadius: 20))
        .overlay(RoundedRectangle(cornerRadius: 20).strokeBorder(RelayTheme.accent.opacity(0.6), lineWidth: 1))
    }
}

struct SwapRow: View {
    let swap: AgentSwap
    var body: some View {
        HStack(spacing: 13) {
            Image(systemName: "arrow.triangle.2.circlepath").font(.system(size: 18, weight: .medium)).foregroundStyle(RelayTheme.forest)
                .frame(width: 48, height: 48).background(RelayTheme.soft, in: RoundedRectangle(cornerRadius: 11))
            VStack(alignment: .leading, spacing: 3) {
                Text("\(swap.gives) → \(swap.circle?.members.last?.gives ?? swap.wants)").font(.subheadline.weight(.medium)).lineLimit(1)
                Text(detail).font(.footnote).foregroundStyle(RelayTheme.secondary).lineLimit(1)
            }
            Spacer(minLength: 4)
            if swap.phase == .searching || (swap.phase == .approving && swap.youApproved) { ProgressView().controlSize(.small) }
        }.padding(.vertical, 3)
    }
    private var detail: String {
        let size = swap.circle.map { "Circle of \($0.members.count)" } ?? "Swap"
        switch swap.phase {
        case .searching: return "Looking for a circle…"
        case .approving: return swap.youApproved ? "\(size) · waiting on \(swap.waitingOn.count)" : "\(size) · approve your part"
        case .confirmed: return swap.circle.map { "\($0.slot) · \($0.zone)" } ?? "Confirmed"
        case .noMatch: return "No circle yet"
        case .declined: return "You passed"
        }
    }
}
