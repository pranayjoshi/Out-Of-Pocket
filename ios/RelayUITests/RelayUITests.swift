import XCTest

final class RelayUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    @MainActor
    func testCampusPromotionSampleAndDismissal() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing"]
        app.launch()
        app.tabBars.buttons["Campus"].tap()
        let promotion = app.descendants(matching: .any)["campus-promotion-Campus board"].firstMatch
        XCTAssertTrue(promotion.waitForExistence(timeout: 10))
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
        XCTAssertTrue(app.tabBars.buttons["Discover"].exists)
        XCTAssertTrue(app.tabBars.buttons["My plans"].exists)
        saveScreenshot("01-discover")
        app.tabBars.buttons["My plans"].tap()
        XCTAssertTrue(app.buttons["Build my setup"].waitForExistence(timeout: 5))
        app.buttons["Build my setup"].tap()
        XCTAssertTrue(app.buttons["Save my plan"].waitForExistence(timeout: 5))
        app.buttons["Save my plan"].tap()
        XCTAssertTrue(app.staticTexts["My cozy campus corner"].waitForExistence(timeout: 5))
        saveScreenshot("02-plans")
        app.tabBars.buttons["Campus"].tap()
        XCTAssertTrue(app.staticTexts["Buy with Big Al"].waitForExistence(timeout: 5))
        saveScreenshot("03-campus")
        app.tabBars.buttons["You"].tap()
        XCTAssertTrue(app.staticTexts["Your campus era."].waitForExistence(timeout: 5))
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
    func testSwitchboardFindAndOfferPrefill() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing"]
        app.launch()
        let books = app.buttons["campus-topic-Textbooks"]
        XCTAssertTrue(books.waitForExistence(timeout: 10))
        books.tap()
        app.buttons["campus-move-submit"].tap()
        XCTAssertTrue(app.staticTexts["Let’s see what’s around."].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["campus-find-ask"].exists)
        saveScreenshot("06-switchboard-find")
        app.buttons["Done"].tap()
        app.buttons["campus-intent-Offer"].tap()
        let input = app.textFields["campus-move-input"]
        input.tap()
        input.typeText("My chemistry textbook\n")
        XCTAssertTrue(app.textFields["A chair with a lot of good stories…"].waitForExistence(timeout: 5))
        XCTAssertEqual(app.textFields["A chair with a lot of good stories…"].value as? String, "My chemistry textbook")
        app.buttons["Cancel"].tap()
    }

    @MainActor
    func testSwitchboardTradeRequiresBothSides() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing"]
        app.launch()
        XCTAssertTrue(app.buttons["campus-intent-Trade"].waitForExistence(timeout: 10))
        app.buttons["campus-intent-Trade"].tap()
        let input = app.textFields["campus-move-input"]
        input.tap()
        input.typeText("My chemistry textbook\n")
        let submit = app.buttons["campus-post-submit"]
        XCTAssertTrue(submit.waitForExistence(timeout: 5))
        XCTAssertFalse(submit.isEnabled)
        let wanted = app.textFields["campus-post-wanted"]
        wanted.tap()
        wanted.typeText("A desk lamp")
        app.swipeUp()
        scrollTo(submit, in: app)
        XCTAssertTrue(submit.isEnabled)
        submit.tap()
        XCTAssertTrue(app.staticTexts["A little give. A little take."].waitForExistence(timeout: 5))
        XCTAssertTrue(app.tabBars.buttons["Campus"].isSelected)
        scrollTo(app.staticTexts["My chemistry textbook"], in: app)
        XCTAssertTrue(app.staticTexts["Trade · For: A desk lamp"].exists)
        saveScreenshot("07-switchboard-trade")
    }

    @MainActor
    func testSwitchboardNoMatchCanBecomeAnAsk() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing"]
        app.launch()
        let input = app.textFields["campus-move-input"]
        XCTAssertTrue(input.waitForExistence(timeout: 10))
        input.tap()
        input.typeText("Help with advanced chemistry\n")
        XCTAssertTrue(app.staticTexts["Be the first to ask."].waitForExistence(timeout: 5))
        app.buttons["campus-find-ask"].tap()
        XCTAssertTrue(app.textFields["campus-post-title"].waitForExistence(timeout: 5))
        XCTAssertEqual(app.textFields["campus-post-title"].value as? String, "Help with advanced chemistry")
        XCTAssertTrue(app.buttons["campus-post-submit"].isEnabled)
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
        // Dismiss the keyboard with a downward scroll before working with offers.
        app.swipeDown()
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
