import React, { useContext, useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ThemeContext } from '../context/ThemeContext';
import { WorkoutContext } from '../context/WorkoutContext';
import { FiArrowLeft, FiDownload, FiShare2, FiPause, FiPlay } from 'react-icons/fi';
import Header from '../components/Header';
import FootPressureHeatmap from '../components/FootPressureHeatmap';
import SkeletonVisualization3D from '../components/SkeletonVisualization3D';
import TimeSeriesChart from '../components/TimeSeriesChart';
import RegionStatsDisplay from '../components/RegionStatsDisplay';
import MetricsGraph from '../components/MetricsGraph';
import { startMockDeviceStream, convertToMatrix } from '../services/mockdevice';
import { sendstat, getWorkout, updateWorkout as apiUpdateWorkout } from '../services/api';

const EpisodeDetail = () => {
  const { isDark, toggleTheme } = useContext(ThemeContext);
  const { workouts } = useContext(WorkoutContext);
  const { id } = useParams();
  const navigate = useNavigate();
  const [workoutDetail, setWorkoutDetail] = useState(null);
  const [pressureData, setPressureData] = useState([]);
  const [statsData, setStatsData] = useState(null);
  const [timeSeriesStats, setTimeSeriesStats] = useState([]); // Accumulate time-series stats for graphing
  const stopStreamRef = useRef(null);
  const [isPaused, setIsPaused] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);

  const workout = workoutDetail || workouts.find(w => (w._id && w._id === id) || (w.id && w.id === parseInt(id)));

  // Fetch workout details from backend when navigating to a specific episode
  useEffect(() => {
    let mounted = true;
    const fetchDetail = async () => {
      try {
        const detail = await getWorkout(id);
        if (mounted) setWorkoutDetail(detail);
      } catch (e) {
        console.warn('Failed to fetch workout detail:', e.message);
      }
    };
    if (id) fetchDetail();
    return () => { mounted = false; };
  }, [id]);

  // Start/manage mock device stream on component mount and pause state changes
  useEffect(() => {
    if (!workout || workout.status !== 'in-progress' || isPaused) {
      // Stop stream if paused
      if (stopStreamRef.current) {
        stopStreamRef.current();
        stopStreamRef.current = null;
      }
      return;
    }

    const handleDeviceData = async (frameData) => {
      // Update local pressure visualization with real-time pressure data
      setPressureData(frameData.nodes);

      // Send data to backend for calculation
      try {
        const matrix = convertToMatrix(frameData);
        const workoutId = workout._id || workout.id;
        const response = await sendstat({ matrix, nodes: frameData.nodes, timestamp: frameData.timestamp }, workoutId);
        
        // Receive and store calculated stats from backend
        if (response && response.data && response.data.stats) {
          setStatsData(response.data.stats);
          
          // Accumulate time-series data for graphing
          setTimeSeriesStats(prev => [...prev, {
            timestamp: frameData.timestamp || Date.now(),
            ...response.data.stats
          }]);
          
          console.log('Received calculated stats:', response.data.stats);
        }
      } catch (e) {
        console.warn('Failed to send stats to backend:', e.message);
      }
    };

    // Start streaming every 250ms (1/4 second) as specified
    const stop = startMockDeviceStream(handleDeviceData, 250);
    stopStreamRef.current = stop;

    // Cleanup on unmount or when workout completes or paused
    return () => {
      if (stop) stop();
    };
  }, [workout, isPaused]);

  const handlePauseToggle = () => {
    setIsPaused(!isPaused);
  };

  const handleCompleteWorkout = async () => {
    if (!workout) return;
    try {
      setIsCompleting(true);
      const wid = workout._id || workout.id;
      const updated = await apiUpdateWorkout(wid, { status: 'completed', completedAt: new Date().toISOString() });
      if (updated) {
        setWorkoutDetail(updated);
      } else {
        setWorkoutDetail({ ...(workoutDetail || workout), status: 'completed', completedAt: new Date().toISOString() });
      }
    } catch (e) {
      console.warn('Failed to complete workout:', e.message);
      alert('Failed to complete workout');
    } finally {
      setIsCompleting(false);
    }
  };

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
        {/* Top Control Bar */}
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => navigate('/workouts')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
              isDark ? 'bg-slate-800 hover:bg-slate-700 text-blue-400' : 'bg-white hover:bg-gray-50 text-blue-600'
            }`}
          >
            <FiArrowLeft size={20} />
            Back to Workouts
          </button>

          {/* Controls */}
          <div className="flex items-center gap-3">
            {workout.status === 'in-progress' && (
              <button
                onClick={handlePauseToggle}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all ${
                  isPaused
                    ? isDark
                      ? 'bg-green-900 hover:bg-green-800 text-green-300'
                      : 'bg-green-100 hover:bg-green-200 text-green-700'
                    : isDark
                    ? 'bg-orange-900 hover:bg-orange-800 text-orange-300'
                    : 'bg-orange-100 hover:bg-orange-200 text-orange-700'
                }`}
              >
                {isPaused ? (
                  <>
                    <FiPlay size={20} />
                    Resume
                  </>
                ) : (
                  <>
                    <FiPause size={20} />
                    Pause
                  </>
                )}
              </button>
            )}

            {workout.status !== 'completed' && (
              <button
                onClick={handleCompleteWorkout}
                disabled={isCompleting}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all ${
                  isDark ? 'bg-green-700 hover:bg-green-600 text-white' : 'bg-green-500 hover:bg-green-600 text-white'
                } ${isCompleting ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                {isCompleting ? 'Completing…' : 'Complete Workout'}
              </button>
            )}
          </div>
        </div>

        {/* Pause Indicator */}
        {isPaused && (
          <div className={`mb-6 p-4 rounded-lg border-2 text-center ${
            isDark
              ? 'bg-orange-900 border-orange-700 text-orange-200'
              : 'bg-orange-100 border-orange-300 text-orange-800'
          }`}>
            <p className="font-semibold">⏸ Workout paused - Data streaming stopped</p>
          </div>
        )}

        {/* Header Section */}
        <div className={`rounded-lg shadow-lg p-8 mb-8 ${isDark ? 'bg-slate-800' : 'bg-white'}`}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className={`text-4xl font-bold mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                {workout.name}
              </h1>
              <p className={`text-lg ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                {workout.type} • {new Date(workout.date || new Date()).toLocaleDateString()} at {new Date(workout.date || new Date()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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
          <FootPressureHeatmap 
            footPressureData={pressureData.length > 0 ? pressureData : workout.footPressureData} 
            isDark={isDark}
            isPaused={isPaused}
            onPauseToggle={handlePauseToggle}
          />

          {/* Region Stats Display - Shows calculated stats from backend */}
          <RegionStatsDisplay statsData={statsData} isDark={isDark} />

          {/* Metrics Graph - Time-series line graphs */}
          <MetricsGraph timeSeriesStats={timeSeriesStats} isDark={isDark} />

          {/* Skeleton Visualization */}
          {Array.isArray(workout.skeletonData) && workout.skeletonData.length > 0 ? (
            <SkeletonVisualization3D skeletonData={workout.skeletonData} isDark={isDark} />
          ) : (
            <div className={`rounded-lg shadow-lg p-6 ${isDark ? 'bg-slate-800 text-gray-300' : 'bg-white text-gray-700'}`}>
              No skeleton data available for this workout.
            </div>
          )}

          {/* Heart Rate Time Series */}
          {Array.isArray(workout.timeSeriesData) && workout.timeSeriesData.length > 0 && (
            <div className={`rounded-lg shadow-lg p-6 ${isDark ? 'bg-slate-800' : 'bg-white'}`}>
              <h3 className={`text-lg font-semibold mb-4 ${isDark ? 'text-white' : 'text-gray-800'}`}>
                Heart Rate & Speed Analysis
              </h3>
              <TimeSeriesChart data={workout.timeSeriesData} isDark={isDark} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default EpisodeDetail;
