import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import './App.css';
import { ThemeProvider } from './context/ThemeContext';
import { WorkoutProvider } from './context/WorkoutContext';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import Workouts from './pages/Workouts';
import EpisodeDetail from './pages/EpisodeDetail';
import Analytics from './pages/Analytics';

function App() {
  return (
    <Router>
      <ThemeProvider>
        <WorkoutProvider>
          <Routes>
            <Route path="/" element={<Layout><Dashboard /></Layout>} />
            <Route path="/workouts" element={<Layout><Workouts /></Layout>} />
            <Route path="/episode/:id" element={<EpisodeDetail />} />
            <Route path="/analytics" element={<Layout><Analytics /></Layout>} />
          </Routes>
        </WorkoutProvider>
      </ThemeProvider>
    </Router>
  );
}

export default App;
