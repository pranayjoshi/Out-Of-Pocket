import Foundation

public struct MobilityError: Error, Equatable, LocalizedError, Sendable {
    public var code: String
    public var message: String
    public var errorDescription: String? { message }
    public init(_ code: String, _ message: String) { self.code = code; self.message = message }
}

public enum CampusClock {
    public static func dayKey(_ date: Date, timeZone: String) -> String {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: timeZone) ?? .gmt
        let parts = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
    }

    public static func instant(dayKey: String, hour: Int, minute: Int, timeZone: String) -> Date {
        let pieces = dayKey.split(separator: "-").compactMap { Int($0) }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: timeZone) ?? .gmt
        return calendar.date(from: DateComponents(year: pieces[0], month: pieces[1], day: pieces[2], hour: hour, minute: minute)) ?? Date()
    }

    public static func shift(_ dayKey: String, by days: Int) -> String {
        let pieces = dayKey.split(separator: "-").compactMap { Int($0) }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = .gmt
        let base = calendar.date(from: DateComponents(year: pieces[0], month: pieces[1], day: pieces[2])) ?? Date()
        let shifted = calendar.date(byAdding: .day, value: days, to: base) ?? base
        let parts = calendar.dateComponents([.year, .month, .day], from: shifted)
        return String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
    }

    public static func formatWhen(_ date: Date, timeZone: String, now: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: timeZone)
        let sameDay = dayKey(date, timeZone: timeZone) == dayKey(now, timeZone: timeZone)
        formatter.dateFormat = "h:mm a"
        let time = formatter.string(from: date)
        if sameDay { return "Today, \(time)" }
        formatter.dateFormat = "EEE, MMM d, h:mm a"
        return formatter.string(from: date)
    }

    public static func inWindow(_ date: Date, dayKey: String, windowName: String, timeZone: String) -> Bool {
        guard self.dayKey(date, timeZone: timeZone) == dayKey else { return false }
        if windowName.isEmpty || windowName == "any" { return true }
        let windows = ["morning": 8..<12, "afternoon": 12..<17, "evening": 17..<21]
        guard let range = windows[windowName] else { return false }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: timeZone) ?? .gmt
        let parts = calendar.dateComponents([.hour, .minute], from: date)
        let minutes = (parts.hour ?? 0) * 60 + (parts.minute ?? 0)
        return minutes >= range.lowerBound * 60 && minutes < range.upperBound * 60
    }

    public static func contribution(_ cents: Int) -> String { cents == 0 ? "Free" : Money.format(cents) }
}

public struct DepartureTemplate: Codable, Equatable, Sendable {
    public var dayOffset: Int
    public var hour: Int
    public var minute: Int
}

public struct PlaceCoordinates: Codable, Equatable, Sendable {
    public var latitude: Double
    public var longitude: Double
}

public struct CampusPlace: Codable, Identifiable, Equatable, Sendable {
    public var id: String
    public var name: String
    public var aliases: [String]
    public var area: String
    public var kind: String
    public var source: String
    public var reviewStatus: String
    public var reviewedAt: String?
    public var coordinates: PlaceCoordinates?
    public var formattedAddress: String
    public var pickupNotes: String
}

public struct CampusMapConfig: Codable, Identifiable, Equatable, Sendable {
    public var campusId: String
    public var name: String
    public var label: String
    public var shortName: String
    public var timezone: String
    public var officialMapUrl: String
    public var embedUrl: String?
    public var embedPermitted: Bool
    public var fallback: String
    public var framingNote: String
    public var attribution: String
    public var places: [CampusPlace]
    public var id: String { campusId }
}

public struct RideTrip: Codable, Identifiable, Equatable, Sendable {
    public var id: String
    public var kind: String
    public var driverId: String
    public var driverName: String
    public var driverInitials: String
    public var emailVerified: Bool
    public var drivingCheck: String
    public var campusId: String
    public var pickupId: String
    public var destinationId: String
    public var departure: DepartureTemplate?
    public var departureAt: String?
    public var timezone: String
    public var capacity: Int
    public var contributionCents: Int
    public var vehicleSummary: String
    public var luggage: String
    public var accessibilityNotes: String
    public var status: String
    public var meetingInstructions: String
    public var cancellationTerms: String
    public var demo: Bool
    public var version: Int
}

public struct RideBooking: Codable, Identifiable, Equatable, Sendable {
    public var id: String
    public var tripId: String
    public var riderId: String
    public var riderName: String
    public var quantity: Int
    public var status: String
    public var needsReconfirm: Bool
    public var acceptedPickupId: String?
    public var acceptedDestinationId: String?
    public var createdAt: String?
    public var expiresAt: String?
    public var demo: Bool
    public var version: Int
}

public struct ProviderHandoff: Codable, Identifiable, Equatable, Sendable {
    public var id: String
    public var userId: String
    public var provider: String
    public var campusId: String
    public var pickupId: String
    public var destinationId: String
    public var coordinatesIncluded: Bool
    public var openedAt: String
    public var bookingState: String?
}

