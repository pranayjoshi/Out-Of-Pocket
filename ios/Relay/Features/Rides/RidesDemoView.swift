import SwiftUI
import SafariServices
import RelayCore

struct CreateChoiceSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(RelayStore.self) private var store
    @State private var selected: CampusService?
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 23) {
                    SectionTitle(eyebrow: "A LITTLE GIVE GOES A LONG WAY", title: "What can you share?")
                    Text("Put your skills, spare seat, or extra ticket to good use.").font(.subheadline).foregroundStyle(RelayTheme.secondary)
                    Button { selected = .tutoring } label: { choice(.tutoring, "Offer tutoring", "Share what you know.") }.buttonStyle(RelayPressStyle())
                    Button { selected = .tickets } label: { choice(.tickets, "Sell a ticket", "Let someone else be there.") }.buttonStyle(RelayPressStyle())
                    Button { selected = .rides } label: { choice(.rides, "Offer a ride", "Good company. Shared journeys.") }.buttonStyle(RelayPressStyle())
                    Button { selected = .market } label: { choice(.market, "Sell an item", "Give a good find a second life.") }.buttonStyle(RelayPressStyle())
                }.padding(22).relayEntrance()
            }.background(RelayTheme.paper).navigationTitle("Post to campus").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } } }
        }.presentationDragIndicator(.visible)
            .sheet(item: $selected) { service in
                switch service {
                case .tutoring: RequestEditorView(category: .tutoring, intent: .offer)
                case .tickets: NavigationStack { TicketsDemoView(startSell: true).toolbar { ToolbarItem(placement: .cancellationAction) { Button("Close") { selected = nil } } } }
                case .rides: NavigationStack { RidesDemoView(startOffer: true).toolbar { ToolbarItem(placement: .cancellationAction) { Button("Close") { selected = nil } } } }
                case .market: CreateListingView()
                }
            }
            .onChange(of: store.snapshot.requests.count) { _, _ in finish(.tutoring) }
            .onChange(of: store.snapshot.ownListings.count) { _, _ in finish(.market) }
            .onChange(of: store.rideLedger().trips.count) { old, new in if new > old { finish(.rides) } }
            .onChange(of: store.ticketLedger().listings.count) { old, new in if new > old { finish(.tickets) } }
    }
    private func finish(_ service: CampusService) { store.explore(service); dismiss() }
    private func choice(_ service: CampusService, _ title: String, _ subtitle: String) -> some View {
        HStack(spacing: 17) {
            Image(systemName: service.symbol).font(.title2).frame(width: 54, height: 62).background(service.color, in: RoundedRectangle(cornerRadius: 18))
            VStack(alignment: .leading, spacing: 6) { Text(title).font(.headline); Text(subtitle).font(.caption).foregroundStyle(RelayTheme.secondary) }
            Spacer(minLength: 0); Image(systemName: "arrow.up.right").font(.subheadline)
        }.foregroundStyle(RelayTheme.ink).relayCard()
    }
}

struct OfficialMapSheet: UIViewControllerRepresentable {
    let url: URL
    func makeUIViewController(context: Context) -> SFSafariViewController { SFSafariViewController(url: url) }
    func updateUIViewController(_ controller: SFSafariViewController, context: Context) {}
}

struct RidesDemoView: View {
    var destinationId = ""
    var startOffer = false
    var initialTripID = ""
    @Environment(RelayStore.self) private var store
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var pickupId = ""
    @State private var destination = ""
    @State private var windowName = "afternoon"
    @State private var seats = 1
    @State private var tripId = ""
    @State private var asDriver = false
    @State private var results: [String] = []
    @State private var mode = "student"
    @State private var screen = "home"
    @State private var banner = "Sample carpools stay on this device. Nothing is dispatched and no one is charged."
    @State private var error = ""
    @State private var showMap = false
    @State private var offerStep = 1
    @State private var offerPay = "12"
    @State private var offerVehicle = ""
    @State private var offerPickup = ""
    @State private var offerDestination = ""
    @State private var offerDeparture = Date().addingTimeInterval(3 * 3600)

