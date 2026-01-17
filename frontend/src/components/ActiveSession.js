import React, { useContext, useState } from 'react';
import { WorkoutContext } from '../context/WorkoutContext';
import { FiX, FiHeart, FiZap } from 'react-icons/fi';

const ActiveSession = ({ isDark }) => {
  const { endSession } = useContext(WorkoutContext);
  const [elapsed, setElapsed] = useState(0);

  React.useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(e => e + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const formatTime = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  return (
    <div className={`rounded-lg shadow-lg p-6 h-full flex flex-col justify-between ${
      isDark
        ? 'bg-gradient-to-br from-blue-900 to-green-900 border border-blue-700'
        : 'bg-gradient-to-br from-blue-500 to-green-500'
    }`}>
      <div>
        <h3 className="text-white font-semibold text-lg mb-4">Active Session</h3>

        <div className="bg-white bg-opacity-20 backdrop-blur rounded-lg p-4 mb-4">
          <p className="text-white text-xs opacity-90 mb-2">Elapsed Time</p>
          <p className="text-white text-4xl font-bold font-mono">{formatTime(elapsed)}</p>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-white bg-opacity-10 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              <FiHeart className="text-red-300" size={16} />
              <p className="text-white text-xs">Heart Rate</p>
            </div>
            <p className="text-white text-lg font-semibold">-</p>
          </div>

          <div className="bg-white bg-opacity-10 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              <FiZap className="text-yellow-300" size={16} />
              <p className="text-white text-xs">Calories</p>
            </div>
            <p className="text-white text-lg font-semibold">-</p>
          </div>
        </div>

        <div className="w-full bg-white bg-opacity-20 rounded-full h-1">
          <div className="bg-white h-1 rounded-full" style={{ width: '45%' }}></div>
        </div>
      </div>

      <button
        onClick={endSession}
        className="w-full mt-4 bg-red-500 hover:bg-red-600 text-white font-semibold py-2 px-4 rounded-lg transition flex items-center justify-center gap-2"
      >
        <FiX size={18} />
        End Session
      </button>
    </div>
  );
};

export default ActiveSession;
