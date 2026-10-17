import Foundation
import RelayCore

extension RelayStore {
    var agentSwaps: [AgentSwap] { (snapshot.agentSwaps ?? []).sorted { $0.createdAt < $1.createdAt } }
    func agentSwap(_ id: UUID) -> AgentSwap? { snapshot.agentSwaps?.first { $0.id == id } }
    var swapsNeedingYou: Int { agentSwaps.filter { $0.phase == .approving && !$0.youApproved }.count }

    /// Open swaps Big Al can chain through: the sample students plus trade posts on the campus board.
    var swapPool: [SwapPost] {
        let board = snapshot.requests.compactMap { r -> SwapPost? in
            guard r.postIntent == .trade, r.person != TradeCircles.you, let wants = r.exchangeFor, !wants.isEmpty else { return nil }
            return SwapPost(id: "board-" + r.id, person: r.person, campus: r.campus, gives: r.title, wants: wants)
        }
        return TradeCircles.samplePosts + board
    }

    @discardableResult
    func openSwap(gives: String, wants: String) -> UUID {
        let swap = AgentSwap(gives: gives, wants: wants)
        update { $0.agentSwaps = ($0.agentSwaps ?? []) + [swap] }
        Task { await runSwap(swap.id) }
        return swap.id
    }

    func resumeSwaps() {
        for swap in agentSwaps {
            if swap.phase == .searching { Task { await runSwap(swap.id) } }
            if swap.phase == .approving { Task { await gatherApprovals(swap.id) } }
        }
    }

    func retrySwap(_ id: UUID) {
        setSwap(id) { $0.phase = .searching; $0.circle = nil; $0.approvals = [] }
        Task { await runSwap(id) }
    }

    private func runSwap(_ id: UUID) async {
        try? await Task.sleep(for: .seconds(1.4))
        guard let swap = agentSwap(id), swap.phase == .searching else { return }
        let mine = SwapPost(id: id.uuidString, person: TradeCircles.you, campus: campus, gives: swap.gives, wants: swap.wants)
        guard let circle = TradeCircles.findCircle(for: mine, in: swapPool) else {
            setSwap(id) { $0.phase = .noMatch }
            return
        }
        let others = circle.members.dropFirst().map(\.firstName)
        let route = circle.members.enumerated().map { i, m in "\(i == 0 ? "you bring" : "\(m.firstName) brings") the \(m.gives)" }
        setSwap(id) {
            $0.circle = circle
            $0.phase = .approving
            $0.messages.append(CircleMessage(author: nil, text: "Found a circle with \(others.formatted(.list(type: .and))). Everyone gets what they asked for: \(route.formatted(.list(type: .and))). I’m checking with their agents."))
        }
        await gatherApprovals(id)
    }

    /// The other students' agents answer one at a time.
    private func gatherApprovals(_ id: UUID) async {
        guard let members = agentSwap(id)?.circle?.members.dropFirst() else { return }
        for member in members {
            guard let swap = agentSwap(id), swap.phase == .approving else { return }
            if swap.approvals.contains(member.person) { continue }
            try? await Task.sleep(for: .seconds(1.3))
            guard agentSwap(id)?.phase == .approving else { return }
            setSwap(id) {
                $0.approvals.append(member.person)
                $0.messages.append(CircleMessage(author: nil, text: "\(member.firstName) is in."))
            }
        }
        confirmIfEveryoneApproved(id)
    }

    func approveSwap(_ id: UUID) {
        guard let swap = agentSwap(id), swap.phase == .approving, !swap.youApproved else { return }
        setSwap(id) { $0.approvals.append(TradeCircles.you); $0.messages.append(CircleMessage(author: nil, text: "You’re in.")) }
        confirmIfEveryoneApproved(id)
    }

    private func confirmIfEveryoneApproved(_ id: UUID) {
        guard let swap = agentSwap(id), swap.phase == .approving, let circle = swap.circle, swap.waitingOn.isEmpty else { return }
        setSwap(id) {
            $0.phase = .confirmed
            $0.messages.append(CircleMessage(author: nil, text: "Everyone’s in. Meet \(circle.slot) at the \(circle.zone) and show code \(circle.code). Bring the \(swap.gives)."))
        }
        notify("Trading circle confirmed. Meet \(circle.slot) at the \(circle.zone).")
    }

    func declineSwap(_ id: UUID) {
        setSwap(id) { $0.phase = .declined; $0.messages.append(CircleMessage(author: nil, text: "You passed on this circle. I let everyone know.")) }
    }

    /// Leave a circle (or close a swap that never matched); Big Al tells the others.
    func closeSwap(_ id: UUID) {
        update { $0.agentSwaps?.removeAll { $0.id == id } }
    }

    func sendCircleMessage(_ id: UUID, _ text: String) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        setSwap(id) { $0.messages.append(CircleMessage(author: TradeCircles.you, text: trimmed)) }
    }

    private func setSwap(_ id: UUID, _ change: (inout AgentSwap) -> Void) {
        update { s in
            guard let i = s.agentSwaps?.firstIndex(where: { $0.id == id }) else { return }
            change(&s.agentSwaps![i])
        }
    }
}
