from __future__ import annotations

import argparse
import csv
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageStat


FPS = 24


def timecode(frame_number: int) -> str:
    total_seconds, frame = divmod(frame_number - 1, FPS)
    hours, remainder = divmod(total_seconds, 3600)
    minutes, seconds = divmod(remainder, 60)
    return f"{hours:02d}:{minutes:02d}:{seconds:02d}:{frame:02d}"


def frame_signature(path: Path) -> tuple[np.ndarray, float, float, str]:
    with Image.open(path) as source:
        image = source.convert("RGB")
        thumb = image.resize((96, 54), Image.Resampling.BILINEAR)
        array = np.asarray(thumb, dtype=np.float32)
        gray = np.asarray(thumb.convert("L"), dtype=np.float32)
        stats = ImageStat.Stat(thumb)
        brightness = float(stats.mean[0] * 0.299 + stats.mean[1] * 0.587 + stats.mean[2] * 0.114)
        contrast = float(gray.std())
        dominant = tuple(int(value) for value in stats.mean)
        dominant_hex = "#{:02x}{:02x}{:02x}".format(*dominant)
        return gray, brightness, contrast, dominant_hex


def build_contact_sheet(frames: list[Path], output: Path, columns: int = 4, rows: int = 3) -> None:
    selected = frames[:: max(1, len(frames) // (columns * rows))][: columns * rows]
    thumb_width, thumb_height = 480, 270
    label_height = 34
    sheet = Image.new(
        "RGB",
        (columns * thumb_width, rows * (thumb_height + label_height)),
        "#160b0c",
    )
    draw = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.truetype("C:/Windows/Fonts/msyh.ttc", 18)
    except OSError:
        font = ImageFont.load_default()

    for position, frame_path in enumerate(selected):
        frame_number = int(frame_path.stem.split("_")[-1])
        with Image.open(frame_path) as source:
            thumb = source.convert("RGB")
            thumb.thumbnail((thumb_width, thumb_height), Image.Resampling.LANCZOS)
        x = (position % columns) * thumb_width
        y = (position // columns) * (thumb_height + label_height)
        offset_x = x + (thumb_width - thumb.width) // 2
        sheet.paste(thumb, (offset_x, y))
        draw.rectangle((x, y + thumb_height, x + thumb_width, y + thumb_height + label_height), fill="#241112")
        draw.text(
            (x + 12, y + thumb_height + 7),
            f"F{frame_number:06d}  {timecode(frame_number)}",
            font=font,
            fill="#edcf9f",
        )
    sheet.save(output, quality=91)


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate a frame-level manifest at 24 FPS.")
    parser.add_argument("--frames", required=True, help="Directory containing frame_000001.jpg files.")
    parser.add_argument("--out", required=True, help="Output directory.")
    args = parser.parse_args()

    frame_dir = Path(args.frames)
    output_dir = Path(args.out)
    output_dir.mkdir(parents=True, exist_ok=True)
    frame_paths = sorted(frame_dir.glob("frame_*.jpg"))
    if not frame_paths:
        raise SystemExit("No frame_*.jpg files found.")

    rows: list[dict[str, str | int | float]] = []
    change_scores: list[float] = []
    previous: np.ndarray | None = None

    for frame_path in frame_paths:
        frame_number = int(frame_path.stem.split("_")[-1])
        gray, brightness, contrast, dominant_hex = frame_signature(frame_path)
        change = 0.0 if previous is None else float(np.mean(np.abs(gray - previous)))
        change_scores.append(change)
        previous = gray
        rows.append(
            {
                "frame_no": frame_number,
                "timecode": timecode(frame_number),
                "seconds": round((frame_number - 1) / FPS, 4),
                "file": frame_path.name,
                "brightness": round(brightness, 2),
                "contrast": round(contrast, 2),
                "change_score": round(change, 3),
                "dominant_hex": dominant_hex,
            }
        )

    manifest_path = output_dir / "frame_manifest.csv"
    with manifest_path.open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)

    scores = np.asarray(change_scores[1:], dtype=np.float32)
    threshold = max(16.0, float(np.percentile(scores, 98)))
    candidate_indices = np.where(scores >= threshold)[0] + 2
    with (output_dir / "scene_candidates.csv").open(
        "w", newline="", encoding="utf-8-sig"
    ) as handle:
        writer = csv.writer(handle)
        writer.writerow(["frame_no", "timecode", "change_score", "note"])
        for frame_number in candidate_indices.tolist():
            score = float(change_scores[frame_number - 1])
            writer.writerow(
                [
                    frame_number,
                    timecode(frame_number),
                    round(score, 3),
                    "候选切镜/大幅画面变化，需要人工复核",
                ]
            )

    segment_size = 60 * FPS
    for index, start in enumerate(range(0, len(frame_paths), segment_size), start=1):
        build_contact_sheet(
            frame_paths[start : start + segment_size],
            output_dir / f"minute-{index:02d}-contact.jpg",
        )

    summary = (
        "# 24 FPS 逐帧清单\n\n"
        f"- 帧率：{FPS} FPS\n"
        f"- 总帧数：{len(frame_paths)}\n"
        f"- 分辨率：960×540（由 1920×1080 原片等比缩放）\n"
        f"- 清单：`{manifest_path.name}`\n"
        f"- 候选切镜：`scene_candidates.csv`\n"
        f"- 候选阈值：change_score ≥ {threshold:.3f}\n"
        "- 说明：程序化分数只用于定位画面突变；内容语义需结合 OCR、口播和人工复核。\n"
    )
    (output_dir / "README.md").write_text(summary, encoding="utf-8")
    print(f"Wrote {len(rows)} rows to {manifest_path}")


if __name__ == "__main__":
    main()
