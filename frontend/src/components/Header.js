import React, { useContext } from 'react';
import { FiBluetooth, FiMoon, FiSun } from 'react-icons/fi';
import { BluetoothContext } from '../context/BluetoothContext';

const Header = ({ toggleTheme, isDark }) => {
  const {
    isSupported,
    isConnecting,
    isConnected,
    connect,
    disconnect,
  } = useContext(BluetoothContext);

  const handleBluetoothClick = async () => {
    try {
      if (isConnected) {
        await disconnect();
      } else {
        await connect();
      }
    } catch (e) {
      console.warn('Bluetooth connection failed:', e.message);
    }
  };

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

          <div className="flex items-center gap-3">
            {isSupported ? (
              <button
                onClick={handleBluetoothClick}
                className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 ${
                  isConnected
                    ? isDark
                      ? 'bg-green-900 text-green-200 hover:bg-green-800'
                      : 'bg-green-100 text-green-700 hover:bg-green-200'
                    : isDark
                    ? 'bg-slate-700 text-blue-200 hover:bg-slate-600'
                    : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                }`}
                aria-label="Toggle bluetooth connection"
              >
                <FiBluetooth size={16} />
                {isConnecting ? 'Connecting…' : isConnected ? 'Bluetooth On' : 'Connect'}
              </button>
            ) : (
              <span className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                Bluetooth unavailable
              </span>
            )}

            <button
              onClick={toggleTheme}
              className={`p-2 rounded-lg transition-all ${isDark ? 'bg-slate-700 text-yellow-400 hover:bg-slate-600' : 'bg-blue-100 text-blue-600 hover:bg-blue-200'}`}
              aria-label="Toggle theme"
            >
              {isDark ? <FiSun size={20} /> : <FiMoon size={20} />}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
