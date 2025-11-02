import React from 'react';
import { Navigate } from 'react-router-dom';

const Improvisations: React.FC = () => {
  // For now, redirect the /improvisations route back to the dashboard (/)
  return <Navigate to="/" replace />;
};

export default Improvisations;