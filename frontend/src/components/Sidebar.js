import React, { useContext } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ThemeContext } from '../context/ThemeContext';
import { FiHome, FiActivity, FiBarChart2, FiLogOut } from 'react-icons/fi';

const Sidebar = () => {
  const { isDark } = useContext(ThemeContext);
  const location = useLocation();

  const menuItems = [
    { name: 'Dashboard', icon: FiHome, path: '/' },
    { name: 'Workouts', icon: FiActivity, path: '/workouts' },
    { name: 'Analytics', icon: FiBarChart2, path: '/analytics' },
  ];

  return (
    <div className={`w-64 min-h-screen ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-blue-100'} border-r transition-colors duration-300 flex flex-col`}>
      {/* Logo */}
      <div className="p-6 border-b" style={{ borderColor: isDark ? '#1e293b' : '#dbeafe' }}>
        <Link to="/" className="flex items-center gap-3 group">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-green-500 flex items-center justify-center group-hover:shadow-lg transition-all">
            <span className="text-white font-bold text-lg">K</span>
          </div>
          <div>
            <h2 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>Kinetra</h2>
            <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Fitness</p>
          </div>
        </Link>
      </div>

      {/* Navigation Menu */}
      <nav className="flex-1 px-3 py-6 space-y-2">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;

          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-300 ${
                isActive
                  ? isDark
                    ? 'bg-gradient-to-r from-blue-600 to-green-600 text-white shadow-lg'
                    : 'bg-gradient-to-r from-blue-500 to-green-500 text-white shadow-lg'
                  : isDark
                  ? 'text-gray-400 hover:bg-slate-700 hover:text-white'
                  : 'text-gray-600 hover:bg-blue-50 hover:text-blue-600'
              }`}
            >
              <Icon size={20} />
              <span className="font-medium text-sm">{item.name}</span>
              {isActive && (
                <div className="ml-auto w-2 h-2 rounded-full bg-current"></div>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t" style={{ borderColor: isDark ? '#1e293b' : '#dbeafe' }}>
        <div className={`text-xs text-center mb-4 ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
          <p>Connected Devices: 1</p>
          <p className="text-green-500 font-semibold">● Insole Active</p>
        </div>
        <button
          className={`w-full px-4 py-2 rounded-lg font-medium text-sm transition-all ${
            isDark
              ? 'bg-slate-700 text-gray-300 hover:bg-slate-600'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          <FiLogOut className="inline mr-2" size={16} />
          Logout
        </button>
      </div>
    </div>
  );
};

export default Sidebar;
