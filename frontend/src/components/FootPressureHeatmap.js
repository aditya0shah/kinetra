import React, { useRef, useEffect, useState, useMemo } from 'react';
import usePressureGrid from '../hooks/usePressureGrid';

const FootPressureHeatmap = ({
  footPressureData,
  isDark,
  gridRows = 4,
  gridCols = 4,
}) => {
  const canvasRef = useRef(null);
  const [showNumbers, setShowNumbers] = useState(false);
  const minPressureValue = 0;
  const maxPressureValue = 100;

  const resolvedData = Array.isArray(footPressureData)
    ? footPressureData
    : footPressureData?.frames
    ? footPressureData
    : [];

  const getPressureColor = (pressure) => {
    const clamped = Math.min(Math.max(pressure, minPressureValue), maxPressureValue);
    const normalized = clamped / maxPressureValue; // 0..1 (higher is more pressure)
    // Map 0..1 to green->red gradient (low->high pressure)
    const hue = 120 * (1 - normalized); // 120=green, 0=red
    return `hsl(${hue}, 85%, 50%)`;
  };

  const applyGaussianKernel = (inputGrid) => {
    if (!Array.isArray(inputGrid) || inputGrid.length === 0) return inputGrid;
    const rows = inputGrid.length;
    const cols = inputGrid[0]?.length || 0;
    if (!cols) return inputGrid;

    const kernel = [
      [0.5, 1, 0.5],
      [1, 2, 1],
      [0.5, 1, 0.5],
    ];

    const output = inputGrid.map((row) => row.slice());

    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const center = inputGrid[r][c];
        if (center === -1) {
          output[r][c] = -1;
          continue;
        }
        let sum = 0;
        let weightSum = 0;
        for (let kr = -1; kr <= 1; kr += 1) {
          for (let kc = -1; kc <= 1; kc += 1) {
            const rr = r + kr;
            const cc = c + kc;
            if (rr < 0 || rr >= rows || cc < 0 || cc >= cols) continue;
            const value = inputGrid[rr][cc];
            if (value === -1) continue;
            const weight = kernel[kr + 1][kc + 1];
            sum += value * weight;
            weightSum += weight;
          }
        }
        output[r][c] = weightSum > 0 ? sum / weightSum : center;
      }
    }
    return output;
  };

  const { grid, dims } = usePressureGrid(resolvedData, 0, { gridCols, gridRows });
  const smoothedGrid = useMemo(() => applyGaussianKernel(grid), [grid]);

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

    // Draw grid cells to offscreen canvas, then blur for smooth transitions
    const offscreen = document.createElement('canvas');
    offscreen.width = width;
    offscreen.height = height;
    const offCtx = offscreen.getContext('2d');
    if (!offCtx) return;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const value = smoothedGrid[r]?.[c] ?? -1;
        const x = gridX + c * cellW;
        const y = gridY + r * cellH;

        // Skip cells marked -1 (no sensor) → shapes the foot
        if (value === -1) {
          continue;
        }

        const color = getPressureColor(value);
        offCtx.fillStyle = color;
        const clamped = Math.min(Math.max(value, minPressureValue), maxPressureValue);
        const normalized = clamped / maxPressureValue; // more opaque for higher pressure
        offCtx.globalAlpha = Math.min(0.85, 0.35 + normalized * 0.5);
        offCtx.fillRect(x, y, cellW, cellH);
      }
    }

    ctx.filter = 'blur(8px)';
    ctx.globalAlpha = 1;
    ctx.drawImage(offscreen, 0, 0);
    ctx.filter = 'none';

    if (showNumbers) {
      ctx.globalAlpha = 1;
      ctx.font = '10px Inter, system-ui';
      ctx.fillStyle = isDark ? '#e2e8f0' : '#1f2937';
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const value = smoothedGrid[r]?.[c] ?? -1;
          if (value === -1) continue;
          const x = gridX + c * cellW;
          const y = gridY + r * cellH;
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
      <div className={`relative rounded-lg ${isDark ? 'bg-slate-900' : 'bg-gray-50'}`}>
        <img
          src="/leftfoot.png"
          alt="Left foot overlay"
          className="absolute inset-0 w-full h-full object-contain pointer-events-none"
          style={{ opacity: isDark ? 0.35 : 0.25 }}
        />
        <canvas ref={canvasRef} style={{ width: '100%', height: 520 }} />
      </div>



      {/* Pressure values grid removed for thinner view */}
    </div>
  );
};

export default FootPressureHeatmap;
