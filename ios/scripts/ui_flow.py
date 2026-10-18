"""Ordered native feature recordings and a local, self-contained results viewer."""
from datetime import datetime, timezone
from html import escape
import json
import re
import signal
import subprocess
import time


def step(id, title, test, covers):
    return dict(id=id, title=title, test=test, covers=covers)


STEPS = [
    step("01-home", "Welcome to campus", "testDiscoveryAndNativeTabs", "Home, four tabs, all service destinations, profile"),
    step("02-shortcuts", "A quicker way around", "testHomeShortcutsAndActivity", "Home shortcuts and Inbox activity"),
    step("03-classes", "Your semester, sorted", "testFlowClassesSaveAndClear", "Manual classes, save, revisit, clear, screenshot consent gate"),
    step("04-market", "Find it. Keep it.", "testFlowMarketSearchSaveAndFilters", "Marketplace search, empty state, listing details, favorites, free filter"),
    step("05-publish", "Give it a next chapter", "testFlowPublishListingWithPredictedPrice", "Listing validation, price prediction, editable price, publish, My posts"),
    step("06-tutors", "Find your study person", "testTutorSearchSaveAndConversation", "Course search, tutor profile, save, message, no paid handoff"),
    step("07-request", "Ask your campus", "testTutoringRequestAndOffering", "Create a tutoring request and return to the study board"),
    step("08-offer", "Share what you know", "testPostingTutorOfferReturnsToStudyBoard", "Create-post chooser, tutoring offer, study board"),
    step("09-tickets", "Your way in", "testFlowTicketReservationAndTransfer", "Event, listing, reservation, simulated payment, seller transfer, buyer receipt"),
    step("10-rides", "Going your way", "testFlowRideRequestAcceptAndCancel", "Ride detail, seat request, driver acceptance, cancellation"),
    step("11-negotiation", "Make a fair deal", "testListingMessagesCounterofferAndAgreedHandoff", "Send message, offer, seller counter, buyer acceptance, agreed handoff price"),
    step("12-inspection", "Look it over first", "testInspectionCannotBeSkipped", "Wrong pickup code, identification, mandatory inspection, cancel before payment"),
    step("13-payment", "A second chance", "testMockPaymentDeclineAndRetry", "Payment method, simulated decline, error, successful retry"),
    step("14-refund", "Every step accounted for", "testFlowPaidHandoffAndRefund", "All inspection checks, explicit payment, case, verified return, pending refund, bank confirmation"),
    step("15-free", "A little more kindness", "testFlowFreeHandoff", "Free listing, no payment method, inspection, explicit acceptance"),
    step("16-agent", "Buy with Big Al", "testBigAlTradeFromHomePreservesExploreServices", "Campus pet entry, negotiation, lock confirmation, seller chat, Explore navigation"),
    step("17-materials", "Ready for class", "testBigAlAvailableFromMarketAndScheduleReview", "Market agent entry, course search, material review, chat entry"),
    step("18-circle", "Good things go around", "testTradingCircleApprovalChatAndLeave", "Create swap, approve circle, meetup, group message, leave"),
    step("19-no-match", "Keep looking", "testTradingCircleNoMatchCanRetry", "No-match explanation and retry"),
    step("20-promotions", "Around your campus", "testCampusPromotionSampleAndDismissal", "Single campus promotion and dismissal"),
    step("21-auburn", "Hello, Auburn", "testAuburnInventoryAndInlineAds", "Campus switch, Auburn tutors, tickets, rides, inline ads"),
    step("22-pet", "Your campus companion", "testCampusPetMovesPersistsAndOpensTrades", "Drag, relaunch persistence, reset position, pause, campus mascot, trades entry"),
]


def select_steps(only):
    requested = set(only.split(",")) if only else {s["id"] for s in STEPS}
    unknown = requested - {s["id"] for s in STEPS}
    if unknown:
        raise RuntimeError("Unknown flow steps: " + ", ".join(sorted(unknown)))
    return [dict(s, status="pending") for s in STEPS if s["id"] in requested]


def validate_manifest(root):
    source = (root / "ios/RelayUITests/RelayUITests.swift").read_text()
    discovered = set(re.findall(r"func (test\w+)\(", source))
    listed = {s["test"] for s in STEPS}
    if discovered != listed or len(listed) != len(STEPS) or len({s["id"] for s in STEPS}) != len(STEPS):
        raise RuntimeError(f"Update the UI flow manifest. Uncovered tests: {sorted(discovered - listed)}; missing tests: {sorted(listed - discovered)}. Each chapter must select one unique test.")


