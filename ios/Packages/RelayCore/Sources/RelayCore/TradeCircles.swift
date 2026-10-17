import Foundation

/// Trading circles: each student says what they'll give and what they want. Big Al looks for a
/// loop where everyone gets something they asked for, e.g. you → Priya → Jordan → you.

public struct SwapPost: Codable, Identifiable, Equatable, Sendable {
    public let id: String
    public var person: String
    public var campus: Campus
    public var gives: String
    public var wants: String
    public var imageName: String?
    public init(id: String = UUID().uuidString, person: String, campus: Campus, gives: String, wants: String, imageName: String? = nil) {
        self.id = id; self.person = person; self.campus = campus; self.gives = gives; self.wants = wants; self.imageName = imageName
    }
    public var firstName: String { person.split(separator: " ").first.map(String.init) ?? person }
}

/// One hand-off in the loop: `from` brings `item` for `to`.
public struct CircleLeg: Codable, Equatable, Sendable {
    public let from: String
    public let to: String
    public let item: String
    public let imageName: String?
}

public struct TradeCircle: Codable, Equatable, Sendable {
    /// Posts in loop order; the student's own post is always first.
    public let members: [SwapPost]
    public let zone: String
    public let slot: String
    public let code: String
    /// Leg i: member i brings what they give to member i + 1.
    public var legs: [CircleLeg] {
        members.indices.map { i in
            let next = members[(i + 1) % members.count]
            return CircleLeg(from: members[i].person, to: next.person, item: members[i].gives, imageName: members[i].imageName)
        }
    }
}

public enum SwapPhase: String, Codable, Sendable {
    case searching, approving, confirmed, noMatch, declined
}

public struct CircleMessage: Codable, Identifiable, Equatable, Sendable {
    public let id: UUID
    public let author: String?   // nil for Big Al
    public let text: String
    public let createdAt: Date
    public init(author: String?, text: String) { id = UUID(); self.author = author; self.text = text; createdAt = Date() }
}

public struct AgentSwap: Codable, Identifiable, Equatable, Sendable {
    public let id: UUID
    public var gives: String
    public var wants: String
    public var phase: SwapPhase
    public var circle: TradeCircle?
    /// People (by name) who have approved the circle. "You" is the student.
    public var approvals: [String]
    public var messages: [CircleMessage]
    public let createdAt: Date
    public init(id: UUID = UUID(), gives: String, wants: String, createdAt: Date = Date()) {
        self.id = id; self.gives = gives; self.wants = wants; self.phase = .searching
        self.circle = nil; self.approvals = []; self.messages = []; self.createdAt = createdAt
    }
    public var youApproved: Bool { approvals.contains(TradeCircles.you) }
    public var waitingOn: [String] { circle?.members.map(\.person).filter { !approvals.contains($0) } ?? [] }
}

public enum TradeCircles {
    public static let you = "You"
    public static let maxSize = 4

    private static let data: [SwapPost] = {
        guard let url = Bundle.module.url(forResource: "swaps", withExtension: "json"),
              let raw = try? Data(contentsOf: url) else { return [] }
        return (try? JSONDecoder().decode([SwapPost].self, from: raw)) ?? []
    }()
    /// Sample students with open swaps.
    public static var samplePosts: [SwapPost] { data }

    private static let ignored: Set<String> = ["a", "an", "the", "for", "my", "of", "and", "or", "to", "in", "with", "any", "some",
                                               "used", "new", "textbook", "book", "kit", "edition", "4e", "9e", "plus"]
    private static func words(_ text: String) -> [String] {
        text.lowercased().split { !$0.isLetter && !$0.isNumber }.map(String.init).filter { $0.count > 1 && !ignored.contains($0) }
    }

    /// True when `item` covers what someone `wants`: at least half of the wanted words appear.
    public static func satisfies(_ item: String, _ wants: String) -> Bool {
        let want = Set(words(wants))
        guard !want.isEmpty else { return false }
        let have = Set(words(item))
        let hits = want.filter { w in have.contains(w) || (w.count > 3 && have.contains { $0.hasPrefix(w) || w.hasPrefix($0) && $0.count > 3 }) }.count
        return hits * 2 >= want.count
    }

    /// The shortest loop through `mine` (2 to 4 people). Only posts on the
    /// student's campus are considered, so everyone can meet at one safe zone.
    public static func findCircle(for mine: SwapPost, in pool: [SwapPost]) -> TradeCircle? {
        let others = pool.filter { $0.id != mine.id && $0.campus == mine.campus && $0.person != mine.person }
        var best: [SwapPost]?
        func walk(_ path: [SwapPost]) {
            guard let last = path.last else { return }
            if path.count > 1, satisfies(last.gives, mine.wants) {
                if best == nil || path.count < best!.count { best = path }
                return
            }
            guard path.count < maxSize else { return }
            for next in others where !path.contains(where: { $0.id == next.id || $0.person == next.person }) && satisfies(last.gives, next.wants) {
                walk(path + [next])
            }
        }
        walk([mine])
        guard let members = best else { return nil }
        let meet = meetup(campus: mine.campus)
        return TradeCircle(members: members, zone: meet.zone, slot: meet.slot, code: BigAl.handoffCode(members.map(\.id).joined()))
    }

    /// Everyone in a circle meets once, together, at a staffed safe zone.
    public static func meetup(campus: Campus) -> (zone: String, slot: String) {
        campus == .auburn ? ("Auburn University Police lobby", "Sat 11:00 AM") : ("UAPD lobby", "Thu 4:00 PM")
    }
}
