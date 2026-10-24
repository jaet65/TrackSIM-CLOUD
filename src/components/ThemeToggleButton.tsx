import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

interface ThemeToggleButtonProps {
  className?: string;
}

export const ThemeToggleButton: React.FC<ThemeToggleButtonProps> = ({ className = '' }) => {
  const { theme, toggleTheme } = useTheme();
  const nextThemeLabel = theme === 'dark' ? 'claro' : 'oscuro';

  return (
    <button
      type="button"
      className={`theme-toggle ${className}`.trim()}
      onClick={toggleTheme}
      aria-label={`Cambiar a tema ${nextThemeLabel}`}
      aria-pressed={theme === 'light'}
      title={`Cambiar a tema ${nextThemeLabel}`}
    >
      {theme === 'dark'
        ? <Sun size={18} aria-hidden="true" />
        : <Moon size={18} aria-hidden="true" />}
    </button>
  );
};
