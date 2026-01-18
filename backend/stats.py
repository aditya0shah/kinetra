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

    