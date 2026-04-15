import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock


MODULE_PATH = Path(__file__).resolve().parent.parent / "scripts" / "build_knowledge_parts.py"
SPEC = importlib.util.spec_from_file_location("build_knowledge_parts_script", MODULE_PATH)
build_knowledge_parts = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
sys.modules["build_knowledge_parts_script"] = build_knowledge_parts
SPEC.loader.exec_module(build_knowledge_parts)


class BuildKnowledgePartsOdlOnlyTests(unittest.TestCase):
    def test_rejects_legacy_docling_shape(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp = Path(tmpdir)
            input_path = tmp / "legacy-docling.json"
            output_path = tmp / "knowledge_parts.json"
            input_path.write_text(json.dumps({
                "chunks": [{"text": "hello", "headings": ["Intro"], "page_numbers": [1]}],
                "documents": [],
            }))

            argv = [
                "build_knowledge_parts.py",
                str(input_path),
                "-o",
                str(output_path),
                "--slug",
                "doc",
            ]
            with mock.patch.object(sys, "argv", argv):
                with self.assertRaises(SystemExit) as exc:
                    build_knowledge_parts.main()

            self.assertEqual(exc.exception.code, 1)
            self.assertFalse(output_path.exists())


if __name__ == "__main__":
    unittest.main()
