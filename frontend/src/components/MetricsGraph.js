import React, { useMemo, useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

/**
 * MetricsGraph Component
 * Displays time-series metrics from a workout session
 * - Line graphs: mean_force, sum_pressure, mean, std
 * - Single values: max, min
 */
const MetricsGraph = ({ timeSeriesStats, isDark, activeFrameIndex }) => {
  const regionKeys = useMemo(() => {
    if (!Array.isArray(timeSeriesStats)) return [];
    const keys = new Set();
    timeSeriesStats.forEach(frame => {
      Object.keys(frame || {}).forEach(key => {
        if (key !== 'timestamp' && typeof frame[key] === 'object' && frame[key] !== null) {
          keys.add(key);
        }
      });
    });
    return Array.from(keys);
  }, [timeSeriesStats]);

  const statKeys = useMemo(() => {
    if (!regionKeys.length || !Array.isArray(timeSeriesStats)) return [];
    const sampleRegion = regionKeys[0];
    const sampleStats = timeSeriesStats.find(frame => frame?.[sampleRegion])?.[sampleRegion] || {};
    return Object.keys(sampleStats);
  }, [regionKeys, timeSeriesStats]);

  const [activeStat, setActiveStat] = useState(statKeys[0] || '');

  useEffect(() => {
    if (!statKeys.length) {
      setActiveStat('');
      return;
    }
    if (!statKeys.includes(activeStat)) {
      setActiveStat(statKeys[0]);
    }
  }, [statKeys, activeStat]);

  const chartData = useMemo(() => {
    if (!timeSeriesStats || timeSeriesStats.length === 0 || !activeStat) {
      return [];
    }
    return timeSeriesStats.map((frame, idx) => {
      const point = { time: idx };
      regionKeys.forEach(region => {
        const regionStats = frame?.[region];
        point[region] = regionStats?.[activeStat] ?? 0;
      });
      return point;
    });
  }, [timeSeriesStats, regionKeys, activeStat]);

  const currentFrame = useMemo(() => {
    if (!timeSeriesStats || timeSeriesStats.length === 0 || !activeStat) return null;
    return timeSeriesStats[timeSeriesStats.length - 1];
  }, [timeSeriesStats, activeStat]);

  const statLabels = {
    mean_force: 'Mean Force',
    sum_pressure: 'Sum Pressure',
    mean: 'Mean',
    std: 'Std Dev',
    max: 'Max',
    min: 'Min',
  };

  const regionColors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#14b8a6', '#f97316', '#22c55e'];
  const showActiveDot = typeof activeFrameIndex === 'number';
  const activePoint = showActiveDot && chartData[activeFrameIndex] ? chartData[activeFrameIndex] : null;

  const renderActiveDot = (color) => (props) => {
    if (!showActiveDot) return null;
    if (props.index !== activeFrameIndex) return null;
    return (
      <circle
        cx={props.cx}
        cy={props.cy}
        r={5}
        fill={color}
        stroke={isDark ? '#0f172a' : '#ffffff'}
        strokeWidth={2}
      />
    );
  };

  if (!chartData || chartData.length === 0 || !regionKeys.length || !statKeys.length) {
    return (
      <div className={`rounded-lg shadow-lg p-6 ${isDark ? 'bg-slate-800' : 'bg-white'}`}>
        <h3 className={`text-lg font-semibold mb-4 ${isDark ? 'text-white' : 'text-gray-800'}`}>
          Pressure Metrics Over Time
        </h3>
        <div className={`text-center py-8 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
          No data available yet. Start recording to see metrics.
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-lg shadow-lg p-6 ${isDark ? 'bg-slate-800' : 'bg-white'}`}>
      <h3 className={`text-lg font-semibold mb-6 ${isDark ? 'text-white' : 'text-gray-800'}`}>
        Pressure Metrics Over Time
      </h3>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 mb-4">
        {statKeys.map(stat => (
          <button
            key={stat}
            onClick={() => setActiveStat(stat)}
            className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
              activeStat === stat
                ? (isDark ? 'bg-blue-600 text-white' : 'bg-blue-500 text-white')
                : (isDark ? 'bg-slate-700 text-slate-200 hover:bg-slate-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200')
            }`}
          >
            {statLabels[stat] || stat}
          </button>
        ))}
      </div>

      {/* Line Graph for active stat per region */}
      <div className={`rounded-lg p-4 ${isDark ? 'bg-slate-900' : 'bg-gray-50'}`}>
        <ResponsiveContainer width="100%" height={520}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#334155' : '#e2e8f0'} />
            <XAxis 
              dataKey="time" 
              stroke={isDark ? '#94a3b8' : '#64748b'}
              label={{ value: 'Time (frames)', position: 'insideBottomRight', offset: -5 }}
            />
            <YAxis 
              stroke={isDark ? '#94a3b8' : '#64748b'}
              domain={[0, 100]}
              label={{ value: statLabels[activeStat] || activeStat, angle: -90, position: 'insideLeft' }}
            />
            <Tooltip 
              contentStyle={{
                backgroundColor: isDark ? '#1e293b' : '#fff',
                border: `1px solid ${isDark ? '#475569' : '#e2e8f0'}`,
                borderRadius: '8px',
              }}
              labelStyle={{ color: isDark ? '#e2e8f0' : '#1f2937' }}
            />
            <Legend wrapperStyle={{ color: isDark ? '#e2e8f0' : '#1f2937' }} />

            {regionKeys.map((region, index) => (
              <Line
                key={region}
                type="monotone"
                dataKey={region}
                stroke={regionColors[index % regionColors.length]}
                dot={showActiveDot ? renderActiveDot(regionColors[index % regionColors.length]) : false}
                strokeWidth={2}
                isAnimationActive={false}
                name={region}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {activePoint && (
        <div
          className={`mt-4 rounded-lg border px-4 py-3 text-sm ${
            isDark ? 'bg-slate-900 border-slate-700 text-slate-200' : 'bg-white border-gray-200 text-gray-700'
          }`}
        >
          <div className="mb-2 font-semibold">
            Frame {activePoint.time + 1}
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3 lg:grid-cols-4">
            {regionKeys.map((region, index) => (
              <div key={region} className="flex items-center gap-2">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: regionColors[index % regionColors.length] }}
                />
                <span className="truncate">{region}</span>
                <span className="ml-auto font-medium">
                  {Number.isFinite(activePoint[region]) ? activePoint[region].toFixed(2) : '—'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default MetricsGraph;
