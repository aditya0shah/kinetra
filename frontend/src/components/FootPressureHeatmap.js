import React, { useRef, useEffect, useState } from 'react';
import { FiPlay, FiPause, FiSkipBack, FiSkipForward } from 'react-icons/fi';
import usePressureGrid from '../hooks/usePressureGrid';

const FootPressureHeatmap = ({ footPressureData, isDark }) => {
  const canvasRef = useRef(null);
  const [currentTimeIdx, setCurrentTimeIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const maxTimePoints = footPressureData[0]?.data.length || 20;

  const getPressureColor = (pressure) => {
    const p = Math.min(Math.max(pressure, 0), 100);
    if (p < 25) return '#10b981'; // Green
    if (p < 50) return '#3b82f6'; // Blue
    if (p < 75) return '#f59e0b'; // Amber
    return '#ef4444'; // Red
  };

  const { grid, dims } = usePressureGrid(footPressureData, currentTimeIdx, { gridCols: 4, gridRows: 4 });

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
  }, [currentTimeIdx, isDark, grid, dims]);

  useEffect(() => {
    if (!isPlaying) return;
    const id = setInterval(() => {
      setCurrentTimeIdx((t) => (t + 1) % maxTimePoints);
    }, 120);
    return () => clearInterval(id);
  }, [isPlaying, maxTimePoints]);

  return (
    <div className={`rounded-lg shadow-lg p-6 ${isDark ? 'bg-slate-800' : 'bg-white'}`}>
      <h3 className={`text-lg font-semibold mb-4 ${isDark ? 'text-white' : 'text-gray-800'}`}>
        Foot Pressure Heatmap (2D)
      </h3>

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

      {/* Time Series Display */}
      <div className={`mb-4 p-4 rounded-lg ${isDark ? 'bg-slate-700' : 'bg-gray-100'}`}>
        <div className="flex items-center justify-between">
          <span className={`text-sm font-semibold ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
            Time: {currentTimeIdx.toString().padStart(2, '0')}s
          </span>
          <div className="w-full max-w-xs h-2 rounded-full" style={{ backgroundColor: isDark ? '#1e293b' : '#e5e7eb' }}>
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${(currentTimeIdx / maxTimePoints) * 100}%`, backgroundColor: '#3b82f6' }}
            ></div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-3">
        <button
          onClick={() => setCurrentTimeIdx(Math.max(0, currentTimeIdx - 1))}
          className={`p-2 rounded-lg transition-colors ${isDark ? 'hover:bg-slate-700 text-blue-400' : 'hover:bg-gray-200 text-blue-600'}`}
          disabled={currentTimeIdx === 0}
        >
          <FiSkipBack size={20} />
        </button>
        <button
          onClick={() => setIsPlaying(!isPlaying)}
          className={`p-3 rounded-lg transition-colors ${isDark ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-blue-500 hover:bg-blue-600 text-white'}`}
        >
          {isPlaying ? <FiPause size={20} /> : <FiPlay size={20} />}
        </button>
        <button
          onClick={() => setCurrentTimeIdx(Math.min(maxTimePoints - 1, currentTimeIdx + 1))}
          className={`p-2 rounded-lg transition-colors ${isDark ? 'hover:bg-slate-700 text-blue-400' : 'hover:bg-gray-200 text-blue-600'}`}
          disabled={currentTimeIdx === maxTimePoints - 1}
        >
          <FiSkipForward size={20} />
        </button>
        <button
          onClick={() => setCurrentTimeIdx(0)}
          className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${isDark ? 'bg-slate-700 hover:bg-slate-600 text-gray-300' : 'bg-gray-200 hover:bg-gray-300 text-gray-700'}`}
        >
          Reset
        </button>
      </div>

      {/* Pressure values grid */}
      <div className="grid grid-cols-4 gap-2 mt-4">
        {footPressureData.map((node) => {
          const pressure = node.data[currentTimeIdx]?.pressure || 0;
          const normalized = Math.min(pressure / 100, 1);
          let bgColor = '#10b981';
          if (normalized >= 0.75) bgColor = '#ef4444';
          else if (normalized >= 0.5) bgColor = '#f59e0b';
          else if (normalized >= 0.25) bgColor = '#3b82f6';

          return (
            <div
              key={node.id}
              className={`p-2 rounded text-center text-xs font-semibold ${isDark ? 'bg-slate-700 text-gray-300' : 'bg-gray-100 text-gray-700'}`}
              style={{ backgroundColor: `${bgColor}22`, borderLeft: `3px solid ${bgColor}` }}
            >
              {Math.round(pressure)}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default FootPressureHeatmap;
