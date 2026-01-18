import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { FiMic, FiX } from 'react-icons/fi';
import { TokenSource } from 'livekit-client';
import { LiveKitRoom, RoomAudioRenderer, useVoiceAssistant } from '@livekit/components-react';
import '@livekit/components-styles';
import CONFIG from '../config';

const FloatingAIButton = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const location = useLocation();
  
  // Extract workout ID from URL if on episode page (/episode/:id)
  const workoutId = (() => {
    const m = location.pathname.match(/\/episode\/([^/?]+)/);
    return m ? m[1] : null;
  })();

  return (
    <>
      {/* Floating Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          className="fixed bottom-6 right-6 z-50 group"
          aria-label="Open AI Coach"
        >
          <div className="relative">
            <div className="w-16 h-16 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 rounded-full shadow-2xl flex items-center justify-center transition-all duration-300 transform hover:scale-110 group-hover:shadow-purple-500/50">
              <FiMic className="w-7 h-7 text-white" />
            </div>
            <div className="absolute inset-0 w-16 h-16 bg-purple-600 rounded-full animate-ping opacity-20"></div>
            
            {isHovered && (
              <div className="absolute right-20 top-1/2 -translate-y-1/2 bg-slate-900 text-white px-4 py-2 rounded-lg shadow-xl whitespace-nowrap">
                <span className="text-sm font-medium">Open AI Fitness Coach</span>
                <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-2 w-2 h-2 bg-slate-900 rotate-45"></div>
              </div>
            )}
          </div>
        </button>
      )}

      {/* Floating Modal */}
      {isOpen && (
        <AICoachModal onClose={() => setIsOpen(false)} workoutId={workoutId} />
      )}
    </>
  );
};

/**
 * AI Coach Modal - Floating window with agent interface
 */
