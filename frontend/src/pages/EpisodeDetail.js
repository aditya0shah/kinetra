import React, { useContext, useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ThemeContext } from '../context/ThemeContext';
import { WorkoutContext } from '../context/WorkoutContext';
import { BluetoothContext } from '../context/BluetoothContext';
import { FiArrowLeft, FiDownload, FiShare2 } from 'react-icons/fi';
import Header from '../components/Header';
import FootPressureHeatmap from '../components/FootPressureHeatmap';
import TimeSeriesChart from '../components/TimeSeriesChart';
import RegionStatsDisplay from '../components/RegionStatsDisplay';
import MetricsGraph from '../components/MetricsGraph';
import { decodeFrameU16 } from '../services/ble';
import { getWorkout, updateWorkout as apiUpdateWorkout } from '../services/api';
import CONFIG from '../config';
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
  const { isConnected, startStream: startBleStream } = useContext(BluetoothContext);
  const { id } = useParams();
  const navigate = useNavigate();
  const [workoutDetail, setWorkoutDetail] = useState(null);
  const [pressureData, setPressureData] = useState([]);
  const [, setGridDims] = useState({ rows: 4, cols: 4 });
  const [statsData, setStatsData] = useState(null);
  const [timeSeriesStats, setTimeSeriesStats] = useState([]); // Accumulate time-series stats for graphing
  const [pressureMatrixData, setPressureMatrixData] = useState([]); // Accumulate raw pressure matrix data to save to DB
  const stopStreamRef = useRef(null);
  const [isCompleting, setIsCompleting] = useState(false);
  const [canStart, setCanStart] = useState(true);
  const isStreamActiveRef = useRef(false); // track live streaming lifecycle
  const frameProcessedHandlerRef = useRef(null); // stable WS listener for cleanup
  const [isPaused, setIsPaused] = useState(false);
  const isPausedRef = useRef(false); // ref for immediate access in callbacks
  
  // Replay state for completed workouts
  const [isReplaying, setIsReplaying] = useState(false);
  const [replayIndex, setReplayIndex] = useState(0);
  const [isReplayPlaying, setIsReplayPlaying] = useState(false);
  const replayIntervalRef = useRef(null);

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

  // Pause workout on component unmount or page navigation (don't complete it)
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (isStreamActiveRef.current && !isPausedRef.current && workout && workout.status === 'in-progress') {
        // Pause the workout instead of completing it
        handlePauseWorkout(true);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      // Pause (not complete) on unmount if still in progress
      if (isStreamActiveRef.current && !isPausedRef.current && workout && workout.status === 'in-progress') {
        console.log('⚠️ Component unmounting, pausing workout...');
        handlePauseWorkout(true);
      }
    };
  }, [workout, handlePauseWorkout]);

  // Start/manage BLE device stream and WebSocket connection
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
        connectWebSocket();
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

    const handleBlePayload = (payload) => {
      if (!isStreamActiveRef.current || isPausedRef.current) return;

      try {
        const { matrix } = decodeFrameU16(payload, {
          minV: CONFIG.BLE.MIN_V,
          maxV: CONFIG.BLE.MAX_V,
          rows: CONFIG.BLE.ROWS,
          cols: CONFIG.BLE.COLS,
        });
        setGridDims({ rows: CONFIG.BLE.ROWS, cols: CONFIG.BLE.COLS });

        // Update local pressure visualization with real-time pressure data
        setPressureData({ frames: [matrix] });
        const timestamp = Date.now();

        // Accumulate raw pressure matrix data to save to MongoDB later
        setPressureMatrixData(prev => [...prev, {
          timestamp: timestamp,
          matrix: matrix,
        }]);

        // Send to backend via WebSocket for real-time stats calculation
        console.log('>>> Emitting pressure_frame via WebSocket');
        sendPressureFrame(workoutId, matrix, undefined, timestamp);
      } catch (e) {
        console.error('Failed to process BLE payload:', e);
      }
    };

    const startBleStreamInternal = async () => {
      if (!isConnected) {
        console.warn('BLE device not connected. Streaming disabled.');
        return;
      }
      try {
        const payloadLen = 4 + CONFIG.BLE.ROWS * CONFIG.BLE.COLS * 2;
        const stop = await startBleStream({
          payloadLen,
          useSequence: CONFIG.BLE.USE_SEQUENCE,
          onPayload: handleBlePayload,
        });
        stopStreamRef.current = stop;
      } catch (e) {
        console.error('Failed to start BLE stream:', e);
      }
    };

    startBleStreamInternal();

    // Cleanup on unmount
    return () => {
      isStreamActiveRef.current = false;
      if (stopStreamRef.current) {
        stopStreamRef.current();
        stopStreamRef.current = null;
      }
    };
  }, [workout, canStart, hasActiveWorkout, startWorkout, navigate, inProgressWorkoutId, isConnected, startBleStream]);

  const handlePauseWorkout = useCallback(async (skipStateUpdate = false) => {
    if (!workout) return;
    const workoutId = workout._id || workout.id;
    
    console.log('⏸️ Pausing workout:', workoutId);
    
    // Stop the BLE stream
    if (stopStreamRef.current) {
      stopStreamRef.current();
      stopStreamRef.current = null;
      console.log('✅ BLE stream stopped');
    }
    
    // Pause WebSocket listeners but keep connection
    isPausedRef.current = true;
    if (!skipStateUpdate) {
      setIsPaused(true);
    }
    
    // Leave session and disconnect WebSocket
    if (frameProcessedHandlerRef.current) {
      offFrameProcessed(frameProcessedHandlerRef.current);
      offStatsUpdate(frameProcessedHandlerRef.current);
      console.log('✅ WebSocket listeners removed');
    }
    leaveSession(workoutId);
    disconnectWebSocket();
    console.log('✅ WebSocket disconnected');
    
    // Update workout status to paused in MongoDB
    try {
      await apiUpdateWorkout(workoutId, { 
        status: 'paused',
        pausedAt: new Date().toISOString(),
        // Save current progress
        timeSeriesData: pressureMatrixData
      });
      console.log('✅ Workout paused in database');
      
      // Update local state
      if (!skipStateUpdate) {
        setWorkoutDetail(prev => ({ ...prev, status: 'paused' }));
      }
    } catch (e) {
      console.error('Failed to pause workout:', e);
    }
  }, [workout, pressureMatrixData]);

  const handleResumeWorkout = async () => {
    if (!workout) return;
    const workoutId = workout._id || workout.id;
    
    console.log('▶️ Resuming workout:', workoutId);
    
    // Update status to in-progress
    try {
      await apiUpdateWorkout(workoutId, { 
        status: 'in-progress',
        resumedAt: new Date().toISOString()
      });
      
      // Update local state
      setWorkoutDetail(prev => ({ ...prev, status: 'in-progress' }));
      setIsPaused(false);
      isPausedRef.current = false;
      
      // Reconnect WebSocket and resume stream
      connectWebSocket();
      await joinSession(workoutId);
      
      // Re-attach listeners
      const handler = (data) => {
        if (data && data.stats) {
          setStatsData(data.stats);
          setTimeSeriesStats(prev => [...prev, {
            timestamp: data.timestamp || Date.now(),
            ...data.stats
          }]);
        }
      };
      frameProcessedHandlerRef.current = handler;
      onFrameProcessed(handler);
      onStatsUpdate(handler);
      
      // Restart BLE stream
      if (isConnected) {
        const payloadLen = 4 + CONFIG.BLE.ROWS * CONFIG.BLE.COLS * 2;
        const stop = await startBleStream({
          payloadLen,
          useSequence: CONFIG.BLE.USE_SEQUENCE,
          onPayload: (payload) => {
            if (!isStreamActiveRef.current || isPausedRef.current) return;
            try {
              const { matrix } = decodeFrameU16(payload, {
                minV: CONFIG.BLE.MIN_V,
                maxV: CONFIG.BLE.MAX_V,
                rows: CONFIG.BLE.ROWS,
                cols: CONFIG.BLE.COLS,
              });
              setGridDims({ rows: CONFIG.BLE.ROWS, cols: CONFIG.BLE.COLS });
              setPressureData({ frames: [matrix] });
              const timestamp = Date.now();
              setPressureMatrixData(prev => [...prev, {
                timestamp: timestamp,
                matrix: matrix,
              }]);
              sendPressureFrame(workoutId, matrix, undefined, timestamp);
            } catch (e) {
              console.error('Failed to process BLE payload:', e);
            }
          },
        });
        stopStreamRef.current = stop;
      }
      
      console.log('✅ Workout resumed');
    } catch (e) {
      console.error('Failed to resume workout:', e);
      alert('Failed to resume workout. Please try again.');
    }
  };

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

  // Replay handlers for completed workouts
  const handleStartReplay = () => {
    if (!workout?.timeSeriesData || workout.timeSeriesData.length === 0) {
      alert('No replay data available');
      return;
    }
    setIsReplaying(true);
    setReplayIndex(0);
    setIsReplayPlaying(true);
  };

  const handleStopReplay = () => {
    setIsReplaying(false);
    setIsReplayPlaying(false);
    setReplayIndex(0);
    if (replayIntervalRef.current) {
      clearInterval(replayIntervalRef.current);
      replayIntervalRef.current = null;
    }
  };

  const handleReplayPlayPause = () => {
    setIsReplayPlaying(!isReplayPlaying);
  };

  const handleReplaySeek = (index) => {
    setReplayIndex(Math.max(0, Math.min(index, (workout?.timeSeriesData?.length || 1) - 1)));
  };

  // Replay playback effect
  useEffect(() => {
    if (!isReplaying || !isReplayPlaying || !workout?.timeSeriesData) return;

    replayIntervalRef.current = setInterval(() => {
      setReplayIndex(prev => {
        const next = prev + 1;
        if (next >= workout.timeSeriesData.length) {
          setIsReplayPlaying(false);
          return prev; // Stay at last frame
        }
        return next;
      });
    }, 250); // 4 FPS replay

    return () => {
      if (replayIntervalRef.current) {
        clearInterval(replayIntervalRef.current);
        replayIntervalRef.current = null;
      }
    };
  }, [isReplaying, isReplayPlaying, workout?.timeSeriesData]);

  // Update pressure data during replay
  useEffect(() => {
    if (isReplaying && workout?.timeSeriesData && workout.timeSeriesData[replayIndex]) {
      const frame = workout.timeSeriesData[replayIndex];
      if (frame.matrix) {
        setPressureData({ frames: [frame.matrix] });
        setGridDims({ rows: CONFIG.BLE.ROWS, cols: CONFIG.BLE.COLS });
      }
    }
  }, [isReplaying, replayIndex, workout?.timeSeriesData]);

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
            {workout.status === 'in-progress' && !isPaused && (
              <>
                <button
                  onClick={handlePauseWorkout}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all ${
                    isDark ? 'bg-yellow-700 hover:bg-yellow-600 text-white' : 'bg-yellow-500 hover:bg-yellow-600 text-white'
                  }`}
                >
                  ⏸️ Pause Workout
                </button>
                <button
                  onClick={handleCompleteWorkout}
                  disabled={isCompleting}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all ${
                    isDark ? 'bg-green-700 hover:bg-green-600 text-white' : 'bg-green-500 hover:bg-green-600 text-white'
                  } ${isCompleting ? 'opacity-60 cursor-not-allowed' : ''}`}
                >
                  {isCompleting ? 'Completing…' : '✅ Complete Workout'}
                </button>
              </>
            )}
            {(workout.status === 'paused' || isPaused) && (
              <>
                <button
                  onClick={handleResumeWorkout}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all ${
                    isDark ? 'bg-blue-700 hover:bg-blue-600 text-white' : 'bg-blue-500 hover:bg-blue-600 text-white'
                  }`}
                >
                  ▶️ Resume Workout
                </button>
                <button
                  onClick={handleCompleteWorkout}
                  disabled={isCompleting}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all ${
                    isDark ? 'bg-green-700 hover:bg-green-600 text-white' : 'bg-green-500 hover:bg-green-600 text-white'
                  } ${isCompleting ? 'opacity-60 cursor-not-allowed' : ''}`}
                >
                  {isCompleting ? 'Completing…' : '✅ Complete Workout'}
                </button>
              </>
            )}
            {workout.status === 'completed' && !isReplaying && workout?.timeSeriesData?.length > 0 && (
              <button
                onClick={handleStartReplay}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all ${
                  isDark ? 'bg-purple-700 hover:bg-purple-600 text-white' : 'bg-purple-500 hover:bg-purple-600 text-white'
                }`}
              >
                🔄 Replay Workout
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
          {/* Replay Controls */}
          {isReplaying && (
            <div className={`rounded-lg shadow-lg p-6 ${isDark ? 'bg-slate-800' : 'bg-white'}`}>
              <div className="flex items-center justify-between mb-4">
                <h3 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-800'}`}>
                  🔄 Replay Mode
                </h3>
                <button
                  onClick={handleStopReplay}
                  className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                    isDark ? 'bg-red-700 hover:bg-red-600 text-white' : 'bg-red-500 hover:bg-red-600 text-white'
                  }`}
                >
                  Stop Replay
                </button>
              </div>
              
              {/* Playback Controls */}
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <button
                    onClick={handleReplayPlayPause}
                    className={`px-4 py-2 rounded-lg font-semibold transition-all ${
                      isDark ? 'bg-blue-700 hover:bg-blue-600 text-white' : 'bg-blue-500 hover:bg-blue-600 text-white'
                    }`}
                  >
                    {isReplayPlaying ? '⏸️ Pause' : '▶️ Play'}
                  </button>
                  <span className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                    Frame {replayIndex + 1} / {workout?.timeSeriesData?.length || 0}
                  </span>
                </div>
                
                {/* Scrubber */}
                <div className="relative">
                  <input
                    type="range"
                    min="0"
                    max={(workout?.timeSeriesData?.length || 1) - 1}
                    value={replayIndex}
                    onChange={(e) => handleReplaySeek(parseInt(e.target.value))}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
                    style={{
                      background: `linear-gradient(to right, ${isDark ? '#3b82f6' : '#2563eb'} 0%, ${isDark ? '#3b82f6' : '#2563eb'} ${((replayIndex) / ((workout?.timeSeriesData?.length || 1) - 1)) * 100}%, ${isDark ? '#374151' : '#e5e7eb'} ${((replayIndex) / ((workout?.timeSeriesData?.length || 1) - 1)) * 100}%, ${isDark ? '#374151' : '#e5e7eb'} 100%)`
                    }}
                  />
                </div>
              </div>
            </div>
          )}
          
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
