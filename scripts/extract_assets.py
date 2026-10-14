#!/usr/bin/env python3
"""
Extract cropped game assets from source JPG sheets.

- Reads a JSON crop config (see assets/processing/crops.*.json).
- Never regenerates or redraws art; only crops + optional soft background mattes.
- Standalone backgrounds / opaque panels stay opaque when transparency=false.
- Re-run after editing crop boxes to fix individual assets.

Usage:
  python3 scripts/extract_assets.py \
    --config assets/processing/crops.full.json \
    --out assets/library \
    --contact-sheet \
    --manifest-name manifest.json
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any

import numpy as np

ROOT = Path(__file__).resolve().parents[1]


def load_config(path: Path) -> dict[str, Any]:
    with path.open() as f:
        return json.load(f)


def sample_bg_color(rgb: np.ndarray, inset: int, size: int) -> np.ndarray:
    """Median RGB from four corner patches."""
    h, w, _ = rgb.shape
    s = max(1, min(size, h // 4, w // 4))
    i = max(0, inset)

    def patch(y0: int, x0: int) -> np.ndarray:
        return rgb[y0 : y0 + s, x0 : x0 + s].reshape(-1, 3)

    patches = [
        patch(i, i),
        patch(i, max(0, w - i - s)),
        patch(max(0, h - i - s), i),
        patch(max(0, h - i - s), max(0, w - i - s)),
    ]
    stacked = np.concatenate(patches, axis=0)
    return np.median(stacked, axis=0).astype(np.float32)


def _morph_close(mask: np.ndarray, radius: int) -> np.ndarray:
    """Binary close via max then min filter (fills small holes)."""
    if radius <= 0:
        return mask
    img = Image.fromarray((mask.astype(np.uint8) * 255), mode="L")
    img = img.filter(ImageFilter.MaxFilter(size=radius * 2 + 1))
    img = img.filter(ImageFilter.MinFilter(size=radius * 2 + 1))
    return np.asarray(img) > 127


def _morph_dilate(mask: np.ndarray, radius: int) -> np.ndarray:
    if radius <= 0:
        return mask
    img = Image.fromarray((mask.astype(np.uint8) * 255), mode="L")
    img = img.filter(ImageFilter.MaxFilter(size=radius * 2 + 1))
    return np.asarray(img) > 127


def color_distance_soft_matte(
    rgb: np.ndarray,
    *,
    near: float,
    far: float,
    corner_inset: int,
    corner_size: int,
    despill: float,
    feather_px: float,
    protect_dark: bool = True,
    protect_lum_max: float = 95.0,
    protect_alpha_floor: float = 0.94,
    core_threshold: float = 0.28,
    close_radius: int = 3,
    dilate_radius: int = 2,
    left_edge_mask_px: int = 0,
    left_edge_teal_bias: float = 12.0,
    right_edge_fade_px: int = 0,
) -> Image.Image:
    """
    Soft alpha from Euclidean RGB distance to sampled sheet background.

    Protects low-luminance pixels inside a morphologically filled object mask
    so dark silhouettes (chains, gunmetal) stay opaque on light backgrounds.
    Optional left-edge teal bleed suppression for neighboring-cell glow.
    """
    bg = sample_bg_color(rgb, corner_inset, corner_size)
    rgb_f = rgb.astype(np.float32)
    dist = np.linalg.norm(rgb_f - bg, axis=2)
    if far <= near:
        raise ValueError(f"matte.far ({far}) must be > matte.near ({near})")

    alpha = np.clip((dist - near) / (far - near), 0.0, 1.0)

    lum = 0.2126 * rgb_f[..., 0] + 0.7152 * rgb_f[..., 1] + 0.0722 * rgb_f[..., 2]
    bg_lum = float(0.2126 * bg[0] + 0.7152 * bg[1] + 0.0722 * bg[2])

    if protect_dark:
        # Seed only from clear color-distance content (not flat sheet texture).
        # Closing fills dark holes inside the object (metal shadows, chains)
        # without claiming surrounding sheet background via contrast seeds.
        local = Image.fromarray(lum.astype(np.uint8), mode="L")
        blur = np.asarray(local.filter(ImageFilter.GaussianBlur(radius=2))).astype(np.float32)
        contrast = np.abs(lum - blur)
        seed = (alpha >= core_threshold) | (lum > (bg_lum + 28.0))
        filled = _morph_close(seed, close_radius)
        if dilate_radius > 0:
            filled = _morph_dilate(filled, dilate_radius)

        # Protect dark pixels only inside the filled object core.
        # Require some local structure OR being a hole between content,
        # so flat sheet bg that sneaks in stays soft/transparent.
        hole = filled & (alpha < core_threshold)
        structured_dark = filled & (lum <= protect_lum_max) & ((contrast > 4.0) | hole)
        dark_w = np.clip((protect_lum_max - lum) / max(protect_lum_max, 1.0), 0.0, 1.0)
        protect = structured_dark.astype(np.float32) * np.maximum(dark_w, hole.astype(np.float32))
        floor = protect_alpha_floor * protect
        alpha = np.maximum(alpha, floor)
        # Mid-tone metal inside filled core: keep mostly solid.
        alpha = np.where(
            filled & (alpha < 0.55) & (dist > near * 0.65) & (contrast > 3.0),
            np.maximum(alpha, 0.82),
            alpha,
        )

    if left_edge_mask_px and left_edge_mask_px > 0:
        # Suppress cyan/teal neighbor glow along the left crop edge.
        # Kill teal-biased pixels that are not red-dominant (keeps wax seal).
        w = min(left_edge_mask_px, rgb.shape[1])
        rch, gch, bch = rgb_f[:, :w, 0], rgb_f[:, :w, 1], rgb_f[:, :w, 2]
        teal = (gch + bch) / 2.0 - rch
        red_dom = (rch > gch + 8) & (rch > bch + 8) & (rch > 70)
        edge_kill = ((teal > left_edge_teal_bias) & (~red_dom)) | (dist[:, :w] < (near + far) * 0.4)
        falloff = np.linspace(1.0, 0.05, w, dtype=np.float32)[None, :]
        factor = np.where(edge_kill, falloff, 0.0)
        # Outer 6px: hard-zero non-red leftover glow.
        hard_w = min(6, w)
        hard = edge_kill[:, :hard_w]
        alpha[:, :hard_w] = np.where(hard, 0.0, alpha[:, :hard_w])
        alpha[:, :w] *= np.clip(1.0 - factor, 0.0, 1.0)
        # Neutralize residual cyan cast on surviving left-edge pixels (baked neighbor light).
        cast = (teal > left_edge_teal_bias) & (rch < 140)
        if np.any(cast):
            # Pull G/B down toward R for cast pixels; drop weak cast to transparent.
            weak = cast & (dist[:, :w] < (near + far) * 0.55)
            alpha[:, :w] = np.where(weak, alpha[:, :w] * 0.15, alpha[:, :w])
            for c in (1, 2):
                ch = rgb_f[:, :w, c]
                rgb_f[:, :w, c] = np.where(cast, np.minimum(ch, rch + 6.0), ch)

    if right_edge_fade_px and right_edge_fade_px > 0:
        w = min(right_edge_fade_px, rgb.shape[1])
        fade = np.linspace(1.0, 0.0, w, dtype=np.float32)[None, :]
        alpha[:, -w:] *= fade

    if feather_px and feather_px > 0:
        a_img = Image.fromarray((alpha * 255).astype(np.uint8), mode="L")
        a_img = a_img.filter(ImageFilter.GaussianBlur(radius=float(feather_px)))
        alpha = np.asarray(a_img).astype(np.float32) / 255.0
        # Re-assert dark protection after blur so silhouettes don't re-soften away.
        if protect_dark:
            dark_core = (lum <= protect_lum_max * 0.85) & (alpha > 0.2)
            # Use previous filled approx via high alpha after blur neighborhood
            strong = alpha >= 0.5
            strong = _morph_close(strong, max(1, close_radius - 1))
            alpha = np.where(strong & dark_core, np.maximum(alpha, protect_alpha_floor), alpha)

    out = np.zeros((rgb.shape[0], rgb.shape[1], 4), dtype=np.float32)
    out[..., :3] = rgb_f

    if despill and despill > 0:
        a = alpha[..., None]
        # Despill only on bright fringe; skip dark protected pixels.
        fringe = (1.0 - a) * float(despill)
        if protect_dark:
            fringe = fringe * np.clip((lum[..., None] - 40.0) / 80.0, 0.0, 1.0)
        out[..., :3] = np.clip(out[..., :3] - bg * fringe, 0, 255)

    out[..., 3] = alpha * 255.0
    return Image.fromarray(out.astype(np.uint8), mode="RGBA")


def kill_left_cyan_cast(rgba_img: Image.Image, zone_frac: float = 0.38) -> Image.Image:
    """Remove leftover neighbor cyan glow baked into the left rim."""
    arr = np.asarray(rgba_img).astype(np.float32)
    rgb, a = arr[..., :3], arr[..., 3]
    h, w = a.shape
    xs = np.arange(w, dtype=np.float32)[None, :]
    left_w = np.clip(1.0 - xs / max(w * zone_frac, 1.0), 0.0, 1.0)
    teal = (rgb[..., 1] + rgb[..., 2]) / 2.0 - rgb[..., 0]
    cast = (teal > 2.0) & (rgb[..., 0] < rgb[..., 2] + 8.0) & (left_w > 0.1)
    hard = cast & (xs < 22)
    a = np.where(hard, 0.0, a)
    a = np.where(cast, a * (1.0 - 0.9 * left_w), a)
    mild = cast & (rgb[..., 0] > 55) & (a > 30) & (~hard)
    for c in (1, 2):
        rgb[..., c] = np.where(mild, np.minimum(rgb[..., c], rgb[..., 0] * 0.8 + 8.0), rgb[..., c])
    out = np.dstack([rgb, a]).astype(np.uint8)
    return Image.fromarray(out, mode="RGBA")


def rembg_matte(rgb_img: Image.Image, model: str) -> Image.Image:
    from rembg import new_session, remove

    session = new_session(model)
    return remove(rgb_img.convert("RGB"), session=session).convert("RGBA")


def merge_matte(defaults: dict[str, Any], asset: dict[str, Any]) -> dict[str, Any]:
    m = dict(defaults.get("matte") or {})
    m.update(asset.get("matte") or {})
    return m


def output_relpath(asset: dict[str, Any], out_dir: Path) -> Path:
    """category/subcategory/.../id.png under out_dir."""
    category = asset.get("category") or "uncategorized"
    parts = [p for p in str(category).split("/") if p]
    return out_dir.joinpath(*parts, f"{asset['id']}.png")


def extract_one(asset: dict[str, Any], defaults: dict[str, Any], out_dir: Path) -> dict[str, Any]:
    source = ROOT / asset["source"]
    if not source.exists() and asset.get("source_alias"):
        source = ROOT / asset["source_alias"]
    if not source.exists():
        raise FileNotFoundError(f"Missing source for {asset['id']}: {asset['source']}")

    im = Image.open(source).convert("RGB")
    x, y, w, h = asset["crop"]
    # Clamp crop to image bounds; never upscale.
    x = max(0, int(x))
    y = max(0, int(y))
    w = max(1, int(w))
    h = max(1, int(h))
    if x + w > im.width:
        w = im.width - x
    if y + h > im.height:
        h = im.height - y
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
            despill=float(matte_cfg.get("despill", 0.45)),
            feather_px=float(matte_cfg.get("feather_px", 0.6)),
            protect_dark=bool(matte_cfg.get("protect_dark", True)),
            protect_lum_max=float(matte_cfg.get("protect_lum_max", 95)),
            protect_alpha_floor=float(matte_cfg.get("protect_alpha_floor", 0.94)),
            core_threshold=float(matte_cfg.get("core_threshold", 0.28)),
            close_radius=int(matte_cfg.get("close_radius", 3)),
            dilate_radius=int(matte_cfg.get("dilate_radius", 2)),
            left_edge_mask_px=int(matte_cfg.get("left_edge_mask_px", 0)),
            left_edge_teal_bias=float(matte_cfg.get("left_edge_teal_bias", 12.0)),
            right_edge_fade_px=int(matte_cfg.get("right_edge_fade_px", 0)),
        )
        method_used = "color_distance_soft"
        if bool(matte_cfg.get("post_kill_left_cyan", False)):
            rgba = kill_left_cyan_cast(rgba, zone_frac=float(matte_cfg.get("cyan_zone_frac", 0.38)))
            method_used += "+cyan_kill"
    elif method == "none":
        rgba = crop.convert("RGBA")
        method_used = "none"
    else:
        raise ValueError(f"Unknown matte method for {asset['id']}: {method}")

    out_path = output_relpath(asset, out_dir)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    rgba.save(out_path, optimize=True)

    return {
        "id": asset["id"],
        "path": str(out_path.relative_to(ROOT)),
        "category": asset.get("category"),
        "source": asset["source"],
        "crop": [x, y, w, h],
        "dims": list(rgba.size),
        "transparency": transparent,
        "matte_method": method_used,
        "identity": asset.get("identity"),
        "suggested_identity": asset.get("suggested_identity"),
        "identity_confidence": asset.get("identity_confidence"),
        "review_status": asset.get("review_status", "needs_review"),
        "notes": asset.get("notes"),
    }


def draw_checker(img: Image.Image, size: int, a: tuple[int, int, int, int], b: tuple[int, int, int, int]) -> None:
    d = ImageDraw.Draw(img)
    w, h = img.size
    for yy in range(0, h, size):
        for xx in range(0, w, size):
            color = a if ((xx // size) + (yy // size)) % 2 == 0 else b
            d.rectangle([xx, yy, xx + size - 1, yy + size - 1], fill=color)


def _fit_tile(img: Image.Image, cell: int) -> Image.Image:
    fitted = Image.new("RGBA", (cell, cell), (0, 0, 0, 0))
    # Fit only — never upscale above 1:1.
    scale = min(1.0, cell / img.width, cell / img.height)
    nw, nh = max(1, int(img.width * scale)), max(1, int(img.height * scale))
    resized = img if (nw, nh) == img.size else img.resize((nw, nh), Image.Resampling.LANCZOS)
    fitted.paste(resized, ((cell - nw) // 2, (cell - nh) // 2), resized)
    return fitted


def build_contact_sheet(
    results: list[dict[str, Any]],
    out_path: Path,
    *,
    title: str,
    cell: int = 160,
    cols: int | None = None,
) -> None:
    """Grid of assets composited on light and dark checkers (stacked sections)."""
    if not results:
        return
    n = len(results)
    cols = cols or min(6, n)
    rows = (n + cols - 1) // cols
    pad = 12
    label_h = 22
    header = 32
    section_gap = 28
    section_h = rows * (cell + label_h + pad) + pad
    width = pad + cols * (cell + pad)
    height = header + section_h * 2 + section_gap + 24

    sheet = Image.new("RGB", (width, height), (48, 50, 58))
    draw = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 12)
        title_font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 15)
    except OSError:
        font = ImageFont.load_default()
        title_font = font

    draw.text((pad, 8), title, fill=(230, 230, 230), font=title_font)

    def paste_section(y0: int, mode: str) -> None:
        draw.text((pad, y0), f"{mode} background", fill=(200, 200, 200), font=font)
        y_base = y0 + 18
        for i, r in enumerate(results):
            rr, cc = divmod(i, cols)
            x = pad + cc * (cell + pad)
            y = y_base + rr * (cell + label_h + pad)
            img = Image.open(ROOT / r["path"]).convert("RGBA")
            tile = _fit_tile(img, cell)
            if mode == "light":
                bg = Image.new("RGBA", (cell, cell), (236, 232, 224, 255))
                draw_checker(bg, 14, (220, 216, 208, 255), (236, 232, 224, 255))
            else:
                bg = Image.new("RGBA", (cell, cell), (22, 24, 30, 255))
                draw_checker(bg, 14, (30, 32, 40, 255), (22, 24, 30, 255))
            bg.alpha_composite(tile)
            sheet.paste(bg.convert("RGB"), (x, y))
            label = r["id"]
            if len(label) > 22:
                label = label[:20] + "…"
            draw.text((x, y + cell + 3), label, fill=(210, 210, 210), font=font)

    paste_section(header, "light")
    paste_section(header + section_h + section_gap, "dark")

    out_path.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out_path, optimize=True)


def build_pair_contact_sheet(results: list[dict[str, Any]], out_light: Path, out_dark: Path, title: str, cell: int = 160) -> None:
    """Write separate light and dark contact sheets."""
    for path, mode in ((out_light, "light"), (out_dark, "dark")):
        if not results:
            continue
        n = len(results)
        cols = min(6, n)
        rows = (n + cols - 1) // cols
        pad = 12
        label_h = 22
        header = 36
        width = pad + cols * (cell + pad)
        height = header + rows * (cell + label_h + pad) + pad
        sheet = Image.new("RGB", (width, height), (48, 50, 58) if mode == "dark" else (70, 72, 78))
        draw = ImageDraw.Draw(sheet)
        try:
            font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 12)
            title_font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 15)
        except OSError:
            font = ImageFont.load_default()
            title_font = font
        draw.text((pad, 8), f"{title} — {mode}", fill=(230, 230, 230), font=title_font)
        for i, r in enumerate(results):
            rr, cc = divmod(i, cols)
            x = pad + cc * (cell + pad)
            y = header + rr * (cell + label_h + pad)
            img = Image.open(ROOT / r["path"]).convert("RGBA")
            tile = _fit_tile(img, cell)
            if mode == "light":
                bg = Image.new("RGBA", (cell, cell), (236, 232, 224, 255))
                draw_checker(bg, 14, (220, 216, 208, 255), (236, 232, 224, 255))
            else:
                bg = Image.new("RGBA", (cell, cell), (22, 24, 30, 255))
                draw_checker(bg, 14, (30, 32, 40, 255), (22, 24, 30, 255))
            bg.alpha_composite(tile)
            sheet.paste(bg.convert("RGB"), (x, y))
            label = r["id"] if len(r["id"]) <= 22 else r["id"][:20] + "…"
            draw.text((x, y + cell + 3), label, fill=(210, 210, 210), font=font)
        path.parent.mkdir(parents=True, exist_ok=True)
        sheet.save(path, optimize=True)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--config", type=Path, required=True)
    ap.add_argument("--out", type=Path, required=True, help="Output directory")
    ap.add_argument("--contact-sheet", action="store_true")
    ap.add_argument("--contact-combined", action="store_true", help="Also write light+dark stacked sheets")
    ap.add_argument("--manifest-name", default="manifest.json")
    ap.add_argument("--ids", nargs="*", help="Optional subset of asset ids")
    ap.add_argument("--group-contact-by", default="sheet", choices=["sheet", "category", "none"])
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
        print(f"wrote {info['path']} ({info['dims'][0]}x{info['dims'][1]}, {info['matte_method']})")

    manifest = {
        "config": str(cfg_path.relative_to(ROOT)),
        "version": cfg.get("version"),
        "count": len(results),
        "assets": results,
    }
    manifest_path = out_dir / args.manifest_name
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"wrote {manifest_path.relative_to(ROOT)}")

    if args.contact_sheet:
        sheets_dir = out_dir / "contact_sheets"
        if args.group_contact_by == "none":
            build_pair_contact_sheet(
                results,
                sheets_dir / "all_light.png",
                sheets_dir / "all_dark.png",
                title="All extracts",
            )
            print(f"wrote {sheets_dir.relative_to(ROOT)}/all_{{light,dark}}.png")
        else:
            groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
            for asset, info in zip(assets, results):
                if args.group_contact_by == "category":
                    key = str(asset.get("category") or "uncategorized").replace("/", "_")
                else:
                    src = Path(asset["source"]).stem
                    key = src
                groups[key].append(info)
            for key, group in sorted(groups.items()):
                build_pair_contact_sheet(
                    group,
                    sheets_dir / f"{key}_light.png",
                    sheets_dir / f"{key}_dark.png",
                    title=key,
                )
                print(f"wrote contact sheets for {key} ({len(group)} assets)")
            # Master combined
            build_pair_contact_sheet(
                results,
                sheets_dir / "all_light.png",
                sheets_dir / "all_dark.png",
                title="All extracts",
                cell=140,
            )
            print(f"wrote {sheets_dir.relative_to(ROOT)}/all_{{light,dark}}.png")

        if args.contact_combined:
            build_contact_sheet(results, sheets_dir / "all_combined.png", title="All extracts — light vs dark", cell=140)
            # Sample-style single combined if small
            if len(results) <= 8:
                build_contact_sheet(results, out_dir / "contact_sheet_sample.png", title="Sample extracts — light vs dark", cell=200)

    return 0


if __name__ == "__main__":
    sys.exit(main())
