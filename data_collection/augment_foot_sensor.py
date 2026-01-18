#!/usr/bin/env python3
"""
Data augmentation: add noise to foot sensor data while keeping pose landmarks unchanged.

Reads .npz episodes, adds configurable Gaussian noise to the `matrices` (foot sensor)
array only on active sensor cells, leaves `pose_landmarks` and all metadata unchanged,
and writes augmented copies to an output directory.

Usage:
  python augment_foot_sensor.py --input-dir data/raw --output-dir data/raw_augmented
  python augment_foot_sensor.py -i data/raw -o data/raw_augmented --noise-std 80 --num-copies 2
"""

import argparse
import numpy as np
from pathlib import Path


# From DATA_FORMAT_SUMMARY.md: inactive sensor coords (row, col) always 3700.0
INACTIVE_COORDS = {
    (0, 0), (0, 1), (0, 7), (1, 0),   # top corners / edges
    (6, 7), (7, 7),                    # middle edges
    (8, 6), (8, 7), (9, 6), (9, 7),   # bottom edges
    (10, 6), (10, 7), (11, 6), (11, 7)  # bottom corners
}
MAX_CLIP = 3700.0  # ohms; 3700 = no pressure, lower = higher pressure


def make_active_mask(n_rows: int = 12, n_cols: int = 8):
    """Boolean mask: True = active sensor, False = inactive."""
    mask = np.ones((n_rows, n_cols), dtype=bool)
    for r, c in INACTIVE_COORDS:
        if r < n_rows and c < n_cols:
            mask[r, c] = False
    return mask


def add_foot_sensor_noise(
    matrices: np.ndarray,
    noise_std: float,
    rng: np.random.Generator,
    inplace: bool = False,
) -> np.ndarray:
    """
    Add Gaussian noise to foot sensor data (matrices) on active cells only.
    Inactive cells stay at MAX_CLIP. Values are clipped to [0, MAX_CLIP].

    matrices: (T, 12, 8) float64, values in [0, MAX_CLIP]
    noise_std: std of Gaussian noise in same units (ohms)
    rng: numpy random generator for reproducibility
    inplace: if True, modify matrices; else copy first
    """
    T, R, C = matrices.shape
    out = matrices if inplace else matrices.copy().astype(np.float64)

    active = make_active_mask(R, C)  # (12, 8)
    # Noise shape (T, 12, 8); we will only add where active
    noise = rng.normal(0, noise_std, size=out.shape)
    noise[:, ~active] = 0.0  # no noise on inactive
    out += noise
    out = np.clip(out, 0.0, MAX_CLIP)
    # Restore inactive to exactly MAX_CLIP (clip might have left small errors)
    for r, c in INACTIVE_COORDS:
        if r < R and c < C:
            out[:, r, c] = MAX_CLIP
    return out


def load_npz(path: Path) -> dict:
    """Load .npz and return a dict of arrays/scalars (no np.lib.npyio.BagObj)."""
    with np.load(path, allow_pickle=True) as z:
        return {k: z[k] for k in z.files}


def save_npz(path: Path, data: dict) -> None:
    """Save dict of arrays/scalars to .npz (compressed)."""
    np.savez_compressed(path, **data)


def augment_episode(
    data: dict,
    noise_std: float,
    rng: np.random.Generator,
) -> dict:
    """
    Return a new dict with noise added to `matrices`; `pose_landmarks` and
    all other keys are copied as-is (we copy arrays to avoid sharing memory).
    """
    out = {}
    for k, v in data.items():
        if k == "matrices":
            arr = np.asarray(v, dtype=np.float64)
            out[k] = add_foot_sensor_noise(arr, noise_std, rng, inplace=False)
        else:
            out[k] = np.asarray(v).copy() if hasattr(v, "shape") and hasattr(v, "copy") else v
    return out


def discover_npz(root: Path) -> list[Path]:
    """Recursively find all .npz under root."""
    return sorted(root.rglob("*.npz"))


def main():
    parser = argparse.ArgumentParser(
        description="Add Gaussian noise to foot sensor data in .npz episodes; pose unchanged."
    )
    parser.add_argument(
        "-i", "--input-dir",
        type=Path,
        default=Path("data/raw"),
        help="Root directory to search for .npz (keeps relative structure)",
    )
    parser.add_argument(
        "-o", "--output-dir",
        type=Path,
        default=Path("data/raw_augmented"),
        help="Root for augmented .npz (same relative structure as input)",
    )
    parser.add_argument(
        "--noise-std",
        type=float,
        default=60.0,
        help="Std of Gaussian noise in sensor units (ohms). Default 60. Sensible range ~30–120.",
    )
    parser.add_argument(
        "-n", "--num-copies",
        type=int,
        default=1,
        help="Number of augmented copies to generate per source file. Default 1.",
    )
    parser.add_argument(
        "--suffix",
        type=str,
        default="aug",
        help="Suffix before .npz for augmented filenames, e.g. idle_ep01_xxx_aug0.npz. Default: aug",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=42,
        help="Random seed for reproducibility. Default 42.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Only print which files would be processed and output paths.",
    )
    args = parser.parse_args()

    rng = np.random.default_rng(args.seed)
    input_dir = args.input_dir.resolve()
    output_dir = args.output_dir.resolve()

    if not input_dir.is_dir():
        raise SystemExit(f"Input directory does not exist: {input_dir}")

    files = discover_npz(input_dir)
    if not files:
        print(f"No .npz under {input_dir}")
        return

    print(f"Found {len(files)} .npz under {input_dir}")
    print(f"Noise std: {args.noise_std}, copies per file: {args.num_copies}, suffix: {args.suffix}")

    for npz_path in files:
        rel = npz_path.relative_to(input_dir)
        stem = npz_path.stem  # e.g. idle_ep01_20260117_225220

        for c in range(args.num_copies):
            out_name = f"{stem}_{args.suffix}{c}.npz" if args.num_copies > 1 else f"{stem}_{args.suffix}.npz"
            out_path = output_dir / rel.parent / out_name

            if args.dry_run:
                print(f"  would: {npz_path} -> {out_path}")
                continue

            out_path.parent.mkdir(parents=True, exist_ok=True)
            data = load_npz(npz_path)
            if "matrices" not in data:
                print(f"  skip (no 'matrices'): {npz_path}")
                continue
            aug = augment_episode(data, args.noise_std, rng)
            save_npz(out_path, aug)
            print(f"  wrote: {out_path}")

    if not args.dry_run:
        print(f"Done. Output root: {output_dir}")


if __name__ == "__main__":
    main()
