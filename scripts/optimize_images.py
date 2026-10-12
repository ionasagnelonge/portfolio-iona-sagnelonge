"""Optimise les images du portfolio pour le web.

Lit public/content/projects.json, prend les originaux dans data/<folder>/
et produit :
  - public/images/<slug>/<nom>-<largeur>.webp (plusieurs largeurs, sans métadonnées)
  - public/content/images.json (dimensions, couleur moyenne, mini-aperçu flou)

Usage :
  pip install pillow
  python scripts/optimize_images.py           # ne traite que les images nouvelles/modifiées
  python scripts/optimize_images.py --force   # régénère tout
"""

import argparse
import base64
import io
import json
import os
import re
import sys
import unicodedata
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

from PIL import Image, ImageCms, ImageFilter, ImageOps

Image.MAX_IMAGE_PIXELS = None

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
PROJECTS_FILE = ROOT / "public/content/projects.json"
MANIFEST_FILE = ROOT / "public/content/images.json"
OUT_DIR = ROOT / "public/images"

WIDTHS = [640, 1280, 2000]
STICKER_WIDTHS = [360, 720]
STICKER_DIR = "stickers"
ANIMATED_WIDTHS = [640, 1080]
QUALITY = 80
LQIP_WIDTH = 24

CMYK_PROFILES = [
    Path(os.environ.get("WINDIR", "C:/Windows")) / "System32/spool/drivers/color/RSWOP.icm",
    Path("/usr/share/color/icc/ghostscript/default_cmyk.icc"),
    Path("/Library/ColorSync/Profiles/Generic CMYK Profile.icc"),
]


def nfc(value):
    return unicodedata.normalize("NFC", value)


def slugify(value):
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-") or "image"


def find_entry(directory, name):
    """Retrouve un fichier quelle que soit la normalisation Unicode (macOS écrit en NFD)."""
    target = nfc(name)
    for entry in directory.iterdir():
        if nfc(entry.name) == target:
            return entry
    raise FileNotFoundError(f"{name} introuvable dans {directory}")


def open_source(path):
    if path.suffix.lower() == ".svg":
        # Les SVG exportés d'Illustrator ne contiennent ici qu'une image bitmap embarquée.
        text = path.read_text(encoding="utf-8")
        match = re.search(r'base64,([^"\']+)', text)
        if not match:
            raise ValueError(f"Pas d'image bitmap dans {path}")
        return Image.open(io.BytesIO(base64.b64decode(match.group(1))))
    return Image.open(path)


def to_rgb(image):
    if image.mode == "CMYK":
        profile = next((p for p in CMYK_PROFILES if p.exists()), None)
        icc = image.info.get("icc_profile")
        if icc or profile:
            source = ImageCms.ImageCmsProfile(io.BytesIO(icc)) if icc else str(profile)
            return ImageCms.profileToProfile(image, source, ImageCms.createProfile("sRGB"), outputMode="RGB")
        return image.convert("RGB")
    if image.mode in ("RGBA", "LA") or (image.mode == "P" and "transparency" in image.info):
        rgba = image.convert("RGBA")
        # Garde l'alpha seulement s'il sert vraiment.
        if rgba.getchannel("A").getextrema()[0] < 255:
            return rgba
        return rgba.convert("RGB")
    return image.convert("RGB")


def target_widths(width, widths):
    selected = [w for w in widths if w < width]
    # Toujours une version à la taille maximale disponible (bornée par la plus grande largeur).
    selected.append(min(width, widths[-1]))
    return sorted(set(selected))


def resized(image, width):
    if image.width == width:
        return image
    height = round(image.height * width / image.width)
    return image.resize((width, height), Image.LANCZOS)


def summary(image):
    rgb = image.convert("RGB")
    color = rgb.resize((1, 1), Image.BOX).getpixel((0, 0))
    lqip_image = resized(rgb, LQIP_WIDTH)
    buffer = io.BytesIO()
    lqip_image.save(buffer, "WEBP", quality=40)
    return "#%02x%02x%02x" % color, "data:image/webp;base64," + base64.b64encode(buffer.getvalue()).decode()


def make_sticker(image, width):
    """Image détourée -> sticker : contour blanc arrondi autour de la forme (fond transparent)."""
    image = image.convert("RGBA")
    image = resized(image, min(width, image.width))
    border = max(4, round(max(image.size) * 0.028))
    pad = border * 2
    canvas_size = (image.width + pad * 2, image.height + pad * 2)
    alpha = Image.new("L", canvas_size, 0)
    alpha.paste(image.getchannel("A"), (pad, pad))
    # Dilatation douce de la silhouette : flou puis seuil, puis léger lissage du bord.
    outline = alpha.filter(ImageFilter.GaussianBlur(border * 0.6))
    outline = outline.point(lambda v: 255 if v > 6 else 0).filter(ImageFilter.GaussianBlur(1.2))
    sticker = Image.new("RGBA", canvas_size, (255, 255, 255, 0))
    sticker.putalpha(outline)
    sticker.alpha_composite(image, (pad, pad))
    return sticker.crop(sticker.getbbox() or (0, 0, *canvas_size))


def is_fresh(meta, source):
    outputs = [ROOT / "public" / s["src"] for s in (meta or {}).get("srcset", [])]
    if not outputs or not all(p.exists() for p in outputs):
        return False
    return min(p.stat().st_mtime for p in outputs) >= source.stat().st_mtime