def write_report(folder, state):
    # Atomic replacement lets the browser refresh while a step is running.
    temporary = folder / "report.json.tmp"
    temporary.write_text(json.dumps(state, indent=2))
    temporary.replace(folder / "report.json")
    counts = {status: sum(s["status"] == status for s in state["steps"])
              for status in ("passed", "failed", "pending", "running", "interrupted")}
    cards = []
    for s in state["steps"]:
        artifacts = []
        for filename, label in (("recording.mp4", "Watch recording"), ("result.xcresult", "Xcode results"), ("test.log", "Test log")):
            if (folder / s["id"] / filename).exists():
                artifacts.append(f'<a href="{s["id"]}/{filename}">{label}</a>')
        pictures = sorted((folder / s["id"] / "screenshots").glob("**/*.png"))
        gallery = "".join(f'<a href="{p.relative_to(folder)}"><img loading="lazy" src="{p.relative_to(folder)}" alt="{escape(p.name)}"></a>' for p in pictures)
        video = f'<video controls preload="none" src="{s["id"]}/recording.mp4"></video>' if (folder / s["id"] / "recording.mp4").exists() else ""
        note = f'<p class="note">{escape(s["note"])}</p>' if s.get("note") else ""
        cards.append(f'''<article id="{s['id']}"><div class="row"><span class="number">{s['id'].split('-')[0]}</span><span class="badge {s['status']}">{s['status']}</span></div>
          <h2>{escape(s['title'])}</h2><p>{escape(s['covers'])}</p>{note}
          <div class="links">{' '.join(artifacts)}</div>
          {'<details><summary>Review this flow · ' + str(round(s.get('seconds', 0))) + 's</summary>' + video + '<div class="gallery">' + gallery + '</div></details>' if artifacts else ''}</article>''')
    refresh = '<meta http-equiv="refresh" content="10">' if state["status"] == "running" else ""
    content = f'''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">{refresh}
    <title>Out of Pocket UI flow</title><style>
    *{{box-sizing:border-box}}body{{margin:0;background:#f5f3eb;color:#233b31;font:16px -apple-system,BlinkMacSystemFont,sans-serif}}main{{max-width:1160px;margin:auto;padding:56px 28px}}header{{max-width:780px;margin-bottom:38px}}.eyebrow{{text-transform:uppercase;letter-spacing:3px;font-size:12px;font-weight:700}}h1{{font:clamp(38px,6vw,66px) Georgia,serif;letter-spacing:-2px;margin:18px 0}}header p{{font-size:18px;line-height:1.6;color:#606b60}}.stats{{display:flex;gap:12px;flex-wrap:wrap;margin:26px 0}}.stats span{{background:#e5ebd7;padding:12px 18px;border-radius:24px}}.grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:18px}}article{{background:#fffdf7;border:1px solid #e4e4d9;border-radius:22px;padding:24px;min-width:0}}.row{{display:flex;align-items:center;justify-content:space-between}}.number{{font:26px Georgia,serif;color:#8a9585}}.badge{{font-size:11px;text-transform:uppercase;letter-spacing:1px;border-radius:20px;padding:7px 10px;background:#eee}}.passed{{background:#e3edcf}}.failed,.interrupted{{background:#f8d8c9}}.running{{background:#ece3ff}}h2{{font:26px Georgia,serif;margin:22px 0 12px}}p{{line-height:1.6;color:#606b60}}a{{color:#275d40}}.links{{display:flex;flex-wrap:wrap;gap:16px;font-size:13px;margin:22px 0}}summary{{cursor:pointer;font-size:13px}}video{{width:100%;max-height:540px;margin-top:20px;border-radius:12px;background:#202820}}.gallery{{display:flex;overflow:auto;gap:10px;margin-top:16px}}.gallery img{{height:210px;border-radius:8px}}.note{{color:#874b2f;font-size:13px}}footer{{margin-top:34px;color:#606b60;font-size:13px}}
    </style><main><header><div class="eyebrow">Feature by feature · Native iOS</div><h1>Out of Pocket<br>UI flow.</h1><p>A recorded walk through the good stuff. Every chapter runs in order, with its own fresh sample app, assertions, and evidence.</p>
    <div class="stats"><span>{counts['passed']} passed</span><span>{counts['failed']} failed</span><span>{counts['pending']} queued</span><span>{escape(state['status'])}</span></div>
    <p style="font-size:13px">{escape(state['started'])} · {len(state['steps'])} chapters · <a href="report.json">Machine-readable results</a> · <a href="build.log">Build log</a></p>
    {'<p class="note">' + escape(state['note']) + '</p>' if state.get('note') else ''}</header>
    <div class="grid">{''.join(cards)}</div><footer>Local simulator samples. Live sign-in, AI providers, real purchases, system photo selection, and external apps require separate integration checks. A passing chapter verifies only the actions listed on its card.</footer></main></html>'''
    temporary = folder / "index.html.tmp"
    temporary.write_text(content)
    temporary.replace(folder / "index.html")


