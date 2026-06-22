#!/usr/bin/env python3
# CaramelBoard JoyTag Server Bridge
# - Minimal Flask server that uses the JoyTag repo's VisionModel to provide
#   a stable API for CaramelBoard: /health and /api/v1/tag
# - Place this file next to the cloned JoyTag repo (externals/joytag) and run.

from flask import Flask, request, jsonify
from PIL import Image
import torchvision.transforms.functional as TVF
import torch
from pathlib import Path
import gc
import io
import os
import sys
import time
import logging
import traceback
from threading import Event, Lock, Thread
from typing import Optional

joytag_repo_dir = Path(os.environ.get("JOYTAG_REPO_DIR", Path.cwd())).resolve()
if str(joytag_repo_dir) not in sys.path:
    sys.path.insert(0, str(joytag_repo_dir))

# JoyTag repo dependency
try:
    from Models import VisionModel  # provided by https://github.com/fpgaminer/joytag
except Exception as e:  # pragma: no cover
    traceback.print_exc()
    raise SystemExit(f"Failed to import JoyTag Models.py from {joytag_repo_dir}: {type(e).__name__}: {e}")


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("cb-joytag")

app = Flask(__name__)

# Globals
model = None
top_tags: list[str] | None = None
device = os.environ.get("JOYTAG_DEVICE", "auto").strip().lower() or "auto"
THRESHOLD_DEFAULT = float(os.environ.get("JOYTAG_THRESHOLD", 0.4))
IDLE_UNLOAD_SECONDS = float(os.environ.get("JOYTAG_IDLE_UNLOAD_SECONDS", 600))
MODEL_LOAD_TIMEOUT_SECONDS = float(os.environ.get("JOYTAG_LOAD_TIMEOUT_SECONDS", 300))
MODEL_MONITOR_INTERVAL_SECONDS = float(os.environ.get("JOYTAG_MONITOR_INTERVAL_SECONDS", 30))
PRELOAD_MODEL = os.environ.get("JOYTAG_PRELOAD", "false").strip().lower() in {"1", "true", "yes"}

model_ready = Event()
model_error: Optional[str] = None
_model_loader_lock = Lock()
_prediction_lock = Lock()
_model_loader_thread: Optional[Thread] = None
_model_load_started_at: Optional[float] = None
_model_load_finished_at: Optional[float] = None
_model_unloaded_at: Optional[float] = None
_last_prediction_at: Optional[float] = None
_active_predictions = 0
_idle_monitor_started = False


def _pick_device() -> str:
    requested_device = os.environ.get("JOYTAG_DEVICE", "").strip().lower()
    if requested_device == "auto":
        requested_device = ""
    if requested_device:
        if requested_device not in {"cpu", "cuda", "mps"}:
            raise RuntimeError(f"Unsupported JOYTAG_DEVICE: {requested_device}")
        if not _device_available(requested_device):
            raise RuntimeError(f"Requested JoyTag device is not available: {requested_device}")
        return requested_device
    if _device_available("mps"):
        return "mps"
    if _device_available("cuda"):
        return "cuda"
    return "cpu"


def _device_available(candidate: str) -> bool:
    if candidate == "cpu":
        return True
    if candidate == "cuda":
        return torch.cuda.is_available()
    if candidate == "mps":
        mps_backend = getattr(torch.backends, "mps", None)
        return bool(mps_backend and mps_backend.is_available())
    return False


def _load_model_instance(model_dir: str, selected_device: str):
    model_instance = VisionModel.load_model(model_dir)
    return model_instance.to(selected_device).eval()


def initialize_model(force_device: Optional[str] = None):
    global model, top_tags, device, _model_unloaded_at
    model_dir = os.environ.get("JOYTAG_MODEL_DIR", str(Path(__file__).parent / "models"))
    selected_device = force_device or _pick_device()
    logger.info(f"Loading JoyTag model… (dir={model_dir}, device={selected_device})")

    try:
        model_instance = _load_model_instance(model_dir, selected_device)
    except Exception:
        if selected_device != "mps":
            raise
        logger.exception("Failed to load JoyTag model on MPS; falling back to CPU")
        selected_device = "cpu"
        model_instance = _load_model_instance(model_dir, selected_device)

    # Load tags
    tags_file = Path(model_dir) / "top_tags.txt"
    if not tags_file.exists():
        raise FileNotFoundError(f"top_tags.txt not found in {model_dir}. Download JoyTag models first.")
    loaded_tags = [ln.strip() for ln in tags_file.read_text(encoding="utf-8").splitlines() if ln.strip()]

    model = model_instance
    device = selected_device
    top_tags = loaded_tags
    _model_unloaded_at = None
    logger.info(f"Model ready. tags={len(top_tags)}, device={device}")


