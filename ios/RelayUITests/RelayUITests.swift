import XCTest

final class RelayUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    @MainActor
    func testBigAlTradeFromHomePreservesExploreServices() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing"]
        app.launch()
        let entry = app.buttons["bigal-entry"]
        XCTAssertTrue(entry.waitForExistence(timeout: 10))
        entry.tap()
        XCTAssertTrue(app.buttons["bigal-open-trade"].waitForExistence(timeout: 5))
        app.buttons["bigal-open-trade"].tap()
        let item = app.textFields["bigal-item"]
        XCTAssertTrue(item.waitForExistence(timeout: 5))
        item.tap(); item.typeText("Artificial Intelligence: A Modern Approach")
        app.buttons["bigal-submit-trade"].tap()
        XCTAssertTrue(app.staticTexts["Ready for you"].waitForExistence(timeout: 15))
        let trade = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "bigal-trade-")).firstMatch
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
        XCTAssertTrue(app.buttons["bigal-chat"].waitForExistence(timeout: 5))
        app.buttons["bigal-chat"].tap()
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
        XCTAssertTrue(promotion.exists)
        let open = app.buttons["open-campus-promotion"]
        scrollTo(open, in: app)
        open.tap()
        XCTAssertTrue(app.staticTexts["SAMPLE CAMPUS PROMOTION"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["This is an example ad. There is no live event registration, study enrollment, payment or offer."].exists)
        saveScreenshot("ads-sample-detail")
        app.buttons["Done"].tap()
        let dismiss = app.buttons["Dismiss campus promotion"]
        scrollTo(dismiss, in: app)
        saveScreenshot("ads-campus-placement")
        dismiss.tap()
        XCTAssertFalse(promotion.exists)
    }

    @MainActor
    func testDiscoveryAndNativeTabs() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing"]
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
        XCTAssertTrue(app.buttons["find-ride"].waitForExistence(timeout: 5))
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
