import React, { createContext, useState } from 'react';

export const WorkoutContext = createContext();

export const WorkoutProvider = ({ children }) => {
  const [inProgressWorkoutId, setInProgressWorkoutId] = useState(null);

  const startWorkout = (workoutId) => {
    setInProgressWorkoutId(workoutId);
  };

  const stopWorkout = () => {
    setInProgressWorkoutId(null);
  };

  const isWorkoutInProgress = (workoutId) => {
    return inProgressWorkoutId === workoutId;
  };

  const hasActiveWorkout = () => {
    return inProgressWorkoutId !== null;
  };

  return (
    <WorkoutContext.Provider
      value={{
        inProgressWorkoutId,
        startWorkout,
        stopWorkout,
        isWorkoutInProgress,
        hasActiveWorkout
      }}
    >
      {children}
    </WorkoutContext.Provider>
  );
};
