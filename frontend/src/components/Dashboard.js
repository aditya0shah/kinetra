import React, { useContext, useState } from 'react';
import { ThemeContext } from '../context/ThemeContext';
import { WorkoutContext } from '../context/WorkoutContext';
import { FiPlayCircle } from 'react-icons/fi';
import Header from './Header';
import StatsOverview from './StatsOverview';
import ActiveSession from './ActiveSession';
import TimeSeriesChart from './TimeSeriesChart';
import VideoPlayer from './VideoPlayer';
import WorkoutEpisodesList from './WorkoutEpisodesList';
import './Dashboard.css';

const Dashboard = () => {
  const { isDark, toggleTheme } = useContext(ThemeContext);
  const { workouts, activeSession } = useContext(WorkoutContext);
  const [selectedWorkout, setSelectedWorkout] = useState(workouts[0]);
  const [showNewSession, setShowNewSession] = useState(false);

  return (
    <div className={`min-h-screen transition-colors duration-300 ${isDark ? 'bg-slate-900' : 'bg-gradient-to-br from-blue-50 to-green-50'}`}>
      {/* Header */}
      <Header toggleTheme={toggleTheme} isDark={isDark} />

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Top Section - Stats and Active Session */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          {/* Left Column - Stats Overview */}
          <div className="lg:col-span-2">
            <StatsOverview workouts={workouts} isDark={isDark} />
          </div>

          {/* Right Column - Active Session */}
          <div>
            {activeSession ? (
              <ActiveSession isDark={isDark} />
            ) : (
              <div className={`rounded-lg shadow-lg p-6 h-full ${isDark ? 'bg-gradient-to-br from-blue-900 to-green-900' : 'bg-gradient-to-br from-blue-500 to-green-500'}`}>
                <h3 className="text-white font-semibold text-lg mb-4">Start New Session</h3>
                <button
                  onClick={() => setShowNewSession(!showNewSession)}
                  className="w-full bg-white text-blue-600 font-semibold py-3 px-4 rounded-lg hover:shadow-lg transition flex items-center justify-center gap-2"
                >
                  <FiPlayCircle size={20} />
                  Start Tracking
                </button>
                <div className="mt-4 text-white text-sm opacity-90">
                  <p>Track your fitness in real-time</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Middle Section - Visualizations */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          {/* Time Series Chart */}
          <div className="lg:col-span-2">
            <div className={`rounded-lg shadow-lg p-6 ${isDark ? 'bg-slate-800' : 'bg-white'}`}>
              <h3 className={`text-lg font-semibold mb-4 ${isDark ? 'text-white' : 'text-gray-800'}`}>
                Workout Analysis
              </h3>
              {selectedWorkout && <TimeSeriesChart data={selectedWorkout.timeSeriesData} isDark={isDark} />}
            </div>
          </div>

          {/* Video Player */}
          <div>
            <div className={`rounded-lg shadow-lg p-4 ${isDark ? 'bg-slate-800' : 'bg-white'}`}>
              <h3 className={`text-lg font-semibold mb-4 ${isDark ? 'text-white' : 'text-gray-800'}`}>
                Session Recording
              </h3>
              {selectedWorkout && <VideoPlayer videoUrl={selectedWorkout.videoUrl} isDark={isDark} />}
            </div>
          </div>
        </div>

        {/* Bottom Section - Workout Episodes */}
        <div>
          <WorkoutEpisodesList workouts={workouts} selectedWorkout={selectedWorkout} onSelectWorkout={setSelectedWorkout} isDark={isDark} />
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
