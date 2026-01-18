import numpy as np

# For a 4x4 pressure matrix, map regions anatomically:
# Row 0: Toes
# Rows 1-2: Metatarsals (M1-M5)
# Row 3: Heel (medial and lateral)

REGIONS = {
    "Toe1": (np.s_[0:2, :3], 2.0),
    "Toe2345": (np.s_[0:2, 3:], 2.0),
    "M1": (np.s_[2:5, :4], 2.0),
    "M2": (np.s_[2:5, 4:5], 2.0),
    "M3": (np.s_[2:5, 5:6], 2.0),
    "M4": (np.s_[2:5, 6:7], 2.0),
    "M5": (np.s_[2:5, 7:], 2.0),
    "Mid Foot": (np.s_[5:9, :], 2.0),
    "Med Heel": (np.s_[9:, :4], 2.0),
    "Lat Heel": (np.s_[9:, 4:], 2.0),
}

def split_into_regions(matrix):
    """Split a 4x4 pressure matrix into anatomical regions."""
    regions = {}
    for region_name, (indices, area) in REGIONS.items():
        try:
            region_data = matrix[indices]
            regions[region_name] = region_data.flatten() if region_data.ndim > 0 else np.array([region_data])
        except:
            regions[region_name] = np.array([0.0])
    return regions

def calculate_region_stats(regions):
    """Calculate statistics for each anatomical region."""
    stats = {}
    for region_name, values in regions.items():
        if len(values) == 0:
            values = np.array([0.0])
        
        area = REGIONS[region_name][1]
        force = np.mean(values) * area
        
        stats[region_name] = {
            "mean_force": float(force),
            "max": float(np.max(values)),
            "sum_pressure": float(np.sum(values)),
            "mean": float(np.mean(values)),
            "std": float(np.std(values)),
            "min": float(np.min(values)),
        }
    return stats

def apply_ema_stats(stats, prev_ema=None, alpha=0.05):
    """Apply EMA smoothing to nested region stats."""
    if not isinstance(stats, dict):
        return {}

    prev_ema = prev_ema if isinstance(prev_ema, dict) else {}
    smoothed = {}
    for region_name, region_stats in stats.items():
        if not isinstance(region_stats, dict):
            continue
        smoothed_region = {}
        prev_region = prev_ema.get(region_name, {})
        for stat_name, value in region_stats.items():
            if not isinstance(value, (int, float, np.number)):
                continue
            prev_value = prev_region.get(stat_name)
            if isinstance(prev_value, (int, float, np.number)):
                next_value = alpha * float(value) + (1 - alpha) * float(prev_value)
            else:
                next_value = float(value)
            smoothed_region[stat_name] = float(next_value)
        if smoothed_region:
            smoothed[region_name] = smoothed_region
    return smoothed

    