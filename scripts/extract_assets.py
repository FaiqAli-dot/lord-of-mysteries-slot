#!/usr/bin/env python3
"""
Extract cropped game assets from source JPG sheets.

- Reads a JSON crop config (see assets/processing/crops.sample.json).
- Never regenerates or redraws art; only crops + optional soft background mattes.
- Standalone backgrounds / opaque panels stay opaque when transparency=false.
- Re-run after editing crop boxes to fix individual assets.

Usage:
  python3 scripts/extract_assets.py \
    --config assets/processing/crops.sample.json \
    --out assets/sample \
    --contact-sheet
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]


def load_config(path: Path) -> dict[str, Any]:
    with path.open() as f:
        return json.load(f)


def sample_bg_color(rgb: np.ndarray, inset: int, size: int) -> np.ndarray:
    """Median RGB from four corner patches."""
    h, w, _ = rgb.shape
    s = max(1, size)
    i = max(0, inset)

    patches = [
        rgb[i : i + s, i : i + s],
        rgb[i : i + s, w - i - s : w - i],
        rgb[h - i - s : h - i, i : i + s],
        rgb[h - i - s : h - i, w - i - s : w - i],
    ]
    stacked = np.concatenate([p.reshape(-1, 3) for p in patches], axis=0)
    return np.median(stacked, axis=0).astype(np.float32)


def color_distance_soft_matte(
    rgb: np.ndarray,
    *,
    near: float,
    far: float,
    corner_inset: int,
    corner_size: int,
    despill: float,
    feather_px: float,
) -> Image.Image:
    """
    Soft alpha from Euclidean RGB distance to sampled sheet background.
    Preserves glow / smoke better than hard thresholding.
    """
    bg = sample_bg_color(rgb, corner_inset, corner_size)
    dist = np.linalg.norm(rgb.astype(np.float32) - bg, axis=2)
    if far <= near:
        raise ValueError(f"matte.far ({far}) must be > matte.near ({near})")

    alpha = (dist - near) / (far - near)
    alpha = np.clip(alpha, 0.0, 1.0)

    # Slight edge softening without eroding core pixels.
    if feather_px and feather_px > 0:
        a_img = Image.fromarray((alpha * 255).astype(np.uint8), mode="L")
        a_img = a_img.filter(ImageFilter.GaussianBlur(radius=float(feather_px)))
        alpha = np.asarray(a_img).astype(np.float32) / 255.0

    out = np.zeros((rgb.shape[0], rgb.shape[1], 4), dtype=np.float32)
    out[..., :3] = rgb.astype(np.float32)

    if despill and despill > 0:
        # Pull residual background tint out of semi-transparent fringe.
        a = alpha[..., None]
        fringe = (1.0 - a) * float(despill)
        out[..., :3] = np.clip(out[..., :3] - bg * fringe, 0, 255)

    out[..., 3] = alpha * 255.0
    return Image.fromarray(out.astype(np.uint8), mode="RGBA")


def rembg_matte(rgb_img: Image.Image, model: str) -> Image.Image:
    from rembg import new_session, remove

    session = new_session(model)
    return remove(rgb_img.convert("RGB"), session=session).convert("RGBA")


def merge_matte(defaults: dict[str, Any], asset: dict[str, Any]) -> dict[str, Any]:
    m = dict(defaults.get("matte") or {})
    m.update(asset.get("matte") or {})
    return m


def extract_one(asset: dict[str, Any], defaults: dict[str, Any], out_dir: Path) -> dict[str, Any]:
    source = ROOT / asset["source"]
    if not source.exists() and asset.get("source_alias"):
        source = ROOT / asset["source_alias"]
    if not source.exists():
        raise FileNotFoundError(f"Missing source for {asset['id']}: {asset['source']}")

    im = Image.open(source).convert("RGB")
    x, y, w, h = asset["crop"]
    crop = im.crop((x, y, x + w, y + h))

    transparent = bool(asset.get("transparency", True))
    matte_cfg = merge_matte(defaults, asset)
    method = matte_cfg.get("method", "color_distance_soft")

    if not transparent:
        rgba = crop.convert("RGBA")
        method_used = "opaque_passthrough"
    elif method == "rembg":
        model = (defaults.get("rembg") or {}).get("model", "u2net")
        if asset.get("matte", {}).get("model"):
            model = asset["matte"]["model"]
        rgba = rembg_matte(crop, model)
        method_used = f"rembg:{model}"
    elif method == "color_distance_soft":
        rgba = color_distance_soft_matte(
            np.asarray(crop),
            near=float(matte_cfg.get("near", 18)),
            far=float(matte_cfg.get("far", 55)),
            corner_inset=int(matte_cfg.get("corner_inset", 4)),
            corner_size=int(matte_cfg.get("corner_size", 10)),
            despill=float(matte_cfg.get("despill", 0.55)),
            feather_px=float(matte_cfg.get("feather_px", 0.75)),
        )
        method_used = "color_distance_soft"
    elif method == "none":
        rgba = crop.convert("RGBA")
        method_used = "none"
    else:
        raise ValueError(f"Unknown matte method for {asset['id']}: {method}")

    out_path = out_dir / "png" / f"{asset['id']}.png"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    rgba.save(out_path, optimize=True)

    return {
        "id": asset["id"],
        "path": str(out_path.relative_to(ROOT)),
        "size": list(rgba.size),
        "mode": rgba.mode,
        "transparency": transparent,
        "matte_method": method_used,
        "crop": asset["crop"],
        "source": asset["source"],
        "identity": asset.get("identity"),
        "review_status": asset.get("review_status", "needs_review"),
    }


def build_contact_sheet(results: list[dict[str, Any]], out_path: Path, cell: int = 220) -> None:
    """Show each sample on light and dark checker panels."""
    labels = []
    tiles = []
    for r in results:
        img = Image.open(ROOT / r["path"]).convert("RGBA")
        # Fit into cell preserving aspect.
        fitted = Image.new("RGBA", (cell, cell), (0, 0, 0, 0))
        scale = min(cell / img.width, cell / img.height)
        nw, nh = max(1, int(img.width * scale)), max(1, int(img.height * scale))
        resized = img.resize((nw, nh), Image.Resampling.LANCZOS)
        fitted.paste(resized, ((cell - nw) // 2, (cell - nh) // 2), resized)

        light = Image.new("RGBA", (cell, cell), (236, 232, 224, 255))
        dark = Image.new("RGBA", (cell, cell), (22, 24, 30, 255))
        # Subtle checker on each so transparency is obvious.
        draw_checker(light, 16, (220, 216, 208, 255), (236, 232, 224, 255))
        draw_checker(dark, 16, (30, 32, 40, 255), (22, 24, 30, 255))
        light.alpha_composite(fitted)
        dark.alpha_composite(fitted)
        tiles.append((light.convert("RGB"), dark.convert("RGB")))
        labels.append(r["id"])

    pad = 16
    label_h = 28
    cols = len(tiles)
    width = pad + cols * (cell + pad)
    height = pad + 2 * (cell + label_h + pad) + 36
    sheet = Image.new("RGB", (width, height), (48, 50, 58))
    draw = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 14)
        title_font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 16)
    except OSError:
        font = ImageFont.load_default()
        title_font = font

    draw.text((pad, 10), "Sample extracts — light vs dark (transparency check)", fill=(230, 230, 230), font=title_font)

    for i, ((light, dark), label) in enumerate(zip(tiles, labels)):
        x = pad + i * (cell + pad)
        y_light = pad + 28
        y_dark = y_light + cell + label_h + pad
        sheet.paste(light, (x, y_light))
        sheet.paste(dark, (x, y_dark))
        draw.text((x, y_light + cell + 6), f"{label} @ light", fill=(210, 210, 210), font=font)
        draw.text((x, y_dark + cell + 6), f"{label} @ dark", fill=(210, 210, 210), font=font)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out_path, optimize=True)


def draw_checker(img: Image.Image, size: int, a: tuple[int, int, int, int], b: tuple[int, int, int, int]) -> None:
    d = ImageDraw.Draw(img)
    w, h = img.size
    for y in range(0, h, size):
        for x in range(0, w, size):
            color = a if ((x // size) + (y // size)) % 2 == 0 else b
            d.rectangle([x, y, x + size - 1, y + size - 1], fill=color)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--config", type=Path, required=True)
    ap.add_argument("--out", type=Path, required=True, help="Output directory (png/ + manifests)")
    ap.add_argument("--contact-sheet", action="store_true")
    ap.add_argument("--ids", nargs="*", help="Optional subset of asset ids")
    args = ap.parse_args()

    cfg_path = args.config if args.config.is_absolute() else ROOT / args.config
    out_dir = args.out if args.out.is_absolute() else ROOT / args.out
    cfg = load_config(cfg_path)
    defaults = cfg.get("defaults") or {}
    assets = cfg["assets"]
    if args.ids:
        wanted = set(args.ids)
        assets = [a for a in assets if a["id"] in wanted]

    results = []
    for asset in assets:
        info = extract_one(asset, defaults, out_dir)
        results.append(info)
        print(f"wrote {info['path']} ({info['size'][0]}x{info['size'][1]}, {info['matte_method']})")

    manifest_path = out_dir / "sample_manifest.json"
    manifest_path.write_text(json.dumps({"config": str(cfg_path.relative_to(ROOT)), "assets": results}, indent=2) + "\n")
    print(f"wrote {manifest_path.relative_to(ROOT)}")

    if args.contact_sheet:
        sheet_path = out_dir / "contact_sheet_sample.png"
        build_contact_sheet(results, sheet_path)
        print(f"wrote {sheet_path.relative_to(ROOT)}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
