import Foundation
import Testing
@testable import RelayCore

private let clock = ISO8601DateFormatter().date(from: "2026-10-17T15:00:00Z")!

@Test func mobilityFixturesLoad() throws {
    let campus = try CampusMobility.campus(for: .alabama)
    #expect(campus.embedPermitted == false)
    #expect(campus.officialMapUrl == "https://www.ua.edu/map/")
    #expect(campus.places.allSatisfy { $0.coordinates == nil && $0.reviewStatus == "unreviewed" })
    let rides = try CampusMobility.seedRides(now: clock)
    #expect(rides.trips.count >= 24)
    let airport = try #require(rides.trips.first { $0.id == "ride-airport" })
    #expect(try CampusMobility.summary(rides, trip: airport, now: clock).contains("4:30"))
    #expect(try CampusMobility.seatsLeft(rides, tripId: "ride-airport") == 2)
}

@Test func lastSeatAcceptsOnlyOneRequest() throws {
    let rides = try CampusMobility.seedRides(now: clock)
    let first = try CampusMobility.acceptBooking(rides, bookingId: "book-last-a", actorId: "demo-jordan", now: clock)
    #expect(try CampusMobility.seatsLeft(first.0, tripId: "ride-last-seat") == 0)
    #expect(throws: MobilityError.self) {
        _ = try CampusMobility.acceptBooking(first.0, bookingId: "book-last-b", actorId: "demo-jordan", now: clock)
    }
}

@Test func requestDoesNotConsumeASeatUntilAccepted() throws {
    let rides = try CampusMobility.seedRides(now: clock)
    let requested = try CampusMobility.requestSeat(rides, tripId: "ride-airport", riderCampusId: "alabama", quantity: 1, now: clock)
    #expect(requested.1.status == "requested")
    #expect(try CampusMobility.seatsLeft(requested.0, tripId: "ride-airport") == 2)
    let accepted = try CampusMobility.acceptBooking(requested.0, bookingId: requested.1.id, actorId: "demo-maya", now: clock)
    #expect(try CampusMobility.seatsLeft(accepted.0, tripId: "ride-airport") == 1)
}

@Test func uberIgnoresUnreviewedCoordinates() throws {
    let campus = try CampusMobility.campus(for: .alabama)
    let pickup = try #require(campus.places.first { $0.id == "student-center" })
    let dropoff = try #require(campus.places.first { $0.id == "airport" })
    var reviewed = pickup
    reviewed.reviewStatus = "reviewed"
    reviewed.coordinates = PlaceCoordinates(latitude: 33.2, longitude: -87.5)
    let manual = try CampusMobility.uberLink(pickup: pickup, dropoff: dropoff, clientId: "")
    #expect(manual.url.absoluteString == "https://m.uber.com/")
    #expect(manual.coordinatesIncluded == false)
    #expect(manual.bookingState == nil)
    let ignored = try CampusMobility.uberLink(pickup: reviewed, dropoff: dropoff, clientId: "demo-client")
    #expect(ignored.coordinatesIncluded == false)
    #expect(!ignored.url.absoluteString.contains("latitude"))
}

@Test func receiptReportIsNotUniversityVerified() throws {
    var tickets = try CampusMobility.seedTickets(now: clock)
    let reserved = try CampusMobility.reserveTicket(tickets, listingId: "ticket-football-open", buyerCampusId: "alabama", now: clock)
    tickets = try CampusMobility.simulatePayment(reserved.0, orderId: reserved.1.id, actorId: CampusMobility.you, now: clock)
    tickets = try CampusMobility.reportTransfer(tickets, orderId: reserved.1.id, actorId: "demo-jordan")
    tickets = try CampusMobility.reportReceipt(tickets, orderId: reserved.1.id, actorId: CampusMobility.you)
    let order = try #require(tickets.orders.first { $0.id == reserved.1.id })
    #expect(order.status == "receipt_reported")
    #expect(order.confirmation == "Reported by buyer")
    #expect(CampusMobility.availableQuantity(tickets, listingId: "ticket-football-open", now: clock) == 0)
}

@Test func competingTicketReservationIsUnavailable() throws {
    let tickets = try CampusMobility.seedTickets(now: clock)
    let reserved = try CampusMobility.reserveTicket(tickets, listingId: "ticket-recital", buyerId: "buyer-a", buyerCampusId: "alabama", quantity: 2, now: clock)
    #expect(throws: MobilityError.self) {
        _ = try CampusMobility.reserveTicket(reserved.0, listingId: "ticket-recital", buyerId: "buyer-b", buyerCampusId: "alabama", quantity: 1, now: clock)
    }
}

@Test func handoffDoesNotCreateABooking() throws {
    let rides = try CampusMobility.seedRides(now: clock)
    let recorded = CampusMobility.recordHandoff(rides, campusId: "alabama", pickupId: "student-center", destinationId: "airport", coordinatesIncluded: false, now: clock)
    #expect(recorded.1.bookingState == nil)
    #expect(recorded.0.bookings.count == rides.bookings.count)
}

@Test func eachCampusHasUsableRidesAndTicketInventory() throws {
    let rides = try CampusMobility.seedRides(now: clock)
    let tickets = try CampusMobility.seedTickets(now: clock)
    for campus in Campus.allCases {
        let id = campus == .alabama ? "alabama" : "auburn"
        let places = try CampusMobility.campus(for: campus).places.map(\.id)
        let trips = rides.trips.filter { $0.campusId == id }
        #expect(trips.count >= 10)
        for trip in trips {
            #expect(places.contains(trip.pickupId))
            #expect(places.contains(trip.destinationId))
        }
        let nextDay = try #require(trips.first { $0.departure?.dayOffset == 1 && $0.status == "open" })
        let requested = try CampusMobility.requestSeat(rides, tripId: nextDay.id, riderCampusId: id, quantity: 1, now: clock)
        #expect(requested.1.status == "requested")
        let events = tickets.events.filter { $0.campusId == id }
        #expect(events.count >= 3)
        for event in events {
            #expect(places.contains(event.venuePlaceId))
            #expect(tickets.listings.contains { $0.eventId == event.id && CampusMobility.availableQuantity(tickets, listingId: $0.id) > 0 })
        }
    }
    #expect(Set(rides.trips.map(\.id)).count == rides.trips.count)
    #expect(Set(tickets.events.map(\.id)).count == tickets.events.count)
}
