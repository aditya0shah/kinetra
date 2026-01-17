// COCO-style skeleton edges (or adapt to your model output)
// Each edge connects two keypoint indices.
export const SKELETON_EDGES = [
  [0, 1], [1, 2], [2, 3], [3, 4], // Right arm
  [0, 5], [5, 6], [6, 7],        // Left arm
  [0, 8], [8, 9], [9, 10],       // Spine to right leg
  [0, 11], [11, 12], [12, 13],   // Spine to left leg
  [0, 14], [14, 15],             // Neck/head
];

// Example keypoint structure expected by SkeletonVisualization3D:
// [{ id: 0, x, y, z, confidence }, ...]
