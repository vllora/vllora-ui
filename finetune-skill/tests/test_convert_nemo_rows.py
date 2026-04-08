import importlib.util
import json
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).resolve().parent.parent / "scripts" / "convert_nemo_rows.py"
SPEC = importlib.util.spec_from_file_location("convert_nemo_rows_script", MODULE_PATH)
convert_nemo_rows = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(convert_nemo_rows)


class ConvertNemoRowsTests(unittest.TestCase):
    def test_extract_exact_source_parts_prefers_question_matches(self):
        row = {
            "question_chunks_matches_json": json.dumps(
                [
                    {"part_id": "part-q-1", "relevant": True},
                    {"part_id": "part-q-2", "relevant": False},
                    {"part_id": "part-q-3", "relevant": None},
                ]
            ),
            "retrieved_chunks_part_ids": ["part-topic-1"],
        }

        self.assertEqual(
            convert_nemo_rows.extract_exact_source_parts(row),
            ["part-q-1", "part-q-3"],
        )

    def test_extract_exact_source_parts_falls_back_to_topic_level_ids(self):
        row = {
            "retrieved_chunks_part_ids": ["part-topic-1", "part-topic-2", "part-topic-1"],
        }

        self.assertEqual(
            convert_nemo_rows.extract_exact_source_parts(row),
            ["part-topic-1", "part-topic-2"],
        )

    def test_extract_exact_source_parts_does_not_fallback_from_irrelevant_matches(self):
        row = {
            "question_chunks_matches_json": json.dumps(
                [
                    {"part_id": "part-q-1", "relevant": False},
                    {"part_id": "part-q-2", "relevant": False},
                ]
            ),
            "question_chunks_part_ids": ["part-q-1", "part-q-2"],
        }

        self.assertEqual(convert_nemo_rows.extract_exact_source_parts(row), [])

    def test_build_relations_deduplicates_topic_part_pairs(self):
        rows = [
            {
                "topic": "topic-a",
                "retrieved_chunks_matches_json": json.dumps(
                    [
                        {"part_id": "part-1", "relevant": True},
                        {"part_id": "part-2", "relevant": False},
                    ]
                ),
            },
            {
                "topic": "topic-a",
                "retrieved_chunks_part_ids": ["part-1", "part-3"],
            },
            {
                "topic": "topic-b",
                "retrieved_chunks_part_ids": ["part-4"],
            },
        ]

        self.assertEqual(
            convert_nemo_rows.build_relations(rows),
            [
                {"topic_identifier": "topic-a", "part_identifier": "part-1"},
                {"topic_identifier": "topic-a", "part_identifier": "part-3"},
                {"topic_identifier": "topic-b", "part_identifier": "part-4"},
            ],
        )

    def test_build_relations_does_not_fallback_from_irrelevant_matches(self):
        rows = [
            {
                "topic": "topic-a",
                "retrieved_chunks_matches_json": json.dumps(
                    [
                        {"part_id": "part-1", "relevant": False},
                    ]
                ),
                "retrieved_chunks_part_ids": ["part-1"],
            },
        ]

        self.assertEqual(convert_nemo_rows.build_relations(rows), [])


if __name__ == "__main__":
    unittest.main()
