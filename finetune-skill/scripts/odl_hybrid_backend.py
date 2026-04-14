"""
Helpers for managing the OpenDataLoader hybrid backend server.

Hybrid mode in OpenDataLoader uses a separate backend server
(`opendataloader-pdf-hybrid`). The client-side convert() call points at that
server via `hybrid_url`.
"""

from __future__ import annotations

import socket
import subprocess
import time
from dataclasses import dataclass
from typing import Sequence
from urllib.parse import urlparse


DEFAULT_HYBRID_HOST = "127.0.0.1"
DEFAULT_HYBRID_PORT = 5002
DEFAULT_STARTUP_TIMEOUT_SECONDS = 30.0


@dataclass
class HybridBackendSession:
    url: str
    managed: bool
    start_state: str
    preflight: str
    backend_force_ocr_applied: bool = False
    backend_ocr_lang_applied: str | None = None
    backend_enrich_picture_description_applied: bool = False
    startup_error: str | None = None
    process: subprocess.Popen | None = None

    def close(self) -> None:
        if not self.process:
            return
        if self.process.poll() is None:
            self.process.terminate()
            try:
                self.process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.process.kill()
                self.process.wait(timeout=5)
        self.process = None


def build_hybrid_url(host: str = DEFAULT_HYBRID_HOST, port: int = DEFAULT_HYBRID_PORT) -> str:
    return f"http://{host}:{port}"


def _parse_host_port(url: str) -> tuple[str, int]:
    parsed = urlparse(url)
    host = parsed.hostname or DEFAULT_HYBRID_HOST
    if parsed.port is not None:
        port = parsed.port
    elif parsed.scheme == "https":
        port = 443
    else:
        port = 80
    return host, port


def is_backend_reachable(url: str, timeout_seconds: float = 0.5) -> bool:
    host, port = _parse_host_port(url)
    try:
        with socket.create_connection((host, port), timeout_seconds):
            return True
    except OSError:
        return False


def wait_for_backend(
    url: str,
    timeout_seconds: float = DEFAULT_STARTUP_TIMEOUT_SECONDS,
    poll_interval_seconds: float = 0.25,
) -> bool:
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        if is_backend_reachable(url):
            return True
        time.sleep(poll_interval_seconds)
    return False


def build_backend_command(
    host: str = DEFAULT_HYBRID_HOST,
    port: int = DEFAULT_HYBRID_PORT,
    backend_force_ocr: bool = False,
    backend_ocr_lang: str | None = None,
    backend_enrich_picture_description: bool = False,
) -> list[str]:
    command = [
        "opendataloader-pdf-hybrid",
        "--host",
        host,
        "--port",
        str(port),
    ]
    if backend_force_ocr:
        command.append("--force-ocr")
    if backend_ocr_lang:
        command.extend(["--ocr-lang", backend_ocr_lang])
    if backend_enrich_picture_description:
        command.append("--enrich-picture-description")
    return command


def ensure_backend(
    hybrid_url: str | None = None,
    hybrid_host: str = DEFAULT_HYBRID_HOST,
    hybrid_port: int = DEFAULT_HYBRID_PORT,
    autostart: bool = True,
    backend_force_ocr: bool = False,
    backend_ocr_lang: str | None = None,
    backend_enrich_picture_description: bool = False,
    startup_timeout_seconds: float = DEFAULT_STARTUP_TIMEOUT_SECONDS,
) -> HybridBackendSession:
    url = hybrid_url or build_hybrid_url(hybrid_host, hybrid_port)

    if is_backend_reachable(url):
        return HybridBackendSession(
            url=url,
            managed=False,
            start_state="reused_existing",
            preflight="reachable",
        )

    if not autostart:
        return HybridBackendSession(
            url=url,
            managed=False,
            start_state="startup_failed",
            preflight="unreachable",
            startup_error=f"Could not connect to hybrid backend at {url}",
        )

    command = build_backend_command(
        host=hybrid_host,
        port=hybrid_port,
        backend_force_ocr=backend_force_ocr,
        backend_ocr_lang=backend_ocr_lang,
        backend_enrich_picture_description=backend_enrich_picture_description,
    )
    try:
        process = subprocess.Popen(
            command,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    except OSError as exc:
        return HybridBackendSession(
            url=url,
            managed=False,
            start_state="startup_failed",
            preflight="unreachable",
            startup_error=f"Could not start hybrid backend command {' '.join(command)}: {exc}",
        )

    if wait_for_backend(url, timeout_seconds=startup_timeout_seconds):
        return HybridBackendSession(
            url=url,
            managed=True,
            start_state="started_local",
            preflight="reachable",
            backend_force_ocr_applied=backend_force_ocr,
            backend_ocr_lang_applied=backend_ocr_lang,
            backend_enrich_picture_description_applied=backend_enrich_picture_description,
            process=process,
        )

    if process.poll() is None:
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=5)

    return HybridBackendSession(
        url=url,
        managed=False,
        start_state="startup_failed",
        preflight="unreachable",
        backend_force_ocr_applied=False,
        backend_ocr_lang_applied=None,
        backend_enrich_picture_description_applied=False,
        startup_error=(
            f"Hybrid backend did not become reachable within {startup_timeout_seconds:.0f}s "
            f"at {url}. Command: {' '.join(command)}"
        ),
    )


__all__: Sequence[str] = (
    "DEFAULT_HYBRID_HOST",
    "DEFAULT_HYBRID_PORT",
    "DEFAULT_STARTUP_TIMEOUT_SECONDS",
    "HybridBackendSession",
    "build_backend_command",
    "build_hybrid_url",
    "ensure_backend",
    "is_backend_reachable",
    "wait_for_backend",
)