public struct IdempotencyRecord: Codable, Equatable, Sendable {
    public var tripId: String?
    public var bookingId: String?
    public var orderId: String?
    public var listingId: String?
}

public struct RideLedger: Codable, Equatable, Sendable {
    public var trips: [RideTrip]
    public var bookings: [RideBooking]
    public var handoffs: [ProviderHandoff]
    public var keys: [String: IdempotencyRecord]
    public init(trips: [RideTrip], bookings: [RideBooking], handoffs: [ProviderHandoff], keys: [String: IdempotencyRecord]) {
        self.trips = trips
        self.bookings = bookings
        self.handoffs = handoffs
        self.keys = keys
    }
}

public struct TicketTypeSpec: Codable, Identifiable, Equatable, Sendable {
    public var id: String
    public var label: String
    public var fields: [String]
    public var maxPerListing: Int
}

public struct OfficialChannel: Codable, Equatable, Sendable {
    public var name: String
    public var url: String
    public var note: String
}

public struct AdmissionEvent: Codable, Identifiable, Equatable, Sendable {
    public var id: String
    public var campusId: String
    public var name: String
    public var venue: String
    public var venuePlaceId: String
    public var start: DepartureTemplate?
    public var startAt: String?
    public var originalStartAt: String?
    public var timeTbd: Bool
    public var timezone: String
    public var status: String
    public var policyVersion: Int
    public var eligibility: String
    public var transferRoute: String
    public var transferLabel: String
    public var transferInstructions: String
    public var transferPortalUrl: String?
    public var transferDeadlineHoursBefore: Int
    public var resale: String
    public var ticketTypes: [TicketTypeSpec]
    public var officialChannel: OfficialChannel?
    public var source: String
    public var reviewedAt: String?
    public var demo: Bool
    public var scheduleChange: String?
}

public struct TicketListing: Codable, Identifiable, Equatable, Sendable {
    public var id: String
    public var sellerId: String
    public var sellerName: String
    public var eventId: String
    public var typeId: String
    public var bowl: String
    public var quantity: Int
    public var priceCents: Int
    public var status: String
    public var attestation: Bool
    public var demo: Bool
    public var version: Int
}

public struct TicketOrder: Codable, Identifiable, Equatable, Sendable {
    public var id: String
    public var listingId: String
    public var eventId: String
    public var buyerId: String
    public var buyerName: String
    public var sellerId: String
    public var quantity: Int
    public var priceCents: Int
    public var buyerTotalCents: Int?
    public var sellerProceedsCents: Int?
    public var policyVersion: Int?
    public var eventName: String?
    public var venue: String?
    public var bowl: String?
    public var typeId: String?
    public var eventStart: String?
    public var originalEventStart: String?
    public var transferDeadline: String?
    public var transferRoute: String?
    public var status: String
    public var confirmation: String?
    public var payment: String?
    public var transferReport: String?
    public var expiresAt: String?
    public var recipientLabel: String?
    public var createdAt: String?
    public var demo: Bool
    public var version: Int
    public var scheduleChange: String?
}

public struct EventReviewRequest: Codable, Identifiable, Equatable, Sendable {
    public var id: String
    public var name: String
    public var campusId: String
    public var status: String
    public var createdAt: String
}

public struct TicketLedger: Codable, Equatable, Sendable {
    public var events: [AdmissionEvent]
    public var listings: [TicketListing]
    public var orders: [TicketOrder]
    public var eventRequests: [EventReviewRequest]
    public var keys: [String: IdempotencyRecord]
    public init(events: [AdmissionEvent], listings: [TicketListing], orders: [TicketOrder], eventRequests: [EventReviewRequest], keys: [String: IdempotencyRecord]) {
        self.events = events
        self.listings = listings
        self.orders = orders
        self.eventRequests = eventRequests
        self.keys = keys
    }
}

public struct UberLink: Equatable, Sendable {
    public var mode: String
    public var url: URL
    public var nativeURL: URL?
    public var coordinatesIncluded: Bool
    public var bookingState: String?
    public var message: String
    public var copyText: String
}

struct MobilityCatalog: Codable {
    var flags: Flags
    var campuses: [CampusMapConfig]
    var rides: [RideTrip]
    var bookings: [RideBooking]
    var events: [AdmissionEvent]
    var ticketListings: [TicketListing]
    var ticketOrders: [TicketOrder]
    struct Flags: Codable {
        var ridesDemo: Bool
        var ticketsDemo: Bool
        var uberHandoff: Bool
        var liveRideMatching: Bool
        var paidRides: Bool
        var ticketCheckout: Bool
    }
}

public enum CampusMobility {
    public static let you = "you"
    public static let holdInterval: TimeInterval = 10 * 60
    private static let holdingRide = ["accepted", "in_progress", "completed"]
    private static let activeRequest = ["requested", "accepted", "in_progress"]
    private static let holdingTicket = ["reserved", "payment_pending", "awaiting_transfer", "transfer_reported", "receipt_reported", "completed", "disputed"]

    static func catalog() throws -> MobilityCatalog {
        guard let url = Bundle.module.url(forResource: "rides-tickets", withExtension: "json") else { throw CocoaError(.fileNoSuchFile) }
        return try JSONDecoder().decode(MobilityCatalog.self, from: Data(contentsOf: url))
    }