def execute(root, common, device, opts):
    validate_manifest(root)
    steps = select_steps(opts.only)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f")
    folder = root / "work/ui-flow" / stamp
    folder.mkdir(parents=True)
    state = dict(name="Out of Pocket UI flow", started=datetime.now().astimezone().isoformat(),
                 status="running", simulator=device, steps=steps)
    write_report(folder, state)
    print(f"Flow report: {folder / 'index.html'}", flush=True)
    if not opts.no_open:
        subprocess.run(["open", str(folder / "index.html")], check=False)
    current = None
    try:
        with (folder / "build.log").open("w") as log:
            build = subprocess.run(["xcodebuild", "build-for-testing", *map(str, common),
                                    "-parallel-testing-enabled", "NO"], stdout=log, stderr=subprocess.STDOUT, timeout=600)
        if build.returncode:
            state["status"] = "build failed"
            state["note"] = "See build.log; no UI chapters ran."
            print(f"Build failed. See {folder / 'build.log'}", flush=True)
            return 1
        for current in steps:
            chapter = folder / current["id"]
            chapter.mkdir()
            current["status"] = "running"
            write_report(folder, state)
            print(f"[{current['id']}] {current['title']}", flush=True)
            start = time.monotonic()
            recorder = None
            with (chapter / "recording.log").open("w") as recording_log:
                try:
                    if not opts.no_video:
                        recorder = subprocess.Popen(["xcrun", "simctl", "io", device, "recordVideo", "--codec=h264", str(chapter / "recording.mp4")], stdout=recording_log, stderr=subprocess.STDOUT)
                    with (chapter / "test.log").open("w") as log:
                        result = subprocess.run(["xcodebuild", "test-without-building", *map(str, common),
                            "-parallel-testing-enabled", "NO", "-maximum-concurrent-test-simulator-destinations", "1",
                            "-only-testing:RelayUITests/RelayUITests/" + current["test"],
                            "-resultBundlePath", str(chapter / "result.xcresult")],
                            stdout=log, stderr=subprocess.STDOUT, timeout=300)
                    current["status"] = "passed" if result.returncode == 0 else "failed"
                    # A selector that silently runs zero tests must never count as coverage.
                    if result.returncode == 0 and "Executed 1 test" not in (chapter / "test.log").read_text():
                        current.update(status="failed", note="Expected exactly one UI test. Check the test log.")
                except subprocess.TimeoutExpired:
                    current.update(status="failed", note="Chapter exceeded five minutes. See the test log.")
                finally:
                    if recorder is not None:
                        if recorder.poll() is None:
                            recorder.send_signal(signal.SIGINT)
                        try:
                            recorder.wait(timeout=20)
                        except subprocess.TimeoutExpired:
                            recorder.kill()
                            recorder.wait()
                        if recorder.returncode != 0 or not (chapter / "recording.mp4").exists():
                            current["note"] = current.get("note", "") + " Video unavailable; see recording.log."
                            (chapter / "recording.mp4").unlink(missing_ok=True)
                    current["seconds"] = round(time.monotonic() - start, 1)
            if (chapter / "result.xcresult").exists():
                with (chapter / "export.log").open("w") as log:
                    try:
                        exported = subprocess.run(["xcrun", "xcresulttool", "export", "attachments", "--path", str(chapter / "result.xcresult"),
                                        "--output-path", str(chapter / "screenshots")], stdout=log, stderr=subprocess.STDOUT, timeout=60)
                        if exported.returncode:
                            current["note"] = current.get("note", "") + " Attachment export failed; original evidence remains in Xcode results."
                    except subprocess.TimeoutExpired:
                        current["note"] = current.get("note", "") + " Attachment export timed out; original evidence remains in Xcode results."
            write_report(folder, state)
            print(f"  {current['status']} ({current['seconds']}s)", flush=True)
        state["status"] = "failed" if any(s["status"] != "passed" for s in steps) else "passed"
    except KeyboardInterrupt:
        state["status"] = "interrupted"
        if current and current["status"] == "running":
            current["status"] = "interrupted"
    except (OSError, subprocess.SubprocessError) as error:
        state.update(status="failed", note=str(error))
        if current and current["status"] == "running":
            current.update(status="failed", note=str(error))
    finally:
        write_report(folder, state)
        print(f"{state['status']}: {folder / 'index.html'}", flush=True)
    return 0 if state["status"] == "passed" else 1
