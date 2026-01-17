import React, { useRef, useState } from 'react';
import { FiPlay, FiPause, FiVolume2, FiVolumeX } from 'react-icons/fi';

const VideoPlayer = ({ videoUrl, isDark }) => {
  const videoRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  const togglePlayPause = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  return (
    <div className="w-full">
      <div className={`relative rounded-lg overflow-hidden ${isDark ? 'bg-black' : 'bg-gray-900'}`}>
        <video
          ref={videoRef}
          src={videoUrl}
          className="w-full h-auto aspect-video bg-black rounded-lg"
          onEnded={() => setIsPlaying(false)}
        />
        {!isPlaying && (
          <div className="absolute inset-0 bg-black bg-opacity-40 flex items-center justify-center">
            <button
              onClick={togglePlayPause}
              className="bg-blue-500 hover:bg-blue-600 text-white p-4 rounded-full transition-all transform hover:scale-110"
            >
              <FiPlay size={32} fill="currentColor" />
            </button>
          </div>
        )}
      </div>

      {/* Video Controls */}
      <div className={`flex items-center justify-between mt-3 p-3 rounded-lg ${isDark ? 'bg-slate-800' : 'bg-gray-100'}`}>
        <button
          onClick={togglePlayPause}
          className={`p-2 rounded-lg transition-colors ${isDark ? 'hover:bg-slate-700 text-blue-400' : 'hover:bg-gray-200 text-blue-600'}`}
        >
          {isPlaying ? <FiPause size={20} /> : <FiPlay size={20} />}
        </button>

        <div className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
          Session Recording
        </div>

        <button
          onClick={toggleMute}
          className={`p-2 rounded-lg transition-colors ${isDark ? 'hover:bg-slate-700 text-green-400' : 'hover:bg-gray-200 text-green-600'}`}
        >
          {isMuted ? <FiVolumeX size={20} /> : <FiVolume2 size={20} />}
        </button>
      </div>
    </div>
  );
};

export default VideoPlayer;