    public static func campus(for campus: Campus) throws -> CampusMapConfig {
        let id = campus == .alabama ? "alabama" : "auburn"
        guard let match = try catalog().campuses.first(where: { $0.campusId == id }) else {
            throw MobilityError("not_found", "That campus is not in the demo.")
        }
        return match
    }

    public static func place(_ campusId: String, _ placeId: String) throws -> CampusPlace {
        guard let campus = try catalog().campuses.first(where: { $0.campusId == campusId }),
              let place = campus.places.first(where: { $0.id == placeId }) else {
            throw MobilityError("not_found", "Choose a meeting point from the list.")
        }
        return place
    }

    public static func searchPlaces(_ campusId: String, query: String) throws -> [CampusPlace] {
        let places = try catalog().campuses.first { $0.campusId == campusId }?.places ?? []
        let text = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !text.isEmpty else { return places }
        return places.filter { place in
            place.name.lowercased().contains(text) || place.aliases.contains { $0.lowercased().contains(text) }
        }
    }

    public static func seedRides(now: Date = Date()) throws -> RideLedger {
        let source = try catalog()
        let trips = source.rides
        let bookings = source.bookings.map { booking in
            var copy = booking
            copy.createdAt = iso(now)
            if booking.status == "accepted", let trip = trips.first(where: { $0.id == booking.tripId }) {
                copy.acceptedPickupId = trip.pickupId
                copy.acceptedDestinationId = trip.destinationId
            }
            return copy
        }
        return RideLedger(trips: trips, bookings: bookings, handoffs: [], keys: [:])
    }

    public static func hydrateRides(_ saved: RideLedger?, now: Date = Date()) throws -> RideLedger {
        let fresh = try seedRides(now: now)
        guard let saved, !saved.trips.isEmpty else { return fresh }
        var trips = saved.trips
        var bookings = saved.bookings
        for trip in fresh.trips where !trips.contains(where: { $0.id == trip.id }) { trips.append(trip) }
        for booking in fresh.bookings where !bookings.contains(where: { $0.id == booking.id }) { bookings.append(booking) }
        return RideLedger(trips: trips, bookings: bookings, handoffs: saved.handoffs, keys: saved.keys)
    }

    public static func departure(_ trip: RideTrip, now: Date) throws -> Date {
        if let raw = trip.departureAt, let date = ISO8601DateFormatter().date(from: raw) { return date }
        guard let spec = trip.departure else { throw MobilityError("invalid_time", "Choose a departure time.") }
        let key = CampusClock.shift(CampusClock.dayKey(now, timeZone: trip.timezone), by: spec.dayOffset)
        return CampusClock.instant(dayKey: key, hour: spec.hour, minute: spec.minute, timeZone: trip.timezone)
    }

    public static func seatsLeft(_ state: RideLedger, tripId: String) throws -> Int {
        guard let trip = state.trips.first(where: { $0.id == tripId }) else { throw MobilityError("not_found", "That ride is no longer available.") }
        let taken = state.bookings.filter { $0.tripId == tripId && holdingRide.contains($0.status) }.reduce(0) { $0 + $1.quantity }
        return max(0, trip.capacity - taken)
    }

    public static func summary(_ state: RideLedger, trip: RideTrip, now: Date = Date()) throws -> String {
        let when = try departure(trip, now: now)
        let pickup = try place(trip.campusId, trip.pickupId)
        let destination = try place(trip.campusId, trip.destinationId)
        let left = trip.kind == "request" ? trip.capacity : try seatsLeft(state, tripId: trip.id)
        let seats = left == 1 ? "seat" : "seats"
        return "\(CampusClock.formatWhen(when, timeZone: trip.timezone, now: now)) · \(pickup.name) → \(destination.name) · \(left) \(seats) left · \(CampusClock.contribution(trip.contributionCents)) per seat"
    }

    public static func search(_ state: RideLedger, campusId: String, pickupId: String, destinationId: String, dayKey: String, windowName: String, seats: Int, baggage: Bool = false, accessible: Bool = false, now: Date = Date()) throws -> [RideTrip] {
        if pickupId == destinationId { throw MobilityError("same_place", "Choose a destination that is different from the pickup.") }
        _ = try place(campusId, pickupId)
        _ = try place(campusId, destinationId)
        return try state.trips.filter { trip in
            guard trip.kind == "offer", trip.campusId == campusId else { return false }
            if ["canceled", "expired", "completed"].contains(trip.status) { return false }
            if trip.pickupId != pickupId || trip.destinationId != destinationId { return false }
            let when = try departure(trip, now: now)
            if !CampusClock.inWindow(when, dayKey: dayKey, windowName: windowName, timeZone: trip.timezone) { return false }
            if baggage && trip.luggage.isEmpty { return false }
            if accessible && trip.accessibilityNotes.isEmpty { return false }
            return true
        }.sorted { (try? departure($0, now: now)) ?? .distantFuture < ((try? departure($1, now: now)) ?? .distantFuture) }
    }

