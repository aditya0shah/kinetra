import React, { useRef, useEffect, useState } from 'react';
import usePressureGrid from '../hooks/usePressureGrid';

const FootPressureHeatmap = ({
  footPressureData,
  isDark,
  isPaused,
  onPauseToggle,
  gridRows = 4,
  gridCols = 4,
}) => {
  const canvasRef = useRef(null);
  const [elapsedTime, setElapsedTime] = useState(0);

  const resolvedData = Array.isArray(footPressureData)
    ? footPressureData
    : footPressureData?.frames
    ? footPressureData
    : [];

  const getPressureColor = (pressure) => {
    const p = Math.min(Math.max(pressure, 0), 100);
    if (p < 25) return '#10b981'; // Green
    if (p < 50) return '#3b82f6'; // Blue
    if (p < 75) return '#f59e0b'; // Amber
    return '#ef4444'; // Red
  };

  const { grid, dims } = usePressureGrid(resolvedData, 0, { gridCols, gridRows });

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.offsetWidth;
    const height = 360;
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
        ctx.globalAlpha = Math.min(0.85, 0.35 + (value / 100) * 0.5);
        ctx.fillRect(x + 1, y + 1, cellW - 2, cellH - 2);

        // Cell border
        ctx.globalAlpha = 1;
        ctx.strokeStyle = isDark ? '#334155' : '#cbd5e1';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, cellW, cellH);

        // Value label
        ctx.font = '10px Inter, system-ui';
        ctx.fillStyle = isDark ? '#e2e8f0' : '#1f2937';
        ctx.fillText(String(Math.round(value)), x + 6, y + 12);
      }
    }
  };

  useEffect(() => {
    draw();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDark, grid, dims]);

  // Update elapsed time every second
  useEffect(() => {
    const id = setInterval(() => {
      setElapsedTime((t) => t + 1);
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const formatTime = (seconds) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className={`rounded-lg shadow-lg p-6 ${isDark ? 'bg-slate-800' : 'bg-white'}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-800'}`}>
          Foot Pressure Heatmap (2D)
        </h3>
        <div className="flex items-center gap-3">
          <span className={`text-sm font-mono ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
            ⏱ {formatTime(elapsedTime)}
          </span>
          {onPauseToggle && (
            <button
              onClick={onPauseToggle}
              className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${
                isPaused
                  ? isDark
                    ? 'bg-green-900 hover:bg-green-800 text-green-300'
                    : 'bg-green-100 hover:bg-green-200 text-green-700'
                  : isDark
                  ? 'bg-orange-900 hover:bg-orange-800 text-orange-300'
                  : 'bg-orange-100 hover:bg-orange-200 text-orange-700'
              }`}
            >
              {isPaused ? 'Resume' : 'Pause'}
            </button>
          )}
        </div>
      </div>

      {/* Canvas */}
      <div className={`rounded-lg ${isDark ? 'bg-slate-900' : 'bg-gray-50'}`}>
        <canvas ref={canvasRef} style={{ width: '100%', height: 360 }} />
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

      {/* Pressure values grid */}
      <div
        className="grid gap-2 mt-4"
        style={{
          gridTemplateColumns: `repeat(${dims.cols || gridCols}, minmax(0, 1fr))`,
        }}
      >
        {grid.length > 0 ? (
          grid.flat().map((value, idx) => {
            if (value === -1) {
              return (
                <div
                  key={`empty-${idx}`}
                  className={`p-2 rounded text-center text-xs font-semibold ${
                    isDark ? 'bg-slate-700 text-gray-500' : 'bg-gray-100 text-gray-400'
                  }`}
                >
                  —
                </div>
              );
            }

            const pressure = value || 0;
            const normalized = Math.min(pressure / 100, 1);
            let bgColor = '#10b981';
            if (normalized >= 0.75) bgColor = '#ef4444';
            else if (normalized >= 0.5) bgColor = '#f59e0b';
            else if (normalized >= 0.25) bgColor = '#3b82f6';

            return (
              <div
                key={`val-${idx}`}
                className={`p-2 rounded text-center text-xs font-semibold ${
                  isDark ? 'bg-slate-700 text-gray-300' : 'bg-gray-100 text-gray-700'
                }`}
                style={{ backgroundColor: `${bgColor}22`, borderLeft: `3px solid ${bgColor}` }}
              >
                {Math.round(pressure)}
              </div>
            );
          })
        ) : (
          <div
            className={`text-center py-4 ${
              isDark ? 'text-gray-400' : 'text-gray-500'
            }`}
            style={{ gridColumn: '1 / -1' }}
          >
            No pressure data available
          </div>
        )}
      </div>
    </div>
  );
};

export default FootPressureHeatmap;
