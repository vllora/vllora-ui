import importlib.util
import json
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest import mock


SCRIPTS_DIR = Path(__file__).resolve().parent.parent / "scripts"
BACKEND_PATH = SCRIPTS_DIR / "odl_hybrid_backend.py"
ODL_EXTRACT_PATH = SCRIPTS_DIR / "odl_extract.py"
EXTRACT_ROUTER_PATH = SCRIPTS_DIR / "extract_router.py"

SUPPORTED_CONVERT_KWARGS = {
    "input_path",
    "output_dir",
    "format",
    "reading_order",
    "use_struct_tree",
    "table_method",
    "hybrid",
    "hybrid_url",
    "hybrid_timeout",
    "hybrid_fallback",
    "hybrid_mode",
}


def _load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def _make_fake_opendataloader_module():
    module = types.ModuleType("opendataloader_pdf")

    def convert(**kwargs):
        return None

    module.convert = convert
    return module


def _load_extract_modules():
    fake_odl = _make_fake_opendataloader_module()
    for name in ["odl_hybrid_backend", "odl_extract"]:
        sys.modules.pop(name, None)
    with mock.patch.dict(sys.modules, {"opendataloader_pdf": fake_odl}, clear=False):
        backend_module = _load_module("odl_hybrid_backend", BACKEND_PATH)
        odl_extract_module = _load_module("odl_extract", ODL_EXTRACT_PATH)
        extract_router_module = _load_module("extract_router_test", EXTRACT_ROUTER_PATH)
    odl_extract_module._SUPPORTED_CONVERT_KWARGS = set(SUPPORTED_CONVERT_KWARGS)
    return fake_odl, backend_module, odl_extract_module, extract_router_module


def _write_fake_odl_outputs(kwargs):
    output_dir = Path(kwargs["output_dir"])
    output_dir.mkdir(parents=True, exist_ok=True)
    for input_path in kwargs["input_path"]:
        emitted = output_dir / f"{Path(input_path).stem}.json"
        emitted.write_text(json.dumps({
            "number of pages": 1,
            "kids": [{"type": "heading", "heading level": 1, "content": "Section"}],
        }))


