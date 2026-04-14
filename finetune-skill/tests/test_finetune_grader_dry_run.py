import importlib.util
import io
import json
import sys
import tempfile
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
requests_stub.request = lambda *args, **kwargs: None
requests_stub.get = lambda *args, **kwargs: None
requests_stub.post = lambda *args, **kwargs: None
requests_stub.HTTPError = HTTPError
requests_stub.ConnectionError = ConnectionError
sys.modules["requests"] = requests_stub

MODULE_PATH = Path(__file__).resolve().parent.parent / "scripts" / "finetune.py"
SPEC = importlib.util.spec_from_file_location("finetune_script", MODULE_PATH)
finetune = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(finetune)


class DummyResponse:
    def __init__(self, payload=None, status_code=200, text=""):
        self._payload = payload if payload is not None else {}
        self.status_code = status_code
        self.text = text or json.dumps(self._payload)
        self.content = self.text.encode("utf-8")

    def json(self):
        return self._payload

    def raise_for_status(self):
        if self.status_code >= 400:
            raise finetune.requests.HTTPError(self)


class FinetuneGraderDryRunTests(unittest.TestCase):
    def test_test_grader_parser_accepts_max_output_tokens(self):
        captured = {}
        argv = [
            str(MODULE_PATH),
            "test-grader",
            "--workflow-id",
            "wf-123",
            "--training-file",
            "training.jsonl",
            "--max-output-tokens",
            "128",
        ]

        with mock.patch.object(finetune, "cmd_test_grader", side_effect=lambda args: captured.setdefault("args", args)):
            with mock.patch.object(sys, "argv", argv):
                finetune.main()

        self.assertEqual(captured["args"].max_output_tokens, 128)

    def test_resolve_grader_script_prefers_local_file(self):
        with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False) as fh:
            fh.write("function evaluate(input) { return { score: 1, reason: 'ok' }; }")
            grader_path = fh.name

        args = types.SimpleNamespace(
            grader_file=grader_path,
            base_url="http://localhost:9090",
            workflow_id="wf-123",
        )

        with mock.patch.object(finetune.requests, "get", side_effect=AssertionError("gateway fetch should not be used")):
            script = finetune._resolve_grader_script_for_test(args)

        self.assertIn("function evaluate", script)

    def test_resolve_grader_script_uses_latest_evaluator_version(self):
        args = types.SimpleNamespace(
            grader_file=None,
            base_url="http://localhost:9090",
            workflow_id="wf-123",
        )
        versions = [
            {"config": {"script": "function evaluate(input) { return { score: 0.5, reason: 'ok' }; }"}}
        ]

        with mock.patch.object(finetune.requests, "get", return_value=DummyResponse(versions)):
            script = finetune._resolve_grader_script_for_test(args)

        self.assertIn("return { score: 0.5", script)

    def test_resolve_grader_script_supports_nested_config_shape(self):
        args = types.SimpleNamespace(
            grader_file=None,
            base_url="http://localhost:9090",
            workflow_id="wf-123",
        )
        versions = [
            {"config": {"config": {"script": "function evaluate(input) { return { score: 0.7, reason: 'nested' }; }"}}}
        ]

        with mock.patch.object(finetune.requests, "get", return_value=DummyResponse(versions)):
            script = finetune._resolve_grader_script_for_test(args)

        self.assertIn("nested", script)

    def test_test_grader_posts_to_evaluator_dry_run(self):
        record = {
            "id": "rec-1",
            "messages": [
                {"role": "system", "content": "System prompt"},
                {"role": "user", "content": "Question?"},
            ],
            "ground_truth": "correct answer",
        }
        with tempfile.NamedTemporaryFile("w", suffix=".jsonl", delete=False) as fh:
            fh.write(json.dumps(record) + "\n")
            training_path = fh.name

        calls = []

        def fake_post(url, json=None, timeout=None, **kwargs):
            calls.append((url, json))
            if url.endswith("/v1/chat/completions"):
                return DummyResponse({"choices": [{"message": {"content": "wrong answer"}}]})
            if url.endswith("/evaluator/dry-run"):
                return DummyResponse({"score": 0.05, "reason": "strict", "is_success": True})
            raise AssertionError(f"unexpected POST {url}")

        args = types.SimpleNamespace(
            workflow_id="wf-123",
            training_file=training_path,
            grader_file=None,
            samples=1,
            base_url="http://localhost:9090",
            max_output_tokens=128,
        )

        with mock.patch.object(finetune, "_resolve_grader_script_for_test", return_value="function evaluate(input) { return { score: 0, reason: 'strict' }; }"):
            with mock.patch.object(finetune.requests, "post", side_effect=fake_post):
                with mock.patch.object(finetune, "_auto_journal", return_value=None):
                    with self.assertRaises(SystemExit) as ctx:
                        finetune.cmd_test_grader(args)

        self.assertEqual(ctx.exception.code, 0)
        dry_run_calls = [(url, payload) for url, payload in calls if url.endswith("/evaluator/dry-run")]
        self.assertTrue(dry_run_calls)
        self.assertTrue(all("/evaluate" not in url for url, _ in dry_run_calls))
        for url, payload in dry_run_calls:
            self.assertEqual(url, "http://localhost:9090/finetune/workflows/wf-123/evaluator/dry-run")
            self.assertIn("script", payload)
            self.assertIn("row", payload)

    def test_test_grader_error_message_no_longer_mentions_evaluate(self):
        record = {
            "id": "rec-1",
            "messages": [
                {"role": "system", "content": "System prompt"},
                {"role": "user", "content": "Question?"},
            ],
            "ground_truth": "correct answer",
        }
        with tempfile.NamedTemporaryFile("w", suffix=".jsonl", delete=False) as fh:
            fh.write(json.dumps(record) + "\n")
            training_path = fh.name

        args = types.SimpleNamespace(
            workflow_id="wf-123",
            training_file=training_path,
            grader_file=None,
            samples=1,
            base_url="http://localhost:9090",
            max_output_tokens=None,
        )

        stderr = io.StringIO()
        with mock.patch.object(finetune, "_resolve_grader_script_for_test", return_value="function evaluate(input) { return { score: 0, reason: 'strict' }; }"):
            with mock.patch.object(finetune, "_score_row_with_dry_run", side_effect=Exception("boom")):
                with mock.patch.object(finetune.requests, "post", return_value=DummyResponse({"choices": [{"message": {"content": "wrong answer"}}]})):
                    with mock.patch.object(finetune, "_auto_journal", return_value=None):
                        with redirect_stderr(stderr):
                            with self.assertRaises(SystemExit) as ctx:
                                finetune.cmd_test_grader(args)

        self.assertEqual(ctx.exception.code, 1)
        output = stderr.getvalue()
        self.assertIn("dry-run endpoint", output)
        self.assertNotIn("/evaluate", output)


if __name__ == "__main__":
    unittest.main()
