import importlib.util
import sys
import types
import unittest
from pathlib import Path


requests_stub = types.ModuleType("requests")
requests_stub.post = lambda *args, **kwargs: None
requests_stub.get = lambda *args, **kwargs: None
requests_stub.HTTPError = Exception
requests_stub.ConnectionError = ConnectionError
sys.modules["requests"] = requests_stub

MODULE_PATH = Path(__file__).resolve().parent.parent / "scripts" / "apply_deita_selection.py"
SPEC = importlib.util.spec_from_file_location("apply_deita_selection_test", MODULE_PATH)
deita = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(deita)


def _record(record_id: str, prompt: str, gt: str) -> dict:
    return {
        "id": record_id,
        "topic": "refunds",
        "messages": [
            {"role": "system", "content": "You are a support assistant."},
            {"role": "user", "content": prompt},
        ],
        "source_parts": ["part-refund"],
        "ground_truth": gt,
        "prompt_type": "backtranslation",
        "metadata": {"distilabel": {"method": "instruction_backtranslation"}},
    }


class DeitaSelectionTests(unittest.TestCase):
    def test_selection_enforces_budget_and_diversity(self):
        records = [
            _record(
                "rec-1",
                "Given a damaged item delivered yesterday, what refund steps should the user follow and when should support escalate?",
                "Refunds for damaged items can be approved with evidence and escalated when policy exceptions apply.",
            ),
            _record(
                "rec-2",
                "Given a damaged item delivered yesterday, what refund steps should the user follow and when should support escalate?",
                "Refunds for damaged items can be approved with evidence and escalated when policy exceptions apply.",
            ),
            _record(
                "rec-3",
                "Compare how support should handle a late-delivery refund versus a damaged-item refund when the customer requests store credit.",
                "Late-delivery refunds depend on shipping guarantees, while damaged-item refunds depend on product condition and evidence.",
            ),
            _record("rec-4", "Refund?", "yes"),
        ]

        selected, report = deita.select_records(records, {"refunds": 3}, diversity_threshold=0.70)

        selected_ids = {row["id"] for row in selected}
        self.assertIn("rec-3", selected_ids)
        self.assertEqual(len({"rec-1", "rec-2"} & selected_ids), 1)
        self.assertGreaterEqual(report["drop_reasons"].get("near_duplicate", 0), 1)
        self.assertGreaterEqual(
            report["drop_reasons"].get("low_quality", 0) + report["drop_reasons"].get("low_complexity", 0),
            1,
        )
        for row in selected:
            self.assertEqual(row["metadata"]["distilabel"]["selection_reason"], "deita_selected")
            self.assertGreater(row["metadata"]["distilabel"]["candidate_score"], 0.0)


if __name__ == "__main__":
    unittest.main()
