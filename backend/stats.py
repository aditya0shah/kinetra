import numpy as np

REGIONS = {
    "Toe1": (np.s_[0:2, :3]),
    "Toe2345": (np.s_[0:2, 3:]),
    "M1": (np.s_[2:5, :4]),
    "M2": (np.s_[2:5, 4:5]),
    "M3": (np.s_[2:5, 5:6]),
    "M4": (np.s_[2:5, 6:7]),
    "M5": (np.s_[2:5, 7:]),
    "Mid Foot": (np.s_[5:9, :]),
    "Med Heel": (np.s_[9:, :4]),
    "Lat Heel": (np.s_[9:, 4:]),
}
def split_into_regions(matrix):
    regions = {}
    for region, indices in REGIONS.items():
        regions[region] = matrix[indices[0]].flatten()
    return regions

def calculate_region_stats(regions):
    stats = {}
    for region, values in regions.items():
        stats[region] = {
            "max": np.max(values),
            "mean": np.mean(values),
            "std": np.std(values),
            "min": np.min(values),
        }
    return stats

    