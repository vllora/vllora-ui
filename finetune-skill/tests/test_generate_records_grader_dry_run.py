import importlib.util
import io
import json
import sys
import types
import unittest
from contextlib import redirect_stderr
from pathlib import Path
from unittest import mock


class HTTPError(Exception):
    def __init__(self, response):
        super().__init__(f"HTTP {response.status_code}")
        self.response = response


requests_stub = types.ModuleType("requests")
requests_stub.get = lambda *args, **kwargs: None
requests_stub.post = lambda *args, **kwargs: None
requests_stub.HTTPError = HTTPError
requests_stub.ConnectionError = ConnectionError
sys.modules["requests"] = requests_stub

MODULE_PATH = Path(__file__).resolve().parent.parent / "scripts" / "generate_records.py"
SPEC = importlib.util.spec_from_file_location("generate_records_script", MODULE_PATH)
generate_records = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(generate_records)


class DummyResponse:
    def __init__(self, payload=None, status_code=200, text=""):
        self._payload = payload if payload is not None else {}
        self.status_code = status_code
        self.text = text or json.dumps(self._payload)

    def json(self):
        return self._payload

    def raise_for_status(self):
        if self.status_code >= 400:
            raise generate_records.requests.HTTPError(self)


class GenerateRecordsGraderDryRunTests(unittest.TestCase):
    def test_probe_and_rewrite_uses_evaluator_dry_run(self):
        calls = []

        def fake_post(url, json=None, timeout=None, **kwargs):
            calls.append((url, json))
            return DummyResponse({"score": 0.9, "reason": "trivial"})

        row = {"messages": [{"role": "user", "content": "q"}], "ground_truth": "a"}
        with mock.patch.object(generate_records.requests, "post", side_effect=fake_post):
            result = generate_records._score_row_with_dry_run(
                "http://localhost:9090",
                "wf-123",
                "function evaluate(input) { return { score: 1, reason: 'ok' }; }",
                row,
            )

        self.assertEqual(result["score"], 0.9)
        self.assertEqual(calls[0][0], "http://localhost:9090/finetune/workflows/wf-123/evaluator/dry-run")
        self.assertIn("script", calls[0][1])
        self.assertEqual(calls[0][1]["row"], row)

    def test_probe_and_rewrite_fetches_script_once(self):
        args = types.SimpleNamespace(
            base_url="http://localhost:9090",
            workflow_id="wf-123",
            probe_model="Qwen3.5-4B",
        )
        records = [{"messages": [{"role": "user", "content": "q"}], "ground_truth": "a"}]

        with mock.patch.object(generate_records, "_fetch_latest_grader_script", return_value="script") as fetch_mock:
            with mock.patch.object(generate_records, "_probe_records_for_triviality", return_value=[]) as probe_mock:
                result = generate_records._maybe_probe_trivial_records(records, args, threshold=0.85)

        self.assertEqual(result, [])
        fetch_mock.assert_called_once_with("http://localhost:9090", "wf-123")
        probe_mock.assert_called_once_with(
            records,
            "http://localhost:9090",
            "wf-123",
            "Qwen3.5-4B",
            "script",
            threshold=0.85,
        )

    def test_probe_and_rewrite_warns_and_skips_when_no_grader_source(self):
        args = types.SimpleNamespace(
            base_url="http://localhost:9090",
            workflow_id="wf-123",
            probe_model=None,
        )
        stderr = io.StringIO()

        with mock.patch.object(generate_records, "_fetch_latest_grader_script", return_value=None):
            with redirect_stderr(stderr):
                result = generate_records._maybe_probe_trivial_records([], args, threshold=0.85)

        self.assertEqual(result, [])
        self.assertIn("Probe-and-rewrite skipped: no uploaded grader available for dry-run scoring.", stderr.getvalue())


if __name__ == "__main__":
    unittest.main()