    public static func requestSeat(_ original: RideLedger, tripId: String, riderId: String = you, riderName: String = "You", riderCampusId: String, quantity: Int, idempotencyKey: String? = nil, blocked: [[String]] = [], now: Date = Date()) throws -> (RideLedger, RideBooking) {
        if let key = idempotencyKey, let prior = original.keys[key], let booking = original.bookings.first(where: { $0.id == prior.bookingId }) {
            return (original, booking)
        }
        var state = original
        guard let index = state.trips.firstIndex(where: { $0.id == tripId }) else { throw MobilityError("not_found", "That ride is no longer available.") }
        let trip = state.trips[index]
        if trip.kind != "offer" { throw MobilityError("wrong_flow", "Respond to a ride request from its conversation.") }
        if trip.campusId != riderCampusId { throw MobilityError("cross_campus", "This ride is for another campus.") }
        if trip.driverId == riderId { throw MobilityError("self", "You can’t request a seat in your own car.") }
        if blocked.contains(where: { ($0.first == riderId && $0.last == trip.driverId) || ($0.last == riderId && $0.first == trip.driverId) }) {
            throw MobilityError("blocked", "This ride isn’t available.")
        }
        if !["open", "full"].contains(trip.status) { throw MobilityError("closed", "This ride is not taking requests.") }
        if quantity < 1 || quantity > 6 { throw MobilityError("invalid_capacity", "Request 1 to 6 seats.") }
        if state.bookings.contains(where: { $0.tripId == trip.id && $0.riderId == riderId && activeRequest.contains($0.status) }) {
            throw MobilityError("duplicate", "You already have a request on this ride.")
        }
        let when = try departure(trip, now: now)
        if when <= now { throw MobilityError("expired", "This ride has already departed.") }
        let booking = RideBooking(id: next("book"), tripId: trip.id, riderId: riderId, riderName: riderName, quantity: quantity, status: "requested", needsReconfirm: false, acceptedPickupId: nil, acceptedDestinationId: nil, createdAt: iso(now), expiresAt: iso(when), demo: true, version: 1)
        state.bookings.append(booking)
        if let key = idempotencyKey { state.keys[key] = IdempotencyRecord(tripId: nil, bookingId: booking.id, orderId: nil, listingId: nil) }
        return (state, booking)
    }

    public static func acceptBooking(_ original: RideLedger, bookingId: String, actorId: String, idempotencyKey: String? = nil, expectedTripVersion: Int? = nil, now: Date = Date()) throws -> (RideLedger, RideBooking) {
        if let key = idempotencyKey, let prior = original.keys[key], let booking = original.bookings.first(where: { $0.id == prior.bookingId }) {
            return (original, booking)
        }
        var state = original
        guard let bookingIndex = state.bookings.firstIndex(where: { $0.id == bookingId }) else { throw MobilityError("not_found", "That request is no longer available.") }
        guard let tripIndex = state.trips.firstIndex(where: { $0.id == state.bookings[bookingIndex].tripId }) else { throw MobilityError("not_found", "That ride is no longer available.") }
        if state.trips[tripIndex].driverId != actorId { throw MobilityError("forbidden", "Only the driver can accept a request.") }
        if let expected = expectedTripVersion, state.trips[tripIndex].version != expected { throw MobilityError("conflict", "This ride changed. Review the request again.") }
        if state.bookings[bookingIndex].status == "accepted" { throw MobilityError("already_accepted", "This request is already accepted.") }
        if state.bookings[bookingIndex].status != "requested" { throw MobilityError("closed", "This request can no longer be accepted.") }
        let parsed = state.bookings[bookingIndex].expiresAt.flatMap { ISO8601DateFormatter().date(from: $0) }
        let deadline = try parsed ?? departure(state.trips[tripIndex], now: now)
        if deadline <= now { throw MobilityError("expired", "This request expired.") }
        let left = try seatsLeft(state, tripId: state.trips[tripIndex].id)
        if state.bookings[bookingIndex].quantity > left { throw MobilityError("full", "That seat was just taken.") }
        state.bookings[bookingIndex].status = "accepted"
        state.bookings[bookingIndex].acceptedPickupId = state.trips[tripIndex].pickupId
        state.bookings[bookingIndex].acceptedDestinationId = state.trips[tripIndex].destinationId
        state.bookings[bookingIndex].needsReconfirm = false
        state.bookings[bookingIndex].version += 1
        try syncFull(&state, tripIndex: tripIndex)
        state.trips[tripIndex].version += 1
        if let key = idempotencyKey { state.keys[key] = IdempotencyRecord(tripId: nil, bookingId: bookingId, orderId: nil, listingId: nil) }
        return (state, state.bookings[bookingIndex])
    }

    public static func declineBooking(_ original: RideLedger, bookingId: String, actorId: String) throws -> RideLedger {
        var state = original
        guard let bookingIndex = state.bookings.firstIndex(where: { $0.id == bookingId }) else { throw MobilityError("not_found", "That request is no longer available.") }
        guard let trip = state.trips.first(where: { $0.id == state.bookings[bookingIndex].tripId }) else { throw MobilityError("not_found", "That ride is no longer available.") }
        if trip.driverId != actorId { throw MobilityError("forbidden", "Only the driver can decline a request.") }
        if state.bookings[bookingIndex].status != "requested" { throw MobilityError("closed", "This request can no longer be declined.") }
        state.bookings[bookingIndex].status = "declined"
        state.bookings[bookingIndex].version += 1
        return state
    }

