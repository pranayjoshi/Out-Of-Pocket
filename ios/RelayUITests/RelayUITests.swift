import XCTest

final class RelayUITests: XCTestCase {
    @MainActor
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    @MainActor
    func testDiscoveryAndNativeTabs() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing"]
        app.launch()
        XCTAssertTrue(app.staticTexts["Your campus,\nin circulation."].waitForExistence(timeout: 10))
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
        XCTAssertTrue(app.staticTexts["Good things\nare happening."].waitForExistence(timeout: 5))
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
    private func saveScreenshot(_ name: String) {
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