class OdlHybridModeTests(unittest.TestCase):
    def test_extract_batch_passes_hybrid_client_kwargs(self):
        fake_odl, backend_module, odl_extract, _ = _load_extract_modules()
        calls = []

        def fake_convert(**kwargs):
            calls.append(kwargs)
            _write_fake_odl_outputs(kwargs)

        fake_odl.convert = fake_convert
        session = backend_module.HybridBackendSession(
            url="http://127.0.0.1:5002",
            managed=True,
            start_state="started_local",
            preflight="reachable",
            backend_force_ocr_applied=True,
        )

        with tempfile.TemporaryDirectory() as tmpdir:
            tmp = Path(tmpdir)
            pdf = tmp / "doc.pdf"
            pdf.write_bytes(b"%PDF-1.4\n")
            output = tmp / "out" / "extraction-result.json"
            with mock.patch.object(odl_extract.odl_hybrid_backend, "ensure_backend", return_value=session):
                ok = odl_extract.extract_batch(
                    [(pdf, output)],
                    hybrid="docling-fast",
                    hybrid_url="http://127.0.0.1:5002",
                    hybrid_timeout=12345,
                    hybrid_fallback=True,
                    hybrid_mode="full",
                    hybrid_autostart=False,
                )

            self.assertTrue(ok)
            self.assertEqual(len(calls), 1)
            self.assertEqual(calls[0]["hybrid"], "docling-fast")
            self.assertEqual(calls[0]["hybrid_url"], "http://127.0.0.1:5002")
            self.assertEqual(calls[0]["hybrid_timeout"], "12345")
            self.assertTrue(calls[0]["hybrid_fallback"])
            self.assertEqual(calls[0]["hybrid_mode"], "full")

    def test_extract_batch_omits_hybrid_mode_when_not_requested(self):
        fake_odl, backend_module, odl_extract, _ = _load_extract_modules()
        calls = []

        def fake_convert(**kwargs):
            calls.append(kwargs)
            _write_fake_odl_outputs(kwargs)

        fake_odl.convert = fake_convert
        session = backend_module.HybridBackendSession(
            url="http://127.0.0.1:5002",
            managed=False,
            start_state="reused_existing",
            preflight="reachable",
        )

        with tempfile.TemporaryDirectory() as tmpdir:
            tmp = Path(tmpdir)
            pdf = tmp / "doc.pdf"
            pdf.write_bytes(b"%PDF-1.4\n")
            output = tmp / "out" / "extraction-result.json"
            with mock.patch.object(odl_extract.odl_hybrid_backend, "ensure_backend", return_value=session):
                ok = odl_extract.extract_batch(
                    [(pdf, output)],
                    hybrid="docling-fast",
                    hybrid_autostart=False,
                )

            self.assertTrue(ok)
            self.assertEqual(len(calls), 1)
            self.assertNotIn("hybrid_mode", calls[0])

    def test_explicit_hybrid_url_records_requested_force_ocr_without_applying_it(self):
        fake_odl, backend_module, odl_extract, _ = _load_extract_modules()

        def fake_convert(**kwargs):
            _write_fake_odl_outputs(kwargs)

        fake_odl.convert = fake_convert
        session = backend_module.HybridBackendSession(
            url="http://remote-host:5002",
            managed=False,
            start_state="reused_existing",
            preflight="reachable",
        )

        with tempfile.TemporaryDirectory() as tmpdir:
            tmp = Path(tmpdir)
            pdf = tmp / "doc.pdf"
            pdf.write_bytes(b"%PDF-1.4\n")
            output = tmp / "out" / "extraction-result.json"
            with mock.patch.object(odl_extract.odl_hybrid_backend, "ensure_backend", return_value=session):
                ok = odl_extract.extract_single(
                    pdf,
                    output,
                    hybrid="docling-fast",
                    hybrid_url="http://remote-host:5002",
                    force_ocr=True,
                )

            self.assertTrue(ok)
            status = json.loads((output.parent / "extraction-status.json").read_text())
            self.assertEqual(status["hybrid_backend_start"], "reused_existing")
            self.assertEqual(status["backend_preflight"], "reachable")
            self.assertTrue(status["requested_backend_force_ocr"])
            self.assertNotIn("backend_force_ocr", status)

    def test_unreachable_backend_marks_fallback_expected(self):
        fake_odl, backend_module, odl_extract, _ = _load_extract_modules()

        def fake_convert(**kwargs):
            _write_fake_odl_outputs(kwargs)

        fake_odl.convert = fake_convert
        session = backend_module.HybridBackendSession(
            url="http://127.0.0.1:5002",
            managed=False,
            start_state="startup_failed",
            preflight="unreachable",
            startup_error="backend unavailable",
        )

        with tempfile.TemporaryDirectory() as tmpdir:
            tmp = Path(tmpdir)
            pdf = tmp / "doc.pdf"
            pdf.write_bytes(b"%PDF-1.4\n")
            output = tmp / "out" / "extraction-result.json"
            with mock.patch.object(odl_extract.odl_hybrid_backend, "ensure_backend", return_value=session):
                ok = odl_extract.extract_single(
                    pdf,
                    output,
                    hybrid="docling-fast",
                    hybrid_fallback=True,
                )

            self.assertTrue(ok)
            status = json.loads((output.parent / "extraction-status.json").read_text())
            self.assertTrue(status["fallback_expected"])
            self.assertEqual(status["hybrid_backend_start"], "startup_failed")
            self.assertEqual(status["backend_preflight"], "unreachable")

    def test_batch_prepares_hybrid_backend_once_for_multiple_output_dirs(self):
        fake_odl, backend_module, odl_extract, _ = _load_extract_modules()

        def fake_convert(**kwargs):
            _write_fake_odl_outputs(kwargs)

        fake_odl.convert = fake_convert
        session = backend_module.HybridBackendSession(
            url="http://127.0.0.1:5002",
            managed=True,
            start_state="started_local",
            preflight="reachable",
        )

        with tempfile.TemporaryDirectory() as tmpdir:
            tmp = Path(tmpdir)
            pdf1 = tmp / "doc1.pdf"
            pdf2 = tmp / "doc2.pdf"
            pdf1.write_bytes(b"%PDF-1.4\n")
            pdf2.write_bytes(b"%PDF-1.4\n")
            pairs = [
                (pdf1, tmp / "out1" / "extraction-result.json"),
                (pdf2, tmp / "out2" / "extraction-result.json"),
            ]
            with mock.patch.object(
                odl_extract.odl_hybrid_backend,
                "ensure_backend",
                return_value=session,
            ) as ensure_backend:
                ok = odl_extract.extract_batch(
                    pairs,
                    hybrid="docling-fast",
                    backend_force_ocr=True,
                )

            self.assertTrue(ok)
            ensure_backend.assert_called_once()

    def test_router_scanned_pdf_defaults_backend_force_ocr(self):
        _, _, _, extract_router = _load_extract_modules()

        with tempfile.TemporaryDirectory() as tmpdir:
            tmp = Path(tmpdir)
            pdf = tmp / "scanned.pdf"
            pdf.write_bytes(b"%PDF-1.4\n")
            output = tmp / "out.json"
            with mock.patch.object(extract_router, "route", return_value="odl_hybrid"):
                with mock.patch.object(
                    extract_router.odl_extract,
                    "extract_batch",
                    return_value=True,
                ) as extract_batch:
                    argv = ["extract_router.py", str(pdf), "-o", str(output)]
                    with mock.patch.object(sys, "argv", argv):
                        with self.assertRaises(SystemExit) as exc:
                            extract_router.main()

            self.assertEqual(exc.exception.code, 0)
            kwargs = extract_batch.call_args.kwargs
            self.assertTrue(kwargs["backend_force_ocr"])
            self.assertTrue(kwargs["hybrid_autostart"])
            self.assertEqual(kwargs["hybrid"], "docling-fast")

    def test_router_digital_pdf_uses_plain_odl_path(self):
        _, _, _, extract_router = _load_extract_modules()

        with tempfile.TemporaryDirectory() as tmpdir:
            tmp = Path(tmpdir)
            pdf = tmp / "digital.pdf"
            pdf.write_bytes(b"%PDF-1.4\n")
            output = tmp / "out.json"
            with mock.patch.object(extract_router, "route", return_value="odl"):
                with mock.patch.object(
                    extract_router.odl_extract,
                    "extract_batch",
                    return_value=True,
                ) as extract_batch:
                    argv = ["extract_router.py", str(pdf), "-o", str(output)]
                    with mock.patch.object(sys, "argv", argv):
                        with self.assertRaises(SystemExit) as exc:
                            extract_router.main()

            self.assertEqual(exc.exception.code, 0)
            kwargs = extract_batch.call_args.kwargs
            self.assertNotIn("hybrid", kwargs)
            self.assertNotIn("backend_force_ocr", kwargs)

    def test_router_rejects_force_docling(self):
        _, _, _, extract_router = _load_extract_modules()

        with tempfile.TemporaryDirectory() as tmpdir:
            tmp = Path(tmpdir)
            pdf = tmp / "doc.pdf"
            pdf.write_bytes(b"%PDF-1.4\n")
            output = tmp / "out.json"
            argv = [
                "extract_router.py",
                str(pdf),
                "-o",
                str(output),
                "--force",
                "docling",
            ]
            with mock.patch.object(sys, "argv", argv):
                with self.assertRaises(SystemExit) as exc:
                    extract_router.main()

        self.assertEqual(exc.exception.code, 2)


if __name__ == "__main__":
    unittest.main()
