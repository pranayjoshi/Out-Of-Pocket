import XCTest

final class RelayUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    override func tearDownWithError() throws {
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = "chapter-final-state"
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    @MainActor
    func testCampusPetMovesPersistsAndOpensTrades() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing", "-pet-reset", "-pet-still"]
        app.launch()
        let pet = app.buttons["campus-pet"]
        XCTAssertTrue(pet.waitForExistence(timeout: 10))
        XCTAssertTrue(pet.label.contains("Al Pal"))
        let original = pet.frame
        XCTAssertGreaterThan(original.midX, app.frame.midX)
        XCTAssertGreaterThan(original.midY, app.frame.midY)
        saveScreenshot("pet-al-pal-home")

        let destination = pet.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
            .withOffset(CGVector(dx: -150, dy: -260))
        pet.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
            .press(forDuration: 0.1, thenDragTo: destination)
        XCTAssertLessThan(pet.frame.midX, original.midX - 50)
        XCTAssertLessThan(pet.frame.midY, original.midY - 100)
        let moved = pet.frame
        saveScreenshot("pet-dragged")
        app.terminate()
        app.launchArguments = ["-ui-testing", "-pet-still"]
        app.launch()
        XCTAssertTrue(pet.waitForExistence(timeout: 10))
        XCTAssertEqual(pet.frame.midX, moved.midX, accuracy: 5)
        XCTAssertEqual(pet.frame.midY, moved.midY, accuracy: 5)

        pet.press(forDuration: 1.2)
        app.buttons["Return to bottom right"].tap()
        XCTAssertEqual(pet.frame.midX, original.midX, accuracy: 5)
        pet.press(forDuration: 1.2)
        app.buttons["Pause dancing"].tap()
        XCTAssertTrue((pet.value as? String)?.contains("Resting") == true)

        app.buttons["Select campus, currently University of Alabama"].tap()
        app.buttons["Auburn University"].tap()
        XCTAssertTrue(pet.label.contains("Auburn Pal"))
        saveScreenshot("pet-auburn-home")
        app.tabBars.buttons["Explore"].tap()
        XCTAssertTrue(pet.exists)
        pet.tap()
        XCTAssertTrue(app.buttons["bigal-open-trade"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["bigal-circle"].exists)
        saveScreenshot("pet-buy-and-swap")
        app.buttons["close-pet-agent"].tap()
        XCTAssertTrue(pet.waitForExistence(timeout: 5))
        pet.press(forDuration: 1.2)
        app.buttons["Start dancing"].tap()
    }