    private var campusId: String { store.campus == .alabama ? "alabama" : "auburn" }
    private var map: CampusMapConfig? { try? CampusMobility.campus(for: store.campus) }
    private var ledger: RideLedger { store.rideLedger() }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                ServiceHeading(service: .rides, title: screen == "offer" ? "Room for one more?" : "Going your way.", subtitle: screen == "offer" ? "Share a seat. Split the journey." : "Campus, home, or somewhere in between.").relayEntrance()
                if !error.isEmpty { Text(error).font(.subheadline).foregroundStyle(.red).accessibilityAddTraits(.isStaticText) }
                if screen == "home" { home }
                if screen == "results" { resultsList }
                if screen == "detail" || screen == "activity" { detail }
                if screen == "offer" { offer }
                DemoNotice(text: banner)
            }.foregroundStyle(RelayTheme.ink).padding(22)
                .animation(reduceMotion ? nil : .smooth(duration: 0.28), value: screen)
                .animation(reduceMotion ? nil : .smooth(duration: 0.25), value: offerStep)
        }
        .background(RelayTheme.paper)
        .navigationTitle("Rides")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            if destination.isEmpty { destination = destinationId }
            if offerDestination.isEmpty { offerDestination = destinationId }
            if startOffer && screen == "home" { screen = "offer" }
            if !initialTripID.isEmpty { tripId = initialTripID; screen = "activity"; asDriver = ledger.trips.first { $0.id == initialTripID }?.driverId == CampusMobility.you }
        }
        .sheet(isPresented: $showMap) {
            if let url = map.flatMap({ URL(string: $0.officialMapUrl) }) { OfficialMapSheet(url: url) }
        }
    }

    private var home: some View {
        VStack(alignment: .leading, spacing: 23) {
            VStack(alignment: .leading, spacing: 18) {
                Picker("Ride kind", selection: $mode) {
                    Text("Student rides").tag("student")
                    Text("Uber").tag("uber")
                }.pickerStyle(.segmented)
                VStack(spacing: 5) {
                    placeMenu("From", selection: $pickupId)
                    Divider().padding(.leading, 30)
                    placeMenu("To", selection: $destination)
                }
                Divider()
                HStack {
                    Label("Today", systemImage: "calendar").font(.subheadline).foregroundStyle(RelayTheme.secondary)
                    Spacer()
                    Picker("Departure window", selection: $windowName) {
                        Text("Morning").tag("morning"); Text("Afternoon").tag("afternoon"); Text("Evening").tag("evening")
                    }.labelsHidden().font(.subheadline)
                }
                Stepper("\(seats) \(seats == 1 ? "passenger" : "passengers")", value: $seats, in: 1...6).font(.subheadline)
                Button(mode == "uber" ? "Continue in Uber" : "Find a ride") { mode == "uber" ? openUber() : find() }.buttonStyle(RelayPrimaryButton()).accessibilityIdentifier("find-ride")
                if mode == "uber" { Text("Review your fare and book in Uber. Relay will not show a confirmed booking.").font(.caption).foregroundStyle(RelayTheme.secondary) }
            }.relayCard()
            HStack {
                Button { showMap = true } label: { Label("Campus map", systemImage: "map").font(.subheadline.weight(.semibold)).frame(minHeight: 44) }
                Spacer()
                Button { offerStep = 1; screen = "offer" } label: { Label("Offer a ride", systemImage: "plus").font(.subheadline.weight(.semibold)).frame(minHeight: 44) }
            }
            Text("Seats around campus").font(.title3.weight(.bold)).tracking(-0.5)
            ForEach(ledger.trips.filter { $0.campusId == campusId && $0.kind == "offer" && $0.status != "canceled" }) { trip in
                Button { tripId = trip.id; screen = "detail"; error = "" } label: { rideCard(trip) }
                    .buttonStyle(RelayPressStyle()).accessibilityIdentifier("ride-\(trip.id)")
            }
            if let map { Text("\(map.attribution). Meeting points are unreviewed; agree on your pickup first.").font(.caption).foregroundStyle(RelayTheme.secondary) }
        }
    }

    private func rideCard(_ trip: RideTrip) -> some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack {
                Text(trip.driverInitials).font(.subheadline.weight(.bold)).frame(width: 42, height: 42).background(RelayTheme.lime, in: RoundedRectangle(cornerRadius: 14))
                VStack(alignment: .leading, spacing: 4) {
                    Text(trip.driverName).font(.subheadline.weight(.semibold))
                    Text(trip.vehicleSummary).font(.caption).foregroundStyle(RelayTheme.secondary)
                }
                Spacer(minLength: 0)
                Text(CampusClock.contribution(trip.contributionCents)).font(.headline)
            }
            VStack(alignment: .leading, spacing: 10) {
                Label(map?.places.first { $0.id == trip.pickupId }?.name ?? trip.pickupId, systemImage: "circle")
                Label(map?.places.first { $0.id == trip.destinationId }?.name ?? trip.destinationId, systemImage: "mappin.circle.fill")
            }.font(.subheadline.weight(.medium))
            HStack {
                Text("\((try? CampusMobility.seatsLeft(ledger, tripId: trip.id)) ?? 0) seats left").font(.caption.weight(.medium))
                Spacer(minLength: 0)
                if let time = try? CampusMobility.departure(trip, now: Date()) {
                    Text(time.formatted(date: .abbreviated, time: .shortened)).font(.caption)
                }
                Image(systemName: "arrow.up.right").font(.caption)
            }.foregroundStyle(RelayTheme.secondary)
        }.foregroundStyle(RelayTheme.ink).relayCard()
    }

    private var resultsList: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Student ride results").font(.headline)
            if results.isEmpty { Text("No rides in that window").foregroundStyle(RelayTheme.secondary) }
            ForEach(results, id: \.self) { id in
                if let trip = ledger.trips.first(where: { $0.id == id }) {
                    Button { tripId = id; screen = "detail" } label: {
                        rideCard(trip)
                    }.buttonStyle(.plain)
                }
            }
            Button("Back") { screen = "home" }.buttonStyle(RelayPrimaryButton(secondary: true))
        }
    }

    @ViewBuilder private var detail: some View {
        if let trip = ledger.trips.first(where: { $0.id == tripId }) {
            let mine = ledger.bookings.first { $0.tripId == trip.id && $0.riderId == CampusMobility.you && ["requested", "accepted", "in_progress", "completed"].contains($0.status) }
            VStack(alignment: .leading, spacing: 12) {
                Text("Demo").font(.caption.weight(.semibold)).foregroundStyle(RelayTheme.accent)
                rideCard(trip)
                Label("Driving check not done", systemImage: "info.circle").font(.caption).foregroundStyle(RelayTheme.secondary)
                Text(trip.meetingInstructions).font(.subheadline)
                if screen == "detail" {
                    Toggle("Demo: act as driver", isOn: $asDriver)
                    if trip.status == "canceled" { Text("This ride is canceled.") }
                    else if asDriver { Button("Review requests") { screen = "activity" }.buttonStyle(RelayPrimaryButton()) }
                    else { Button("Request seat") { request(trip) }.buttonStyle(RelayPrimaryButton()) }
                } else {
                    Text(mine?.status == "accepted" ? "Seat confirmed" : mine?.status == "requested" ? "Waiting for driver. A request is not a confirmed seat." : "Ride activity").font(.headline)
                    if mine?.status == "requested" { Button("Withdraw request") { run { store.saveRides(try CampusMobility.withdrawBooking(ledger, bookingId: mine?.id ?? "", actorId: CampusMobility.you)); banner = "Request withdrawn." } }.buttonStyle(RelayPrimaryButton(secondary: true)) }
                    if let mine, ["requested", "accepted", "in_progress"].contains(mine.status) {
                        Button("Cancel seat") { run { store.saveRides(try CampusMobility.cancelBooking(ledger, bookingId: mine.id, actorId: CampusMobility.you)); banner = "Seat canceled." } }.buttonStyle(RelayPrimaryButton(secondary: true))
                    }
                    Toggle("Demo: act as driver", isOn: $asDriver)
                    if asDriver {
                        ForEach(ledger.bookings.filter { $0.tripId == trip.id && $0.status == "requested" }) { booking in
                            HStack {
                                Text("\(booking.riderName) · \(booking.quantity) seat")
                                Spacer()
                                Button("Accept") { accept(booking, trip: trip) }.buttonStyle(RelayPrimaryButton())
                                Button("Decline") { run { store.saveRides(try CampusMobility.declineBooking(ledger, bookingId: booking.id, actorId: trip.driverId)); banner = "Declined \(booking.riderName)." } }
                            }
                        }
                        Text("\((try? CampusMobility.seatsLeft(ledger, tripId: trip.id)) ?? 0) seats left. Accepting checks the seat at that moment.").font(.caption)
                    }
                }
                Button("Back") { screen = results.isEmpty ? "home" : "results"; error = ""; banner = "Sample carpools stay on this device. Nothing is dispatched and no one is charged." }.buttonStyle(RelayPrimaryButton(secondary: true))
            }
        }
    }

    private var offer: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 6) {
                ForEach(1...3, id: \.self) { step in Capsule().fill(step <= offerStep ? RelayTheme.forest : RelayTheme.line).frame(height: 5) }
            }.accessibilityLabel("Step \(offerStep) of 3")
            Text(offerStep == 1 ? "Where are you headed?" : offerStep == 2 ? "The seat details" : "Ready to share?").font(.title3.weight(.bold))
            if offerStep == 1 {
                placeMenu("Pickup", selection: $offerPickup)
                placeMenu("Destination", selection: $offerDestination)
                DatePicker("Departure", selection: $offerDeparture, in: Date()..., displayedComponents: [.date, .hourAndMinute]).font(.subheadline)
            } else if offerStep == 2 {
                FormField(label: "Contribution per seat ($)", placeholder: "12", text: $offerPay).keyboardType(.decimalPad)
                Stepper("Seats: \(seats)", value: $seats, in: 1...6)
                FormField(label: "Vehicle", placeholder: "Blue Honda Civic", text: $offerVehicle)
            } else {
                Text("\(map?.places.first { $0.id == offerPickup }?.name ?? offerPickup) → \(map?.places.first { $0.id == offerDestination }?.name ?? offerDestination)").font(.headline)
                Text(offerDeparture.formatted(date: .abbreviated, time: .shortened)).font(.subheadline)
                Text("\(seats) seats · $\(offerPay) per seat · \(offerVehicle)").font(.subheadline)
                Text("This demo does not collect payment.").font(.caption).foregroundStyle(RelayTheme.secondary)
            }
            Button(offerStep < 3 ? "Continue" : "Post ride") {
                if offerStep < 3 { offerStep += 1 } else { postOffer() }
            }.buttonStyle(RelayPrimaryButton())
                .disabled(offerStep == 1 ? offerPickup.isEmpty || offerDestination.isEmpty || offerPickup == offerDestination : Money.parse(offerPay) == nil || offerVehicle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            Button("Back") { if offerStep > 1 { offerStep -= 1 } else { screen = "home" } }.buttonStyle(RelayPrimaryButton(secondary: true))
        }
    }

    private func placeMenu(_ title: String, selection: Binding<String>) -> some View {
        HStack(spacing: 10) {
            Image(systemName: title == "From" || title == "Pickup" ? "circle" : "mappin.circle.fill").foregroundStyle(RelayTheme.forest).frame(width: 20)
            VStack(alignment: .leading, spacing: 3) {
                Text(title).font(.caption).foregroundStyle(RelayTheme.secondary)
                Picker(title, selection: selection) {
                    Text("Choose a place").tag("")
                    ForEach(map?.places ?? []) { place in Text(place.name).tag(place.id) }
                }.pickerStyle(.menu).labelsHidden().font(.subheadline).frame(maxWidth: .infinity, alignment: .leading)
            }.frame(minHeight: 58)
        }
    }

    private func summary(_ trip: RideTrip) -> String { (try? CampusMobility.summary(ledger, trip: trip)) ?? trip.id }

    private func find() {
        run {
            let day = CampusClock.dayKey(Date(), timeZone: map?.timezone ?? "America/Chicago")
            let found = try CampusMobility.search(ledger, campusId: campusId, pickupId: pickupId, destinationId: destination, dayKey: day, windowName: windowName, seats: seats)
            results = found.map(\.id)
            screen = "results"
            banner = found.isEmpty ? "No rides in that window" : "\(found.count) rides"
        }
    }

    private func request(_ trip: RideTrip) {
        run {
            let saved = try CampusMobility.requestSeat(ledger, tripId: trip.id, riderCampusId: campusId, quantity: seats)
            store.saveRides(saved.0)
            screen = "activity"
            banner = "Waiting for driver. A request is not a confirmed seat."
        }
    }

    private func accept(_ booking: RideBooking, trip: RideTrip) {
        run {
            let saved = try CampusMobility.acceptBooking(ledger, bookingId: booking.id, actorId: trip.driverId, expectedTripVersion: trip.version)
            store.saveRides(saved.0)
            let left = try CampusMobility.seatsLeft(saved.0, tripId: trip.id)
            banner = "Accepted \(booking.riderName). Seats left: \(left)."
        }
    }

    private func openUber() {
        run {
            guard let pickup = map?.places.first(where: { $0.id == pickupId }), let dropoff = map?.places.first(where: { $0.id == destination }) else {
                throw MobilityError("missing_place", "Choose a pickup and a destination.")
            }
            let link = try CampusMobility.uberLink(pickup: pickup, dropoff: dropoff, clientId: "")
            let saved = CampusMobility.recordHandoff(ledger, campusId: campusId, pickupId: pickupId, destinationId: destination, coordinatesIncluded: link.coordinatesIncluded)
            store.saveRides(saved.0)
            banner = "Opened in Uber. No ride was booked in Relay."
            UIApplication.shared.open(link.url)
        }
    }

    private func postOffer() {
        run {
            guard let cents = Money.parse(offerPay) else { throw MobilityError("invalid_price", "Enter a valid contribution with up to two decimal places.") }
            let when = offerDeparture
            let saved = try CampusMobility.createOffer(ledger, campusId: campusId, pickupId: offerPickup, destinationId: offerDestination, departureAt: when, capacity: seats, contributionCents: cents, vehicleSummary: offerVehicle)
            store.saveRides(saved.0)
            tripId = saved.1.id
            screen = "detail"
            banner = "Ride posted. Requests do not fill a seat until you accept them."
        }
    }

    private func run(_ action: () throws -> Void) {
        do { try action(); error = "" } catch let caught { error = (caught as? LocalizedError)?.errorDescription ?? "Something went wrong. Nothing was saved."; banner = "Sample carpools stay on this device. Nothing is dispatched and no one is charged." }
    }
}

