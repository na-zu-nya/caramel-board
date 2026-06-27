#!/usr/bin/env python3
# CaramelBoard JoyTag Server Bridge
# - Keeps a stable HTTP API for CaramelBoard: /health and /api/v1/tag
# - Runs JoyTag/PyTorch inside a short-lived worker process so idle unload can
#   release CUDA/PyTorch runtime resources by exiting that worker.

from flask import Flask, request, jsonify
from pathlib import Path
import gc
import io
import logging
import multiprocessing as mp
import os
import platform
import queue
import sys
import threading
import time
import traceback
from typing import Any, Optional


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("cb-joytag")

app = Flask(__name__)

THRESHOLD_DEFAULT = float(os.environ.get("JOYTAG_THRESHOLD", 0.4))
IDLE_UNLOAD_SECONDS = float(os.environ.get("JOYTAG_IDLE_UNLOAD_SECONDS", 300))
MODEL_LOAD_TIMEOUT_SECONDS = float(os.environ.get("JOYTAG_LOAD_TIMEOUT_SECONDS", 300))
MODEL_MONITOR_INTERVAL_SECONDS = float(os.environ.get("JOYTAG_MONITOR_INTERVAL_SECONDS", 30))
PRELOAD_MODEL = os.environ.get("JOYTAG_PRELOAD", "false").strip().lower() in {"1", "true", "yes"}

_mp_context = mp.get_context("spawn")
_worker_lock = threading.Lock()
_request_lock = threading.Lock()
_prediction_lock = threading.Lock()

_worker_process: Optional[mp.Process] = None
_worker_command_queue: Any = None
_worker_response_queue: Any = None
_worker_request_id = 0
_worker_state = "idle"
_worker_error: Optional[str] = None
_worker_started_at: Optional[float] = None
_worker_ready_at: Optional[float] = None
_worker_unloaded_at: Optional[float] = None
_last_prediction_at: Optional[float] = None
_active_predictions = 0
_model_tag_count = 0


def _base_worker_config() -> dict[str, Any]:
    return {
        "repo_dir": os.environ.get("JOYTAG_REPO_DIR", Path.cwd()),
        "model_dir": os.environ.get("JOYTAG_MODEL_DIR", str(Path(__file__).parent / "models")),
        "library_path": os.environ.get("JOYTAG_LIBRARY_PATH", "").strip(),
        "files_root": os.environ.get(
            "JOYTAG_FILES_ROOT",
            str(Path(__file__).resolve().parent.parent / "data"),
        ),
        "device": os.environ.get("JOYTAG_DEVICE", "auto").strip().lower() or "auto",
        "idle_unload_seconds": IDLE_UNLOAD_SECONDS,
        "monitor_interval_seconds": MODEL_MONITOR_INTERVAL_SECONDS,
    }


def _trim_process_memory() -> None:
    try:
        if platform.system() == "Windows":
            import ctypes

            process = ctypes.windll.kernel32.GetCurrentProcess()
            ctypes.windll.psapi.EmptyWorkingSet(process)
        elif platform.system() == "Linux":
            import ctypes

            ctypes.CDLL("libc.so.6").malloc_trim(0)
    except Exception:
        logger.debug("Failed to trim process memory", exc_info=True)