    @MainActor
    func testAuburnInventoryAndInlineAds() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing"]
        app.launch()
        app.buttons["Select campus, currently University of Alabama"].tap()
        app.buttons["Auburn University"].tap()
        app.buttons["home-Tutoring"].tap()
        XCTAssertTrue(app.staticTexts["6 tutors"].waitForExistence(timeout: 5))
        let ad = app.buttons["open-campus-promotion"].firstMatch
        scrollTo(ad, in: app)
        XCTAssertTrue(ad.exists)
        saveScreenshot("sample-auburn-tutors-ad")
        app.buttons["service-Tickets"].tap()
        XCTAssertTrue(app.buttons["ticket-event-event-au-0"].waitForExistence(timeout: 5))
        scrollTo(ad, in: app)
        XCTAssertTrue(ad.exists)
        saveScreenshot("sample-auburn-tickets-ad")
        app.buttons["service-Rides"].tap()
        XCTAssertTrue(app.staticTexts["Going your way."].waitForExistence(timeout: 5))
        scrollTo(app.buttons["find-ride"], in: app)
        XCTAssertTrue(app.buttons["find-ride"].exists)
        let ride = app.buttons["ride-ride-au-1-0"]
        scrollTo(ride, in: app)
        XCTAssertTrue(ride.exists)
        saveScreenshot("sample-auburn-rides-ad")
    }

    @MainActor
    func testTradingCircleApprovalChatAndLeave() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing"]
        app.launch()
        app.buttons["campus-pet"].tap()
        let start = app.buttons["bigal-circle"]
        scrollTo(start, in: app); start.tap()
        let gives = app.textFields["swap-gives"]
        XCTAssertTrue(gives.waitForExistence(timeout: 5))
        gives.tap(); gives.typeText("TI-84 calculator")
        let wants = app.textFields["bigal-item"]
        scrollTo(wants, in: app); wants.tap(); wants.typeText("Arduino kit")
        app.buttons["bigal-submit-trade"].tap()
        let row = app.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH %@", "bigal-circle-")).firstMatch
        scrollTo(row, in: app); row.tap()
        let approve = app.buttons["circle-approve"]
        XCTAssertTrue(approve.waitForExistence(timeout: 10))
        scrollTo(approve, in: app); approve.tap()
        let meetup = app.descendants(matching: .any)["circle-meetup"].firstMatch
        XCTAssertTrue(meetup.waitForExistence(timeout: 10))
        scrollTo(meetup, in: app)
        saveScreenshot("trading-circle-confirmed")
        let chat = app.descendants(matching: .any)["circle-chat-input"].firstMatch
        scrollTo(chat, in: app); chat.tap(); chat.typeText("I will bring the calculator.")
        app.buttons["Send to circle"].tap()
        XCTAssertTrue(app.staticTexts["I will bring the calculator."].waitForExistence(timeout: 5))
        app.buttons["Circle options"].tap()
        app.buttons["Leave circle"].tap()
        app.buttons["Leave circle"].tap()
        XCTAssertTrue(app.buttons["bigal-circle"].waitForExistence(timeout: 5))
        XCTAssertFalse(row.exists)
    }

    @MainActor
    func testTradingCircleNoMatchCanRetry() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing"]
        app.launch()
        app.buttons["campus-pet"].tap()
        let start = app.buttons["bigal-circle"]
        scrollTo(start, in: app); start.tap()
        let gives = app.textFields["swap-gives"]
        XCTAssertTrue(gives.waitForExistence(timeout: 5))
        gives.tap(); gives.typeText("Desk lamp")
        let wants = app.textFields["bigal-item"]
        scrollTo(wants, in: app); wants.tap(); wants.typeText("Kayak")
        app.buttons["bigal-submit-trade"].tap()
        let row = app.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH %@", "bigal-circle-")).firstMatch
        scrollTo(row, in: app); row.tap()
        XCTAssertTrue(app.staticTexts["No circle yet"].waitForExistence(timeout: 10))
        app.buttons["Look again"].tap()
        XCTAssertTrue(app.staticTexts["No circle yet"].waitForExistence(timeout: 10))
    }

    @MainActor
    func testBigAlTradeFromHomePreservesExploreServices() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing", "-pet-reset", "-pet-still"]
        app.launch()
        let entry = app.buttons["campus-pet"]
        XCTAssertTrue(entry.waitForExistence(timeout: 10))
        entry.tap()
        XCTAssertTrue(app.buttons["bigal-open-trade"].waitForExistence(timeout: 5))
        app.buttons["bigal-open-trade"].tap()
        let item = app.textFields["bigal-item"]
        XCTAssertTrue(item.waitForExistence(timeout: 5))
        item.tap(); item.typeText("Artificial Intelligence: A Modern Approach")
        app.buttons["bigal-submit-trade"].tap()
        let ready = app.staticTexts["Ready for you"]
        scrollTo(ready, in: app)
        XCTAssertTrue(ready.waitForExistence(timeout: 15))
        let trade = app.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH %@", "bigal-trade-")).firstMatch
        scrollTo(trade, in: app); trade.tap()
        let lock = app.buttons["bigal-lock"]
        scrollTo(lock, in: app)
        XCTAssertTrue(lock.isEnabled)
        saveScreenshot("bigal-deal-ready")
        lock.tap()
        let confirm = app.buttons["bigal-confirm-lock"]
        XCTAssertTrue(confirm.waitForExistence(timeout: 5))
        confirm.tap()
        XCTAssertTrue(app.buttons["Undo lock-in"].waitForExistence(timeout: 5))
        let messages = app.buttons["bigal-message-seller"]
        scrollTo(messages, in: app); messages.tap()
        XCTAssertTrue(app.descendants(matching: .any)["message-input"].firstMatch.waitForExistence(timeout: 5))
        app.navigationBars.firstMatch.swipeDown()
        app.tabBars.buttons["Explore"].tap()
        XCTAssertTrue(app.buttons["service-Tutoring"].waitForExistence(timeout: 5))
        app.buttons["service-Tickets"].tap()
        XCTAssertTrue(app.staticTexts["Your way in."].waitForExistence(timeout: 5))
        XCTAssertFalse(app.tabBars.buttons["My plans"].exists)
    }

    @MainActor
    func testBigAlAvailableFromMarketAndScheduleReview() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing"]
        app.launch()
        app.tabBars.buttons["Explore"].tap()
        app.buttons["service-Market"].tap()
        app.buttons["bigal-entry"].tap()
        app.buttons["bigal-schedule"].tap()
        let search = app.searchFields.firstMatch
        XCTAssertTrue(search.waitForExistence(timeout: 5))
        search.tap(); search.typeText("CS 465")
        let course = app.buttons.containing(.staticText, identifier: "CS 465").firstMatch
        XCTAssertTrue(course.waitForExistence(timeout: 5))
        course.tap()
        app.buttons["Find materials for 1 class"].tap()
        XCTAssertTrue(app.staticTexts["1 item for 1 class"].waitForExistence(timeout: 5))
        app.buttons["Cancel"].tap()
        let chat = app.buttons["bigal-chat"]
        scrollTo(chat, in: app); chat.tap()
        XCTAssertTrue(app.staticTexts["Your buying agent · same rules for every student"].waitForExistence(timeout: 5))
    }

    @MainActor
    func testCampusPromotionSampleAndDismissal() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing"]
        app.launch()
        app.tabBars.buttons["Explore"].tap()
        app.buttons["service-Market"].tap()
        let promotion = app.descendants(matching: .any)["campus-promotion-Campus board"].firstMatch
        scrollTo(promotion, in: app)
        let open = app.buttons["open-campus-promotion"].firstMatch
        XCTAssertTrue(open.exists)
        XCTAssertEqual(app.buttons.matching(identifier: "open-campus-promotion").count, 1)
        saveScreenshot("ads-campus-placement")
        let dismiss = app.buttons["Dismiss campus promotion"].firstMatch
        scrollTo(dismiss, in: app)
        dismiss.tap()
        XCTAssertFalse(app.buttons["open-campus-promotion"].exists)

    }

    @MainActor
    func testDiscoveryAndNativeTabs() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing", "-pet-reset", "-pet-still"]
        app.launch()
        XCTAssertTrue(app.descendants(matching: .any)["discovery-intro"].waitForExistence(timeout: 10))
        for title in ["Home", "Explore", "Inbox", "You"] { XCTAssertTrue(app.tabBars.buttons[title].exists) }
        XCTAssertFalse(app.tabBars.buttons["My plans"].exists)
        saveScreenshot("01-home")
        app.buttons["home-Tutoring"].tap()
        XCTAssertTrue(app.staticTexts["Your next aha!"].waitForExistence(timeout: 5))
        saveScreenshot("02-tutoring")
        app.buttons["service-Tickets"].tap()
        XCTAssertTrue(app.staticTexts["Your way in."].waitForExistence(timeout: 5))
        saveScreenshot("03-tickets")
        app.buttons["service-Rides"].tap()
        XCTAssertTrue(app.staticTexts["Going your way."].waitForExistence(timeout: 5))
        scrollTo(app.buttons["find-ride"], in: app)
        XCTAssertTrue(app.buttons["find-ride"].exists)
        saveScreenshot("04-rides")
        app.tabBars.buttons["Inbox"].tap()
        XCTAssertTrue(app.staticTexts["Keep it moving."].waitForExistence(timeout: 5))
        app.tabBars.buttons["You"].tap()
        XCTAssertTrue(app.staticTexts["Make yourself at home."].waitForExistence(timeout: 5))
        XCTAssertFalse(app.staticTexts["Plan pieces"].exists)
        saveScreenshot("05-profile")
    }

    @MainActor
    func testTutorSearchSaveAndConversation() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing"]
        app.launch()
        app.buttons["home-Tutoring"].tap()
        let search = app.textFields["Course, subject, or tutor"]
        XCTAssertTrue(search.waitForExistence(timeout: 10))
        search.tap(); search.typeText("MATH 125")
        XCTAssertTrue(app.staticTexts["Maya R."].waitForExistence(timeout: 5))
        XCTAssertFalse(app.staticTexts["Jordan L."].exists)
        app.buttons.containing(.staticText, identifier: "Maya R.").firstMatch.tap()
        XCTAssertTrue(app.buttons["Save tutor"].waitForExistence(timeout: 5))
        app.buttons["Save tutor"].tap()
        XCTAssertTrue(app.buttons["Unsave tutor"].exists)
        saveScreenshot("06-tutor-profile")
        app.buttons["message-tutor"].tap()
        let input = app.descendants(matching: .any)["message-input"].firstMatch
        XCTAssertTrue(input.waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["conversation-handoff"].exists)
        input.tap(); input.typeText("Can we go over derivatives?")
        app.buttons["send-message"].tap()
        XCTAssertTrue(app.staticTexts["Can we go over derivatives?"].waitForExistence(timeout: 5))
    }

    @MainActor
    func testInspectionCannotBeSkipped() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing", "-open-exchange-demo"]
        app.launch()
        let authorize = app.buttons["prepare-exchange"]
        XCTAssertTrue(authorize.waitForExistence(timeout: 10))
        scrollTo(authorize, in: app)
        authorize.tap()
        let code = app.textFields["partner-code"]
        XCTAssertTrue(code.waitForExistence(timeout: 5))
        code.tap()
        code.typeText("0000")
        app.buttons["identify-exchange"].tap()
        XCTAssertTrue(app.staticTexts["That code doesn’t match. The sample code is 2418."].exists)
        code.tap()
        code.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: 4) + "2418")
        app.buttons["identify-exchange"].tap()
        let inspection = app.buttons["complete-inspection"]
        XCTAssertTrue(inspection.waitForExistence(timeout: 5))
        XCTAssertFalse(inspection.isEnabled)
        saveScreenshot("04-inspection")
        app.buttons["cancel-exchange"].tap()
        XCTAssertTrue(app.staticTexts["It’s okay to pass."].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["No payment captured"].exists)
    }

    @MainActor
    func testMockPaymentDeclineAndRetry() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing", "-open-exchange-demo"]
        app.launch()
        let method = app.buttons["payment-method-applePay"]
        XCTAssertTrue(method.waitForExistence(timeout: 10))
        scrollTo(method, in: app)
        method.tap()
        let outcome = app.buttons["payment-outcome"]
        scrollTo(outcome, in: app)
        outcome.tap()
        app.buttons["Declined"].tap()
        scrollTo(app.buttons["prepare-exchange"], in: app)
        app.buttons["prepare-exchange"].tap()
        XCTAssertTrue(app.staticTexts["exchange-error"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.textFields["partner-code"].exists)
        outcome.tap()
        app.buttons["Success"].tap()
        app.buttons["prepare-exchange"].tap()
        XCTAssertTrue(app.textFields["partner-code"].waitForExistence(timeout: 5))
        saveScreenshot("05-mock-payment")
    }

    @MainActor
    func testTutoringRequestAndOffering() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing"]
        app.launch()
        app.buttons["home-Tutoring"].tap()
        let request = app.buttons["request-tutor"]
        scrollTo(request, in: app)
        request.tap()
        let title = app.textFields["campus-post-title"]
        XCTAssertTrue(title.waitForExistence(timeout: 5))
        title.tap(); title.typeText("Help with derivatives")
        let submit = app.buttons["campus-post-submit"]
        scrollTo(submit, in: app); submit.tap()
        XCTAssertTrue(app.tabBars.buttons["Explore"].isSelected)
        scrollTo(app.staticTexts["Help with derivatives"], in: app)
        XCTAssertTrue(app.staticTexts["Help with derivatives"].exists)
        saveScreenshot("07-study-request")
    }

    @MainActor
    func testPostingTutorOfferReturnsToStudyBoard() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing"]
        app.launch()
        app.buttons["Create a post"].tap()
        app.buttons.containing(.staticText, identifier: "Offer tutoring").firstMatch.tap()
        let title = app.textFields["campus-post-title"]
        XCTAssertTrue(title.waitForExistence(timeout: 5))
        title.tap(); title.typeText("Intro chemistry tutoring")
        let submit = app.buttons["campus-post-submit"]
        scrollTo(submit, in: app); submit.tap()
        XCTAssertTrue(app.tabBars.buttons["Explore"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.tabBars.buttons["Explore"].isSelected)
        scrollTo(app.staticTexts["Intro chemistry tutoring"], in: app)
        XCTAssertTrue(app.staticTexts["Intro chemistry tutoring"].exists)
    }

    @MainActor
    func testHomeShortcutsAndActivity() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing"]
        app.launch()
        app.buttons["home-Tickets"].tap()
        XCTAssertTrue(app.staticTexts["Your way in."].waitForExistence(timeout: 5))
        app.tabBars.buttons["Home"].tap()
        app.buttons["home-Rides"].tap()
        XCTAssertTrue(app.staticTexts["Going your way."].waitForExistence(timeout: 5))
        app.tabBars.buttons["Home"].tap()
        let activity = app.descendants(matching: .any)["home-activity"].firstMatch
        scrollTo(activity, in: app); activity.tap()
        XCTAssertTrue(app.tabBars.buttons["Inbox"].isSelected)
        XCTAssertTrue(app.buttons["Activity"].isSelected)
    }

    @MainActor
    func testListingMessagesCounterofferAndAgreedHandoff() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing", "-open-conversation-demo"]
        app.launch()
        let input = app.descendants(matching: .any)["message-input"].firstMatch
        XCTAssertTrue(input.waitForExistence(timeout: 10))
        input.tap()
        input.typeText("Is pickup after class okay?")
        app.buttons["send-message"].tap()
        XCTAssertTrue(app.staticTexts["Is pickup after class okay?"].waitForExistence(timeout: 5))
        let make = app.buttons["make-offer"]
        scrollTo(make, in: app)
        make.tap()
        let amount = app.textFields["offer-amount"]
        amount.tap()
        amount.typeText("30")
        app.buttons["send-offer"].tap()
        let other = app.switches["demo-other-party"]
        for _ in 0..<5 { if other.isHittable { break }; app.swipeDown() }
        other.tap()
        let counter = app.buttons["counter-offer"]
        scrollTo(counter, in: app)
        counter.tap()
        amount.tap()
        amount.typeText("35")
        app.buttons["send-offer"].tap()
        for _ in 0..<5 { if other.isHittable { break }; app.swipeDown() }
        other.tap()
        let accept = app.buttons["accept-offer"]
        scrollTo(accept, in: app)
        accept.tap()
        XCTAssertTrue(app.staticTexts["agreed-price"].waitForExistence(timeout: 5))
        saveScreenshot("08-listing-negotiation")
        let handoff = app.buttons["conversation-handoff"]
        scrollTo(handoff, in: app)
        handoff.tap()
        let prepare = app.buttons["prepare-exchange"]
        XCTAssertTrue(prepare.waitForExistence(timeout: 5))
        XCTAssertTrue(prepare.label.contains("$35"))
    }

    @MainActor
    func testFlowClassesSaveAndClear() throws {
        let app = flowApp()
        app.tabBars.buttons["You"].tap()
        app.buttons.containing(.staticText, identifier: "Your classes").firstMatch.tap()
        XCTAssertTrue(app.buttons["Read screenshot"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["Read screenshot"].isEnabled)
        let course = app.switches["schedule-course-CS 100"]
        scrollTo(course, in: app); course.tap()
        XCTAssertEqual(course.value as? String, "1")
        let save = app.buttons["Save classes"]
        scrollTo(save, in: app); save.tap()
        scrollUpTo(app.staticTexts["schedule-status"], in: app)
        XCTAssertTrue(app.staticTexts["schedule-status"].label.contains("Classes saved"))
        saveScreenshot("classes-saved")
        app.navigationBars.buttons.firstMatch.tap()
        app.buttons.containing(.staticText, identifier: "Your classes").firstMatch.tap()
        scrollTo(course, in: app)
        XCTAssertEqual(course.value as? String, "1")
        let clear = app.buttons["Clear classes"]
        scrollTo(clear, in: app); clear.tap()
        scrollUpTo(app.staticTexts["schedule-status"], in: app)
        XCTAssertTrue(app.staticTexts["schedule-status"].label.contains("Saved classes removed"))
        scrollTo(course, in: app)
        XCTAssertEqual(course.value as? String, "0")
    }

    @MainActor
    func testFlowMarketSearchSaveAndFilters() throws {
        let app = flowApp()
        app.tabBars.buttons["Explore"].tap()
        app.buttons["service-Market"].tap()
        let search = app.textFields["Search campus finds"]
        scrollTo(search, in: app); search.tap(); search.typeText("zz-no-such-find")
        let empty = app.staticTexts["No finds just yet."]
        scrollTo(empty, in: app)
        XCTAssertTrue(empty.exists)
        app.buttons["Reset filters"].tap()
        scrollUpTo(search, in: app); search.tap(); search.typeText("reading chair\n")
        let chair = app.buttons["Your new favorite reading chair"]
        scrollTo(chair, in: app); chair.tap()
        XCTAssertTrue(app.buttons["Save this find"].waitForExistence(timeout: 5))
        app.buttons["Save this find"].tap()
        saveScreenshot("market-saved-find")
        app.buttons["Done"].tap()
        app.tabBars.buttons["You"].tap()
        app.buttons.containing(.staticText, identifier: "Your saved finds").firstMatch.tap()
        XCTAssertTrue(chair.waitForExistence(timeout: 5))
        app.tabBars.buttons["Explore"].tap()
        scrollUpTo(app.buttons["Clear search"], in: app); app.buttons["Clear search"].tap()
        let filter = app.buttons["Filter"]
        scrollTo(filter, in: app); filter.tap()
        app.switches["Free finds only"].tap()
        saveScreenshot("market-free-filter")
        app.buttons["Done"].tap()
        let plant = app.buttons["A tiny roommate, no rent required"]
        scrollTo(plant, in: app)
        XCTAssertTrue(plant.exists)
        XCTAssertFalse(chair.exists)
    }

    @MainActor
    func testFlowPublishListingWithPredictedPrice() throws {
        let app = flowApp()
        app.buttons["Create a post"].tap()
        app.buttons.containing(.staticText, identifier: "Sell an item").firstMatch.tap()
        let title = app.textFields["listing-title"]
        XCTAssertTrue(title.waitForExistence(timeout: 5))
        let publish = app.buttons["publish-listing"]
        scrollTo(publish, in: app)
        XCTAssertFalse(publish.isEnabled)
        scrollUpTo(title, in: app); title.tap(); title.typeText("Reading chair for a new chapter")
        let predicted = app.buttons["use-predicted-price"]
        scrollTo(predicted, in: app)
        XCTAssertTrue(app.staticTexts["predicted-price"].exists)
        saveScreenshot("listing-price-prediction")
        predicted.tap()
        let price = app.textFields["selling-price"]
        scrollTo(price, in: app); price.tap()
        let existing = price.value as? String ?? ""
        price.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: existing.count) + "35")
        let details = app.descendants(matching: .any)["listing-details"].firstMatch
        scrollTo(details, in: app); details.tap(); details.typeText("Sturdy frame with clean fabric. Sample listing for the recorded UI flow.")
        scrollTo(publish, in: app)
        XCTAssertTrue(publish.isEnabled)
        publish.tap()
        XCTAssertTrue(app.tabBars.buttons["Explore"].waitForExistence(timeout: 5))
        app.tabBars.buttons["You"].tap()
        let posts = app.buttons.containing(.staticText, identifier: "My posts").firstMatch
        scrollTo(posts, in: app); posts.tap()
        let listing = app.buttons.containing(.staticText, identifier: "Reading chair for a new chapter").firstMatch
        scrollTo(listing, in: app); listing.tap()
        XCTAssertTrue(app.staticTexts["$35"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["reserve-listing"].isEnabled)
        saveScreenshot("listing-published")
    }

    @MainActor
    func testFlowTicketReservationAndTransfer() throws {
        let app = flowApp()
        app.buttons["home-Tickets"].tap()
        let event = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "ticket-event-")).firstMatch
        XCTAssertTrue(event.waitForExistence(timeout: 5)); event.tap()
        let listing = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "ticket-listing-")).firstMatch
        scrollTo(listing, in: app); listing.tap()
        tapFlowButton("Reserve ticket", in: app)
        XCTAssertTrue(app.buttons["Simulate payment"].waitForExistence(timeout: 5))
        saveScreenshot("ticket-reserved")
        tapFlowButton("Simulate payment", in: app)
        let seller = app.switches["Demo: act as seller"]
        scrollTo(seller, in: app); seller.tap()
        tapFlowButton("I sent the transfer", in: app)
        tapFlowButton("I accepted the ticket", in: app)
        let receipt = app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "Receipt reported by you.")).firstMatch
        scrollTo(receipt, in: app)
        XCTAssertTrue(receipt.exists)
        saveScreenshot("ticket-receipt-reported")
    }

    @MainActor
    func testFlowRideRequestAcceptAndCancel() throws {
        let app = flowApp()
        app.buttons["home-Rides"].tap()
        let ride = app.buttons["ride-ride-ua-1-0"]
        scrollTo(ride, in: app); ride.tap()
        tapFlowButton("Request seat", in: app)
        XCTAssertTrue(app.staticTexts["Waiting for driver. A request is not a confirmed seat."].firstMatch.waitForExistence(timeout: 5))
        saveScreenshot("ride-seat-requested")
        let driver = app.switches["Demo: act as driver"]
        scrollTo(driver, in: app); driver.tap()
        tapFlowButton("Accept", in: app)
        let confirmed = app.staticTexts["Seat confirmed"]
        scrollUpTo(confirmed, in: app)
        XCTAssertTrue(confirmed.exists)
        saveScreenshot("ride-seat-confirmed")
        tapFlowButton("Cancel seat", in: app)
        let canceled = app.staticTexts["Seat canceled."]
        scrollTo(canceled, in: app)
        XCTAssertTrue(canceled.exists)
        XCTAssertFalse(confirmed.exists)
    }

    @MainActor
    func testFlowPaidHandoffAndRefund() throws {
        let app = flowApp(arguments: ["-open-exchange-demo"])
        completeFlowInspection(in: app, checks: ["Fabric and frame match the photos", "Chair is stable and comfortable", "Disclosed marks are acceptable"])
        tapFlowButton("accept-exchange", in: app)
        XCTAssertTrue(app.staticTexts["A new story begins."].waitForExistence(timeout: 5))
        saveScreenshot("handoff-payment-complete")
        tapFlowButton("Explore a post-handoff issue", in: app)
        XCTAssertTrue(app.staticTexts["Your sample case is open."].waitForExistence(timeout: 5))
        tapFlowButton("Simulate approved case & verified return", in: app)
        XCTAssertTrue(app.staticTexts["Your sample refund is pending."].waitForExistence(timeout: 5))
        saveScreenshot("refund-pending")
        tapFlowButton("Simulate bank confirmation", in: app)
        XCTAssertTrue(app.staticTexts["Back where it belongs."].waitForExistence(timeout: 5))
        saveScreenshot("refund-bank-confirmed")
    }

    @MainActor
    func testFlowFreeHandoff() throws {
        let app = flowApp()
        app.tabBars.buttons["Explore"].tap()
        app.buttons["service-Market"].tap()
        let search = app.textFields["Search campus finds"]
        scrollTo(search, in: app); search.tap(); search.typeText("tiny roommate\n")
        let plant = app.buttons["A tiny roommate, no rent required"]
        scrollTo(plant, in: app); plant.tap()
        tapFlowButton("reserve-listing", in: app)
        XCTAssertTrue(app.buttons["prepare-exchange"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["payment-method-applePay"].exists)
        completeFlowInspection(in: app, checks: ["Plant and pot match the photo", "No visible pests", "You can transport it safely"])
        tapFlowButton("accept-exchange", in: app)
        XCTAssertTrue(app.staticTexts["A new story begins."].waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["Explore a post-handoff issue"].exists)
        saveScreenshot("free-handoff-complete")
    }

    @MainActor
    private func flowApp(arguments: [String] = []) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing", "-pet-reset", "-pet-still"] + arguments
        app.launch()
        XCTAssertTrue(app.tabBars.buttons["Home"].waitForExistence(timeout: 10))
        return app
    }

    @MainActor
    private func tapFlowButton(_ identifier: String, in app: XCUIApplication) {
        let button = app.buttons[identifier].firstMatch
        scrollTo(button, in: app)
        XCTAssertTrue(button.isEnabled)
        button.tap()
    }

    @MainActor
    private func completeFlowInspection(in app: XCUIApplication, checks: [String]) {
        tapFlowButton("prepare-exchange", in: app)
        let code = app.textFields["partner-code"]
        XCTAssertTrue(code.waitForExistence(timeout: 5))
        code.tap(); code.typeText("2418")
        tapFlowButton("identify-exchange", in: app)
        for check in checks { tapFlowButton(check, in: app) }
        tapFlowButton("complete-inspection", in: app)
        saveScreenshot("inspection-complete")
    }

    @MainActor
    private func scrollUpTo(_ element: XCUIElement, in app: XCUIApplication) {
        for _ in 0..<8 {
            if element.isHittable { return }
            app.swipeDown()
        }
        XCTAssertTrue(element.isHittable)
    }

    @MainActor
    private func scrollTo(_ element: XCUIElement, in app: XCUIApplication) {
        for _ in 0..<6 {
            if element.isHittable { return }
            app.swipeUp()
        }
        XCTAssertTrue(element.isHittable)
    }

    @MainActor
    private func saveScreenshot(_ name: String) {
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