struct TicketsDemoView: View {
    var startSell = false
    var orderId = ""
    var initialEventID = ""
    @Environment(RelayStore.self) private var store
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var eventId = ""
    @State private var listingId = ""
    @State private var activeOrder = ""
    @State private var asSeller = false
    @State private var screen = "home"
    @State private var banner = "Sample tickets stay on this device. No barcode, password, or payment is collected."
    @State private var error = ""
    @State private var bowl = ""
    @State private var price = "45"
    @State private var attested = false

    private var campusId: String { store.campus == .alabama ? "alabama" : "auburn" }
    private var ledger: TicketLedger { store.ticketLedger() }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                ServiceHeading(service: .tickets, title: screen == "sell" ? "Pass on the good times." : "Your way in.", subtitle: "Big games. Small gigs. Campus memories.").relayEntrance()
                if !error.isEmpty { Text(error).foregroundStyle(.red) }
                if screen == "home" { home }
                if screen == "event" { event }
                if screen == "order" { order }
                if screen == "sell" { sell }
                DemoNotice(text: banner)
            }.foregroundStyle(RelayTheme.ink).padding(22)
                .animation(reduceMotion ? nil : .smooth(duration: 0.28), value: screen)
                .animation(reduceMotion ? nil : .smooth(duration: 0.2), value: listingId)
        }
        .background(RelayTheme.paper)
        .navigationTitle("Tickets")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            if !orderId.isEmpty { activeOrder = orderId; screen = "order" }
            if startSell { screen = "sell" }
            if !initialEventID.isEmpty && orderId.isEmpty { eventId = initialEventID; screen = "event" }
        }
    }

    private var home: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack {
                Text("Around your campus").font(.title3.weight(.bold)).tracking(-0.5)
                Spacer()
                Button("Sell a ticket") { screen = "sell" }.font(.caption.weight(.semibold)).frame(minHeight: 44)
            }
            ForEach(Array(ledger.events.filter { $0.campusId == campusId }.enumerated()), id: \.element.id) { index, event in
                let available = ledger.listings.filter { $0.eventId == event.id && CampusMobility.availableQuantity(ledger, listingId: $0.id) > 0 }
                let count = available.reduce(0) { $0 + CampusMobility.availableQuantity(ledger, listingId: $1.id) }
                Button { eventId = event.id; listingId = ""; screen = "event" } label: {
                    VStack(alignment: .leading, spacing: 19) {
                        HStack {
                            Label("CAMPUS EVENT", systemImage: "ticket.fill").font(.caption2.weight(.bold)).tracking(1)
                            Spacer()
                            Image(systemName: "arrow.up.right")
                        }
                        Text(event.name).font(.title2.weight(.bold)).tracking(-0.7).multilineTextAlignment(.leading)
                        Label(event.venue, systemImage: "mappin.and.ellipse").font(.subheadline)
                        if let date = eventDate(event) {
                            Text(date.formatted(date: .abbreviated, time: event.timeTbd ? .omitted : .shortened)).font(.caption.weight(.medium))
                        }
                        Divider().overlay(RelayTheme.ink.opacity(0.1))
                        HStack {
                            Text(count == 0 ? "No tickets available" : "\(count) \(count == 1 ? "ticket" : "tickets") available").font(.caption)
                            Spacer()
                            if let price = available.map(\.priceCents).min() { Text("From \(Money.format(price))").font(.subheadline.weight(.bold)) }
                        }
                    }.foregroundStyle(RelayTheme.heroInk).padding(23).frame(maxWidth: .infinity, alignment: .leading)
                        .background(index.isMultiple(of: 2) ? RelayTheme.peach : RelayTheme.lavender, in: RoundedRectangle(cornerRadius: 26))
                }.buttonStyle(RelayPressStyle()).accessibilityIdentifier("ticket-event-\(event.id)").relayEntrance(min(index + 1, 4))
            }
        }
    }

    private var event: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let event = ledger.events.first(where: { $0.id == eventId }) {
                Text(event.name).font(.headline)
                Text(event.venue).font(.subheadline)
                if let note = event.officialChannel?.note { Text(note).font(.caption).foregroundStyle(RelayTheme.secondary) }
                ForEach(ledger.listings.filter { $0.eventId == event.id }) { listing in
                    let left = CampusMobility.availableQuantity(ledger, listingId: listing.id)
                    Button { listingId = listing.id } label: {
                        HStack(spacing: 14) {
                            Image(systemName: listingId == listing.id ? "checkmark.circle.fill" : "ticket").font(.title2)
                            VStack(alignment: .leading, spacing: 7) {
                                Text(listing.bowl.isEmpty ? "General admission" : listing.bowl).font(.headline)
                                Text("\(left) left · \(listing.sellerName)").font(.caption).foregroundStyle(RelayTheme.secondary)
                            }
                            Spacer(minLength: 0)
                            Text(CampusClock.contribution(listing.priceCents)).font(.headline)
                        }.foregroundStyle(RelayTheme.ink).relayCard()
                            .overlay(RoundedRectangle(cornerRadius: 24).stroke(listingId == listing.id ? RelayTheme.forest : .clear, lineWidth: 2))
                    }.disabled(left == 0)
                }
                if let listing = ledger.listings.first(where: { $0.id == listingId }) {
                    Text(listing.bowl.isEmpty ? "General admission" : listing.bowl).font(.headline)
                    Text("\(CampusClock.contribution(listing.priceCents)) total · no Relay fee in this demo")
                    Button("Reserve ticket") { reserve(listing) }.buttonStyle(RelayPrimaryButton())
                }
            }
            Button("Back") { screen = "home" }.buttonStyle(RelayPrimaryButton(secondary: true))
        }
    }

    private var order: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let order = ledger.orders.first(where: { $0.id == activeOrder }), let event = ledger.events.first(where: { $0.id == order.eventId }) {
                VStack(alignment: .leading, spacing: 12) {
                    Label("YOUR TICKET", systemImage: "ticket.fill").font(.caption.weight(.bold)).tracking(1)
                    Text(order.eventName ?? event.name).font(.title2.weight(.bold))
                    Text(event.venue).font(.subheadline).foregroundStyle(RelayTheme.secondary)
                    Text("\(order.bowl ?? "Ticket") · \(CampusClock.contribution(order.buyerTotalCents ?? order.priceCents))").font(.headline)
                }.frame(maxWidth: .infinity, alignment: .leading).padding(23).background(RelayTheme.peach, in: RoundedRectangle(cornerRadius: 25))
                ticketProgress(order.status)
                Text(checklist(order.status)).font(.subheadline).foregroundStyle(RelayTheme.secondary).lineSpacing(4)
                if let confirmation = order.confirmation { Text("\(confirmation). This is not university verified.").font(.subheadline) }
                Toggle("Demo: act as seller", isOn: $asSeller)
                if asSeller, let label = order.recipientLabel { Text("Recipient for the demo transfer: \(label)").font(.caption) }
                if order.status == "reserved" { Button("Simulate payment") { pay(order) }.buttonStyle(RelayPrimaryButton()) }
                if asSeller && order.status == "awaiting_transfer" { Button("I sent the transfer") { transfer(order) }.buttonStyle(RelayPrimaryButton()) }
                if let url = event.transferPortalUrl.flatMap(URL.init(string:)) { Link(event.transferLabel, destination: url) }
                if order.status == "transfer_reported" { Button("I accepted the ticket") { receipt(order) }.buttonStyle(RelayPrimaryButton()) }
                if !["receipt_reported", "completed", "canceled", "expired"].contains(order.status) {
                    Button("Report a problem") { run { store.saveTickets(try CampusMobility.reportProblem(ledger, orderId: order.id, actorId: CampusMobility.you)); banner = "A case is open. The order was not completed." } }.buttonStyle(RelayPrimaryButton(secondary: true))
                }
                NavigationLink { RidesDemoView(destinationId: event.venuePlaceId) } label: { Text("Need a ride?").frame(maxWidth: .infinity, minHeight: 44) }.buttonStyle(RelayPrimaryButton(secondary: true))
            }
            Button("Back") { screen = "home" }.buttonStyle(RelayPrimaryButton(secondary: true))
        }
    }

    private var sell: some View {
        VStack(alignment: .leading, spacing: 12) {
            Picker("Event", selection: $eventId) {
                Text("Choose an event").tag("")
                ForEach(ledger.events.filter { $0.campusId == campusId }) { Text($0.name).tag($0.id) }
            }
            FormField(label: "Section", placeholder: "Bowl or section", text: $bowl)
            FormField(label: "Ticket price ($)", placeholder: "45", text: $price).keyboardType(.decimalPad)
            Toggle("I am eligible to transfer this ticket", isOn: $attested)
            Button("Publish listing") { publish() }.buttonStyle(RelayPrimaryButton()).disabled(eventId.isEmpty || Money.parse(price) == nil || !attested)
            Button("Back") { screen = "home" }.buttonStyle(RelayPrimaryButton(secondary: true))
        }
    }

    private func eventDate(_ event: AdmissionEvent) -> Date? {
        if let raw = event.startAt { return ISO8601DateFormatter().date(from: raw) }
        guard let start = event.start else { return nil }
        let day = CampusClock.shift(CampusClock.dayKey(Date(), timeZone: event.timezone), by: start.dayOffset)
        return CampusClock.instant(dayKey: day, hour: start.hour, minute: start.minute, timeZone: event.timezone)
    }

    private func ticketProgress(_ status: String) -> some View {
        let stage = ["awaiting_transfer": 1, "transfer_reported": 2, "receipt_reported": 3, "completed": 3][status] ?? 0
        return HStack(alignment: .top, spacing: 8) {
            ForEach(Array(["Reserved", "Transfer", "Received"].enumerated()), id: \.offset) { index, title in
                VStack(spacing: 9) {
                    Image(systemName: stage > index ? "checkmark.circle.fill" : "\(index + 1).circle")
                        .font(.title2).contentTransition(.symbolEffect(.replace))
                    Text(title).font(.caption.weight(.semibold))
                }.foregroundStyle(stage >= index ? RelayTheme.forest : RelayTheme.secondary).frame(maxWidth: .infinity)
            }
        }.padding(20).background(RelayTheme.surface, in: RoundedRectangle(cornerRadius: 22))
            .accessibilityElement(children: .combine)
    }

    private func checklist(_ status: String) -> String {
        switch status {
        case "reserved": "Reserved. This hold is not a purchase."
        case "awaiting_transfer": "Demo payment recorded. No card was charged. The seller reports the transfer next."
        case "transfer_reported": "Transfer reported by the seller. The buyer still has to accept it."
        case "receipt_reported": "Receipt reported by you. Relay did not verify it with the university."
        case "disputed": "A case is open. This order is not complete."
        default: status.replacingOccurrences(of: "_", with: " ")
        }
    }

    private func reserve(_ listing: TicketListing) {
        run {
            let saved = try CampusMobility.reserveTicket(ledger, listingId: listing.id, buyerCampusId: campusId)
            store.saveTickets(saved.0)
            activeOrder = saved.1.id
            screen = "order"
            banner = "Reserved. This hold is not a purchase."
        }
    }
    private func pay(_ order: TicketOrder) {
        run { store.saveTickets(try CampusMobility.simulatePayment(ledger, orderId: order.id, actorId: CampusMobility.you)); banner = "Demo payment recorded. No card was charged." }
    }
    private func transfer(_ order: TicketOrder) {
        run { store.saveTickets(try CampusMobility.reportTransfer(ledger, orderId: order.id, actorId: order.sellerId)); banner = "Transfer reported by the seller. The buyer still has to accept it." }
    }
    private func receipt(_ order: TicketOrder) {
        run { store.saveTickets(try CampusMobility.reportReceipt(ledger, orderId: order.id, actorId: CampusMobility.you)); banner = "Receipt reported by you. Relay did not verify it with the university." }
    }
    private func publish() {
        run {
            guard let event = ledger.events.first(where: { $0.id == eventId }), let type = event.ticketTypes.first else { throw MobilityError("invalid_event", "Choose an event.") }
            guard let cents = Money.parse(price) else { throw MobilityError("invalid_price", "Enter a valid ticket price with up to two decimal places.") }
            let saved = try CampusMobility.publishListing(ledger, eventId: event.id, typeId: type.id, bowl: bowl, quantity: 1, priceCents: cents, attestation: attested)
            store.saveTickets(saved.0)
            eventId = event.id
            screen = "event"
            banner = "Listing posted. Buyers still have to reserve it."
        }
    }
    private func run(_ action: () throws -> Void) {
        do { try action(); error = "" } catch let caught { error = (caught as? LocalizedError)?.errorDescription ?? "Something went wrong. Nothing was saved." }
    }
}

