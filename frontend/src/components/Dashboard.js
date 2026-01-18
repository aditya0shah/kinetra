import React, { useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { ThemeContext } from '../context/ThemeContext';
import { FiPlayCircle } from 'react-icons/fi';
import Header from './Header';
import { createWorkout } from '../services/api';
import './Dashboard.css';

const Dashboard = () => {
  const { isDark, toggleTheme } = useContext(ThemeContext);
  const navigate = useNavigate();

  return (
    <div className={`min-h-screen transition-colors duration-300 ${isDark ? 'bg-slate-900' : 'bg-gradient-to-br from-blue-50 to-green-50'}`}>
      {/* Header */}
      <Header toggleTheme={toggleTheme} isDark={isDark} />

      {/* Main Content - Centered Start Button */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 flex items-center justify-center min-h-[calc(100vh-80px)]">
        <div className={`rounded-lg shadow-lg p-12 max-w-md w-full ${isDark ? 'bg-gradient-to-br from-blue-900 to-green-900' : 'bg-gradient-to-br from-blue-500 to-green-500'}`}>
          <h1 className="text-white font-bold text-3xl mb-4 text-center">Kinetra</h1>
          <h3 className="text-white font-semibold text-lg mb-6 text-center">Start New Session</h3>
          <button
            onClick={async () => {
              try {
                // Create a new workout via API
                const workoutData = {
                  name: 'New Workout Session',
                  type: 'Running',
                  status: 'in-progress',
                  videoUrl: 'https://www.w3schools.com/html/mov_bbb.mp4',
                  timeSeriesData: [],
                  footPressureData: [],
                  skeletonData: []
                };

                const newWorkout = await createWorkout(workoutData);
                console.log('Created workout:', newWorkout);

                // Navigate to the new episode detail page
                navigate(`/episode/${newWorkout._id || newWorkout.id}`);
              } catch (e) {
                console.error('Failed to create workout:', e);
                console.error('Error message:', e.message);
                alert(`Failed to start session: ${e.message}`);
              }
            }}
            className="w-full bg-white text-blue-600 font-semibold py-4 px-6 rounded-lg hover:shadow-lg transition flex items-center justify-center gap-2 text-lg"
          >
            <FiPlayCircle size={24} />
            Start Tracking
          </button>
          <div className="mt-6 text-white text-sm opacity-90 text-center">
            <p>Track your fitness metrics in real-time</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
