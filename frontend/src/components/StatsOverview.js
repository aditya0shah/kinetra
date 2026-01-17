import React from 'react';
import { FiActivity, FiTrendingUp, FiClock, FiZap } from 'react-icons/fi';

const StatsOverview = ({ workouts, isDark }) => {
  const totalCalories = workouts.reduce((sum, w) => sum + w.calories, 0);
  const totalDuration = workouts.reduce((sum, w) => sum + w.duration, 0);
  const totalDistance = workouts.reduce((sum, w) => sum + w.distance, 0);
  const avgHeartRate = Math.round(workouts.reduce((sum, w) => sum + w.avgHeartRate, 0) / workouts.length);

  const stats = [
    {
      label: 'Total Calories',
      value: totalCalories,
      unit: 'kcal',
      icon: FiZap,
      color: 'from-orange-400 to-red-500'
    },
    {
      label: 'Total Duration',
      value: totalDuration,
      unit: 'min',
      icon: FiClock,
      color: 'from-blue-400 to-blue-600'
    },
    {
      label: 'Distance Covered',
      value: totalDistance.toFixed(1),
      unit: 'km',
      icon: FiTrendingUp,
      color: 'from-green-400 to-green-600'
    },
    {
      label: 'Avg Heart Rate',
      value: avgHeartRate,
      unit: 'bpm',
      icon: FiActivity,
      color: 'from-pink-400 to-rose-500'
    }
  ];

  return (
    <div className="grid grid-cols-2 gap-4">
      {stats.map((stat, index) => {
        const Icon = stat.icon;
        return (
          <div
            key={index}
            className={`rounded-lg shadow-lg p-6 ${isDark ? 'bg-slate-800' : 'bg-white'} border ${isDark ? 'border-slate-700' : 'border-blue-100'} transition-all hover:shadow-xl`}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className={`text-sm font-medium ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                  {stat.label}
                </p>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className={`text-3xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    {stat.value}
                  </span>
                  <span className={`text-sm font-semibold ${isDark ? 'text-gray-500' : 'text-gray-600'}`}>
                    {stat.unit}
                  </span>
                </div>
              </div>
              <div className={`bg-gradient-to-br ${stat.color} p-3 rounded-lg`}>
                <Icon className="text-white" size={24} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default StatsOverview;
