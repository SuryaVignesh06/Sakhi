import React from 'react';
import { Sun, Moon } from 'lucide-react';

interface AnimatedThemeTogglerProps {
  theme: 'dark' | 'light';
  onToggle: () => void;
}

export const AnimatedThemeToggler: React.FC<AnimatedThemeTogglerProps> = ({ theme, onToggle }) => {
  const isDark = theme === 'dark';

  return (
    <button
      onClick={onToggle}
      className={`animated-theme-toggler-btn ${isDark ? 'is-dark' : 'is-light'}`}
      title={`Switch to ${isDark ? 'Light' : 'Dark'} mode`}
      aria-label="Toggle theme"
    >
      <div className="toggler-icon-wrapper">
        <Sun className="icon-sun" size={18} strokeWidth={1.8} />
        <Moon className="icon-moon" size={18} strokeWidth={1.8} />
      </div>
      <span className="toggler-ripple" />
    </button>
  );
};

export default AnimatedThemeToggler;
