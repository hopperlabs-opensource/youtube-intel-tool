#!/usr/bin/env python3

import argparse
import json
import os
import sys


def _json_ok(payload):
    print(json.dumps({"ok": True, **payload}))


def _json_err(msg):
    print(json.dumps({"ok": False, "error": str(msg)}))


def _pick_device():
    v = os.environ.get("YIT_FACE_DEVICE")
    if v and v.strip():
        return v.strip()

    try:
        import torch

        if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
            return "mps"
        if torch.cuda.is_available():
            return "cuda"
    except Exception:
        pass

    return "cpu"


def run_face_detection(frames_dir, det_threshold=0.5, model_name="buffalo_l"):
    """Run InsightFace detection + embedding on extracted frames."""
    try:
        from insightface.app import FaceAnalysis
    except ImportError:
        raise RuntimeError(
            "insightface not installed. Install with: pip install insightface onnxruntime"
        )

    import numpy as np
    import glob

    device = _pick_device()

    # Initialize InsightFace
    providers = ["CPUExecutionProvider"]
    if device == "cuda":
        providers = ["CUDAExecutionProvider", "CPUExecutionProvider"]
    elif device == "mps":
        providers = ["CoreMLExecutionProvider", "CPUExecutionProvider"]

    app = FaceAnalysis(name=model_name, providers=providers)
    app.prepare(ctx_id=0 if device == "cuda" else -1, det_size=(640, 640))

    # Find all frame images
    frame_files = sorted(
        glob.glob(os.path.join(frames_dir, "*.jpg"))
        + glob.glob(os.path.join(frames_dir, "*.png"))
    )

    if not frame_files:
        raise RuntimeError(f"No frame images found in {frames_dir}")

    results = []
    total_faces = 0

    for frame_path in frame_files:
        filename = os.path.basename(frame_path)

        # Extract frame index from filename (e.g., "frame_0042.jpg" -> 42)
        frame_index = -1
        parts = filename.replace(".jpg", "").replace(".png", "").split("_")
        for p in reversed(parts):
            try:
                frame_index = int(p)
                break
            except ValueError:
                continue

        try:
            import cv2

            img = cv2.imread(frame_path)
            if img is None:
                continue

            faces = app.get(img)
        except Exception:
            continue

        frame_faces = []
        for face in faces:
            if face.det_score < det_threshold:
                continue

            bbox = face.bbox.tolist() if hasattr(face.bbox, "tolist") else list(face.bbox)
            embedding = (
                face.embedding.tolist()
                if hasattr(face.embedding, "tolist")
                else list(face.embedding)
            )

            # Normalize embedding to unit vector
            norm = float(np.linalg.norm(embedding))
            if norm > 0:
                embedding = [float(x / norm) for x in embedding]

            landmarks = None
            if hasattr(face, "kps") and face.kps is not None:
                landmarks = face.kps.tolist() if hasattr(face.kps, "tolist") else list(face.kps)

            frame_faces.append(
                {
                    "bbox": {
                        "x": float(bbox[0]),
                        "y": float(bbox[1]),
                        "w": float(bbox[2] - bbox[0]),
                        "h": float(bbox[3] - bbox[1]),
                    },
                    "det_score": float(face.det_score),
                    "embedding_512d": embedding,
                    "landmarks": landmarks,
                }
            )

        total_faces += len(frame_faces)
        if frame_faces:
            results.append(
                {
                    "filename": filename,
                    "frame_index": frame_index,
                    "faces": frame_faces,
                }
            )

    return {
        "model": model_name,
        "device": device,
        "total_faces": total_faces,
        "frames_processed": len(frame_files),
        "frames_with_faces": len(results),
        "frames": results,
    }


def main():
    parser = argparse.ArgumentParser(description="Face detection and embedding extraction")
    parser.add_argument("--frames-dir", required=True, help="Directory containing extracted frames")
    parser.add_argument(
        "--det-threshold", type=float, default=0.5, help="Detection confidence threshold"
    )
    parser.add_argument(
        "--model", default="buffalo_l", help="InsightFace model name"
    )
    args = parser.parse_args()

    try:
        result = run_face_detection(
            frames_dir=args.frames_dir,
            det_threshold=args.det_threshold,
            model_name=args.model,
        )
        _json_ok(result)
    except Exception as e:
        _json_err(e)
        sys.exit(1)


if __name__ == "__main__":
    main()
