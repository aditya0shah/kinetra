import React, { useRef, useState, Suspense, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Text, Line, Grid } from '@react-three/drei';
import { FiPlay, FiPause, FiSkipBack, FiSkipForward, FiRotateCw } from 'react-icons/fi';
import * as THREE from 'three';

// Skeleton component that renders in 3D space
const Skeleton3D = ({ skeletonData, currentTimeIdx, isDark }) => {
  const groupRef = useRef();

  // COCO keypoint skeleton connections
  const skeletonConnections = [
    [16, 14], [14, 12], [17, 15], [15, 13], [12, 13],
    [6, 12], [7, 13], [6, 7], [6, 8], [7, 9],
    [8, 10], [9, 11], [2, 3], [1, 2], [1, 3],
    [2, 4], [3, 5], [4, 6], [5, 7]
  ];

  // Subtle auto-rotation
  useFrame(() => {
    if (groupRef.current) {
      groupRef.current.rotation.y += 0.002;
    }
  });

  // Get keypoint positions at current time
  const getKeypointPosition = (keypointIdx) => {
    const keypoint = skeletonData[keypointIdx];
    if (!keypoint) return null;
    
    const data = keypoint.data[currentTimeIdx];
    if (!data) return null;

    // Scale and center the coordinates for 3D view
    return [
      (data.x - 320) * 0.01,
      -(data.y - 240) * 0.01,
      data.z * 0.01
    ];
  };

  return (
    <group ref={groupRef}>
      {/* Draw bones (connections) */}
      {skeletonConnections.map(([start, end], idx) => {
        const startPos = getKeypointPosition(start);
        const endPos = getKeypointPosition(end);

        if (!startPos || !endPos) return null;

        return (
          <Line
            key={`bone-${idx}`}
            points={[startPos, endPos]}
            color={isDark ? '#60a5fa' : '#3b82f6'}
            lineWidth={3}
          />
        );
      })}

      {/* Draw joints (keypoints) */}
      {skeletonData.map((keypoint, idx) => {
        const data = keypoint.data[currentTimeIdx];
        if (!data) return null;

        const position = getKeypointPosition(idx);
        if (!position) return null;

        const radius = 0.15 + data.confidence * 0.1;

        return (
          <group key={`joint-${idx}`} position={position}>
            {/* Joint sphere */}
            <mesh castShadow>
              <sphereGeometry args={[radius, 16, 16]} />
              <meshStandardMaterial
                color={isDark ? '#10b981' : '#059669'}
                emissive={isDark ? '#34d399' : '#10b981'}
                emissiveIntensity={0.3}
                metalness={0.3}
                roughness={0.4}
              />
            </mesh>

            {/* Glow effect */}
            <mesh>
              <sphereGeometry args={[radius * 1.5, 16, 16]} />
              <meshBasicMaterial
                color={isDark ? '#34d399' : '#10b981'}
                transparent
                opacity={0.2}
              />
            </mesh>

            {/* Confidence label */}
            <Text
              position={[0, radius + 0.3, 0]}
              fontSize={0.15}
              color={isDark ? '#e2e8f0' : '#1f2937'}
              anchorX="center"
              anchorY="middle"
            >
              {Math.round(data.confidence * 100)}
            </Text>
          </group>
        );
      })}

      {/* Ground plane for reference */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -3, 0]} receiveShadow>
        <planeGeometry args={[20, 20]} />
        <meshStandardMaterial
          color={isDark ? '#1e293b' : '#e5e7eb'}
          transparent
          opacity={0.5}
        />
      </mesh>

      {/* Grid helper */}
      <gridHelper args={[20, 20, isDark ? '#475569' : '#94a3b8', isDark ? '#334155' : '#cbd5e1']} position={[0, -3, 0]} />
    </group>
  );
};

