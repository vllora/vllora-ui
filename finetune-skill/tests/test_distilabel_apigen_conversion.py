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

MODULE_PATH = Path(__file__).resolve().parent.parent / "scripts" / "run_distilabel_apigen_backend.py"
SPEC = importlib.util.spec_from_file_location("run_distilabel_apigen_backend_test", MODULE_PATH)
apigen = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(apigen)


class DistilabelApigenConversionTests(unittest.TestCase):
    def test_apigen_outputs_convert_to_tool_calling_records(self):
        tool_schemas = [
            {
                "type": "function",
                "function": {
                    "name": "lookup_order",
                    "description": "Fetch order details by order id.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "order_id": {"type": "string"},
                        },
                        "required": ["order_id"],
                    },
                },
            }
        ]
        tool_index = apigen.build_tool_index(tool_schemas)
        examples = [
            {
                "source_record_id": "decision-001",
                "query": "Where is order 123?",
                "answer": {"name": "lookup_order", "arguments": {"order_id": "123"}},
                "system_prompt": "You are a customer support agent.",
            }
        ]
        candidate_items = [
            {"query": "Track order 555 for me.", "answer": {"name": "lookup_order", "arguments": {"order_id": "555"}}},
            {"query": "Track it.", "answer": {"name": "unknown_tool", "arguments": {"order_id": "555"}}},
        ]

        selected_rows, rejected = apigen.convert_apigen_outputs_to_records(
            topic="lookup-order",
            candidate_items=candidate_items,
            examples=examples,
            tool_schemas=tool_schemas,
            tool_index=tool_index,
            tool_module=None,
        )

        self.assertEqual(len(selected_rows), 1)
        self.assertEqual(len(rejected), 1)
        row = selected_rows[0]
        self.assertEqual(row["prompt_type"], "apigen")
        self.assertEqual(row["tools"], tool_schemas)
        self.assertEqual(row["ground_truth"], {"name": "lookup_order", "arguments": {"order_id": "555"}})
        self.assertEqual(row["metadata"]["distilabel"]["source_record_id"], "decision-001")
        self.assertEqual(row["messages"][0]["content"], "You are a customer support agent.")


if __name__ == "__main__":
    unittest.main()