def _prepare_image(image: Image.Image, target: int) -> torch.Tensor:
    # Square-pad with white background
    w, h = image.size
    m = max(w, h)
    pad_l = (m - w) // 2
    pad_t = (m - h) // 2
    canvas = Image.new("RGB", (m, m), (255, 255, 255))
    canvas.paste(image, (pad_l, pad_t))
    if m != target:
        canvas = canvas.resize((target, target), Image.BICUBIC)
    x = TVF.pil_to_tensor(canvas).float() / 255.0
    x = TVF.normalize(x, mean=[0.48145466, 0.4578275, 0.40821073], std=[0.26862954, 0.26130258, 0.27577711])
    return x


@torch.no_grad()
def _predict_tensor(t: torch.Tensor) -> torch.Tensor:
    global model, device
    try:
        out = model({"image": t.unsqueeze(0).to(device)})
    except Exception:
        if device != "mps":
            raise
        logger.exception("JoyTag prediction failed on MPS; falling back to CPU")
        device = "cpu"
        model = model.to(device).eval()
        out = model({"image": t.unsqueeze(0).to(device)})
    # JoyTag returns logits under 'tags'
    return out["tags"].sigmoid().cpu()[0]


def _predict_image(img: Image.Image, threshold: float):
    mark_model_used()
    scores_tensor = _predict_tensor(_prepare_image(img, model.image_size))
    mark_model_used()
    # Map to dict
    scores = {top_tags[i]: float(scores_tensor[i]) for i in range(len(top_tags))}
    predicted = [tg for tg, sc in scores.items() if sc >= threshold]
    return predicted, scores


def resolve_file_key(file_key: str) -> Path:
    safe_key = file_key.lstrip("/")
    library_root = os.environ.get("JOYTAG_LIBRARY_PATH", "").strip()

    if library_root and safe_key.startswith("library/"):
        return Path(library_root) / safe_key.removeprefix("library/")

    files_root = os.environ.get("JOYTAG_FILES_ROOT", str(Path(__file__).resolve().parent.parent / "data"))
    return Path(files_root) / safe_key


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


def _release_accelerator_cache() -> None:
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
    mps = getattr(torch, "mps", None)
    empty_cache = getattr(mps, "empty_cache", None)
    if callable(empty_cache):
        empty_cache()


def unload_model(reason: str) -> None:
    global model, top_tags, model_error, _model_load_started_at, _model_load_finished_at, _model_unloaded_at

    with _model_loader_lock:
        with _prediction_lock:
            if _active_predictions > 0:
                return
        if _model_loader_thread and _model_loader_thread.is_alive():
            return
        if model is None and top_tags is None and not model_ready.is_set():
            return

        logger.info(f"Unloading JoyTag model ({reason})")
        model = None
        top_tags = None
        model_error = None
        model_ready.clear()
        _model_load_started_at = None
        _model_load_finished_at = None
        _model_unloaded_at = time.time()

    gc.collect()
    _release_accelerator_cache()


def _idle_monitor_worker() -> None:
    while True:
        time.sleep(max(1.0, MODEL_MONITOR_INTERVAL_SECONDS))
        if IDLE_UNLOAD_SECONDS <= 0 or not model_ready.is_set():
            continue
        if _last_prediction_at is None:
            continue
        idle_for = time.time() - _last_prediction_at
        if idle_for >= IDLE_UNLOAD_SECONDS:
            unload_model(f"idle for {int(idle_for)}s")


def start_idle_monitor() -> None:
    global _idle_monitor_started
    if _idle_monitor_started:
        return
    _idle_monitor_started = True
    monitor = Thread(target=_idle_monitor_worker, name="joytag-idle-monitor", daemon=True)
    monitor.start()


def start_model_loader() -> None:
    global _model_loader_thread, _model_load_started_at, _model_load_finished_at, model_error, device

    with _model_loader_lock:
        if model_ready.is_set() and model_error is None:
            return

        if _model_loader_thread and _model_loader_thread.is_alive():
            return

        device = _pick_device()
        _model_load_started_at = time.time()
        model_error = None
        _model_load_finished_at = None

        def _load_worker() -> None:
            global model_error, _model_load_finished_at
            try:
                initialize_model(force_device=device)
                model_ready.set()
            except Exception as exc:  # pragma: no cover
                logger.exception("Failed to load JoyTag model")
                model_ready.clear()
                model_error = str(exc)
            finally:
                _model_load_finished_at = time.time()

        _model_loader_thread = Thread(target=_load_worker, name="joytag-model-loader", daemon=True)
        _model_loader_thread.start()


