import React from 'react';
import { useTheme } from '../context/ThemeContext';

export const BrandLogo: React.FC = () => {
  const { theme } = useTheme();

  return (
    <img
      src={theme === 'light' ? '/Logo%20NN.png' : '/Logo.png'}
      alt="TrackSIM Logo"
      className="brand-logo-img"
    />
  );
};
