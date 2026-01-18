import React, { useContext, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ThemeContext } from '../context/ThemeContext';
import { WorkoutContext } from '../context/WorkoutContext';
import { FiArrowRight, FiCalendar, FiTrash2 } from 'react-icons/fi';
import Header from '../components/Header';
import { getWorkouts, deleteWorkout as apiDeleteWorkout } from '../services/api';

const Workouts = () => {
  const { isDark, toggleTheme } = useContext(ThemeContext);
  const { isWorkoutInProgress } = useContext(WorkoutContext);
  const [workouts, setWorkouts] = useState([]);

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

  const handleDelete = async (e, workoutId) => {
    e.preventDefault();
    e.stopPropagation();
    if (window.confirm('Are you sure you want to delete this workout?')) {
      try {
        await apiDeleteWorkout(workoutId);
        setWorkouts(workouts.filter(w => w._id !== workoutId && w.id !== workoutId));
      } catch (err) {
        console.error('Failed to delete workout:', err);
        alert('Failed to delete workout');
      }
    }
  };

  const formatDate = (date) => {
    // Handle cases where date is undefined or invalid
    if (!date) return 'Recently';
    
    const parsedDate = new Date(date);
    if (isNaN(parsedDate.getTime())) return 'Recently';
    
    const now = new Date();
    const diffTime = Math.abs(now - parsedDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return parsedDate.toLocaleDateString();
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
            <div
              key={workout._id || workout.id}
              className={`group relative rounded-lg shadow-lg overflow-hidden transition-all hover:shadow-2xl hover:-translate-y-1 ${
                isDark ? 'bg-slate-800 hover:bg-slate-700' : 'bg-white hover:bg-gray-50'
              }`}
            >
              <Link
                to={`/episode/${workout._id || workout.id}`}
                className="block h-full"
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
                </div>

                {/* Bottom Stats */}
                <div className="flex items-center justify-end pt-4 border-t" style={{ borderColor: isDark ? '#1e293b' : '#e5e7eb' }}>
                  <div className={`px-3 py-1 rounded-full text-xs font-semibold ${
                    isWorkoutInProgress(workout._id || workout.id)
                      ? isDark
                        ? 'bg-blue-900 text-blue-300'
                        : 'bg-blue-100 text-blue-800'
                      : workout.status === 'completed'
                      ? isDark
                        ? 'bg-green-900 text-green-300'
                        : 'bg-green-100 text-green-800'
                      : isDark
                      ? 'bg-gray-700 text-gray-300'
                      : 'bg-gray-200 text-gray-800'
                  }`}>
                    {isWorkoutInProgress(workout._id || workout.id)
                      ? '🔴 In Progress'
                      : workout.status === 'completed'
                      ? 'Completed'
                      : 'Incomplete'}
                  </div>
                </div>
              </div>
              </Link>

              {/* Delete Button */}
              <button
                onClick={(e) => handleDelete(e, workout._id || workout.id)}
                className={`absolute top-4 right-4 p-2 rounded-lg transition-all opacity-0 group-hover:opacity-100 ${
                  isDark
                    ? 'bg-red-900 hover:bg-red-800 text-red-200'
                    : 'bg-red-100 hover:bg-red-200 text-red-700'
                }`}
                title="Delete workout"
              >
                <FiTrash2 size={18} />
              </button>
            </div>
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
