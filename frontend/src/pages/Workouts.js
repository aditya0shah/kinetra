import React, { useContext } from 'react';
import { Link } from 'react-router-dom';
import { ThemeContext } from '../context/ThemeContext';
import { WorkoutContext } from '../context/WorkoutContext';
import { FiArrowRight, FiCalendar, FiClock, FiZap, FiHeart } from 'react-icons/fi';
import Header from '../components/Header';

const Workouts = () => {
  const { isDark, toggleTheme } = useContext(ThemeContext);
  const { workouts } = useContext(WorkoutContext);

  const formatDate = (date) => {
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className={`min-h-screen transition-colors duration-300 ${isDark ? 'bg-slate-900' : 'bg-gradient-to-br from-blue-50 to-green-50'}`}>
      <Header toggleTheme={toggleTheme} isDark={isDark} />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Title */}
        <div className="mb-8">
          <h1 className={`text-4xl font-bold mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>
            Your Workouts
          </h1>
          <p className={`text-lg ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
            {workouts.length} episodes recorded
          </p>
        </div>

        {/* Workout Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {workouts.map((workout) => (
            <Link
              key={workout.id}
              to={`/episode/${workout.id}`}
              className={`group rounded-lg shadow-lg overflow-hidden transition-all hover:shadow-2xl hover:-translate-y-1 ${
                isDark ? 'bg-slate-800 hover:bg-slate-700' : 'bg-white hover:bg-gray-50'
              }`}
            >
              {/* Gradient Header */}
              <div
                className={`h-32 bg-gradient-to-br ${
                  workout.type === 'Running'
                    ? 'from-red-400 to-red-600'
                    : workout.type === 'Gym'
                    ? 'from-yellow-400 to-orange-600'
                    : workout.type === 'Yoga'
                    ? 'from-purple-400 to-purple-600'
                    : 'from-blue-400 to-blue-600'
                } relative overflow-hidden`}
              >
                <div className="absolute inset-0 opacity-20 bg-pattern"></div>
              </div>

              {/* Content */}
              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className={`text-xl font-bold mb-1 ${isDark ? 'text-white' : 'text-gray-900'} group-hover:text-blue-500 transition`}>
                      {workout.name}
                    </h3>
                    <p className={`text-sm font-medium ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                      {workout.type}
                    </p>
                  </div>
                  <FiArrowRight className={`transition-transform group-hover:translate-x-1 ${isDark ? 'text-blue-400' : 'text-blue-600'}`} size={24} />
                </div>

                {/* Stats */}
                <div className="space-y-2 mb-4">
                  <div className="flex items-center gap-2">
                    <FiCalendar className={`${isDark ? 'text-gray-500' : 'text-gray-400'}`} size={16} />
                    <span className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                      {formatDate(workout.date)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <FiClock className={`${isDark ? 'text-gray-500' : 'text-gray-400'}`} size={16} />
                    <span className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                      {workout.duration} minutes
                    </span>
                  </div>
                </div>

                {/* Bottom Stats */}
                <div className="flex items-center justify-between pt-4 border-t" style={{ borderColor: isDark ? '#1e293b' : '#e5e7eb' }}>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1">
                      <FiZap size={16} className={isDark ? 'text-orange-400' : 'text-orange-600'} />
                      <span className={`text-sm font-semibold ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                        {workout.calories}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <FiHeart size={16} className={isDark ? 'text-red-400' : 'text-red-600'} />
                      <span className={`text-sm font-semibold ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                        {workout.avgHeartRate}
                      </span>
                    </div>
                  </div>
                  <div className={`px-3 py-1 rounded-full text-xs font-semibold ${
                    isDark
                      ? 'bg-green-900 text-green-300'
                      : 'bg-green-100 text-green-800'
                  }`}>
                    Completed
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>

        {workouts.length === 0 && (
          <div className={`text-center py-16 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
            <p className="text-xl">No workouts recorded yet. Start your first session!</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Workouts;