    public static func withdrawBooking(_ original: RideLedger, bookingId: String, actorId: String) throws -> RideLedger {
        var state = original
        guard let bookingIndex = state.bookings.firstIndex(where: { $0.id == bookingId }) else { throw MobilityError("not_found", "That request is no longer available.") }
        if state.bookings[bookingIndex].riderId != actorId { throw MobilityError("forbidden", "Only the rider can withdraw this request.") }
        if state.bookings[bookingIndex].status != "requested" { throw MobilityError("closed", "Withdraw is only available while the driver is deciding.") }
        state.bookings[bookingIndex].status = "withdrawn"
        state.bookings[bookingIndex].version += 1
        return state
    }

    public static func cancelBooking(_ original: RideLedger, bookingId: String, actorId: String, idempotencyKey: String? = nil) throws -> RideLedger {
        if let key = idempotencyKey, original.keys[key] != nil { return original }
        var state = original
        guard let bookingIndex = state.bookings.firstIndex(where: { $0.id == bookingId }) else { throw MobilityError("not_found", "That request is no longer available.") }
        guard let tripIndex = state.trips.firstIndex(where: { $0.id == state.bookings[bookingIndex].tripId }) else { throw MobilityError("not_found", "That ride is no longer available.") }
        if state.bookings[bookingIndex].riderId != actorId && state.trips[tripIndex].driverId != actorId {
            throw MobilityError("forbidden", "Only the rider or driver can cancel this seat.")
        }
        if state.bookings[bookingIndex].status == "canceled" { throw MobilityError("already_canceled", "This seat is already canceled.") }
        if !["requested", "accepted", "in_progress"].contains(state.bookings[bookingIndex].status) { throw MobilityError("closed", "This seat can no longer be canceled.") }
        state.bookings[bookingIndex].status = "canceled"
        state.bookings[bookingIndex].version += 1
        try syncFull(&state, tripIndex: tripIndex)
        state.trips[tripIndex].version += 1
        if let key = idempotencyKey { state.keys[key] = IdempotencyRecord(tripId: nil, bookingId: bookingId, orderId: nil, listingId: nil) }
        return state
    }

    public static func createOffer(_ original: RideLedger, campusId: String, pickupId: String, destinationId: String, departureAt: Date, capacity: Int, contributionCents: Int, vehicleSummary: String, luggage: String = "", accessibilityNotes: String = "", now: Date = Date()) throws -> (RideLedger, RideTrip) {
        if pickupId == destinationId { throw MobilityError("same_place", "Choose a destination that is different from the pickup.") }
        _ = try place(campusId, pickupId)
        _ = try place(campusId, destinationId)
        let campus = try catalog().campuses.first { $0.campusId == campusId }
        guard let campus else { throw MobilityError("not_found", "That campus is not in the demo.") }
        if capacity < 1 || capacity > 6 { throw MobilityError("invalid_capacity", "Offer 1 to 6 seats.") }
        if contributionCents < 0 || contributionCents > 100_000 { throw MobilityError("invalid_amount", "Enter a contribution from Free to $1,000.") }
        if departureAt <= now { throw MobilityError("invalid_time", "Choose a departure that is still ahead.") }
        let vehicle = String(vehicleSummary.trimmingCharacters(in: .whitespacesAndNewlines).prefix(80))
        if vehicle.isEmpty { throw MobilityError("invalid_vehicle", "Add a short vehicle description.") }
        var state = original
        let trip = RideTrip(id: next("ride"), kind: "offer", driverId: you, driverName: "You", driverInitials: "Y", emailVerified: false, drivingCheck: "not_checked", campusId: campusId, pickupId: pickupId, destinationId: destinationId, departure: nil, departureAt: iso(departureAt), timezone: campus.timezone, capacity: capacity, contributionCents: contributionCents, vehicleSummary: vehicle, luggage: String(luggage.prefix(120)), accessibilityNotes: String(accessibilityNotes.prefix(200)), status: "open", meetingInstructions: "Meet at the named area. This demo point has not been approved for vehicle pickup.", cancellationTerms: "Cancel before departure. An accepted cancellation releases the seat once. This demo does not collect payment.", demo: true, version: 1)
        state.trips.insert(trip, at: 0)
        return (state, trip)
    }

    public static func recordHandoff(_ original: RideLedger, campusId: String, pickupId: String, destinationId: String, coordinatesIncluded: Bool, now: Date = Date()) -> (RideLedger, ProviderHandoff) {
        var state = original
        let handoff = ProviderHandoff(id: next("handoff"), userId: you, provider: "uber", campusId: campusId, pickupId: pickupId, destinationId: destinationId, coordinatesIncluded: coordinatesIncluded, openedAt: iso(now), bookingState: nil)
        state.handoffs.insert(handoff, at: 0)
        return (state, handoff)
    }

