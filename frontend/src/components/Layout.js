import React, { useContext } from 'react';
import Sidebar from './Sidebar';
import { ThemeContext } from '../context/ThemeContext';

const Layout = ({ children }) => {
  const { isDark } = useContext(ThemeContext);

  return (
    <div className={`flex ${isDark ? 'bg-slate-900' : 'bg-gray-50'} min-h-screen`}>
      <Sidebar />
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
};

export default Layout;
