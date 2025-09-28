import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import ErrorBoundary from './components/ErrorBoundary';
import AgeGate from './components/AgeGate';
import ParlayBuilder from './components/ParlayBuilder';

const App = () => {
  // Check if user has verified age
  const isAgeVerified = () => {
    return localStorage.getItem('ageVerified') === 'true';
  };

  // Protected route component
  const ProtectedRoute = ({ children }) => {
    return isAgeVerified() ? children : <Navigate to="/age-gate" replace />;
  };

  return (
    <ErrorBoundary>
      <Router>
        <div className="app">
          <Routes>
            {/* Default redirect to age gate */}
            <Route path="/" element={<Navigate to="/age-gate" replace />} />
            
            {/* Age verification route */}
            <Route path="/age-gate" element={<AgeGate />} />
            
            {/* Protected parlay builder route */}
            <Route 
              path="/builder" 
              element={
                <ProtectedRoute>
                  <ParlayBuilder />
                </ProtectedRoute>
              } 
            />
            
            {/* Catch all other routes and redirect to age gate */}
            <Route path="*" element={<Navigate to="/age-gate" replace />} />
          </Routes>
        </div>
      </Router>
    </ErrorBoundary>
  );
};

export default App;