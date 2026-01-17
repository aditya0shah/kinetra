import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';

const TimeSeriesChart = ({ data, isDark }) => {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke={isDark ? '#334155' : '#e0e7ff'}
        />
        <XAxis
          dataKey="time"
          stroke={isDark ? '#94a3b8' : '#666'}
          style={{ fontSize: '12px' }}
        />
        <YAxis
          stroke={isDark ? '#94a3b8' : '#666'}
          style={{ fontSize: '12px' }}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: isDark ? '#1e293b' : '#ffffff',
            border: `2px solid ${isDark ? '#3b82f6' : '#3b82f6'}`,
            borderRadius: '8px',
            color: isDark ? '#ffffff' : '#000000'
          }}
          cursor={{ stroke: isDark ? '#64748b' : '#cbd5e1' }}
        />
        <Legend
          wrapperStyle={{
            color: isDark ? '#e2e8f0' : '#1f2937'
          }}
        />
        <Line
          type="monotone"
          dataKey="heartRate"
          stroke="#ef4444"
          strokeWidth={2}
          dot={{ fill: '#ef4444', r: 4 }}
          activeDot={{ r: 6 }}
          name="Heart Rate (bpm)"
        />
        <Line
          type="monotone"
          dataKey="speed"
          stroke="#10b981"
          strokeWidth={2}
          dot={{ fill: '#10b981', r: 4 }}
          activeDot={{ r: 6 }}
          name="Speed (km/h)"
        />
      </LineChart>
    </ResponsiveContainer>
  );
};

export default TimeSeriesChart;
