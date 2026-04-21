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

MODULE_PATH = Path(__file__).resolve().parent.parent / "scripts" / "distilabel_shared.py"
SPEC = importlib.util.spec_from_file_location("distilabel_shared_test", MODULE_PATH)
distilabel_shared = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(distilabel_shared)


class DistilabelBackendResolutionTests(unittest.TestCase):
    def test_defaults_to_native_when_config_missing(self):
        self.assertEqual(distilabel_shared.resolve_generation_backend(None), "native")
        self.assertEqual(distilabel_shared.resolve_generation_backend({}), "native")

    def test_legacy_use_nemo_still_resolves(self):
        self.assertEqual(
            distilabel_shared.resolve_generation_backend({"use_nemo": True}),
            "nemo",
        )

    def test_explicit_generation_backend_overrides_legacy_flag(self):
        self.assertEqual(
            distilabel_shared.resolve_generation_backend(
                {"use_nemo": True, "generation_backend": "distilabel"}
            ),
            "distilabel",
        )
        self.assertEqual(
            distilabel_shared.resolve_generation_backend(
                {"use_nemo": False, "generation_backend": "native"}
            ),
            "native",
        )


if __name__ == "__main__":
    unittest.main()
