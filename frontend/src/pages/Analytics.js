import React, { useContext, useState, useEffect } from 'react';
import { ThemeContext } from '../context/ThemeContext';
import { FiTarget } from 'react-icons/fi';
import Header from '../components/Header';
import { getWorkouts } from '../services/api';

const Analytics = () => {
  const { isDark, toggleTheme } = useContext(ThemeContext);
  const [workouts, setWorkouts] = useState([]);

  // Fetch workouts from backend on component mount
  useEffect(() => {
    const fetchWorkouts = async () => {
      try {
        const data = await getWorkouts();
        setWorkouts(data || []);
      } catch (e) {
        console.warn('Failed to fetch workouts:', e.message);
        setWorkouts([]);
      }
    };
    fetchWorkouts();
  }, []);

  const totalWorkouts = workouts.length;
  const stats = [
    { label: 'Total Workouts', value: totalWorkouts, icon: FiTarget }
  ];

  return (
    <div className={`min-h-screen transition-colors duration-300 ${isDark ? 'bg-slate-900' : 'bg-gradient-to-br from-blue-50 to-green-50'}`}>
      <Header toggleTheme={toggleTheme} isDark={isDark} />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className={`text-4xl font-bold mb-8 ${isDark ? 'text-white' : 'text-gray-900'}`}>
          Analytics
        </h1>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {stats.map((stat, index) => {
            const Icon = stat.icon;
            return (
              <div
                key={index}
                className={`rounded-lg shadow-lg p-6 ${isDark ? 'bg-slate-800' : 'bg-white'}`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className={`text-sm font-medium ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                      {stat.label}
                    </p>
                    <p className={`text-3xl font-bold mt-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                      {stat.value}
                    </p>
                  </div>
                  <div className="bg-gradient-to-br from-blue-500 to-green-500 p-3 rounded-lg">
                    <Icon className="text-white" size={24} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Detailed Analytics */}
        <div className={`rounded-lg shadow-lg p-8 ${isDark ? 'bg-slate-800' : 'bg-white'}`}>
          <h2 className={`text-2xl font-bold mb-6 ${isDark ? 'text-white' : 'text-gray-900'}`}>
            Workout Breakdown
          </h2>

          <div className="space-y-4">
            {workouts.map((workout) => (
              <div
                key={workout._id || workout.id}
                className={`p-4 rounded-lg ${isDark ? 'bg-slate-700' : 'bg-gray-50'}`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className={`font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                      {workout.name}
                    </p>
                    <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                      {workout.type} • {new Date(workout.date || new Date()).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Analytics;