class JoyTagWorker:
    def __init__(self, config: dict[str, Any]):
        self.config = config
        self.model = None
        self.top_tags: list[str] | None = None
        self.device = str(config.get("device") or "auto").strip().lower() or "auto"
        self.torch = None
        self.TVF = None
        self.Image = None

    def _device_available(self, candidate: str) -> bool:
        if candidate == "cpu":
            return True
        if candidate == "cuda":
            return self.torch.cuda.is_available()
        if candidate == "mps":
            mps_backend = getattr(self.torch.backends, "mps", None)
            return bool(mps_backend and mps_backend.is_available())
        return False

    def _pick_device(self) -> str:
        requested_device = self.device
        if requested_device == "auto":
            requested_device = ""
        if requested_device:
            if requested_device not in {"cpu", "cuda", "mps"}:
                raise RuntimeError(f"Unsupported JOYTAG_DEVICE: {requested_device}")
            if not self._device_available(requested_device):
                raise RuntimeError(f"Requested JoyTag device is not available: {requested_device}")
            return requested_device
        if self._device_available("mps"):
            return "mps"
        if self._device_available("cuda"):
            return "cuda"
        return "cpu"

    def load(self) -> None:
        if self.model is not None and self.top_tags is not None:
            return

        import torch
        import torchvision.transforms.functional as TVF
        from PIL import Image

        self.torch = torch
        self.TVF = TVF
        self.Image = Image

        joytag_repo_dir = Path(self.config["repo_dir"]).resolve()
        if str(joytag_repo_dir) not in sys.path:
            sys.path.insert(0, str(joytag_repo_dir))

        try:
            from Models import VisionModel
        except Exception as exc:  # pragma: no cover
            traceback.print_exc()
            raise RuntimeError(
                f"Failed to import JoyTag Models.py from {joytag_repo_dir}: {type(exc).__name__}: {exc}"
            ) from exc

        model_dir = str(self.config["model_dir"])
        selected_device = self._pick_device()
        logger.info(f"Loading JoyTag model... (dir={model_dir}, device={selected_device})")

        try:
            model_instance = VisionModel.load_model(model_dir).to(selected_device).eval()
        except Exception:
            if selected_device != "mps":
                raise
            logger.exception("Failed to load JoyTag model on MPS; falling back to CPU")
            selected_device = "cpu"
            model_instance = VisionModel.load_model(model_dir).to(selected_device).eval()

        tags_file = Path(model_dir) / "top_tags.txt"
        if not tags_file.exists():
            raise FileNotFoundError(f"top_tags.txt not found in {model_dir}. Download JoyTag models first.")
        loaded_tags = [ln.strip() for ln in tags_file.read_text(encoding="utf-8").splitlines() if ln.strip()]

        self.model = model_instance
        self.device = selected_device
        self.top_tags = loaded_tags
        logger.info(f"Model ready. tags={len(self.top_tags)}, device={self.device}")

    def release(self) -> None:
        self.model = None
        self.top_tags = None
        gc.collect()
        self._release_accelerator_cache()
        _trim_process_memory()

    def _release_accelerator_cache(self) -> None:
        if self.torch is None:
            return

        try:
            if self.torch.cuda.is_available():
                self.torch.cuda.empty_cache()
                self.torch.cuda.ipc_collect()
        except Exception:
            logger.debug("Failed to release CUDA cache", exc_info=True)

        try:
            mps = getattr(self.torch, "mps", None)
            mps_backend = getattr(self.torch.backends, "mps", None)
            empty_cache = getattr(mps, "empty_cache", None)
            if callable(empty_cache) and mps_backend and mps_backend.is_available():
                empty_cache()
        except Exception:
            logger.debug("Failed to release MPS cache", exc_info=True)

    def resolve_file_key(self, file_key: str) -> Path:
        safe_key = file_key.lstrip("/")
        library_root = str(self.config.get("library_path") or "").strip()

        if library_root and safe_key.startswith("library/"):
            return Path(library_root) / safe_key.removeprefix("library/")

        files_root = str(self.config["files_root"])
        return Path(files_root) / safe_key

    def _prepare_image(self, image: Any, target: int):
        w, h = image.size
        m = max(w, h)
        pad_l = (m - w) // 2
        pad_t = (m - h) // 2
        canvas = self.Image.new("RGB", (m, m), (255, 255, 255))
        canvas.paste(image, (pad_l, pad_t))
        if m != target:
            canvas = canvas.resize((target, target), self.Image.BICUBIC)
        x = self.TVF.pil_to_tensor(canvas).float() / 255.0
        return self.TVF.normalize(
            x,
            mean=[0.48145466, 0.4578275, 0.40821073],
            std=[0.26862954, 0.26130258, 0.27577711],
        )

    def _predict_tensor(self, tensor: Any):
        try:
            out = self.model({"image": tensor.unsqueeze(0).to(self.device)})
        except Exception:
            if self.device != "mps":
                raise
            logger.exception("JoyTag prediction failed on MPS; falling back to CPU")
            self.device = "cpu"
            self.model = self.model.to(self.device).eval()
            out = self.model({"image": tensor.unsqueeze(0).to(self.device)})
        return out["tags"].sigmoid().cpu()[0]

    def _image_from_message(self, message: dict[str, Any]):
        if "file_key" in message:
            abs_path = self.resolve_file_key(str(message["file_key"]))
            if not abs_path.exists():
                raise FileNotFoundError(f"file not found: {abs_path}")
            with self.Image.open(abs_path) as image:
                return image.convert("RGB")

        if "image_url" in message:
            import requests

            response = requests.get(str(message["image_url"]), timeout=30)
            response.raise_for_status()
            with self.Image.open(io.BytesIO(response.content)) as image:
                return image.convert("RGB")

        if "image_bytes" in message:
            with self.Image.open(io.BytesIO(message["image_bytes"])) as image:
                return image.convert("RGB")

        raise ValueError("missing file_key, image_url, or image_bytes")

    def predict(self, message: dict[str, Any]) -> dict[str, Any]:
        self.load()
        threshold = float(message.get("threshold", THRESHOLD_DEFAULT))
        image = self._image_from_message(message)

        with self.torch.no_grad():
            scores_tensor = self._predict_tensor(self._prepare_image(image, self.model.image_size))

        scores = {self.top_tags[i]: float(scores_tensor[i]) for i in range(len(self.top_tags))}
        predicted = [tag for tag, score in scores.items() if score >= threshold]
        return {
            "predicted_tags": predicted,
            "tag_count": len(predicted),
            "threshold": threshold,
            "scores": scores,
            "_model_tag_count": len(self.top_tags),
            "_device": self.device,
        }


