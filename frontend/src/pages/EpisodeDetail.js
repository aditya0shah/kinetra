import React, { useContext, useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FiCamera, FiStopCircle } from 'react-icons/fi';
import { ThemeContext } from '../context/ThemeContext';
import { WorkoutContext } from '../context/WorkoutContext';
import { BluetoothContext } from '../context/BluetoothContext';
import Header from '../components/Header';
import FootPressureHeatmap from '../components/FootPressureHeatmap';
import TimeSeriesChart from '../components/TimeSeriesChart';
import RegionStatsDisplay from '../components/RegionStatsDisplay';
import MetricsGraph from '../components/MetricsGraph';
import { decodeFrameU16 } from '../services/ble';
import { getWorkout, updateWorkout as apiUpdateWorkout } from '../services/api';
import { startOvershootVision, stopOvershootVision } from '../services/overshootVision';
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
  const sessionJoinedRef = useRef(false); // gate WS sends until session joined
  const [isVisionActive, setIsVisionActive] = useState(false);
  const [isVisionStarting, setIsVisionStarting] = useState(false);
  const [visionError, setVisionError] = useState(null);
  const [visionResult, setVisionResult] = useState(null);
  const visionStreamRef = useRef(null);
  const visionVideoRef = useRef(null);
  const visionResultsRef = useRef([]);
  // Replay state for completed workouts
  const [isReplaying, setIsReplaying] = useState(false);
  const [replayIndex, setReplayIndex] = useState(0);
  const replayIntervalRef = useRef(null);

  const workout = workoutDetail;
  const replayFrames = workout?.pressure_frames || workout?.timeSeriesData || [];

  const mapFramesToStats = (frames = []) =>
    frames.map(frame => ({
      timestamp: frame?.timestamp,
      ...(frame?.smoothed_stats || frame?.calculated_stats || {}),
    }));

  // Fetch workout details from backend when navigating to a specific episode
  useEffect(() => {
    let mounted = true;
    const fetchDetail = async () => {
      try {
        const detail = await getWorkout(id);
        if (!mounted) return;
        setWorkoutDetail(detail);
        if (Array.isArray(detail?.pressure_frames) && detail.pressure_frames.length > 0) {
          setTimeSeriesStats(prev => (prev.length > 0 ? prev : mapFramesToStats(detail.pressure_frames)));
          const lastStatsFrame = detail.pressure_frames[detail.pressure_frames.length - 1];
          const latestStats = lastStatsFrame?.smoothed_stats || lastStatsFrame?.calculated_stats;
          if (latestStats) {
            setStatsData(latestStats);
          }
        }
      } catch (e) {
        console.warn('Failed to fetch workout detail:', e.message);
      }
    };
    if (id) fetchDetail();
    return () => { mounted = false; };
  }, [id]);

  useEffect(() => {
    if (!visionVideoRef.current) return;
    if (visionStreamRef.current) {
      visionVideoRef.current.srcObject = visionStreamRef.current;
    } else {
      visionVideoRef.current.srcObject = null;
    }
  }, [isVisionActive]);

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
    sessionJoinedRef.current = false;
    const workoutId = workout._id || workout.id;

    const setupWebSocket = async () => {
      try {
        // Connect to WebSocket
        connectWebSocket();
        console.log('WebSocket connection initiated');

        // Join session
        await joinSession(workoutId);
        sessionJoinedRef.current = true;
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
        sessionJoinedRef.current = false;
        console.error('Failed to setup WebSocket:', e);
      }
    };

    setupWebSocket();

    const handleBlePayload = (payload) => {
      if (!isStreamActiveRef.current) return;

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
        if (!sessionJoinedRef.current) {
          console.warn('WebSocket session not joined yet; skipping frame');
          return;
        }
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
      sessionJoinedRef.current = false;
      if (stopStreamRef.current) {
        stopStreamRef.current();
        stopStreamRef.current = null;
      }
    };
  }, [workout, canStart, hasActiveWorkout, startWorkout, navigate, inProgressWorkoutId, isConnected, startBleStream]);

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
      sessionJoinedRef.current = false;
      if (isVisionActive) {
        await stopOvershootVision();
        if (visionStreamRef.current) {
          visionStreamRef.current.getTracks().forEach(track => track.stop());
          visionStreamRef.current = null;
        }
        setIsVisionActive(false);
      }
      if (frameProcessedHandlerRef.current) {
        offFrameProcessed(frameProcessedHandlerRef.current);
        offStatsUpdate(frameProcessedHandlerRef.current); // remove stats listener if set
        frameProcessedHandlerRef.current = null;
      }
      leaveSession(workoutId);
      disconnectWebSocket();

      // 3. Stop in-progress tracking globally
      stopWorkout();

      console.log('visionResultsRef.current', visionResultsRef.current);

      await apiUpdateWorkout(workoutId, {
        visionResults: visionResultsRef.current
      });

      // 4. Update workout status to completed in MongoDB and save accumulated pressure data
      await apiUpdateWorkout(workoutId, { 
        status: 'completed', 
        completedAt: new Date().toISOString(),
        timeSeriesData: pressureMatrixData,  // Save all accumulated pressure matrix data
        visionResults: visionResultsRef.current
      });


      // 5. Navigate to workouts page
      navigate('/workouts');
    } catch (e) {
      console.warn('Failed to complete workout:', e.message);
      alert('Failed to complete workout. Please try again.');
      setIsCompleting(false);
    }
  };

  const handleToggleVision = async () => {
    if (isVisionStarting) return;
    setVisionError(null);

    if (isVisionActive) {
      setIsVisionStarting(true);
      try {
        await stopOvershootVision();
        if (visionStreamRef.current) {
          visionStreamRef.current.getTracks().forEach(track => track.stop());
          visionStreamRef.current = null;
        }
        setIsVisionActive(false);
      } catch (e) {
        setVisionError(e?.message || 'Failed to stop AI recorder');
      } finally {
        setIsVisionStarting(false);
      }
      return;
    }

    setIsVisionStarting(true);
    try {
      const { stream } = await startOvershootVision({
        prompt: 'Read any visible text',
        onResult: (result) => {
          const value = result?.result ?? result?.text ?? result;
          visionResultsRef.current.push(value);
          setVisionResult(value);
        },
        onError: (err) => {
          console.error('Failed to start AI recorder:', err);
          setVisionError(err?.message || 'AI recorder error');
        }
      });
      visionStreamRef.current = stream;
      setIsVisionActive(true);
    } catch (e) {
      console.error('Failed to start AI recorder:', e);
      setVisionError(e?.message || 'Failed to start AI recorder');
    } finally {
      setIsVisionStarting(false);
    }
  };

  useEffect(() => {
    return () => {
      stopOvershootVision();
      if (visionStreamRef.current) {
        visionStreamRef.current.getTracks().forEach(track => track.stop());
        visionStreamRef.current = null;
      }
    };
  }, []);

  // Replay handlers for completed workouts
  const handleStartReplay = () => {
    if (!replayFrames || replayFrames.length === 0) {
      alert('No replay data available');
      return;
    }
    setIsReplaying(true);
    setReplayIndex(0);
  };

  const handleStopReplay = () => {
    setIsReplaying(false);
    setReplayIndex(0);
    if (replayIntervalRef.current) {
      clearInterval(replayIntervalRef.current);
      replayIntervalRef.current = null;
    }
  };

  const handleReplaySeek = (index) => {
    setReplayIndex(Math.max(0, Math.min(index, (replayFrames.length || 1) - 1)));
  };

  // Replay playback effect
  useEffect(() => {
    if (!isReplaying || !replayFrames) return;

    if (replayIntervalRef.current) {
      clearInterval(replayIntervalRef.current);
    }

    replayIntervalRef.current = setInterval(() => {
      setReplayIndex(prev => {
        const next = prev + 1;
        if (next >= replayFrames.length) {
          if (replayIntervalRef.current) {
            clearInterval(replayIntervalRef.current);
            replayIntervalRef.current = null;
          }
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
  }, [isReplaying, replayFrames]);

  // Update pressure data during replay
  useEffect(() => {
    if (isReplaying && replayFrames && replayFrames[replayIndex]) {
      const frame = replayFrames[replayIndex];
      const matrix = frame?.pressure_matrix || frame?.matrix;
      if (matrix) {
        setPressureData({ frames: [matrix] });
        setGridDims({ rows: CONFIG.BLE.ROWS, cols: CONFIG.BLE.COLS });
      }
    }
  }, [isReplaying, replayIndex, replayFrames]);

  const hasPressureData = Array.isArray(pressureData)
    ? pressureData.length > 0
    : Array.isArray(pressureData?.frames) && pressureData.frames.length > 0;
  const displayPressureData = hasPressureData ? pressureData : workout?.footPressureData;

  if (!workout) {
    return (
      <div className={`min-h-screen transition-colors duration-300 ${isDark ? 'bg-slate-900' : 'bg-gradient-to-br from-blue-50 to-green-50'}`}>
        <Header
          toggleTheme={toggleTheme}
          isDark={isDark}
          showBackToWorkouts
          onBackToWorkouts={() => navigate('/workouts')}
        />
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className={`text-center py-16 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
            <p className="text-xl">Workout not found</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen transition-colors duration-300 ${isDark ? 'bg-slate-900' : 'bg-gradient-to-br from-blue-50 to-green-50'}`}>
      <Header
        toggleTheme={toggleTheme}
        isDark={isDark}
        showBackToWorkouts
        onBackToWorkouts={() => navigate('/workouts')}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Top Control Bar */}
        <div className="flex items-center justify-end mb-6">
          {/* Controls */}
          <div className="flex items-center gap-3">
            {workout.status !== 'completed' && (
              <button
                onClick={handleToggleVision}
                disabled={isVisionStarting}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all ${
                  isVisionActive
                    ? isDark
                      ? 'bg-red-700 hover:bg-red-600 text-white'
                      : 'bg-red-500 hover:bg-red-600 text-white'
                    : isDark
                    ? 'bg-slate-700 hover:bg-slate-600 text-white'
                    : 'bg-white hover:bg-gray-100 text-gray-800'
                } ${isVisionStarting ? 'opacity-60 cursor-not-allowed' : ''}`}
                title={isVisionActive ? 'Stop AI recorder' : 'Start AI recorder'}
              >
                {isVisionActive ? <FiStopCircle size={18} /> : <FiCamera size={18} />}
                {isVisionActive ? 'Stop AI Recorder' : 'Start AI Recorder'}
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
                {isCompleting ? 'Completing…' : '✅ Complete Workout'}
              </button>
            )}
            {workout.status === 'completed' && !isReplaying && replayFrames.length > 0 && (
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
        <div className={`rounded-lg shadow-lg p-4 mb-6 ${isDark ? 'bg-slate-800' : 'bg-white'}`}>
          <div className="flex items-center justify-between">
            <div>
              <h1 className={`text-3xl font-bold mb-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                {workout.name}
              </h1>
              <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                {workout.type} • {new Date(workout.date || new Date()).toLocaleDateString()} at {new Date(workout.date || new Date()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>

          {workout.status !== 'completed' && (isVisionActive || visionError || visionResult) && (
            <div className={`mt-4 rounded-lg border p-4 ${isDark ? 'border-slate-700 bg-slate-900' : 'border-gray-200 bg-gray-50'}`}>
              <div className="flex items-start gap-4">
                <div className="w-40 h-28 rounded-lg overflow-hidden bg-black/20">
                  <video
                    ref={visionVideoRef}
                    autoPlay
                    muted
                    playsInline
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="flex-1">
                  <p className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-gray-800'}`}>
                    AI Recorder {isVisionActive ? 'Active' : 'Idle'}
                  </p>
                  {visionResult && (
                    <p className={`mt-2 text-sm ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                      {String(visionResult)}
                    </p>
                  )}
                  {visionError && (
                    <p className="mt-2 text-sm text-red-500">
                      {visionError}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
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
                  <span className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                    Frame {replayIndex + 1} / {replayFrames.length}
                  </span>
                </div>
                
                {/* Scrubber */}
                <div className="relative">
                  <input
                    type="range"
                    min="0"
                    max={(replayFrames.length || 1) - 1}
                    value={replayIndex}
                    onChange={(e) => handleReplaySeek(parseInt(e.target.value))}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
                    style={{
                      background: `linear-gradient(to right, ${isDark ? '#3b82f6' : '#2563eb'} 0%, ${isDark ? '#3b82f6' : '#2563eb'} ${((replayIndex) / ((replayFrames.length || 1) - 1)) * 100}%, ${isDark ? '#374151' : '#e5e7eb'} ${((replayIndex) / ((replayFrames.length || 1) - 1)) * 100}%, ${isDark ? '#374151' : '#e5e7eb'} 100%)`
                    }}
                  />
                </div>
              </div>
            </div>
          )}
          
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
            {/* Foot Pressure Heatmap */}
            <FootPressureHeatmap 
              footPressureData={displayPressureData} 
              isDark={isDark}
            />

            {/* Metrics Graph - Time-series line graphs */}
            <div className="w-full">
              <MetricsGraph
                timeSeriesStats={timeSeriesStats}
                isDark={isDark}
                activeFrameIndex={isReplaying ? replayIndex : undefined}
              />
            </div>
          </div>

          {/* Region Stats Display - Shows calculated stats from backend */}
          <RegionStatsDisplay statsData={statsData} isDark={isDark} />

        </div>
      </div>
    </div>
  );
};

export default EpisodeDetail;
