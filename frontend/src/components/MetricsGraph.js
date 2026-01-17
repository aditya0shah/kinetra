import React, { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

/**
 * MetricsGraph Component
 * Displays time-series metrics from a workout session
 * - Line graphs: mean_force, sum_pressure, mean, std
 * - Single values: max, min
 */
const MetricsGraph = ({ timeSeriesStats, isDark }) => {
  // Transform time-series stats into plottable data
  const chartData = useMemo(() => {
    if (!timeSeriesStats || timeSeriesStats.length === 0) {
      return [];
    }

    return timeSeriesStats.map((frame, idx) => {
      // Average the metrics across all regions
      let meanForceSum = 0, sumPressureSum = 0, meanSum = 0, stdSum = 0, maxVal = 0, minVal = Infinity;
      let count = 0;

      Object.keys(frame).forEach(key => {
        if (key === 'timestamp') return;
        if (typeof frame[key] === 'object' && frame[key] !== null) {
          meanForceSum += frame[key].mean_force || 0;
          sumPressureSum += frame[key].sum_pressure || 0;
          meanSum += frame[key].mean || 0;
          stdSum += frame[key].std || 0;
          maxVal = Math.max(maxVal, frame[key].max || 0);
          minVal = Math.min(minVal, frame[key].min || Infinity);
          count++;
        }
      });

      return {
        time: idx,
        mean_force: count > 0 ? meanForceSum / count : 0,
        sum_pressure: count > 0 ? sumPressureSum / count : 0,
        mean: count > 0 ? meanSum / count : 0,
        std: count > 0 ? stdSum / count : 0,
        max: maxVal,
        min: minVal === Infinity ? 0 : minVal,
      };
    });
  }, [timeSeriesStats]);

  if (!chartData || chartData.length === 0) {
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

  // Calculate current values (last frame)
  const currentFrame = chartData[chartData.length - 1];

  return (
    <div className={`rounded-lg shadow-lg p-6 ${isDark ? 'bg-slate-800' : 'bg-white'}`}>
      <h3 className={`text-lg font-semibold mb-6 ${isDark ? 'text-white' : 'text-gray-800'}`}>
        Pressure Metrics Over Time
      </h3>

      {/* Line Graph for mean_force, sum_pressure, mean, std */}
      <div className={`rounded-lg p-4 mb-6 ${isDark ? 'bg-slate-900' : 'bg-gray-50'}`}>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#334155' : '#e2e8f0'} />
            <XAxis 
              dataKey="time" 
              stroke={isDark ? '#94a3b8' : '#64748b'}
              label={{ value: 'Time (frames)', position: 'insideBottomRight', offset: -5 }}
            />
            <YAxis 
              stroke={isDark ? '#94a3b8' : '#64748b'}
              label={{ value: 'Pressure (units)', angle: -90, position: 'insideLeft' }}
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
            
            <Line 
              type="monotone" 
              dataKey="mean_force" 
              stroke="#3b82f6" 
              dot={false}
              strokeWidth={2}
              isAnimationActive={false}
              name="Mean Force"
            />
            <Line 
              type="monotone" 
              dataKey="sum_pressure" 
              stroke="#10b981" 
              dot={false}
              strokeWidth={2}
              isAnimationActive={false}
              name="Sum Pressure"
            />
            <Line 
              type="monotone" 
              dataKey="mean" 
              stroke="#f59e0b" 
              dot={false}
              strokeWidth={2}
              isAnimationActive={false}
              name="Mean"
            />
            <Line 
              type="monotone" 
              dataKey="std" 
              stroke="#8b5cf6" 
              dot={false}
              strokeWidth={2}
              isAnimationActive={false}
              name="Std Dev"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Max/Min Value Display */}
      <div className="grid grid-cols-2 gap-4">
        <div className={`p-4 rounded-lg ${isDark ? 'bg-slate-700' : 'bg-gray-100'}`}>
          <p className={`text-sm font-semibold mb-2 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
            Max Pressure
          </p>
          <p className={`text-3xl font-bold ${isDark ? 'text-red-400' : 'text-red-600'}`}>
            {currentFrame.max.toFixed(2)}
          </p>
        </div>
        <div className={`p-4 rounded-lg ${isDark ? 'bg-slate-700' : 'bg-gray-100'}`}>
          <p className={`text-sm font-semibold mb-2 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
            Min Pressure
          </p>
          <p className={`text-3xl font-bold ${isDark ? 'text-green-400' : 'text-green-600'}`}>
            {currentFrame.min.toFixed(2)}
          </p>
        </div>
      </div>
    </div>
  );
};

export default MetricsGraph;
