import React, { useState, useEffect } from 'react';
import { FiPlay, FiPause, FiSkipBack, FiSkipForward } from 'react-icons/fi';

/**
 * WorkoutReplay Component
 * Loads historical workout data from MongoDB and allows frame-by-frame playback
 */
const WorkoutReplay = ({ workoutId, isDark }) => {
  const [frames, setFrames] = useState([]);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch workout frames from backend
  useEffect(() => {
    const fetchWorkoutFrames = async () => {
      try {
        setLoading(true);
        const response = await fetch(`http://localhost:5000/workouts/${workoutId}`);
        if (!response.ok) throw new Error('Failed to fetch workout');
        
        const data = await response.json();
        if (data.data && data.data.pressure_frames) {
          setFrames(data.data.pressure_frames);
        } else {
          setFrames([]);
        }
        setError(null);
      } catch (err) {
        setError(err.message);
        setFrames([]);
      } finally {
        setLoading(false);
      }
    };

    if (workoutId) {
      fetchWorkoutFrames();
    }
  }, [workoutId]);

  // Auto-play frames
  useEffect(() => {
    if (!isPlaying || frames.length === 0) return;

    const interval = setInterval(() => {
      setCurrentFrame(prev => (prev + 1) % frames.length);
    }, 100); // Play at ~10 fps

    return () => clearInterval(interval);
  }, [isPlaying, frames.length]);

  if (loading) {
    return (
      <div className={`rounded-lg shadow-lg p-6 ${isDark ? 'bg-slate-800' : 'bg-white'}`}>
        <p className={`text-center ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
          Loading workout data...
        </p>
      </div>
    );
  }

  if (error || frames.length === 0) {
    return (
      <div className={`rounded-lg shadow-lg p-6 ${isDark ? 'bg-slate-800' : 'bg-white'}`}>
        <p className={`text-center ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
          {error ? `Error: ${error}` : 'No recorded frames available'}
        </p>
      </div>
    );
  }

  const currentFrameData = frames[currentFrame];

  return (
    <div className={`rounded-lg shadow-lg p-6 ${isDark ? 'bg-slate-800' : 'bg-white'}`}>
      <h3 className={`text-lg font-semibold mb-4 ${isDark ? 'text-white' : 'text-gray-800'}`}>
        Workout Replay
      </h3>

      {/* Frame info */}
      <div className={`mb-6 p-4 rounded-lg ${isDark ? 'bg-slate-700' : 'bg-gray-100'}`}>
        <div className="flex items-center justify-between">
          <span className={`text-sm font-semibold ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
            Frame: {(currentFrame + 1).toString().padStart(3, '0')} / {frames.length}
          </span>
          <div className="flex-1 max-w-xs h-2 rounded-full ml-4 mr-4" style={{ backgroundColor: isDark ? '#1e293b' : '#e5e7eb' }}>
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${(currentFrame / frames.length) * 100}%`,
                backgroundColor: '#3b82f6'
              }}
            ></div>
          </div>
          <span className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
            {((currentFrame / frames.length) * 100).toFixed(1)}%
          </span>
        </div>
      </div>

      {/* Frame pressure matrix display */}
      {currentFrameData && (
        <div className={`mb-6 p-4 rounded-lg ${isDark ? 'bg-slate-900' : 'bg-gray-50'}`}>
          <p className={`text-sm font-semibold mb-3 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
            Pressure Matrix
          </p>
          <div className="grid grid-cols-4 gap-2">
            {currentFrameData.matrix && currentFrameData.matrix.flat().map((value, idx) => (
              <div
                key={idx}
                className={`p-2 rounded text-center text-xs font-semibold ${
                  isDark ? 'bg-slate-800 text-gray-300' : 'bg-white text-gray-700'
                }`}
                style={{
                  backgroundColor: `${isDark ? '#1e293b' : '#f1f5f9'}`,
                  borderLeft: `3px solid ${
                    value > 7 ? '#ef4444' : value > 5 ? '#f59e0b' : value > 3 ? '#3b82f6' : '#10b981'
                  }`
                }}
              >
                {typeof value === 'number' ? value.toFixed(1) : value}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center justify-center gap-3">
        <button
          onClick={() => setCurrentFrame(Math.max(0, currentFrame - 1))}
          className={`p-2 rounded-lg transition-colors ${
            isDark ? 'hover:bg-slate-700 text-blue-400' : 'hover:bg-gray-200 text-blue-600'
          }`}
          disabled={currentFrame === 0}
          title="Previous frame"
        >
          <FiSkipBack size={20} />
        </button>

        <button
          onClick={() => setIsPlaying(!isPlaying)}
          className={`p-3 rounded-lg transition-colors ${
            isDark ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-blue-500 hover:bg-blue-600 text-white'
          }`}
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? <FiPause size={20} /> : <FiPlay size={20} />}
        </button>

        <button
          onClick={() => setCurrentFrame(Math.min(frames.length - 1, currentFrame + 1))}
          className={`p-2 rounded-lg transition-colors ${
            isDark ? 'hover:bg-slate-700 text-blue-400' : 'hover:bg-gray-200 text-blue-600'
          }`}
          disabled={currentFrame === frames.length - 1}
          title="Next frame"
        >
          <FiSkipForward size={20} />
        </button>

        <button
          onClick={() => setCurrentFrame(0)}
          className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
            isDark
              ? 'bg-slate-700 hover:bg-slate-600 text-gray-300'
              : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
          }`}
          title="Reset to start"
        >
          Reset
        </button>
      </div>
    </div>
  );
};

export default WorkoutReplay;
