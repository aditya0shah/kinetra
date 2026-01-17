import numpy as np

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
    regions = {}
    for region, indices in REGIONS.items():
        regions[region] = matrix[indices[0]].flatten()
    return regions

def calculate_region_stats(regions):
    stats = {}
    for region, values in regions.items():
        area = REGIONS[region][1] 
        force = np.mean(values) * area
        stats[region] = {
            "mean_force": force,
            "max": np.max(values),
            "sum_pressure": np.sum(values),
            "mean": np.mean(values),
            "std": np.std(values),
            "min": np.min(values),
        }
    return stats

    