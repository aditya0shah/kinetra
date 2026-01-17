import React, { useContext } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ThemeContext } from '../context/ThemeContext';
import { WorkoutContext } from '../context/WorkoutContext';
import { FiArrowLeft, FiDownload, FiShare2 } from 'react-icons/fi';
import Header from '../components/Header';
import FootPressureHeatmap from '../components/FootPressureHeatmap';
import SkeletonVisualization3D from '../components/SkeletonVisualization3D';
import TimeSeriesChart from '../components/TimeSeriesChart';

const EpisodeDetail = () => {
  const { isDark, toggleTheme } = useContext(ThemeContext);
  const { workouts } = useContext(WorkoutContext);
  const { id } = useParams();
  const navigate = useNavigate();

  const workout = workouts.find(w => w.id === parseInt(id));

  if (!workout) {
    return (
      <div className={`min-h-screen transition-colors duration-300 ${isDark ? 'bg-slate-900' : 'bg-gradient-to-br from-blue-50 to-green-50'}`}>
        <Header toggleTheme={toggleTheme} isDark={isDark} />
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <button
            onClick={() => navigate('/workouts')}
            className={`flex items-center gap-2 mb-6 px-4 py-2 rounded-lg transition-colors ${
              isDark ? 'bg-slate-800 hover:bg-slate-700 text-blue-400' : 'bg-white hover:bg-gray-50 text-blue-600'
            }`}
          >
            <FiArrowLeft size={20} />
            Back to Workouts
          </button>
          <div className={`text-center py-16 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
            <p className="text-xl">Workout not found</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen transition-colors duration-300 ${isDark ? 'bg-slate-900' : 'bg-gradient-to-br from-blue-50 to-green-50'}`}>
      <Header toggleTheme={toggleTheme} isDark={isDark} />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Back Button */}
        <button
          onClick={() => navigate('/workouts')}
          className={`flex items-center gap-2 mb-6 px-4 py-2 rounded-lg transition-colors ${
            isDark ? 'bg-slate-800 hover:bg-slate-700 text-blue-400' : 'bg-white hover:bg-gray-50 text-blue-600'
          }`}
        >
          <FiArrowLeft size={20} />
          Back to Workouts
        </button>

        {/* Header Section */}
        <div className={`rounded-lg shadow-lg p-8 mb-8 ${isDark ? 'bg-slate-800' : 'bg-white'}`}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className={`text-4xl font-bold mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                {workout.name}
              </h1>
              <p className={`text-lg ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                {workout.type} • {workout.date.toLocaleDateString()} at {workout.date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
            <div className="flex gap-2">
              <button className={`p-3 rounded-lg transition-colors ${
                isDark ? 'bg-slate-700 hover:bg-slate-600 text-blue-400' : 'bg-gray-100 hover:bg-gray-200 text-blue-600'
              }`}>
                <FiDownload size={24} />
              </button>
              <button className={`p-3 rounded-lg transition-colors ${
                isDark ? 'bg-slate-700 hover:bg-slate-600 text-green-400' : 'bg-gray-100 hover:bg-gray-200 text-green-600'
              }`}>
                <FiShare2 size={24} />
              </button>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className={`p-4 rounded-lg ${isDark ? 'bg-slate-700' : 'bg-gray-50'}`}>
              <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Duration</p>
              <p className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>{workout.duration}m</p>
            </div>
            <div className={`p-4 rounded-lg ${isDark ? 'bg-slate-700' : 'bg-gray-50'}`}>
              <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Calories</p>
              <p className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>{workout.calories}</p>
            </div>
            <div className={`p-4 rounded-lg ${isDark ? 'bg-slate-700' : 'bg-gray-50'}`}>
              <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Avg Heart Rate</p>
              <p className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>{workout.avgHeartRate} bpm</p>
            </div>
            <div className={`p-4 rounded-lg ${isDark ? 'bg-slate-700' : 'bg-gray-50'}`}>
              <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Distance</p>
              <p className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>{workout.distance}km</p>
            </div>
          </div>
        </div>

        {/* Main Visualizations */}
        <div className="space-y-8">
          {/* Foot Pressure Heatmap */}
          <FootPressureHeatmap footPressureData={workout.footPressureData} isDark={isDark} />

          {/* Skeleton Visualization */}
          <SkeletonVisualization3D skeletonData={workout.skeletonData} isDark={isDark} />

          {/* Heart Rate Time Series */}
          <div className={`rounded-lg shadow-lg p-6 ${isDark ? 'bg-slate-800' : 'bg-white'}`}>
            <h3 className={`text-lg font-semibold mb-4 ${isDark ? 'text-white' : 'text-gray-800'}`}>
              Heart Rate & Speed Analysis
            </h3>
            <TimeSeriesChart data={workout.timeSeriesData} isDark={isDark} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default EpisodeDetail;
