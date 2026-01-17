import React from 'react';
import { FiClock, FiZap, FiHeart, FiPlay } from 'react-icons/fi';

const WorkoutEpisodesList = ({ workouts, selectedWorkout, onSelectWorkout, isDark }) => {
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
    <div className={`rounded-lg shadow-lg p-6 ${isDark ? 'bg-slate-800' : 'bg-white'}`}>
      <h2 className={`text-xl font-semibold mb-6 ${isDark ? 'text-white' : 'text-gray-800'}`}>
        Recent Workouts & Episodes
      </h2>

      <div className="space-y-3">
        {workouts.map((workout) => (
          <button
            key={workout.id}
            onClick={() => onSelectWorkout(workout)}
            className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
              selectedWorkout?.id === workout.id
                ? isDark
                  ? 'bg-slate-700 border-blue-500 shadow-lg'
                  : 'bg-blue-50 border-blue-400 shadow-lg'
                : isDark
                ? 'bg-slate-700 border-slate-600 hover:border-blue-400'
                : 'bg-gray-50 border-gray-200 hover:border-blue-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    workout.type === 'Running'
                      ? 'bg-gradient-to-br from-red-400 to-red-600'
                      : workout.type === 'Gym'
                      ? 'bg-gradient-to-br from-yellow-400 to-orange-600'
                      : workout.type === 'Yoga'
                      ? 'bg-gradient-to-br from-purple-400 to-purple-600'
                      : 'bg-gradient-to-br from-blue-400 to-blue-600'
                  }`}>
                    <FiPlay className="text-white" size={20} fill="currentColor" />
                  </div>

                  <div>
                    <h3 className={`font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                      {workout.name}
                    </h3>
                    <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                      {workout.type} • {formatDate(workout.date)}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4 text-right">
                <div className="hidden sm:flex flex-col items-end gap-2">
                  <div className="flex items-center gap-1">
                    <FiClock size={16} className={isDark ? 'text-blue-400' : 'text-blue-600'} />
                    <span className={`text-sm font-semibold ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                      {workout.duration}m
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <FiZap size={16} className={isDark ? 'text-orange-400' : 'text-orange-600'} />
                    <span className={`text-sm font-semibold ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                      {workout.calories}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1 px-3 py-1 rounded-full"
                  style={{
                    backgroundColor: selectedWorkout?.id === workout.id
                      ? isDark ? '#064e3b' : '#d1fae5'
                      : isDark ? '#334155' : '#f3f4f6'
                  }}>
                  <FiHeart size={14} className={isDark ? 'text-green-400' : 'text-green-600'} />
                  <span className={`text-xs font-semibold ${isDark ? 'text-green-400' : 'text-green-700'}`}>
                    {workout.avgHeartRate}
                  </span>
                </div>
              </div>
            </div>
          </button>
        ))}
      </div>

      {workouts.length === 0 && (
        <div className={`text-center py-12 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
          <p>No workouts recorded yet. Start your first session!</p>
        </div>
      )}
    </div>
  );
};

export default WorkoutEpisodesList;