    public static func uberLink(pickup: CampusPlace, dropoff: CampusPlace, clientId: String) throws -> UberLink {
        if pickup.name.isEmpty || dropoff.name.isEmpty { throw MobilityError("missing_place", "Choose a pickup and a destination before opening Uber.") }
        let copy = "\(pickup.name)\n\(dropoff.name)"
        let trimmed = clientId.trimmingCharacters(in: .whitespacesAndNewlines)
        let pickupCoordinates = reviewedCoordinates(pickup)
        let dropoffCoordinates = reviewedCoordinates(dropoff)
        if trimmed.isEmpty {
            return UberLink(mode: "manual", url: URL(string: "https://m.uber.com/")!, nativeURL: nil, coordinatesIncluded: false, bookingState: nil, message: "Uber opens for you to confirm the pickup and destination. Review your pickup, fare, and booking in Uber. Relay does not book this ride.", copyText: copy)
        }
        guard let pickupCoordinates, let dropoffCoordinates else {
            let url = URL(string: "https://m.uber.com/looking?client_id=\(trimmed.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? trimmed)")!
            return UberLink(mode: "confirm", url: url, nativeURL: nil, coordinatesIncluded: false, bookingState: nil, message: "These locations do not have reviewed coordinates, so Relay will not send a pin. Confirm the pickup and destination in Uber.", copyText: copy)
        }
        let pickupJSON = #"{"latitude":\#(pickupCoordinates.latitude),"longitude":\#(pickupCoordinates.longitude),"addressLine1":"\#(pickup.name)","addressLine2":"\#(pickup.formattedAddress)"}"#
        let dropJSON = #"{"latitude":\#(dropoffCoordinates.latitude),"longitude":\#(dropoffCoordinates.longitude),"addressLine1":"\#(dropoff.name)","addressLine2":"\#(dropoff.formattedAddress)"}"#
        let query = "client_id=\(encode(trimmed))&pickup=\(encode(pickupJSON))&drop[0]=\(encode(dropJSON))"
        let url = URL(string: "https://m.uber.com/looking?\(query)")!
        let native = URL(string: "uber://riderequest?pickup[latitude]=\(pickupCoordinates.latitude)&pickup[longitude]=\(pickupCoordinates.longitude)&dropoff[latitude]=\(dropoffCoordinates.latitude)&dropoff[longitude]=\(dropoffCoordinates.longitude)")
        return UberLink(mode: "reviewed", url: url, nativeURL: native, coordinatesIncluded: true, bookingState: nil, message: "Review your pickup, fare, and booking in Uber. Relay does not book this ride.", copyText: copy)
    }

    public static func seedTickets(now: Date = Date()) throws -> TicketLedger {
        let source = try catalog()
        let orders = try source.ticketOrders.map { order -> TicketOrder in
            var copy = order
            guard let event = source.events.first(where: { $0.id == order.eventId }) else { return copy }
            let when = try eventStart(event, now: now)
            copy.buyerTotalCents = order.priceCents * order.quantity
            copy.sellerProceedsCents = order.priceCents * order.quantity
            copy.policyVersion = event.policyVersion
            copy.eventName = event.name
            copy.venue = event.venue
            copy.bowl = copy.bowl ?? ""
            copy.eventStart = iso(when)
            copy.originalEventStart = iso(when)
            copy.transferDeadline = iso(when.addingTimeInterval(TimeInterval(-event.transferDeadlineHoursBefore * 3600)))
            copy.transferRoute = event.transferRoute
            copy.expiresAt = order.status == "expired" ? iso(now.addingTimeInterval(-60)) : nil
            copy.recipientLabel = "Demo recipient · Jordan L."
            copy.createdAt = iso(now)
            return copy
        }
        return TicketLedger(events: source.events, listings: source.ticketListings, orders: orders, eventRequests: [], keys: [:])
    }

    public static func hydrateTickets(_ saved: TicketLedger?, now: Date = Date()) throws -> TicketLedger {
        let fresh = try seedTickets(now: now)
        guard let saved, !saved.events.isEmpty else { return fresh }
        var events = saved.events
        var listings = saved.listings
        var orders = saved.orders
        for event in fresh.events where !events.contains(where: { $0.id == event.id }) { events.append(event) }
        for listing in fresh.listings where !listings.contains(where: { $0.id == listing.id }) { listings.append(listing) }
        for order in fresh.orders where !orders.contains(where: { $0.id == order.id }) { orders.append(order) }
        return TicketLedger(events: events, listings: listings, orders: orders, eventRequests: saved.eventRequests, keys: saved.keys)
    }

    public static func availableQuantity(_ state: TicketLedger, listingId: String, now: Date = Date()) -> Int {
        guard let listing = state.listings.first(where: { $0.id == listingId }), listing.status == "active" else { return 0 }
        guard let event = state.events.first(where: { $0.id == listing.eventId }), event.status != "canceled" else { return 0 }
        let held = state.orders.filter { order in
            guard order.listingId == listingId, holdingTicket.contains(order.status) else { return false }
            if order.status == "reserved", let raw = order.expiresAt, let expiry = ISO8601DateFormatter().date(from: raw), expiry <= now { return false }
            return true
        }.reduce(0) { $0 + $1.quantity }
        return max(0, listing.quantity - held)
    }