struct MyPostsView: View {
    @Environment(RelayStore.self) private var store
    @State private var selected: Listing?
    private var rides: RideLedger { store.rideLedger() }
    private var tickets: TicketLedger { store.ticketLedger() }
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                SectionTitle(eyebrow: "WHAT YOU’RE SHARING", title: "Your corner of campus.")
                Text("Study & campus posts").font(.headline)
                let posts = store.campusRequests.filter { $0.person == "You" }
                if posts.isEmpty { empty("No study posts yet.", symbol: "graduationcap") }
                ForEach(posts) { post in
                    NavigationLink { TutoringPostView(post: post) } label: { postRow(post.title, subtitle: post.summary, service: .tutoring) }
                }
                Text("Tickets").font(.headline)
                let listings = tickets.listings.filter { $0.sellerId == CampusMobility.you }
                if listings.isEmpty { empty("No ticket listings yet.", symbol: "ticket") }
                ForEach(listings) { listing in
                    NavigationLink { TicketsDemoView(initialEventID: listing.eventId) } label: {
                        postRow(tickets.events.first { $0.id == listing.eventId }?.name ?? "Ticket", subtitle: "\(Money.format(listing.priceCents)) · \(listing.status)", service: .tickets)
                    }
                }
                Text("Rides").font(.headline)
                let trips = rides.trips.filter { $0.driverId == CampusMobility.you }
                if trips.isEmpty { empty("No ride posts yet.", symbol: "car.side") }
                ForEach(trips) { trip in
                    NavigationLink { RidesDemoView(initialTripID: trip.id) } label: {
                        postRow((try? CampusMobility.summary(rides, trip: trip)) ?? "Your ride", subtitle: trip.status.capitalized, service: .rides)
                    }
                }
                Text("Marketplace").font(.headline)
                let mine = store.listings.filter { $0.isOwnListing && $0.category != .tutoring }
                if mine.isEmpty { empty("No item listings yet.", symbol: "bag") }
                ForEach(mine) { listing in
                    Button { selected = listing } label: { postRow(listing.title, subtitle: listing.price, service: .market) }
                }
            }.foregroundStyle(RelayTheme.ink).padding(22).relayEntrance()
        }.background(RelayTheme.paper).navigationTitle("My posts").navigationBarTitleDisplayMode(.inline)
            .sheet(item: $selected) { ListingDetailView(listing: $0) }
    }
    private func empty(_ text: String, symbol: String) -> some View {
        Label(text, systemImage: symbol).font(.subheadline).foregroundStyle(RelayTheme.secondary).frame(maxWidth: .infinity, alignment: .leading).relayCard()
    }
    private func postRow(_ title: String, subtitle: String, service: CampusService) -> some View {
        HStack(spacing: 14) {
            Image(systemName: service.symbol).frame(width: 44, height: 48).background(service.color, in: RoundedRectangle(cornerRadius: 15))
            VStack(alignment: .leading, spacing: 6) { Text(title).font(.subheadline.weight(.semibold)); Text(subtitle).font(.caption).foregroundStyle(RelayTheme.secondary) }
            Spacer(minLength: 0); Image(systemName: "chevron.right").font(.caption)
        }.foregroundStyle(RelayTheme.ink).relayCard()
    }
}

