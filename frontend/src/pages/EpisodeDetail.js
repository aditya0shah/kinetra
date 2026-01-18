import React, { useContext, useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ThemeContext } from '../context/ThemeContext';
import { WorkoutContext } from '../context/WorkoutContext';
import { FiArrowLeft, FiDownload, FiShare2 } from 'react-icons/fi';
import Header from '../components/Header';
import FootPressureHeatmap from '../components/FootPressureHeatmap';
import TimeSeriesChart from '../components/TimeSeriesChart';
import RegionStatsDisplay from '../components/RegionStatsDisplay';
import MetricsGraph from '../components/MetricsGraph';
import { decodeFrameU16 } from '../services/ble';
import { sendstat, getWorkout, updateWorkout as apiUpdateWorkout } from '../services/api';
import { 
  connectWebSocket, 
  disconnectWebSocket, 
  joinSession, 
  sendPressureFrame, 
  onFrameProcessed, 
  offFrameProcessed,
  onStatsUpdate,
  offStatsUpdate,
  leaveSession 
} from '../services/websocket';

const EpisodeDetail = () => {
  const { isDark, toggleTheme } = useContext(ThemeContext);
  const { hasActiveWorkout, startWorkout, stopWorkout, inProgressWorkoutId } = useContext(WorkoutContext);
  const { id } = useParams();
  const navigate = useNavigate();
  const [workoutDetail, setWorkoutDetail] = useState(null);
  const [pressureData, setPressureData] = useState([]);
  const [gridDims, setGridDims] = useState({ rows: 4, cols: 4 });
  const [statsData, setStatsData] = useState(null);
  const [timeSeriesStats, setTimeSeriesStats] = useState([]); // Accumulate time-series stats for graphing
  const [pressureMatrixData, setPressureMatrixData] = useState([]); // Accumulate raw pressure matrix data to save to DB
  const stopStreamRef = useRef(null);
  const [isCompleting, setIsCompleting] = useState(false);
  const [canStart, setCanStart] = useState(true);
  const isStreamActiveRef = useRef(false); // track live streaming lifecycle
  const frameProcessedHandlerRef = useRef(null); // stable WS listener for cleanup

  const workout = workoutDetail;

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

  // Start/manage mock device stream and WebSocket connection
  useEffect(() => {
    if (!workout || workout.status !== 'in-progress') {
      return;
    }

    // Check if we should start the stream (and mark workout as in-progress)
    if (canStart && !hasActiveWorkout()) {
      startWorkout(workout._id || workout.id);
      setCanStart(false);
    } else if (hasActiveWorkout() && (workout._id || workout.id) !== inProgressWorkoutId) {
      // Another workout is running; show alert
      alert('Another workout is already in progress. Please complete it first.');
      navigate('/workouts');
      return;
    }

    // mark stream active
    isStreamActiveRef.current = true;
    const workoutId = workout._id || workout.id;

    const setupWebSocket = async () => {
      try {
        // Connect to WebSocket
        const socket = connectWebSocket();
        console.log('WebSocket connection initiated');

        // Join session
        await joinSession(workoutId);
        console.log('Joined WebSocket session for workout:', workoutId);

        // Listen for frame processing responses with stable handler
        const handler = (data) => {
          console.log('>>> Received frame_processed event:', data);
          if (data && data.stats) {
            setStatsData(data.stats);
            setTimeSeriesStats(prev => [...prev, {
              timestamp: data.timestamp || Date.now(),
              ...data.stats
            }]);
            console.log('Stats updated from WebSocket:', data.stats);
          }
        };
        frameProcessedHandlerRef.current = handler;
        onFrameProcessed(handler);

        // Listen to MongoDB change stream updates relayed by server
        const statsHandler = (data) => {
          console.log('>>> Received stats_update event:', data);
          if (data && data.stats) {
            setStatsData(data.stats);
            setTimeSeriesStats(prev => [...prev, {
              timestamp: data.timestamp || Date.now(),
              ...data.stats
            }]);
            console.log('Stats updated from MongoDB change stream:', data.stats);
          }
        };
        onStatsUpdate(statsHandler);
        // Save for cleanup
        if (!frameProcessedHandlerRef.current) frameProcessedHandlerRef.current = handler;
      } catch (e) {
        console.error('Failed to setup WebSocket:', e);
      }
    };

    setupWebSocket();

    const handleDeviceData = (frameData) => {
      if (!isStreamActiveRef.current) return;

      // Update local pressure visualization with real-time pressure data
      setPressureData(frameData.nodes);
      console.log('>>> Sending pressure frame to backend:', { nodes: frameData.nodes.length });

      try {
        const matrix = convertToMatrix(frameData);
        const timestamp = frameData.timestamp || Date.now();

        // Accumulate raw pressure matrix data to save to MongoDB later
        setPressureMatrixData(prev => [...prev, {
          timestamp: timestamp,
          matrix: matrix,
          nodes: frameData.nodes
        }]);

        // Send to backend via WebSocket for real-time stats calculation
        console.log('>>> Emitting pressure_frame via WebSocket');
        sendPressureFrame(workoutId, matrix, frameData.nodes, timestamp);
      } catch (e) {
        console.error('Failed to send pressure frame:', e);
      }
    };

    // Start streaming every 250ms (1/4 second)
    const stop = startMockDeviceStream(handleDeviceData, 250);
    stopStreamRef.current = stop;

    // Cleanup on unmount
    return () => {
      isStreamActiveRef.current = false;
      if (stop) stop();
    };
  }, [workout, canStart, hasActiveWorkout, startWorkout, navigate, inProgressWorkoutId]);

  const handleCompleteWorkout = async () => {
    if (!workout) return;
    try {
      setIsCompleting(true);

      // 1. Stop the device stream
      if (stopStreamRef.current) {
        stopStreamRef.current();
        stopStreamRef.current = null;
      }

      // 2. Mark stream inactive, remove WS listeners, leave session and disconnect
      const workoutId = workout._id || workout.id;
      isStreamActiveRef.current = false;
      if (frameProcessedHandlerRef.current) {
        offFrameProcessed(frameProcessedHandlerRef.current);
        offStatsUpdate(frameProcessedHandlerRef.current); // remove stats listener if set
        frameProcessedHandlerRef.current = null;
      }
      leaveSession(workoutId);
      disconnectWebSocket();

      // 3. Stop in-progress tracking globally
      stopWorkout();

      // 4. Update workout status to completed in MongoDB and save accumulated pressure data
      await apiUpdateWorkout(workoutId, { 
        status: 'completed', 
        completedAt: new Date().toISOString(),
        timeSeriesData: pressureMatrixData  // Save all accumulated pressure matrix data
      });

      // 5. Navigate to workouts page
      navigate('/workouts');
    } catch (e) {
      console.warn('Failed to complete workout:', e.message);
      alert('Failed to complete workout. Please try again.');
      setIsCompleting(false);
    }
  };

  const hasPressureData = Array.isArray(pressureData)
    ? pressureData.length > 0
    : Array.isArray(pressureData?.frames) && pressureData.frames.length > 0;
  const displayPressureData = hasPressureData ? pressureData : workout?.footPressureData;

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
            footPressureData={displayPressureData} 
            isDark={isDark}
          />

          {/* Region Stats Display - Shows calculated stats from backend */}
          <RegionStatsDisplay statsData={statsData} isDark={isDark} />

          {/* Metrics Graph - Time-series line graphs */}
          <MetricsGraph timeSeriesStats={timeSeriesStats} isDark={isDark} />

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
