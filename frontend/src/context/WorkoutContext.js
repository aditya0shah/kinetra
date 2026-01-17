import React, { createContext, useState } from 'react';

export const WorkoutContext = createContext();

// Generate foot pressure heatmap data for insole nodes
const generateFootPressureData = () => {
  const timePoints = Array.from({ length: 20 }, (_, i) => i);
  // 16 nodes on foot insole in a grid pattern
  const footNodes = Array.from({ length: 16 }, (_, i) => ({
    id: i,
    position: {
      x: (i % 4) * 25,
      y: Math.floor(i / 4) * 33.33
    },
    data: timePoints.map(t => ({
      time: t,
      pressure: Math.sin(t * 0.3 + i * 0.5) * 50 + Math.random() * 30 + 50
    }))
  }));
  return footNodes;
};

// Generate skeleton keypoint data (COCO format - 17 keypoints)
const generateSkeletonData = () => {
  const timePoints = Array.from({ length: 20 }, (_, i) => i);
  const keypoints = [
    'nose', 'left_eye', 'right_eye', 'left_ear', 'right_ear',
    'left_shoulder', 'right_shoulder', 'left_elbow', 'right_elbow',
    'left_wrist', 'right_wrist', 'left_hip', 'right_hip',
    'left_knee', 'right_knee', 'left_ankle', 'right_ankle'
  ];
  
  return keypoints.map((name, idx) => ({
    id: idx,
    name: name,
    data: timePoints.map(t => ({
      time: t,
      x: 320 + Math.sin(t * 0.2 + idx) * 100 + Math.random() * 20,
      y: 240 + Math.cos(t * 0.15 + idx * 0.3) * 80 + Math.random() * 20,
      z: 0 + Math.sin(t * 0.25 + idx * 0.1) * 50,
      confidence: 0.8 + Math.random() * 0.2
    }))
  }));
};

// Sample data
const SAMPLE_WORKOUTS = [
  {
    id: 1,
    name: 'Morning Run',
    type: 'Running',
    duration: 45,
    distance: 8.2,
    calories: 620,
    date: new Date(Date.now() - 86400000 * 7),
    status: 'completed',
    avgHeartRate: 155,
    maxHeartRate: 185,
    steps: 8920,
    videoUrl: 'https://www.w3schools.com/html/mov_bbb.mp4',
    timeSeriesData: [
      { time: '0:00', heartRate: 120, speed: 0 },
      { time: '5:00', heartRate: 135, speed: 8.5 },
      { time: '10:00', heartRate: 145, speed: 9.2 },
      { time: '15:00', heartRate: 155, speed: 9.5 },
      { time: '20:00', heartRate: 160, speed: 9.8 },
      { time: '25:00', heartRate: 165, speed: 10.0 },
      { time: '30:00', heartRate: 170, speed: 10.2 },
      { time: '35:00', heartRate: 175, speed: 9.8 },
      { time: '40:00', heartRate: 180, speed: 9.5 },
      { time: '45:00', heartRate: 175, speed: 8.0 }
    ],
    footPressureData: generateFootPressureData(),
    skeletonData: generateSkeletonData()
  },
  {
    id: 2,
    name: 'Strength Training',
    type: 'Gym',
    duration: 60,
    distance: 0,
    calories: 450,
    date: new Date(Date.now() - 86400000 * 5),
    status: 'completed',
    avgHeartRate: 125,
    maxHeartRate: 155,
    steps: 2150,
    videoUrl: 'https://www.w3schools.com/html/mov_bbb.mp4',
    timeSeriesData: [
      { time: '0:00', heartRate: 100, speed: 0 },
      { time: '10:00', heartRate: 115, speed: 0 },
      { time: '20:00', heartRate: 130, speed: 0 },
      { time: '30:00', heartRate: 140, speed: 0 },
      { time: '40:00', heartRate: 145, speed: 0 },
      { time: '50:00', heartRate: 135, speed: 0 },
      { time: '60:00', heartRate: 120, speed: 0 }
    ],
    footPressureData: generateFootPressureData(),
    skeletonData: generateSkeletonData()
  },
  {
    id: 3,
    name: 'Evening Yoga',
    type: 'Yoga',
    duration: 30,
    distance: 0,
    calories: 150,
    date: new Date(Date.now() - 86400000 * 3),
    status: 'completed',
    avgHeartRate: 95,
    maxHeartRate: 115,
    steps: 1250,
    videoUrl: 'https://www.w3schools.com/html/mov_bbb.mp4',
    timeSeriesData: [
      { time: '0:00', heartRate: 90, speed: 0 },
      { time: '10:00', heartRate: 100, speed: 0 },
      { time: '20:00', heartRate: 105, speed: 0 },
      { time: '30:00', heartRate: 95, speed: 0 }
    ],
    footPressureData: generateFootPressureData(),
    skeletonData: generateSkeletonData()
  },
  {
    id: 4,
    name: 'Cycling Session',
    type: 'Cycling',
    duration: 90,
    distance: 32.5,
    calories: 750,
    date: new Date(Date.now() - 86400000 * 1),
    status: 'completed',
    avgHeartRate: 145,
    maxHeartRate: 175,
    steps: 0,
    videoUrl: 'https://www.w3schools.com/html/mov_bbb.mp4',
    timeSeriesData: [
      { time: '0:00', heartRate: 110, speed: 0 },
      { time: '15:00', heartRate: 135, speed: 25 },
      { time: '30:00', heartRate: 150, speed: 32 },
      { time: '45:00', heartRate: 160, speed: 35 },
      { time: '60:00', heartRate: 155, speed: 34 },
      { time: '75:00', heartRate: 145, speed: 30 },
      { time: '90:00', heartRate: 125, speed: 15 }
    ],
    footPressureData: generateFootPressureData(),
    skeletonData: generateSkeletonData()
  }
];

export const WorkoutProvider = ({ children }) => {
  const [workouts, setWorkouts] = useState(SAMPLE_WORKOUTS);
  const [activeSession, setActiveSession] = useState(null);

  const addWorkout = (workout) => {
    const newWorkout = {
      ...workout,
      id: Math.max(...workouts.map(w => w.id)) + 1,
      date: new Date()
    };
    setWorkouts([newWorkout, ...workouts]);
    return newWorkout;
  };

  const updateWorkout = (id, updates) => {
    setWorkouts(workouts.map(w => w.id === id ? { ...w, ...updates } : w));
  };

  const deleteWorkout = (id) => {
    setWorkouts(workouts.filter(w => w.id !== id));
  };

  const startSession = (session) => {
    setActiveSession(session);
  };

  const endSession = () => {
    setActiveSession(null);
  };

  return (
    <WorkoutContext.Provider
      value={{
        workouts,
        addWorkout,
        updateWorkout,
        deleteWorkout,
        activeSession,
        startSession,
        endSession
      }}
    >
      {children}
    </WorkoutContext.Provider>
  );
};
