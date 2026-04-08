import importlib.util
import sys
import types
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).resolve().parent.parent / "scripts" / "finetune.py"
SPEC = importlib.util.spec_from_file_location("finetune_script", MODULE_PATH)
requests_stub = types.ModuleType("requests")
requests_stub.request = lambda *args, **kwargs: None
requests_stub.HTTPError = Exception
requests_stub.ConnectionError = Exception
sys.modules.setdefault("requests", requests_stub)
finetune = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(finetune)


class EpochParsingTests(unittest.TestCase):
    def test_normalize_epoch_candidates_handles_mixed_shapes(self):
        raw = [
            "0.25",
            {"score": "0.75", "reason": "good"},
            {
                "score": ["0.5", "0.9"],
                "reason": ["ok", "great"],
                "rollout_content": ["A", "B"],
            },
            {"nested": [{"score": 0.4}, "0.6"]},
            "opaque string",
        ]

        candidates = finetune._normalize_epoch_candidates(raw)

        self.assertEqual(
            [c.get("score") for c in candidates if c.get("score") is not None],
            [0.25, 0.75, 0.5, 0.9, 0.4, 0.6],
        )
        self.assertEqual(candidates[1]["reason"], "good")
        self.assertEqual(candidates[2]["rollout_content"], "A")
        self.assertEqual(candidates[-1]["rollout_output"], "opaque string")

    def test_compute_eval_partial_score_ignores_malformed_entries(self):
        result = {
            "results": [
                {
                    "epochs": {
                        "0": [
                            "0.2",
                            {"score": "0.8"},
                            {"score": "not-a-number"},
                            {"nested": [{"score": 1.0}]},
                        ],
                    }
                }
            ]
        }

        avg, count, zero_rate, perfect_rate = finetune._compute_eval_partial_score(result)

        self.assertAlmostEqual(avg, (0.2 + 0.8 + 1.0) / 3)
        self.assertEqual(count, 3)
        self.assertEqual(zero_rate, 0.0)
        self.assertAlmostEqual(perfect_rate, 1 / 3)

    def test_check_score_plateau_handles_dict_of_lists_epochs(self):
        eval_payload = {
            "results": [
                {
                    "epochs": {
                        "0": {"score": ["0.20", "0.30"]},
                        "1": {"score": ["0.30", "0.40"]},
                        "2": {"score": ["0.40", "0.50"]},
                    }
                }
            ]
        }

        original_api = finetune._api
        finetune._api = lambda *args, **kwargs: eval_payload
        try:
            plateau = finetune._check_score_plateau(
                base_url="http://localhost:9090",
                wf_id="wf-123",
                job_id="job-local-123",
                provider_job_id="job-123",
                patience=2,
                min_warmup_epochs=1,
                slope_threshold=0.5,
            )
        finally:
            finetune._api = original_api

        self.assertIsNotNone(plateau)
        self.assertEqual(plateau["all_avgs"], [("0", 0.25), ("1", 0.35), ("2", 0.45)])

    def test_best_epoch_candidate_prefers_highest_numeric_score(self):
        candidate = finetune._best_epoch_candidate(
            [
                "not-a-score",
                {"score": "0.65", "reason": "solid"},
                {"score": 0.9, "reason": "best"},
            ]
        )

        self.assertIsNotNone(candidate)
        self.assertEqual(candidate["score"], 0.9)
        self.assertEqual(candidate["reason"], "best")

    def test_best_epoch_candidate_returns_none_without_score(self):
        candidate = finetune._best_epoch_candidate(
            [
                "not-a-score",
                {"status": "running", "rollout_output": "waiting"},
            ]
        )

        self.assertIsNone(candidate)


if __name__ == "__main__":
    unittest.main()
