import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image

from app.core.config import settings
from app.core.exceptions import AppError


def _images_dir() -> Path:
    return Path(settings.IMAGES_DIR)


def _index_path() -> Path:
    return _images_dir() / "_index.json"


def _load_index() -> list[dict]:
    path = _index_path()
    if not path.exists():
        return []
    return json.loads(path.read_text(encoding="utf-8"))


def _save_index(index: list[dict]) -> None:
    _index_path().write_text(json.dumps(index, ensure_ascii=False), encoding="utf-8")


def upload_image(filename: str, content: bytes) -> dict:
    md5 = hashlib.md5(content).hexdigest()
    ext = Path(filename).suffix.lower() or ".png"
    now = datetime.now(timezone.utc)
    date_dir = now.strftime("%Y/%m/%d")

    dest_dir = _images_dir() / date_dir
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest_file = dest_dir / f"{md5}{ext}"

    # dedup
    index = _load_index()
    for item in index:
        if item["md5"] == md5:
            return item

    dest_file.write_bytes(content)

    # get dimensions
    try:
        with Image.open(dest_file) as img:
            width, height = img.size
    except Exception:
        width, height = 0, 0

    record = {
        "id": md5,
        "md5": md5,
        "filename": filename,
        "path": f"{date_dir}/{md5}{ext}",
        "size": len(content),
        "width": width,
        "height": height,
        "created_at": now.isoformat(),
    }
    index.append(record)
    _save_index(index)
    return record


def list_images() -> list[dict]:
    return list(reversed(_load_index()))


def delete_image(image_id: str) -> None:
    index = _load_index()
    found = None
    for item in index:
        if item["id"] == image_id:
            found = item
            break
    if not found:
        raise AppError(code=404, message=f"Image {image_id} not found")

    file_path = _images_dir() / found["path"]
    if file_path.exists():
        file_path.unlink()

    index = [i for i in index if i["id"] != image_id]
    _save_index(index)
