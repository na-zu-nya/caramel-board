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
import io
import os
import sys
import time
import logging
from threading import Event, Lock, Thread
from typing import Optional

joytag_repo_dir = Path(os.environ.get("JOYTAG_REPO_DIR", Path.cwd())).resolve()
if str(joytag_repo_dir) not in sys.path:
    sys.path.insert(0, str(joytag_repo_dir))

# JoyTag repo dependency
try:
    from Models import VisionModel  # provided by https://github.com/fpgaminer/joytag
except Exception as e:  # pragma: no cover
    raise SystemExit("Models.py not found. Ensure you run this in the JoyTag repo folder (externals/joytag).")


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("cb-joytag")

app = Flask(__name__)

# Globals
model = None
top_tags: list[str] | None = None
device = "cpu"
THRESHOLD_DEFAULT = float(os.environ.get("JOYTAG_THRESHOLD", 0.4))

model_ready = Event()
model_error: Optional[str] = None
_model_loader_lock = Lock()
_model_loader_thread: Optional[Thread] = None
_model_load_started_at: Optional[float] = None
_model_load_finished_at: Optional[float] = None


def _pick_device() -> str:
    if torch.backends.mps.is_available():
        return "mps"
    if torch.cuda.is_available():
        return "cuda"
    return "cpu"


def initialize_model(force_device: Optional[str] = None):
    global model, top_tags, device
    model_dir = os.environ.get("JOYTAG_MODEL_DIR", str(Path(__file__).parent / "models"))
    device = force_device or _pick_device()
    logger.info(f"Loading JoyTag model… (dir={model_dir}, device={device})")

    # Load VisionModel from JoyTag repo
    model_instance = VisionModel.load_model(model_dir)
    model_instance = model_instance.to(device).eval()

    # Load tags
    tags_file = Path(model_dir) / "top_tags.txt"
    if not tags_file.exists():
        raise FileNotFoundError(f"top_tags.txt not found in {model_dir}. Download JoyTag models first.")
    loaded_tags = [ln.strip() for ln in tags_file.read_text(encoding="utf-8").splitlines() if ln.strip()]

    model = model_instance
    top_tags = loaded_tags
    logger.info(f"Model ready. tags={len(top_tags)}")


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
    out = model({"image": t.unsqueeze(0).to(device)})
    # JoyTag returns logits under 'tags'
    return out["tags"].sigmoid().cpu()[0]


def _predict_image(img: Image.Image, threshold: float):
    scores_tensor = _predict_tensor(_prepare_image(img, model.image_size))
    # Map to dict
    scores = {top_tags[i]: float(scores_tensor[i]) for i in range(len(top_tags))}
    predicted = [tg for tg, sc in scores.items() if sc >= threshold]
    return predicted, scores


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


@app.before_request
def _ensure_model_loader() -> None:  # pragma: no cover
    start_model_loader()


@app.get("/health")
def health():
    if model_ready.is_set():
        status = "ok"
    elif model_error:
        status = "error"
    else:
        status = "loading"

    services_status = "ready" if model_ready.is_set() else ("error" if model_error else "loading")

    payload = {
        "status": status,
        "services": {"joytag": services_status},
        "device": device,
        "tags": len(top_tags or []),
        "version": "cb-joytag-bridge-1",
    }

    if model_error:
        payload["message"] = model_error

    if _model_load_started_at is not None:
        payload["loading_started_at"] = _model_load_started_at

    if _model_load_finished_at is not None:
        payload["loading_finished_at"] = _model_load_finished_at

    return jsonify(payload)


@app.post("/api/v1/tag")
def api_tag():
    try:
        t0 = time.time()
        threshold = THRESHOLD_DEFAULT
        image: Image.Image | None = None

        if not model_ready.is_set() or model is None or top_tags is None:
            status = "error" if model_error else "loading"
            message = model_error or "JoyTag model is still loading"
            return jsonify({"error": message, "status": status}), 503

        if request.is_json:
            data = request.get_json() or {}
            threshold = float(data.get("threshold", threshold))
            if "file_key" in data:
                files_root = os.environ.get("JOYTAG_FILES_ROOT", str(Path(__file__).resolve().parent.parent / "data"))
                abs_path = Path(files_root) / data["file_key"]
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


if __name__ == "__main__":  # pragma: no cover
    start_model_loader()
    port = int(os.environ.get("PORT", 5001))
    debug = (os.environ.get("DEBUG", "false").lower() == "true")
    logger.info(f"Starting JoyTag bridge on :{port} ({device})")
    app.run(host="0.0.0.0", port=port, debug=debug)