    public static func reserveTicket(_ original: TicketLedger, listingId: String, buyerId: String = you, buyerName: String = "You", buyerCampusId: String, quantity: Int = 1, idempotencyKey: String? = nil, blocked: [[String]] = [], now: Date = Date()) throws -> (TicketLedger, TicketOrder) {
        if let key = idempotencyKey, let prior = original.keys[key], let order = original.orders.first(where: { $0.id == prior.orderId }) {
            return (original, order)
        }
        var state = original
        guard let listing = state.listings.first(where: { $0.id == listingId }) else { throw MobilityError("not_found", "That ticket listing is no longer available.") }
        guard let event = state.events.first(where: { $0.id == listing.eventId }) else { throw MobilityError("not_found", "That event is not in the campus catalog.") }
        if event.campusId != buyerCampusId { throw MobilityError("cross_campus", "This ticket is for another campus.") }
        if listing.sellerId == buyerId { throw MobilityError("self", "You can’t reserve your own ticket.") }
        if blocked.contains(where: { ($0.first == buyerId && $0.last == listing.sellerId) || ($0.last == buyerId && $0.first == listing.sellerId) }) {
            throw MobilityError("blocked", "This listing isn’t available.")
        }
        if event.status == "canceled" { throw MobilityError("paused", "This event was canceled. Listings are paused.") }
        guard let type = event.ticketTypes.first(where: { $0.id == listing.typeId }) else {
            throw MobilityError("unsupported_type", event.officialChannel?.note ?? "That ticket type is not offered for this event.")
        }
        if quantity < 1 || quantity > type.maxPerListing { throw MobilityError("invalid_quantity", "Choose a quantity this event allows.") }
        if availableQuantity(state, listingId: listing.id, now: now) < quantity { throw MobilityError("unavailable", "Those tickets are no longer available.") }
        let when = try eventStart(event, now: now)
        let order = TicketOrder(id: next("order"), listingId: listing.id, eventId: event.id, buyerId: buyerId, buyerName: buyerName, sellerId: listing.sellerId, quantity: quantity, priceCents: listing.priceCents, buyerTotalCents: listing.priceCents * quantity, sellerProceedsCents: listing.priceCents * quantity, policyVersion: event.policyVersion, eventName: event.name, venue: event.venue, bowl: listing.bowl, typeId: listing.typeId, eventStart: iso(when), originalEventStart: event.originalStartAt ?? iso(when), transferDeadline: iso(when.addingTimeInterval(TimeInterval(-event.transferDeadlineHoursBefore * 3600))), transferRoute: event.transferRoute, status: "reserved", confirmation: nil, payment: nil, transferReport: nil, expiresAt: iso(now.addingTimeInterval(holdInterval)), recipientLabel: "Demo recipient · \(buyerName)", createdAt: iso(now), demo: true, version: 1, scheduleChange: nil)
        state.orders.insert(order, at: 0)
        if let key = idempotencyKey { state.keys[key] = IdempotencyRecord(tripId: nil, bookingId: nil, orderId: order.id, listingId: nil) }
        return (state, order)
    }

    public static func simulatePayment(_ original: TicketLedger, orderId: String, actorId: String, now: Date = Date()) throws -> TicketLedger {
        if try catalog().flags.ticketCheckout { throw MobilityError("live_disabled", "Live ticket checkout is not enabled.") }
        var state = original
        guard let index = state.orders.firstIndex(where: { $0.id == orderId }) else { throw MobilityError("not_found", "That order is no longer available.") }
        if state.orders[index].buyerId != actorId { throw MobilityError("forbidden", "Only the buyer can continue this order.") }
        if state.orders[index].status == "expired" || (state.orders[index].status == "reserved" && expired(state.orders[index].expiresAt, now: now)) {
            state.orders[index].status = "expired"
            throw MobilityError("expired", "That hold expired. The ticket can be reserved again.")
        }
        if state.orders[index].status != "reserved" && state.orders[index].status != "payment_pending" {
            throw MobilityError("closed", "Payment simulation is no longer available for this order.")
        }
        state.orders[index].status = "awaiting_transfer"
        state.orders[index].payment = "simulated"
        state.orders[index].version += 1
        return state
    }

    public static func reportTransfer(_ original: TicketLedger, orderId: String, actorId: String) throws -> TicketLedger {
        var state = original
        guard let index = state.orders.firstIndex(where: { $0.id == orderId }) else { throw MobilityError("not_found", "That order is no longer available.") }
        if state.orders[index].sellerId != actorId { throw MobilityError("forbidden", "Only the seller can report a transfer.") }
        if state.orders[index].status != "awaiting_transfer" { throw MobilityError("closed", "Report the transfer after the demo payment step.") }
        state.orders[index].status = "transfer_reported"
        state.orders[index].transferReport = "Reported by seller"
        state.orders[index].version += 1
        return state
    }

