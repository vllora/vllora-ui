import importlib.util
import json
import sys
import types
import unittest
from pathlib import Path
from unittest import mock


requests_stub = types.ModuleType("requests")
requests_stub.post = lambda *args, **kwargs: None
requests_stub.get = lambda *args, **kwargs: None
requests_stub.HTTPError = Exception
requests_stub.ConnectionError = ConnectionError
sys.modules["requests"] = requests_stub

MODULE_PATH = Path(__file__).resolve().parent.parent / "scripts" / "run_distilabel_text_backend.py"
SPEC = importlib.util.spec_from_file_location("run_distilabel_text_backend_test", MODULE_PATH)
text_backend = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(text_backend)


class DistilabelTextBackendTests(unittest.TestCase):
    def test_build_text_candidates_uses_existing_artifacts_and_trace_priority(self):
        topics = [
            {"id": "support", "name": "Support", "system_prompt": "Help users.", "parent_id": None},
            {
                "id": "refunds",
                "name": "Refunds",
                "system_prompt": "Handle refund policies.",
                "parent_id": "support",
            },
            {
                "id": "shipping",
                "name": "Shipping",
                "system_prompt": "Handle shipping questions.",
                "parent_id": "support",
            },
        ]
        relations = [
            {"topic_identifier": "refunds", "part_identifier": "part-refund"},
            {"topic_identifier": "shipping", "part_identifier": "part-ship"},
        ]
        parts = {
            "part-refund": {
                "id": "part-refund",
                "title": "Refund Policy",
                "content": "Refunds are allowed within thirty days for unopened items.",
                "type": "text",
            },
            "part-ship": {
                "id": "part-ship",
                "title": "Shipping Policy",
                "content": "Shipping changes require confirmation before dispatch.",
                "type": "text",
            },
        }
        trace_priority = {"refunds": 0.9, "shipping": 0.1}
        trace_prompts = {
            "seed_queries": {
                "refunds": ["My package arrived damaged. Can I still get a refund?"],
                "shipping": ["Can I change the shipping address after ordering?"],
            }
        }

        fake_payload = json.dumps(
            {
                "records": [
                    {
                        "user_message": "How do I request a refund for an unopened item after two weeks?",
                        "ground_truth": "Refunds are allowed within thirty days for unopened items.",
                        "source_refs": ["1"],
                    },
                    {
                        "user_message": "When should support deny a refund request?",
                        "ground_truth": "Refund requests outside the allowed window should be denied.",
                        "source_refs": ["1"],
                    },
                ]
            }
        )

        with mock.patch.object(text_backend, "gateway_chat_completion", return_value=fake_payload):
            rows, metadata = text_backend.build_text_candidates(
                topics=topics,
                relations=relations,
                parts=parts,
                system_prompt="You are a support assistant.",
                model="gpt-4o-mini",
                base_url="http://localhost:9090/v1",
                target_records_per_topic=30,
                min_records_per_topic=25,
                trace_priority_scores=trace_priority,
                trace_prompts=trace_prompts,
            )

        self.assertTrue(rows)
        self.assertIn("topic_targets", metadata)
        self.assertGreater(metadata["topic_targets"]["refunds"], metadata["topic_targets"]["shipping"])
        self.assertLessEqual(metadata["topic_targets"]["refunds"], 75)

        seed_rows = [row for row in rows if row["id"].startswith("refunds-seedbt-")]
        self.assertTrue(seed_rows)
        for row in seed_rows:
            self.assertEqual(row["prompt_type"], "backtranslation")
            self.assertTrue(row["ground_truth"].strip())
            self.assertEqual(row["source_parts"], ["part-refund"])

        llm_rows = [row for row in rows if row["id"].startswith("refunds-bt-")]
        self.assertTrue(llm_rows)
        self.assertIn("You are a support assistant.", llm_rows[0]["messages"][0]["content"])


if __name__ == "__main__":
    unittest.main()