const SkeletonVisualization3D = ({ skeletonData, isDark }) => {
  const [currentTimeIdx, setCurrentTimeIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const maxTimePoints = skeletonData[0]?.data.length || 20;

  // Auto-play animation
  useEffect(() => {
    if (!isPlaying) return;

    const interval = setInterval(() => {
      setCurrentTimeIdx((prev) => (prev + 1) % maxTimePoints);
    }, 100);

    return () => clearInterval(interval);
  }, [isPlaying, maxTimePoints]);

  return (
    <div className={`rounded-lg shadow-lg p-6 ${isDark ? 'bg-slate-800' : 'bg-white'}`}>
      <h3 className={`text-lg font-semibold mb-6 ${isDark ? 'text-white' : 'text-gray-800'}`}>
        3D Skeleton Visualization
      </h3>

      {/* Three.js Canvas */}
      <div className={`rounded-lg overflow-hidden mb-6 ${isDark ? 'bg-slate-900' : 'bg-gray-100'}`} style={{ height: '500px' }}>
        <Canvas
          shadows
          camera={{ position: [0, 5, 15], fov: 50 }}
          style={{ background: isDark ? '#0f172a' : '#f1f5f9' }}
        >
          <Suspense fallback={null}>
            {/* Lighting */}
            <ambientLight intensity={0.5} />
            <directionalLight
              position={[10, 10, 5]}
              intensity={1}
              castShadow
              shadow-mapSize-width={2048}
              shadow-mapSize-height={2048}
            />
            <pointLight position={[-10, 10, -5]} intensity={0.5} color={isDark ? '#60a5fa' : '#3b82f6'} />
            <pointLight position={[10, -5, 5]} intensity={0.3} color={isDark ? '#10b981' : '#059669'} />

            {/* Skeleton */}
            <Skeleton3D skeletonData={skeletonData} currentTimeIdx={currentTimeIdx} isDark={isDark} />

            {/* Camera Controls */}
            <OrbitControls
              enablePan={true}
              enableZoom={true}
              enableRotate={true}
              minDistance={5}
              maxDistance={30}
            />
          </Suspense>
        </Canvas>
      </div>

      {/* Info text */}
      <div className={`mb-6 p-3 rounded-lg ${isDark ? 'bg-blue-900 bg-opacity-20 border border-blue-800' : 'bg-blue-50 border border-blue-200'}`}>
        <p className={`text-sm ${isDark ? 'text-blue-300' : 'text-blue-700'}`}>
          <FiRotateCw className="inline mr-2" />
          Use mouse to rotate, zoom, and pan the 3D view
        </p>
      </div>

      {/* Keypoint Legend */}
      <div className="mb-6">
        <p className={`text-sm font-semibold mb-3 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
          Detected Keypoints:
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {skeletonData.map((keypoint) => {
            const data = keypoint.data[currentTimeIdx];
            const confidence = data ? Math.round(data.confidence * 100) : 0;

            return (
              <div
                key={keypoint.id}
                className={`p-2 rounded text-xs ${
                  isDark ? 'bg-slate-700 text-gray-300' : 'bg-gray-100 text-gray-700'
                }`}
              >
                <p className="font-semibold capitalize truncate">{keypoint.name.replace('_', ' ')}</p>
                <p className="text-xs opacity-75">{confidence}% conf</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Time Series Slider */}
      <div className={`mb-6 p-4 rounded-lg ${isDark ? 'bg-slate-700' : 'bg-gray-100'}`}>
        <div className="flex items-center justify-between mb-4">
          <span className={`text-sm font-semibold ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
            Frame: {currentTimeIdx.toString().padStart(2, '0')} / {maxTimePoints}
          </span>
          <div className="flex-1 max-w-xs h-2 rounded-full ml-4" style={{ backgroundColor: isDark ? '#1e293b' : '#e5e7eb' }}>
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${(currentTimeIdx / maxTimePoints) * 100}%`,
                backgroundColor: '#10b981'
              }}
            ></div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-3">
        <button
          onClick={() => setCurrentTimeIdx(Math.max(0, currentTimeIdx - 1))}
          className={`p-2 rounded-lg transition-colors ${
            isDark ? 'hover:bg-slate-700 text-green-400' : 'hover:bg-gray-200 text-green-600'
          }`}
          disabled={currentTimeIdx === 0}
        >
          <FiSkipBack size={20} />
        </button>

        <button
          onClick={() => setIsPlaying(!isPlaying)}
          className={`p-3 rounded-lg transition-colors ${
            isDark ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-green-500 hover:bg-green-600 text-white'
          }`}
        >
          {isPlaying ? <FiPause size={20} /> : <FiPlay size={20} />}
        </button>

        <button
          onClick={() => setCurrentTimeIdx(Math.min(maxTimePoints - 1, currentTimeIdx + 1))}
          className={`p-2 rounded-lg transition-colors ${
            isDark ? 'hover:bg-slate-700 text-green-400' : 'hover:bg-gray-200 text-green-600'
          }`}
          disabled={currentTimeIdx === maxTimePoints - 1}
        >
          <FiSkipForward size={20} />
        </button>

        <button
          onClick={() => setCurrentTimeIdx(0)}
          className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
            isDark
              ? 'bg-slate-700 hover:bg-slate-600 text-gray-300'
              : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
          }`}
        >
          Reset
        </button>
      </div>
    </div>
  );
};

export default SkeletonVisualization3D;