def _worker_main(command_queue: Any, response_queue: Any, config: dict[str, Any]) -> None:
    logging.basicConfig(level=logging.INFO)
    worker = JoyTagWorker(config)
    last_used: Optional[float] = None
    idle_unload_seconds = float(config.get("idle_unload_seconds") or 0)
    monitor_interval_seconds = float(config.get("monitor_interval_seconds") or 30)

    try:
        while True:
            timeout = max(1.0, monitor_interval_seconds)
            if worker.model is not None and last_used is not None and idle_unload_seconds > 0:
                idle_for = time.time() - last_used
                remaining = idle_unload_seconds - idle_for
                if remaining <= 0:
                    logger.info(f"Unloading JoyTag worker (idle for {int(idle_for)}s)")
                    break
                timeout = min(timeout, max(0.1, remaining))

            try:
                message = command_queue.get(timeout=timeout)
            except queue.Empty:
                continue

            if not isinstance(message, dict):
                continue
            if message.get("type") == "shutdown":
                break
            if message.get("type") == "preload":
                try:
                    worker.load()
                    last_used = time.time()
                except Exception:  # pragma: no cover
                    logger.exception("JoyTag preload failed")
                    break
                continue
            if message.get("type") != "tag":
                continue

            request_id = message.get("id")
            started_at = time.time()
            try:
                payload = worker.predict(message)
                payload["processing_time_ms"] = int((time.time() - started_at) * 1000)
                last_used = time.time()
                response_queue.put({"id": request_id, "ok": True, "payload": payload, "status_code": 200})
            except FileNotFoundError as exc:
                last_used = time.time()
                response_queue.put({"id": request_id, "ok": False, "error": str(exc), "status_code": 400})
            except Exception as exc:  # pragma: no cover
                last_used = time.time()
                logger.exception("/api/v1/tag worker failed")
                response_queue.put({"id": request_id, "ok": False, "error": str(exc), "status_code": 500})
                if worker.model is None:
                    break
    finally:
        worker.release()
        logger.info("JoyTag worker exited")


