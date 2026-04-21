import importlib.util
import json
import sys
import tempfile
import types
import unittest
from pathlib import Path


requests_stub = types.ModuleType("requests")
requests_stub.post = lambda *args, **kwargs: None
requests_stub.get = lambda *args, **kwargs: None
requests_stub.HTTPError = Exception
requests_stub.ConnectionError = ConnectionError
sys.modules["requests"] = requests_stub

MODULE_PATH = Path(__file__).resolve().parent.parent / "scripts" / "run_distilabel_apigen_backend.py"
SPEC = importlib.util.spec_from_file_location("run_distilabel_apigen_backend_merge_test", MODULE_PATH)
apigen = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(apigen)


class DistilabelApigenMergeTests(unittest.TestCase):
    def test_merge_preserves_canonical_rows_byte_for_byte(self):
        raw_one = '{"id":"decision-1","topic":"lookup-order","messages":[{"role":"system","content":"sys"},{"role":"user","content":"Track order 1"}],"tools":[{"type":"function","function":{"name":"lookup_order"}}],"ground_truth":{"name":"lookup_order","arguments":{"order_id":"1"}}}'
        raw_two = '{"id":"decision-2","topic":"lookup-order","messages":[{"role":"system","content":"sys"},{"role":"user","content":"Track order 2"}],"tools":[{"type":"function","function":{"name":"lookup_order"}}],"ground_truth":{"name":"lookup_order","arguments":{"order_id":"2"}}}'
        canonical_entries = [(raw_one, json.loads(raw_one)), (raw_two, json.loads(raw_two))]
        canonical_rows = [entry[1] for entry in canonical_entries]
        new_rows = [
            canonical_rows[0],
            {
                "id": "lookup-order-apigen-001",
                "topic": "lookup-order",
                "messages": [
                    {"role": "system", "content": "sys"},
                    {"role": "user", "content": "Track order 3"},
                ],
                "tools": [{"type": "function", "function": {"name": "lookup_order"}}],
                "ground_truth": {"name": "lookup_order", "arguments": {"order_id": "3"}},
                "prompt_type": "apigen",
            },
        ]

        deduped_rows, removed = apigen.dedupe_against_canonical(canonical_rows, new_rows)
        self.assertEqual(removed, 1)
        self.assertEqual(len(deduped_rows), 1)

        with tempfile.TemporaryDirectory() as tmpdir:
            output_path = Path(tmpdir) / "training.jsonl"
            apigen.write_merged_training_jsonl(output_path, canonical_entries, deduped_rows)
            lines = output_path.read_text().splitlines()

        self.assertEqual(lines[0], raw_one)
        self.assertEqual(lines[1], raw_two)
        self.assertIn('"prompt_type": "apigen"', lines[2])


if __name__ == "__main__":
    unittest.main()
