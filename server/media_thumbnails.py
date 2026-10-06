"""Generate small, uncropped listing previews without replacing originals."""
import hashlib
from pathlib import Path

try:
    from PIL import Image, ImageOps, UnidentifiedImageError
except ImportError:
    Image = None


def generate(url, uploads):
    if Image is None or not str(url).startswith("/uploads/"):
        return ""
    name = str(url)[len("/uploads/"):]
    if not name or Path(name).name != name or "\\" in name or "?" in name or "#" in name:
        return ""
    root = Path(uploads).resolve()
    source = (root / name).resolve()
    if source.parent != root or not source.is_file():
        return ""
    try:
        digest = hashlib.sha256(source.read_bytes()).hexdigest()[:24]
        preview = root / f"preview-{digest}.webp"
        if not preview.exists():
            with Image.open(source) as image:
                if getattr(image, "is_animated", False) and image.format != "MPO":
                    return ""  # Keep animated source assets animated.
                image = ImageOps.exif_transpose(image)
                image.thumbnail((720, 720), getattr(Image, "Resampling", Image).LANCZOS)
                if image.mode not in ("RGB", "RGBA"):
                    image = image.convert("RGBA" if "transparency" in image.info else "RGB")
                image.save(preview, "WEBP", quality=82, method=4)
        return f"/uploads/{preview.name}"
    except (OSError, ValueError, Image.DecompressionBombError, UnidentifiedImageError):
        return ""


def backfill(connection, uploads):
    updated = []
    for row in connection.execute("SELECT id,url FROM media WHERE COALESCE(thumbnail_url,'')='' ORDER BY id").fetchall():
        preview = generate(row["url"], uploads)
        if preview:
            connection.execute("UPDATE media SET thumbnail_url=? WHERE id=? AND COALESCE(thumbnail_url,'')=''", (preview, row["id"]))
            updated.append(row["id"])
    return updated