def mark_model_used() -> None:
    global _last_prediction_at
    _last_prediction_at = time.time()


def begin_prediction() -> None:
    global _active_predictions
    mark_model_used()
    with _prediction_lock:
        _active_predictions += 1


def end_prediction() -> None:
    global _active_predictions
    mark_model_used()
    with _prediction_lock:
        _active_predictions = max(0, _active_predictions - 1)


def _worker_monitor(process: mp.Process) -> None:
    global _worker_process, _worker_command_queue, _worker_response_queue, _worker_state
    global _worker_error, _worker_unloaded_at, _model_tag_count

    process.join()
    with _worker_lock:
        if _worker_process is not process:
            return
        exitcode = process.exitcode
        _worker_process = None
        _worker_command_queue = None
        _worker_response_queue = None
        _worker_unloaded_at = time.time()
        _model_tag_count = 0
        if exitcode == 0:
            _worker_state = "idle"
            _worker_error = None
        else:
            _worker_state = "error"
            _worker_error = f"JoyTag worker exited unexpectedly with status {exitcode}"


def _start_worker_locked() -> None:
    global _worker_process, _worker_command_queue, _worker_response_queue, _worker_state
    global _worker_error, _worker_started_at, _worker_ready_at

    if _worker_process is not None and _worker_process.is_alive():
        return

    _worker_command_queue = _mp_context.Queue()
    _worker_response_queue = _mp_context.Queue()
    _worker_process = _mp_context.Process(
        target=_worker_main,
        args=(_worker_command_queue, _worker_response_queue, _base_worker_config()),
        name="joytag-worker",
    )
    _worker_process.daemon = True
    _worker_state = "loading"
    _worker_error = None
    _worker_started_at = time.time()
    _worker_ready_at = None
    _worker_process.start()
    threading.Thread(target=_worker_monitor, args=(_worker_process,), name="joytag-worker-monitor", daemon=True).start()
    logger.info(f"JoyTag worker spawned: pid={_worker_process.pid}")


def _ensure_worker_started() -> tuple[Any, Any, Optional[mp.Process], int]:
    global _worker_request_id
    with _worker_lock:
        _start_worker_locked()
        _worker_request_id += 1
        return _worker_command_queue, _worker_response_queue, _worker_process, _worker_request_id


def _wait_worker_response(response_queue: Any, process: Optional[mp.Process], request_id: int) -> dict[str, Any]:
    deadline = time.time() + MODEL_LOAD_TIMEOUT_SECONDS
    while time.time() < deadline:
        try:
            response = response_queue.get(timeout=0.2)
        except queue.Empty:
            if process is not None and not process.is_alive():
                raise RuntimeError("JoyTag worker exited before responding")
            continue

        if isinstance(response, dict) and response.get("id") == request_id:
            return response

    raise TimeoutError("JoyTag model load timed out")


def _tag_message_from_request(threshold: float) -> tuple[dict[str, Any] | None, tuple[Any, int] | None]:
    if request.is_json:
        data = request.get_json() or {}
        threshold = float(data.get("threshold", threshold))
        if "file_key" in data:
            return {"file_key": data["file_key"], "threshold": threshold}, None
        if "image_url" in data:
            return {"image_url": data["image_url"], "threshold": threshold}, None
        return None, (jsonify({"error": "missing file_key or image_url"}), 400)

    if "image" not in request.files:
        return None, (jsonify({"error": "no image file provided"}), 400)
    try:
        threshold = float(request.form.get("threshold", threshold))
    except Exception:
        pass
    image_bytes = request.files["image"].read()
    return {"image_bytes": image_bytes, "threshold": threshold}, None