def process(job):
    source, out_base, previous, kind = job
    if is_fresh(previous, source):
        return previous

    image = open_source(source)

    if kind == "sticker":
        image = ImageOps.exif_transpose(image)
        if image.mode == "CMYK":
            image = to_rgb(image)
        largest = make_sticker(image, STICKER_WIDTHS[-1])
        sources = []
        for w in target_widths(largest.width, STICKER_WIDTHS):
            out = out_base.parent / f"{out_base.name}-{w}.webp"
            resized(largest, w).save(out, "WEBP", quality=QUALITY + 5, method=6)
            sources.append({"w": w, "src": out.relative_to(ROOT / "public").as_posix()})
        return {"w": largest.width, "h": largest.height, "color": "transparent", "lqip": "", "srcset": sources}

    animated = getattr(image, "is_animated", False) and image.n_frames > 1

    if animated:
        frames, durations = [], []
        for index in range(image.n_frames):
            image.seek(index)
            frames.append(image.convert("RGBA"))
            durations.append(image.info.get("duration", 100))
        width, height = frames[0].size
        widths = target_widths(width, ANIMATED_WIDTHS)
        sources = []
        for w in widths:
            out = out_base.parent / f"{out_base.name}-{w}.webp"
            scaled = [resized(frame, w) for frame in frames]
            scaled[0].save(out, "WEBP", save_all=True, append_images=scaled[1:], duration=durations,
                           loop=0, quality=QUALITY - 5, method=4)
            sources.append({"w": w, "src": out.relative_to(ROOT / "public").as_posix()})
        color, lqip = summary(frames[0])
    else:
        if image.format == "JPEG":
            # Décodage JPEG à échelle réduite : beaucoup plus rapide sur les très grands fichiers.
            image.draft(image.mode, (WIDTHS[-1], WIDTHS[-1] * image.height // image.width))
        image = to_rgb(ImageOps.exif_transpose(image))
        width, height = image.size
        # Les dimensions de référence sont celles de l'original (après rotation EXIF).
        original = Image.open(source) if source.suffix.lower() != ".svg" else None
        if original is not None:
            ow, oh = original.size
            orientation = original.getexif().get(0x0112, 1)
            if orientation in (5, 6, 7, 8):
                ow, oh = oh, ow
            width, height = ow, oh
        sources = []
        for w in target_widths(width, WIDTHS):
            out = out_base.parent / f"{out_base.name}-{w}.webp"
            resized(image, min(w, image.width)).save(out, "WEBP", quality=QUALITY, method=6)
            sources.append({"w": w, "src": out.relative_to(ROOT / "public").as_posix()})
        color, lqip = summary(image)

    meta = {"w": width, "h": height, "color": color, "lqip": lqip, "srcset": sources}
    if animated:
        meta["animated"] = True
    return meta


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true", help="régénère toutes les images")
    args = parser.parse_args()

    content = json.loads(PROJECTS_FILE.read_text(encoding="utf-8"))
    projects = list(content["projects"])
    # Les photos du carrousel d'accueil sont traitées comme un projet « accueil ».
    home = content.get("home") or {}
    home_images = [item["file"] if isinstance(item, dict) else item for item in home.get("images", [])]
    if home_images:
        projects.append({"slug": "accueil", "folder": home["folder"], "images": home_images})
    # Stickers détourés (data/stickers/), un par projet : contour blanc ajouté automatiquement.
    stickers = [project["sticker"] for project in content["projects"] if project.get("sticker")]
    if stickers:
        projects.append({"slug": STICKER_DIR, "folder": STICKER_DIR, "images": stickers, "kind": "sticker"})
    previous = {}
    if MANIFEST_FILE.exists() and not args.force:
        previous = json.loads(MANIFEST_FILE.read_text(encoding="utf-8"))
    jobs, keys = [], []

    for project in projects:
        if not project.get("images"):
            continue
        folder = find_entry(DATA_DIR, project["folder"])
        out_dir = OUT_DIR / project["slug"]
        out_dir.mkdir(parents=True, exist_ok=True)
        used_names = set()
        kind = project.get("kind", "image")
        for filename in project["images"]:
            source = find_entry(folder, filename)
            name = slugify(Path(filename).stem)
            while name in used_names:
                name += "-b"
            used_names.add(name)
            key = f"{project['slug']}/{nfc(filename)}"
            jobs.append((source, out_dir / name, previous.get(key), kind))
            keys.append(key)

    with ProcessPoolExecutor(max_workers=max(1, (os.cpu_count() or 2) - 1)) as pool:
        results = list(pool.map(process, jobs))

    manifest = dict(zip(keys, results))

    # Supprime les fichiers générés qui ne correspondent plus à aucune image.
    expected = {ROOT / "public" / s["src"] for meta in results for s in meta["srcset"]}
    for path in OUT_DIR.rglob("*"):
        if path.is_file() and path not in expected:
            path.unlink()
    for path in sorted(OUT_DIR.glob("*"), reverse=True):
        if path.is_dir() and not any(path.iterdir()):
            path.rmdir()

    MANIFEST_FILE.write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")

    total = sum(p.stat().st_size for p in OUT_DIR.rglob("*.webp"))
    print(f"{len(results)} images -> {total / 1024 / 1024:.1f} Mo de WebP dans {OUT_DIR.relative_to(ROOT)}")


if __name__ == "__main__":
    sys.exit(main())
