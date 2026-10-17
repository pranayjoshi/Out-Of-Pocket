#!/usr/bin/env python3
"""Set up, build, test, and launch Relay using the installed Xcode."""
import argparse
import json
import os
import platform
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]


def run(*args, capture=False, timeout=None):
    print("+ " + " ".join(str(arg) for arg in args), flush=True)
    return subprocess.run([str(arg) for arg in args], check=True, text=True,
                          stdout=subprocess.PIPE if capture else None, timeout=timeout).stdout


def sim_json(*args):
    return json.loads(run("xcrun", "simctl", *args, "--json", capture=True))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["setup", "run", "test", "doctor"], default="run", nargs="?")
    parser.add_argument("--device", help="Existing simulator UUID; defaults to a dedicated Relay iPhone")
    parser.add_argument("--restart", action="store_true", help="Restart the selected simulator before launching")
    opts = parser.parse_args()
    developer = os.environ.get("DEVELOPER_DIR")
    if not developer:
        developer = subprocess.check_output(["xcode-select", "-p"], text=True).strip()
        if not Path(developer, "Platforms/iPhoneSimulator.platform").exists():
            developer = "/Applications/Xcode.app/Contents/Developer"
    if not Path(developer, "Platforms/iPhoneSimulator.platform").is_dir():
        raise RuntimeError("Install full Xcode from the App Store, open it once, then retry.")
    os.environ["DEVELOPER_DIR"] = developer
    print(f"Using {developer}", flush=True)
    run("xcodebuild", "-version")
    if opts.action == "setup":
        run("xcodebuild", "-runFirstLaunch")
    runtimes = [r for r in sim_json("list", "runtimes")["runtimes"]
                if r.get("isAvailable") and ".iOS-" in r["identifier"]
                and int(r["version"].split(".")[0]) >= 18]
    if not runtimes and opts.action == "setup":
        free = shutil.disk_usage(ROOT).free / 1024 ** 3
        if free < 14:
            raise RuntimeError(f"Only {free:.1f} GB free. Free at least 14 GB for the iOS runtime and build, then rerun setup.")
        architecture = "arm64" if platform.machine() == "arm64" else "universal"
        run("xcodebuild", "-downloadPlatform", "iOS", "-architectureVariant", architecture)
        runtimes = [r for r in sim_json("list", "runtimes")["runtimes"]
                    if r.get("isAvailable") and ".iOS-" in r["identifier"]
                    and int(r["version"].split(".")[0]) >= 18]
    if not runtimes:
        raise RuntimeError("No compatible iOS simulator runtime. Run: python3 ios/scripts/relay.py setup")
    runtime = max(runtimes, key=lambda r: tuple(int(v) for v in r["version"].split(".")))
    print(f"Runtime: {runtime['name']}", flush=True)
    devices = sim_json("list", "devices", "available")["devices"]
    if opts.device:
        available = [d for group in devices.values() for d in group if d["udid"] == opts.device]
        if not available:
            raise RuntimeError(f"Simulator {opts.device} is unavailable.")
        device = available[0]
    else:
        candidates = [d for d in devices.get(runtime["identifier"], []) if d["name"] == "Relay iPhone"]
        if candidates:
            device = candidates[0]
        else:
            types = sim_json("list", "devicetypes")["devicetypes"]
            preferred = next((d for d in types if d["name"] == "iPhone 16 Pro"), None)
            if not preferred:
                raise RuntimeError("iPhone 16 Pro simulator type missing. Update Xcode.")
            if opts.action == "doctor":
                print("Ready. A dedicated Relay iPhone simulator will be created on first run.")
                return
            uuid = run("xcrun", "simctl", "create", "Relay iPhone", preferred["identifier"],
                       runtime["identifier"], capture=True).strip()
            device = {"udid": uuid, "state": "Shutdown"}
    print(f"Simulator: {device['udid']}", flush=True)
    if opts.action == "doctor":
        print("Ready to build and launch Relay.")
        return
    if opts.restart and device["state"] != "Shutdown":
        run("xcrun", "simctl", "shutdown", device["udid"], timeout=120)
        device["state"] = "Shutdown"
    if device["state"] != "Booted":
        run("xcrun", "simctl", "boot", device["udid"], timeout=120)
    try:
        run("xcrun", "simctl", "bootstatus", device["udid"], "-b", timeout=600)
    except subprocess.TimeoutExpired as error:
        raise RuntimeError("Simulator first boot exceeded 10 minutes. Retry with: python3 ios/scripts/relay.py run --restart. This restarts the simulator without erasing its data.") from error
    derived = ROOT / "work/ios-local-build"
    common = ["-project", ROOT / "ios/Relay.xcodeproj", "-scheme", "Relay",
              "-destination", f"platform=iOS Simulator,id={device['udid']}",
              "-derivedDataPath", derived, "CODE_SIGNING_ALLOWED=NO"]
    if opts.action == "test":
        run("xcrun", "swift", "test", "--package-path", ROOT / "ios/Packages/RelayCore",
            "--scratch-path", ROOT / "work/swift-xcode-build")
        run("xcodebuild", "test", *common, "-parallel-testing-enabled", "NO")
        return
    run("xcodebuild", "build", *common)
    app = derived / "Build/Products/Debug-iphonesimulator/Relay.app"
    run("xcrun", "simctl", "install", device["udid"], app)
    run("xcrun", "simctl", "launch", "--terminate-running-process", device["udid"], "com.pranayjoshi.relay")
    run("open", "-a", str(Path(developer) / "Applications/Simulator.app"),
        "--args", "-CurrentDeviceUDID", device["udid"])
    print("Relay is running. Next time: python3 ios/scripts/relay.py run")


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, subprocess.CalledProcessError, subprocess.TimeoutExpired) as error:
        print(f"\nSetup stopped: {error}", file=sys.stderr)
        sys.exit(1)
