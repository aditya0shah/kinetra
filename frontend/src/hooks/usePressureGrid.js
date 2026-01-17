// Hook to normalize various pressure data formats into a 2D grid
// Supports:
// 1) frames: Array<Array<number>> where -1 indicates no sensor at that cell
// 2) nodes: Array<{ id, gridX, gridY, data: Array<{ pressure:number }> }>
// 3) nodes with normalized positions: position { x:0..100, y:0..100 }
//    binned into grid of size gridCols x gridRows (defaults: 4x4)
import { useMemo } from 'react';

const binToGrid = (nodes, cols = 4, rows = 4, timeIdx = 0) => {
  const grid = Array.from({ length: rows }, () => Array(cols).fill(-1));
  nodes.forEach((node) => {
    const pressure = node.data?.[timeIdx]?.pressure ?? -1;
    let gx = node.gridX;
    let gy = node.gridY;
    if (gx == null || gy == null) {
      // derive from normalized position 0..100
      gx = Math.max(0, Math.min(cols - 1, Math.round((node.position?.x ?? 0) / (100 / (cols - 1)))));
      gy = Math.max(0, Math.min(rows - 1, Math.round((node.position?.y ?? 0) / (100 / (rows - 1)))));
    }
    grid[gy][gx] = pressure;
  });
  return grid;
};

export default function usePressureGrid(footPressureData, timeIdx = 0, options = {}) {
  const { gridCols = 4, gridRows = 4 } = options;

  const grid = useMemo(() => {
    if (!footPressureData) return [];

    // Case 1: frames present
    if (Array.isArray(footPressureData.frames)) {
      const frame = footPressureData.frames[timeIdx] || [];
      return frame;
    }

    // Case 2/3: nodes-based format
    if (Array.isArray(footPressureData)) {
      return binToGrid(footPressureData, gridCols, gridRows, timeIdx);
    }

    // Unknown format
    return [];
  }, [footPressureData, timeIdx, gridCols, gridRows]);

  const dims = useMemo(() => ({
    rows: grid.length,
    cols: grid[0]?.length || 0,
  }), [grid]);

  return { grid, dims };
}