@app.get("/health")
def health():
    with _worker_lock:
        if _worker_state == "ready" and _worker_process is not None and _worker_process.is_alive():
            status = "ok"
            services_status = "ready"
        elif _worker_state == "loading" and _worker_process is not None and _worker_process.is_alive():
            status = "ok"
            services_status = "loading"
        elif _worker_state == "error":
            status = "error"
            services_status = "error"
        else:
            status = "ok"
            services_status = "idle"

        payload = {
            "status": status,
            "services": {"joytag": services_status},
            "device": os.environ.get("JOYTAG_DEVICE", "auto").strip().lower() or "auto",
            "tags": _model_tag_count if services_status == "ready" else 0,
            "version": "cb-joytag-bridge-2",
            "model_state": services_status,
            "worker_pid": _worker_process.pid if _worker_process is not None and _worker_process.is_alive() else None,
            "idle_unload_seconds": IDLE_UNLOAD_SECONDS,
            "active_predictions": _active_predictions,
        }
        if _worker_error:
            payload["message"] = _worker_error
        if _worker_started_at is not None:
            payload["loading_started_at"] = _worker_started_at
        if _worker_ready_at is not None:
            payload["loading_finished_at"] = _worker_ready_at
        if _last_prediction_at is not None:
            payload["last_prediction_at"] = _last_prediction_at
        if _worker_unloaded_at is not None:
            payload["model_unloaded_at"] = _worker_unloaded_at
        return jsonify(payload)


@app.post("/api/v1/tag")
def api_tag():
    global _worker_state, _worker_error, _worker_ready_at, _model_tag_count

    prediction_started = False
    try:
        message, early_response = _tag_message_from_request(THRESHOLD_DEFAULT)
        if early_response is not None:
            return early_response
        if message is None:
            return jsonify({"error": "no image resolved"}), 400

        begin_prediction()
        prediction_started = True

        with _request_lock:
            command_queue, response_queue, process, request_id = _ensure_worker_started()
            command_queue.put({"type": "tag", "id": request_id, **message})
            response = _wait_worker_response(response_queue, process, request_id)

        if not response.get("ok"):
            with _worker_lock:
                if int(response.get("status_code", 500)) >= 500:
                    _worker_state = "error"
                    _worker_error = str(response.get("error") or "JoyTag worker failed")
            return jsonify({"error": response.get("error") or "JoyTag worker failed"}), int(
                response.get("status_code", 500)
            )

        payload = dict(response["payload"])
        model_tag_count = int(payload.pop("_model_tag_count", 0) or 0)
        device = payload.pop("_device", None)
        with _worker_lock:
            _worker_state = "ready"
            _worker_error = None
            _worker_ready_at = _worker_ready_at or time.time()
            if model_tag_count:
                _model_tag_count = model_tag_count
            if device:
                os.environ["JOYTAG_DEVICE"] = str(device)
        return jsonify(payload)
    except TimeoutError as exc:
        return jsonify({"error": str(exc), "status": "loading"}), 503
    except Exception as exc:  # pragma: no cover
        logger.exception("/api/v1/tag failed")
        return jsonify({"error": str(exc)}), 500
    finally:
        if prediction_started:
            end_prediction()


def start_idle_monitor() -> None:
    # Kept for compatibility with older entrypoint flow. Idle unloading is owned
    # by the JoyTag worker process.
    return None


def start_model_loader() -> None:
    with _worker_lock:
        _start_worker_locked()
        if _worker_command_queue is not None:
            _worker_command_queue.put({"type": "preload"})


if __name__ == "__main__":  # pragma: no cover
    if PRELOAD_MODEL:
        start_model_loader()
    port = int(os.environ.get("PORT", 5001))
    debug = os.environ.get("DEBUG", "false").lower() == "true"
    logger.info(
        f"Starting JoyTag bridge on :{port}; preload={PRELOAD_MODEL}; worker_idle_unload={IDLE_UNLOAD_SECONDS}s"
    )
    app.run(host="0.0.0.0", port=port, debug=debug)
