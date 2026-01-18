import React, { useContext } from 'react';
import { ThemeContext } from '../context/ThemeContext';

const Dashboard = () => {
  const { isDark } = useContext(ThemeContext);

  return (
    <div className={`p-8 ${isDark ? 'text-white' : 'text-gray-900'}`}>
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">Dashboard</h1>
        <p className={`text-lg ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>
          Welcome to Kinetra Fitness Tracking
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Quick Stats */}
        <div className={`p-6 rounded-lg ${isDark ? 'bg-slate-800' : 'bg-white'} shadow-lg`}>
          <h3 className="text-xl font-semibold mb-2">Total Workouts</h3>
          <p className="text-3xl font-bold text-blue-500">0</p>
        </div>

        <div className={`p-6 rounded-lg ${isDark ? 'bg-slate-800' : 'bg-white'} shadow-lg`}>
          <h3 className="text-xl font-semibold mb-2">Active Sessions</h3>
          <p className="text-3xl font-bold text-green-500">0</p>
        </div>

        <div className={`p-6 rounded-lg ${isDark ? 'bg-slate-800' : 'bg-white'} shadow-lg`}>
          <h3 className="text-xl font-semibold mb-2">AI Coach</h3>
          <p className="text-3xl font-bold text-purple-500">Ready</p>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
