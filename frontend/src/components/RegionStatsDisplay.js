import React from 'react';

const RegionStatsDisplay = ({ statsData, isDark }) => {
  if (!statsData || Object.keys(statsData).length === 0) {
    return (
      <div className={`rounded-lg shadow-lg p-6 ${isDark ? 'bg-slate-800' : 'bg-white'}`}>
        <h3 className={`text-lg font-semibold mb-4 ${isDark ? 'text-white' : 'text-gray-800'}`}>
          Pressure Region Analysis
        </h3>
        <div className={`text-center py-8 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
          <p>Waiting for pressure data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-lg shadow-lg p-6 ${isDark ? 'bg-slate-800' : 'bg-white'}`}>
      <h3 className={`text-lg font-semibold mb-4 ${isDark ? 'text-white' : 'text-gray-800'}`}>
        Pressure Region Analysis
      </h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Object.entries(statsData).map(([region, stats]) => (
          <div
            key={region}
            className={`p-4 rounded-lg border ${
              isDark
                ? 'bg-slate-700 border-slate-600'
                : 'bg-gray-50 border-gray-200'
            }`}
          >
            <h4 className={`font-semibold mb-3 ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>
              {region}
            </h4>
            
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className={isDark ? 'text-gray-400' : 'text-gray-600'}>Mean Force:</span>
                <span className={`font-semibold ${isDark ? 'text-gray-200' : 'text-gray-900'}`}>
                  {stats.mean_force?.toFixed(2) || 'N/A'}
                </span>
              </div>
              
              <div className="flex justify-between">
                <span className={isDark ? 'text-gray-400' : 'text-gray-600'}>Max Pressure:</span>
                <span className={`font-semibold ${isDark ? 'text-gray-200' : 'text-gray-900'}`}>
                  {stats.max?.toFixed(2) || 'N/A'}
                </span>
              </div>
              
              <div className="flex justify-between">
                <span className={isDark ? 'text-gray-400' : 'text-gray-600'}>Sum Pressure:</span>
                <span className={`font-semibold ${isDark ? 'text-gray-200' : 'text-gray-900'}`}>
                  {stats.sum_pressure?.toFixed(2) || 'N/A'}
                </span>
              </div>
              
              <div className="flex justify-between">
                <span className={isDark ? 'text-gray-400' : 'text-gray-600'}>Mean:</span>
                <span className={`font-semibold ${isDark ? 'text-gray-200' : 'text-gray-900'}`}>
                  {stats.mean?.toFixed(2) || 'N/A'}
                </span>
              </div>
              
              <div className="flex justify-between">
                <span className={isDark ? 'text-gray-400' : 'text-gray-600'}>Std Dev:</span>
                <span className={`font-semibold ${isDark ? 'text-gray-200' : 'text-gray-900'}`}>
                  {stats.std?.toFixed(2) || 'N/A'}
                </span>
              </div>
              
              <div className="flex justify-between">
                <span className={isDark ? 'text-gray-400' : 'text-gray-600'}>Min:</span>
                <span className={`font-semibold ${isDark ? 'text-gray-200' : 'text-gray-900'}`}>
                  {stats.min?.toFixed(2) || 'N/A'}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default RegionStatsDisplay;
