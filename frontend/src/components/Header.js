import React from 'react';
import { FiSun, FiMoon } from 'react-icons/fi';

const Header = ({ toggleTheme, isDark }) => {
  return (
    <header className={`${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-blue-100'} border-b shadow-sm transition-colors duration-300`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg ${isDark ? 'bg-gradient-to-br from-blue-500 to-green-500' : 'bg-gradient-to-br from-blue-600 to-green-600'} flex items-center justify-center`}>
              <span className="text-white font-bold text-lg">K</span>
            </div>
            <div>
              <h1 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                Kinetra
              </h1>
              <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                Fitness Dashboard
              </p>
            </div>
          </div>

          <button
            onClick={toggleTheme}
            className={`p-2 rounded-lg transition-all ${isDark ? 'bg-slate-700 text-yellow-400 hover:bg-slate-600' : 'bg-blue-100 text-blue-600 hover:bg-blue-200'}`}
            aria-label="Toggle theme"
          >
            {isDark ? <FiSun size={20} /> : <FiMoon size={20} />}
          </button>
        </div>
      </div>
    </header>
  );
};

export default Header;