def ensure_model_loaded(timeout: float = MODEL_LOAD_TIMEOUT_SECONDS) -> bool:
    start_model_loader()
    deadline = time.time() + timeout

    while time.time() < deadline:
        if model_ready.is_set():
            mark_model_used()
            return True
        if model_error:
            return False
        if _model_loader_thread and not _model_loader_thread.is_alive():
            return False
        time.sleep(0.2)

    return False


@app.get("/health")
def health():
    if model_ready.is_set():
        status = "ok"
        services_status = "ready"
    elif model_error:
        status = "error"
        services_status = "error"
    elif _model_loader_thread and _model_loader_thread.is_alive():
        status = "ok"
        services_status = "loading"
    else:
        status = "ok"
        services_status = "idle"

    payload = {
        "status": status,
        "services": {"joytag": services_status},
        "device": device,
        "tags": len(top_tags or []),
        "version": "cb-joytag-bridge-1",
        "model_state": services_status,
        "idle_unload_seconds": IDLE_UNLOAD_SECONDS,
    }

    if model_error:
        payload["message"] = model_error

    if _model_load_started_at is not None:
        payload["loading_started_at"] = _model_load_started_at

    if _model_load_finished_at is not None:
        payload["loading_finished_at"] = _model_load_finished_at

    if _last_prediction_at is not None:
        payload["last_prediction_at"] = _last_prediction_at

    payload["active_predictions"] = _active_predictions

    if _model_unloaded_at is not None:
        payload["model_unloaded_at"] = _model_unloaded_at

    return jsonify(payload)


@app.post("/api/v1/tag")
def api_tag():
    prediction_started = False
    try:
        t0 = time.time()
        threshold = THRESHOLD_DEFAULT
        image: Image.Image | None = None

        begin_prediction()
        prediction_started = True

        if not model_ready.is_set() or model is None or top_tags is None:
            if not ensure_model_loaded():
                status = "error" if model_error else "loading"
                message = model_error or "JoyTag model load timed out"
                return jsonify({"error": message, "status": status}), 503

        if model is None or top_tags is None:
            status = "error" if model_error else "loading"
            message = model_error or "JoyTag model is unavailable"
            return jsonify({"error": message, "status": status}), 503

        if request.is_json:
            data = request.get_json() or {}
            threshold = float(data.get("threshold", threshold))
            if "file_key" in data:
                abs_path = resolve_file_key(data["file_key"])
                if not abs_path.exists():
                    return jsonify({"error": f"file not found: {abs_path}"}), 400
                image = Image.open(abs_path).convert("RGB")
            elif "image_url" in data:
                import requests
                r = requests.get(data["image_url"], timeout=30)
                r.raise_for_status()
                image = Image.open(io.BytesIO(r.content)).convert("RGB")
            else:
                return jsonify({"error": "missing file_key or image_url"}), 400
        else:
            # Multipart form with 'image' and optional 'threshold'
            if "image" not in request.files:
                return jsonify({"error": "no image file provided"}), 400
            try:
                threshold = float(request.form.get("threshold", threshold))
            except Exception:
                pass
            image = Image.open(request.files["image"].stream).convert("RGB")

        if image is None:
            return jsonify({"error": "no image resolved"}), 400

        tags, scores = _predict_image(image, threshold)
        dt = int((time.time() - t0) * 1000)
        return jsonify({
            "predicted_tags": tags,
            "tag_count": len(tags),
            "threshold": threshold,
            "scores": scores,
            "processing_time_ms": dt,
        })
    except Exception as e:  # pragma: no cover
        logger.exception("/api/v1/tag failed")
        return jsonify({"error": str(e)}), 500
    finally:
        if prediction_started:
            end_prediction()


if __name__ == "__main__":  # pragma: no cover
    start_idle_monitor()
    if PRELOAD_MODEL:
        start_model_loader()
    port = int(os.environ.get("PORT", 5001))
    debug = (os.environ.get("DEBUG", "false").lower() == "true")
    logger.info(
        f"Starting JoyTag bridge on :{port} ({device}); preload={PRELOAD_MODEL}; idle_unload={IDLE_UNLOAD_SECONDS}s"
    )
    app.run(host="0.0.0.0", port=port, debug=debug)