struct RideTicketActivity: View {
    @Environment(RelayStore.self) private var store
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var filter = "all"
    var body: some View {
        let rides = store.rideLedger()
        let tickets = store.ticketLedger()
        VStack(alignment: .leading, spacing: 22) {
            SectionTitle(eyebrow: "EVERY NEXT STEP", title: "Your next moves.")
            Text("Keep track of what’s requested, reserved, and ready.").font(.subheadline).foregroundStyle(RelayTheme.secondary)
            Picker("Activity type", selection: $filter) {
                Text("All").tag("all"); Text("Rides").tag("rides"); Text("Tickets").tag("tickets")
            }.pickerStyle(.segmented)
            if filter == "all" || filter == "rides" {
                let rows = rides.bookings.filter { booking in
                    booking.riderId == CampusMobility.you || rides.trips.contains { $0.id == booking.tripId && $0.driverId == CampusMobility.you }
                }
                Text("Rides").font(.headline)
                if rows.isEmpty {
                    empty(.rides, "Your next ride starts here.", subtitle: "Seat requests and driver responses will appear here.") { store.explore(.rides) }
                }
                ForEach(rows) { booking in
                    if let trip = rides.trips.first(where: { $0.id == booking.tripId }) {
                        NavigationLink { RidesDemoView(initialTripID: trip.id) } label: {
                            activityRow(.rides, title: (try? CampusMobility.summary(rides, trip: trip)) ?? "Student ride", status: booking.status, subtitle: "\(booking.quantity) seat · \(trip.driverName)")
                        }.buttonStyle(.plain)
                    }
                }
            }
            if filter == "all" || filter == "tickets" {
                let orders = tickets.orders.filter { $0.buyerId == CampusMobility.you || $0.sellerId == CampusMobility.you }
                Text("Tickets").font(.headline)
                if orders.isEmpty {
                    empty(.tickets, "Something to look forward to.", subtitle: "Follow your ticket from reservation to transfer.") { store.explore(.tickets) }
                }
                ForEach(orders) { order in
                    NavigationLink { TicketsDemoView(orderId: order.id) } label: {
                        activityRow(.tickets, title: order.eventName ?? "Campus event", status: order.status, subtitle: Money.format(order.buyerTotalCents ?? order.priceCents))
                    }.buttonStyle(.plain)
                }
            }
            Button { store.inboxPane = "handoffs" } label: {
                HStack { Label("Your marketplace handoffs", systemImage: "shippingbox"); Spacer(); Image(systemName: "arrow.right") }.font(.subheadline.weight(.semibold)).frame(minHeight: 50)
            }
        }.foregroundStyle(RelayTheme.ink).animation(reduceMotion ? nil : .smooth(duration: 0.25), value: filter).relayEntrance()
    }
    private func empty(_ service: CampusService, _ title: String, subtitle: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 12) {
                Image(systemName: service.symbol).font(.title2)
                Text(title).font(.headline)
                Text(subtitle).font(.caption).foregroundStyle(RelayTheme.secondary).multilineTextAlignment(.leading)
                Label("Explore \(service.rawValue.lowercased())", systemImage: "arrow.right").font(.caption.weight(.semibold))
            }.frame(maxWidth: .infinity, alignment: .leading).padding(22).background(service.color, in: RoundedRectangle(cornerRadius: 24))
        }.foregroundStyle(RelayTheme.ink).buttonStyle(RelayPressStyle())
    }
    private func activityRow(_ service: CampusService, title: String, status: String, subtitle: String) -> some View {
        HStack(alignment: .top, spacing: 13) {
            Image(systemName: service.symbol).frame(width: 43, height: 48).background(service.color, in: RoundedRectangle(cornerRadius: 15))
            VStack(alignment: .leading, spacing: 8) {
                Text(status.replacingOccurrences(of: "_", with: " ").capitalized).font(.caption.weight(.semibold)).foregroundStyle(RelayTheme.forest)
                Text(title).font(.subheadline.weight(.semibold))
                Text(subtitle).font(.caption).foregroundStyle(RelayTheme.secondary)
            }
            Spacer(minLength: 0); Image(systemName: "chevron.right").font(.caption)
        }.relayCard()
    }
}
