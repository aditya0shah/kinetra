import React, { useRef, useEffect, useState } from 'react';
import usePressureGrid from '../hooks/usePressureGrid';

const FootPressureHeatmap = ({
  footPressureData,
  isDark,
  gridRows = 4,
  gridCols = 4,
}) => {
  const canvasRef = useRef(null);
  const [showNumbers, setShowNumbers] = useState(false);

  const resolvedData = Array.isArray(footPressureData)
    ? footPressureData
    : footPressureData?.frames
    ? footPressureData
    : [];

  const getPressureColor = (pressure) => {
    // Lower value == higher pressure (darker)
    const maxValue = 3700;
    const clamped = Math.min(Math.max(pressure, 0), maxValue);
    const inverted = 1 - clamped / maxValue; // 0..1 (higher is more pressure)
    if (inverted < 0.25) return '#10b981'; // Low
    if (inverted < 0.5) return '#3b82f6'; // Medium
    if (inverted < 0.75) return '#f59e0b'; // High
    return '#ef4444'; // Very High
  };

  const { grid, dims } = usePressureGrid(resolvedData, 0, { gridCols, gridRows });

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.offsetWidth;
    const height = 520;
    canvas.width = width;
    canvas.height = height;

    // Background
    ctx.fillStyle = isDark ? '#0f172a' : '#f8fafc';
    ctx.fillRect(0, 0, width, height);
    
    // Grid area
    const margin = 24;
    const gridX = margin;
    const gridY = margin;
    const gridW = width - margin * 2;
    const gridH = height - margin * 2;

    const rows = dims.rows || 0;
    const cols = dims.cols || 0;
    const cellW = cols ? gridW / cols : 0;
    const cellH = rows ? gridH / rows : 0;

    // Draw grid cells
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const value = grid[r][c] ?? -1;
        const x = gridX + c * cellW;
        const y = gridY + r * cellH;

        // Skip cells marked -1 (no sensor) → shapes the foot
        if (value === -1) {
          // Draw subtle empty cell border for clarity
          ctx.strokeStyle = isDark ? '#1f2937' : '#e5e7eb';
          ctx.lineWidth = 1;
          ctx.strokeRect(x, y, cellW, cellH);
          continue;
        }

        const color = getPressureColor(value);
        ctx.fillStyle = color;
        const maxValue = 3700;
        const clamped = Math.min(Math.max(value, 0), maxValue);
        const inverted = 1 - clamped / maxValue; // darker for higher pressure
        ctx.globalAlpha = Math.min(0.85, 0.35 + inverted * 0.5);
        ctx.fillRect(x + 1, y + 1, cellW - 2, cellH - 2);

        // Cell border
        ctx.globalAlpha = 1;
        ctx.strokeStyle = isDark ? '#334155' : '#cbd5e1';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, cellW, cellH);

        if (showNumbers) {
          ctx.font = '10px Inter, system-ui';
          ctx.fillStyle = isDark ? '#e2e8f0' : '#1f2937';
          ctx.fillText(String(Math.round(value)), x + 6, y + 12);
        }
      }
    }
  };

  useEffect(() => {
    draw();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDark, grid, dims, showNumbers]);

  return (
    <div
      className={`rounded-lg shadow-lg p-4 ${isDark ? 'bg-slate-800' : 'bg-white'}`}
      style={{ maxWidth: 320, margin: '0 auto' }}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-800'}`}>
          Foot Pressure Heatmap (2D)
        </h3>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={showNumbers}
              onChange={(e) => setShowNumbers(e.target.checked)}
              className="h-4 w-4"
            />
            <span className={isDark ? 'text-gray-300' : 'text-gray-600'}>
              Show numbers
            </span>
          </label>
        </div>
      </div>

      {/* Canvas */}
      <div className={`rounded-lg ${isDark ? 'bg-slate-900' : 'bg-gray-50'}`}>
        <canvas ref={canvasRef} style={{ width: '100%', height: 520 }} />
      </div>

      {/* Legend */}
      <div className="mt-4 mb-2 flex items-center justify-center gap-4">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded" style={{ backgroundColor: '#10b981' }}></div>
          <span className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Low</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded" style={{ backgroundColor: '#3b82f6' }}></div>
          <span className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Medium</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded" style={{ backgroundColor: '#f59e0b' }}></div>
          <span className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>High</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded" style={{ backgroundColor: '#ef4444' }}></div>
          <span className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Very High</span>
        </div>
      </div>

      {/* Pressure values grid removed for thinner view */}
    </div>
  );
};

export default FootPressureHeatmap;