function AICoachModal({ onClose, workoutId }) {
  const [connectionDetails, setConnectionDetails] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState(null);

  const connectToAgent = async () => {
    setIsConnecting(true);
    setError(null);

    try {
      const roomName = `kinetra-session-${workoutId ? 'workout-' + workoutId + '-' : ''}${Date.now()}`;
      const participantName = `user-${Math.random().toString(36).substring(7)}`;

      if (CONFIG.LIVEKIT_USE_BACKEND) {
        const res = await fetch(`${CONFIG.BASE_URL}${CONFIG.ENDPOINTS.LIVEKIT_CONNECTION}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            roomName,
            participantName,
            workoutId: workoutId || undefined,
            agentName: CONFIG.AGENT_NAME,
          }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error || `Request failed: ${res.status}`);
        }
        const d = await res.json();
        setConnectionDetails({ serverUrl: d.serverUrl, participantToken: d.participantToken });
      } else {
        const sandboxOpts = CONFIG.LIVEKIT_SANDBOX_BASE_URL ? { baseUrl: CONFIG.LIVEKIT_SANDBOX_BASE_URL } : {};
        const tokenSource = TokenSource.sandboxTokenServer(CONFIG.LIVEKIT_SANDBOX_ID, sandboxOpts);
        const { serverUrl, participantToken } = await tokenSource.fetch({
          roomName,
          participantName,
          agentName: CONFIG.AGENT_NAME,
          ...(workoutId && { agentMetadata: JSON.stringify({ workout_id: workoutId }) }),
        });
        setConnectionDetails({ serverUrl, participantToken });
      }
    } catch (err) {
      console.error('❌ Connection error:', err);
      setError(err.message);
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnect = () => {
    setConnectionDetails(null);
    setError(null);
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 w-96 h-[600px] bg-slate-900 rounded-2xl shadow-2xl border border-slate-700 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-blue-600 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FiMic className="w-5 h-5 text-white" />
          <h3 className="text-white font-semibold">AI Fitness Coach</h3>
        </div>
        <button
          onClick={onClose}
          className="text-white hover:bg-white/20 rounded-lg p-1 transition-colors"
        >
          <FiX className="w-5 h-5" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {!connectionDetails ? (
          <div className="h-full flex flex-col items-center justify-center p-6 text-center">
            <div className="w-16 h-16 bg-purple-500/20 rounded-full flex items-center justify-center mb-4">
              <FiMic className="w-8 h-8 text-purple-400" />
            </div>
            <h3 className="text-white font-semibold text-lg mb-2">Ready to Start</h3>
            <p className="text-slate-400 text-sm mb-6">
              Connect to your AI fitness coach for personalized guidance
            </p>

            {error && (
              <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded-lg text-red-300 text-sm w-full">
                <p className="font-semibold mb-1">Connection Error</p>
                <p className="text-xs">{error}</p>
              </div>
            )}

            <button
              onClick={connectToAgent}
              disabled={isConnecting}
              className="px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 disabled:from-gray-600 disabled:to-gray-700 text-white font-semibold rounded-lg shadow-lg transition-all transform hover:scale-105 disabled:scale-100 disabled:cursor-not-allowed"
            >
              {isConnecting ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Connecting...
                </span>
              ) : (
                'Start Session'
              )}
            </button>

            <div className="mt-6 text-xs text-slate-500 space-y-1">
              <p>✓ Cloud-hosted agent</p>
              <p>✓ Real-time voice interaction</p>
            </div>
          </div>
        ) : (
          <LiveKitRoom
            serverUrl={connectionDetails.serverUrl}
            token={connectionDetails.participantToken}
            connect
            audio
            video={false}
            onDisconnected={disconnect}
          >
            <AgentInterface onDisconnect={disconnect} />
            <RoomAudioRenderer />
          </LiveKitRoom>
        )}
      </div>
    </div>
  );
}

/**
 * Agent Interface - Shown when connected
 */
function AgentInterface({ onDisconnect }) {
  const { state } = useVoiceAssistant();

  return (
    <div className="h-full flex flex-col bg-slate-900">
      {/* Status Bar */}
      <div className="bg-slate-800 px-4 py-3 border-b border-slate-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
            <span className="text-white text-sm font-medium">Connected</span>
            {state && (
              <span className="text-xs text-slate-400">• {state}</span>
            )}
          </div>
          <button
            onClick={onDisconnect}
            className="text-xs px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
          >
            End
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gradient-to-r from-purple-600 to-blue-600 mb-3">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h4 className="text-white font-semibold mb-1">AI Coach Active</h4>
          <p className="text-slate-400 text-xs">Start speaking to get guidance</p>
        </div>

        {/* Agent State Indicator */}
        <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
          <div className="flex items-center justify-between mb-3">
            <span className="text-slate-300 text-sm font-medium">Status</span>
            <span className="text-xs text-slate-400">
              {state === 'listening' && '🎤 Listening'}
              {state === 'thinking' && '🤔 Thinking'}
              {state === 'speaking' && '🗣️ Speaking'}
              {!state && '⏳ Ready'}
            </span>
          </div>

          {/* Visual Bars */}
          <div className="flex items-center gap-1 h-12">
            {[...Array(12)].map((_, i) => (
              <div
                key={i}
                className={`flex-1 rounded transition-all duration-150 ${
                  state === 'listening' ? 'bg-blue-500' :
                  state === 'thinking' ? 'bg-yellow-500' :
                  state === 'speaking' ? 'bg-green-500' :
                  'bg-slate-600'
                }`}
                style={{
                  height: (state === 'listening' || state === 'speaking')
                    ? `${Math.random() * 40 + 20}px`
                    : '8px',
                }}
              />
            ))}
          </div>
        </div>

        {/* Tips */}
        <div className="mt-4 space-y-2 text-xs text-slate-400">
          <div className="flex items-start gap-2">
            <span>💪</span>
            <p>Ask about exercises and workout tips</p>
          </div>
          <div className="flex items-start gap-2">
            <span>📊</span>
            <p>Discuss your fitness goals</p>
          </div>
          <div className="flex items-start gap-2">
            <span>🎯</span>
            <p>Get form and technique advice</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default FloatingAIButton;
