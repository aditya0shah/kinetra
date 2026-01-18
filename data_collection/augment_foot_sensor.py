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

# Normalization parameters (matching classification.py and skeleton.py)
IN_MIN = 1000.0
IN_MAX = 5000.0
OUT_MIN = 0.0
OUT_MAX = 100.0
MAX_CLIP = 5000.0  # ohms; 3700 = no pressure, lower = higher pressure


def make_active_mask(n_rows: int = 12, n_cols: int = 8):
    """Boolean mask: True = active sensor, False = inactive."""
    mask = np.ones((n_rows, n_cols), dtype=bool)
    for r, c in INACTIVE_COORDS:
        if r < n_rows and c < n_cols:
            mask[r, c] = False
    return mask


def rescale_matrix(matrix):
    """
    Rescale pressure matrix values to match classification.py and skeleton.py normalization.
    
    Maps values from [1000, 5000] to [0, 100] with inversion:
    - Values <= 0 -> -1
    - Higher pressure (lower resistance) -> higher output value
    - Matches frontend rescaleMatrix function and classification.py/skeleton.py logic
    
    Args:
        matrix: numpy array of pressure values (can be 2D or 3D)
    
    Returns:
        Rescaled matrix with same shape, values in [0, 100] or -1
    """
    in_range = IN_MAX - IN_MIN
    out_range = OUT_MAX - OUT_MIN
    
    # Create output array with same shape
    result = np.zeros_like(matrix, dtype=np.float32)
    
    # Handle values <= 0 -> set to -1
    mask_invalid = matrix <= 0
    result[mask_invalid] = -1.0
    
    # Scale valid values: ((value - inMin) / inRange) * outRange + outMin
    mask_valid = ~mask_invalid
    scaled = ((matrix[mask_valid] - IN_MIN) / in_range) * out_range + OUT_MIN
    
    # Clamp to [outMin, outMax]
    scaled = np.clip(scaled, OUT_MIN, OUT_MAX)
    
    # Invert: outMax - scaled (so 3700 -> 0, 700 -> 100)
    result[mask_valid] = OUT_MAX - scaled
    
    return result


def denormalize_matrix(matrix):
    """
    Reverse normalization: convert from [0, 100] back to raw [1000, 5000] range.
    
    This is used when we need to work with raw values for augmentation.
    
    Args:
        matrix: normalized matrix with values in [0, 100] or -1
    
    Returns:
        Denormalized matrix with values in [1000, 5000] or MAX_CLIP
    """
    in_range = IN_MAX - IN_MIN
    out_range = OUT_MAX - OUT_MIN
    
    result = np.zeros_like(matrix, dtype=np.float64)
    
    # Handle invalid values (-1) -> set to MAX_CLIP
    mask_invalid = matrix < 0
    result[mask_invalid] = MAX_CLIP
    
    # Reverse invert and scale
    mask_valid = ~mask_invalid
    inverted = OUT_MAX - matrix[mask_valid]  # Reverse inversion
    denorm = (inverted / out_range) * in_range + IN_MIN  # Reverse scaling
    
    result[mask_valid] = denorm
    result = np.clip(result, 0.0, MAX_CLIP)
    
    return result


def add_foot_sensor_noise(
    matrices: np.ndarray,
    noise_std: float,
    rng: np.random.Generator,
    inplace: bool = False,
) -> np.ndarray:
    """
    Add Gaussian noise to foot sensor data (matrices) on active cells only.
    Works with normalized data [0, 100] or raw data [0, MAX_CLIP].
    
    If data appears normalized (all values <= 100), adds noise in normalized space.
    Otherwise, assumes raw data and adds noise in raw space, then normalizes.

    matrices: (T, 12, 8) float64, values in [0, MAX_CLIP] (raw) or [0, 100] (normalized)
    noise_std: std of Gaussian noise in same units as matrices
    rng: numpy random generator for reproducibility
    inplace: if True, modify matrices; else copy first
    """
    T, R, C = matrices.shape
    out = matrices if inplace else matrices.copy().astype(np.float64)

    # Check if data is already normalized (values typically <= 100)
    max_val = np.max(out[out >= 0])  # Ignore -1 values
    is_normalized = max_val <= 110.0  # Small threshold for normalized data
    
    if not is_normalized:
        # Data is raw, normalize first
        out = rescale_matrix(out)

    active = make_active_mask(R, C)  # (12, 8)
    # Noise shape (T, 12, 8); we will only add where active
    noise = rng.normal(0, noise_std, size=out.shape)
    noise[:, ~active] = 0.0  # no noise on inactive
    out += noise
    
    # Clip to valid normalized range [0, 100] or preserve -1
    valid_mask = out >= 0
    out[valid_mask] = np.clip(out[valid_mask], OUT_MIN, OUT_MAX)
    
    # Restore inactive cells: if they were -1, keep -1; otherwise set to 0 (normalized "no pressure")
    # Note: inactive cells should be masked out, but if they exist in normalized data,
    # they should be 0 (which represents MAX_CLIP in normalized space)
    for r, c in INACTIVE_COORDS:
        if r < R and c < C:
            # In normalized space, inactive should be 0 (represents MAX_CLIP)
            out[:, r, c] = 0.0
    
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
    
    Matrices are normalized using rescale_matrix (matching classification.py/skeleton.py)
    before noise is added, ensuring consistent normalization.
    
    Args:
        data: Dictionary with 'matrices' key containing (T, 12, 8) arrays
        noise_std: Std of noise in raw ohms (will be converted to normalized units)
        rng: Random number generator
    """
    out = {}
    for k, v in data.items():
        if k == "matrices":
            arr = np.asarray(v, dtype=np.float64)
            
            # Check if data is already normalized (values typically <= 100)
            max_val = np.max(arr[arr >= 0]) if np.any(arr >= 0) else 0
            is_normalized = max_val <= 110.0
            
            # Normalize if needed (matching classification.py/skeleton.py)
            if not is_normalized:
                arr_normalized = rescale_matrix(arr)
            else:
                arr_normalized = arr.copy().astype(np.float64)
            
            # Convert noise_std from ohms to normalized units
            # Normalization maps [1000, 5000] ohms to [0, 100] normalized units
            # So 1 ohm = (100 / (5000-1000)) = 0.025 normalized units
            in_range = IN_MAX - IN_MIN  # 4000 ohms
            out_range = OUT_MAX - OUT_MIN  # 100 normalized units
            noise_std_normalized = (noise_std / in_range) * out_range
            
            # Add noise to normalized data
            arr_augmented = add_foot_sensor_noise(arr_normalized, noise_std_normalized, rng, inplace=False)
            
            # Save normalized data (matching classification.py/skeleton.py format)
            out[k] = arr_augmented
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