    public static func reportReceipt(_ original: TicketLedger, orderId: String, actorId: String) throws -> TicketLedger {
        var state = original
        guard let index = state.orders.firstIndex(where: { $0.id == orderId }) else { throw MobilityError("not_found", "That order is no longer available.") }
        if state.orders[index].buyerId != actorId { throw MobilityError("forbidden", "Only the buyer can report receipt.") }
        if state.orders[index].status != "transfer_reported" { throw MobilityError("closed", "Wait for the seller to report the transfer.") }
        state.orders[index].status = "receipt_reported"
        state.orders[index].confirmation = "Reported by buyer"
        state.orders[index].version += 1
        return state
    }

    public static func reportProblem(_ original: TicketLedger, orderId: String, actorId: String) throws -> TicketLedger {
        var state = original
        guard let index = state.orders.firstIndex(where: { $0.id == orderId }) else { throw MobilityError("not_found", "That order is no longer available.") }
        if state.orders[index].buyerId != actorId && state.orders[index].sellerId != actorId {
            throw MobilityError("forbidden", "Only the buyer or seller can open a case.")
        }
        if state.orders[index].status == "completed" || state.orders[index].status == "canceled" {
            throw MobilityError("closed", "This order can no longer be disputed.")
        }
        state.orders[index].status = "disputed"
        state.orders[index].version += 1
        return state
    }

    public static func publishListing(_ original: TicketLedger, eventId: String, typeId: String, bowl: String, quantity: Int, priceCents: Int, attestation: Bool, sellerName: String = "You") throws -> (TicketLedger, TicketListing) {
        var state = original
        guard let event = state.events.first(where: { $0.id == eventId }) else { throw MobilityError("not_found", "That event is not in the campus catalog.") }
        if event.status == "canceled" || event.status == "paused" { throw MobilityError("paused", "Listings are paused while this event is resolved.") }
        if !attestation { throw MobilityError("attestation", "Confirm that you are eligible to transfer this ticket.") }
        guard let type = event.ticketTypes.first(where: { $0.id == typeId }) else {
            throw MobilityError("unsupported_type", event.officialChannel?.note ?? "That ticket type is not offered for this event.")
        }
        if quantity < 1 || quantity > type.maxPerListing {
            throw MobilityError("invalid_quantity", type.maxPerListing == 1 ? "List one ticket for this event." : "List 1 to \(type.maxPerListing) tickets.")
        }
        if priceCents < 0 || priceCents > 100_000 { throw MobilityError("invalid_amount", "Enter a price from Free to $1,000.") }
        let section = String(bowl.trimmingCharacters(in: .whitespacesAndNewlines).prefix(80))
        if type.fields.contains("bowl") && section.isEmpty { throw MobilityError("missing_bowl", "Add the bowl or section. Don’t invent a row or seat.") }
        let listing = TicketListing(id: next("ticket"), sellerId: you, sellerName: sellerName, eventId: event.id, typeId: type.id, bowl: section, quantity: quantity, priceCents: priceCents, status: "active", attestation: true, demo: true, version: 1)
        state.listings.insert(listing, at: 0)
        return (state, listing)
    }

    private static func reviewedCoordinates(_ place: CampusPlace) -> PlaceCoordinates? {
        guard place.reviewStatus == "reviewed", let coordinates = place.coordinates else { return nil }
        guard coordinates.latitude.isFinite, coordinates.longitude.isFinite, abs(coordinates.latitude) <= 90, abs(coordinates.longitude) <= 180 else { return nil }
        return coordinates
    }

    private static func syncFull(_ state: inout RideLedger, tripIndex: Int) throws {
        let trip = state.trips[tripIndex]
        if ["canceled", "expired", "completed", "in_progress"].contains(trip.status) { return }
        let taken = state.bookings.filter { $0.tripId == trip.id && holdingRide.contains($0.status) }.reduce(0) { $0 + $1.quantity }
        if taken > trip.capacity { throw MobilityError("capacity", "Accepted seats cannot exceed the seats you offer.") }
        state.trips[tripIndex].status = taken >= trip.capacity ? "full" : "open"
    }

    private static func eventStart(_ event: AdmissionEvent, now: Date) throws -> Date {
        if let raw = event.startAt, let date = ISO8601DateFormatter().date(from: raw) { return date }
        guard let spec = event.start else { throw MobilityError("invalid_time", "This event does not have a start time.") }
        let key = CampusClock.shift(CampusClock.dayKey(now, timeZone: event.timezone), by: spec.dayOffset)
        return CampusClock.instant(dayKey: key, hour: spec.hour, minute: spec.minute, timeZone: event.timezone)
    }

    private static func expired(_ raw: String?, now: Date) -> Bool {
        guard let raw, let date = ISO8601DateFormatter().date(from: raw) else { return false }
        return date <= now
    }

    private static func iso(_ date: Date) -> String { ISO8601DateFormatter().string(from: date) }
    private static func next(_ prefix: String) -> String { "\(prefix)-\(UUID().uuidString.lowercased())" }
    private static func encode(_ value: String) -> String { value.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? value }
}
