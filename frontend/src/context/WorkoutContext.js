import React, { createContext, useState, useEffect } from 'react';
import { getWorkouts, createWorkout as apiCreateWorkout, updateWorkout as apiUpdateWorkout, deleteWorkout as apiDeleteWorkout } from '../services/api';

export const WorkoutContext = createContext();

export const WorkoutProvider = ({ children }) => {
  const [workouts, setWorkouts] = useState([]);
  const [activeSession, setActiveSession] = useState(null);
  const [loading, setLoading] = useState(true);

  // Fetch workouts from backend on mount
  useEffect(() => {
    const fetchWorkouts = async () => {
      try {
        const data = await getWorkouts();
        if (data && data.length > 0) {
          setWorkouts(data);
        }
      } catch (e) {
        console.warn('Failed to fetch workouts from backend:', e.message);
        // Do not use sample data; only show DB workouts
        setWorkouts([]);
      } finally {
        setLoading(false);
      }
    };

    fetchWorkouts();
  }, []);

  const addWorkout = async (workout) => {
    const newWorkout = await apiCreateWorkout(workout);
    setWorkouts([newWorkout, ...workouts]);
    return newWorkout;
  };

  const updateWorkout = async (id, updates) => {
    const updated = await apiUpdateWorkout(id, updates);
    setWorkouts(workouts.map(w => (w._id === id || w.id === id) ? updated : w));
  };

  const deleteWorkout = async (id) => {
    await apiDeleteWorkout(id);
    setWorkouts(workouts.filter(w => w._id !== id && w.id !== id));
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
        endSession,
        loading
      }}
    >
      {children}
    </WorkoutContext.Provider>
  );
};
