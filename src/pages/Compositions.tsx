import React from 'react';
import { Navigate } from 'react-router-dom';

const Compositions: React.FC = () => {
  // For now, redirect the /compositions route back to the dashboard (/)
  return <Navigate to="/" replace />;
};

export default Compositions;