import contextlib
import io
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import ui_flow


class FlowTests(unittest.TestCase):
    def test_manifest_covers_every_native_test(self):
        ui_flow.validate_manifest(Path(__file__).resolve().parents[2])

    def test_subset_preserves_order_and_rejects_typos(self):
        self.assertEqual([s["id"] for s in ui_flow.select_steps("22-pet,01-home")], ["01-home", "22-pet"])
        with self.assertRaises(RuntimeError):
            ui_flow.select_steps("unknown")

    def run_fake_flow(self, first_output, first_code):
        temporary = TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        root = Path(temporary.name)
        selectors = []

        def run(command, **kwargs):
            if "test-without-building" in command:
                selectors.append(next(arg for arg in command if arg.startswith("-only-testing:")))
                kwargs["stdout"].write(first_output if len(selectors) == 1 else "Executed 1 test, with 0 failures")
                return SimpleNamespace(returncode=first_code if len(selectors) == 1 else 0)
            return SimpleNamespace(returncode=0)

        opts = SimpleNamespace(only="02-shortcuts,01-home", no_open=True, no_video=True)
        with patch.object(ui_flow, "validate_manifest"), patch.object(ui_flow.subprocess, "run", side_effect=run), contextlib.redirect_stdout(io.StringIO()):
            code = ui_flow.execute(root, [], "sample-device", opts)
        report = next((root / "work/ui-flow").glob("*/report.json"))
        return code, selectors, json.loads(report.read_text()), report.with_name("index.html").read_text()

    def test_failure_retains_evidence_and_continues_in_order(self):
        code, selectors, state, html = self.run_fake_flow("Executed 1 test, with 1 failure", 65)
        self.assertEqual(code, 1)
        self.assertIn("testDiscoveryAndNativeTabs", selectors[0])
        self.assertIn("testHomeShortcutsAndActivity", selectors[1])
        self.assertEqual([s["status"] for s in state["steps"]], ["failed", "passed"])
        self.assertIn("Test log", html)
        self.assertNotIn('http-equiv="refresh"', html)

    def test_empty_selection_never_counts_as_a_pass(self):
        code, _, state, _ = self.run_fake_flow("Executed 0 tests", 0)
        self.assertEqual(code, 1)
        self.assertEqual(state["steps"][0]["status"], "failed")
        self.assertIn("Expected exactly one", state["steps"][0]["note"])


if __name__ == "__main__":
    unittest.main()
